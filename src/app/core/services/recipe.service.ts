import { inject, Injectable } from '@angular/core';
import { User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { Ingredient } from '../models/ingredient.model';
import { Recipe, RecipeDraft } from '../models/recipe.model';
import { StorageService } from './storage.service';

/**
 * Reads and writes recipe documents in the `recipes` collection. Stateless —
 * components/stores hold any UI state.
 */
@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly firestore = inject(FIRESTORE);
  private readonly storageService = inject(StorageService);
  private readonly recipesCollection = collection(this.firestore, 'recipes');
  private readonly shareLinksCollection = collection(this.firestore, 'shareLinks');

  /** Create a brand-new (original) recipe owned by `author`. Returns the new id. */
  async createRecipe(draft: RecipeDraft, author: User): Promise<string> {
    const reference = doc(this.recipesCollection);
    await setDoc(reference, {
      ...draft,
      authorId: author.uid,
      rootId: reference.id,
      parentId: null,
      shareId: null,
      keywords: buildKeywords(draft),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reference.id;
  }

  async getRecipe(recipeId: string): Promise<Recipe | null> {
    const snapshot = await getDoc(doc(this.firestore, 'recipes', recipeId));
    return snapshot.exists() ? toRecipe(snapshot.id, snapshot.data()) : null;
  }

  /** All recipes owned by the user, newest first. */
  async listMyRecipes(userId: string): Promise<Recipe[]> {
    const ownedQuery = query(this.recipesCollection, where('authorId', '==', userId));
    const snapshot = await getDocs(ownedQuery);
    return sortByUpdatedDescending(snapshot.docs.map((document) => toRecipe(document.id, document.data())));
  }

  /** Publicly browsable recipes (`visibility == 'public'`), newest first. */
  async listPublicRecipes(): Promise<Recipe[]> {
    const publicQuery = query(this.recipesCollection, where('visibility', '==', 'public'));
    const snapshot = await getDocs(publicQuery);
    return sortByUpdatedDescending(snapshot.docs.map((document) => toRecipe(document.id, document.data())));
  }

  /** Recipes explicitly shared with the user (`sharedWith` contains them), newest first. */
  async listSharedWithMe(userId: string): Promise<Recipe[]> {
    const sharedQuery = query(this.recipesCollection, where('sharedWith', 'array-contains', userId));
    const snapshot = await getDocs(sharedQuery);
    return sortByUpdatedDescending(snapshot.docs.map((document) => toRecipe(document.id, document.data())));
  }

  /**
   * Other readable recipes in the same clone family (same `rootId`): the public
   * ones plus, when signed in, the user's own. The two queries each match a
   * single Firestore-rules read condition so neither is rejected. Excludes
   * `excludeRecipeId` (the recipe currently being viewed).
   */
  async listVersions(rootId: string, currentUserId: string | null, excludeRecipeId: string): Promise<Recipe[]> {
    const requests = [getDocs(query(this.recipesCollection, where('rootId', '==', rootId), where('visibility', '==', 'public')))];
    if (currentUserId) {
      requests.push(getDocs(query(this.recipesCollection, where('rootId', '==', rootId), where('authorId', '==', currentUserId))));
    }
    const snapshots = await Promise.all(requests);
    const byId = new Map<string, Recipe>();
    for (const snapshot of snapshots) {
      for (const document of snapshot.docs) {
        if (document.id !== excludeRecipeId) {
          byId.set(document.id, toRecipe(document.id, document.data()));
        }
      }
    }
    return sortByUpdatedDescending([...byId.values()]);
  }

  /**
   * Clone `source` into a new recipe owned by `cloner`. The clone keeps the
   * family's `rootId`, links back via `parentId`, and starts `private`.
   *
   * When the source has a cover photo, the object is COPIED to a new Storage
   * path under the cloner's own prefix so the clone owns its object
   * independently — deleting the parent's cover will never break the clone's
   * image. If the copy fails (source missing / read error) the clone is still
   * created but without a cover.
   *
   * Returns the new recipe id.
   */
  async cloneRecipe(source: Recipe, cloner: User): Promise<string> {
    // Copy cover photo before writing Firestore doc so the clone owns its object.
    const clonedCoverPhotoPath = source.coverPhotoPath
      ? await this.storageService.copyCoverPhoto(source.coverPhotoPath, cloner.uid)
      : null;

    const reference = doc(this.recipesCollection);
    await setDoc(reference, {
      title: source.title,
      description: source.description,
      type: source.type,
      visibility: 'private',
      sharedWith: [],
      authorId: cloner.uid,
      rootId: source.rootId,
      parentId: source.recipeId,
      shareId: null,
      ingredients: source.ingredients,
      steps: source.steps,
      tags: source.tags,
      keywords: source.keywords,
      servings: source.servings,
      prepTime: source.prepTime,
      cookTime: source.cookTime,
      coverPhotoPath: clonedCoverPhotoPath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reference.id;
  }

  /**
   * Update an existing recipe's editable fields (rebuilds `keywords`, bumps
   * `updatedAt`). Never touches `authorId`/`rootId`/`parentId`/`shareId`/`createdAt`.
   * Owner-only — enforced by the Firestore security rules.
   */
  async updateRecipe(recipeId: string, draft: RecipeDraft): Promise<void> {
    const reference = doc(this.firestore, 'recipes', recipeId);
    await updateDoc(reference, {
      title: draft.title,
      description: draft.description,
      type: draft.type,
      visibility: draft.visibility,
      sharedWith: draft.sharedWith,
      ingredients: draft.ingredients,
      steps: draft.steps,
      tags: draft.tags,
      keywords: buildKeywords(draft),
      servings: draft.servings,
      prepTime: draft.prepTime,
      cookTime: draft.cookTime,
      coverPhotoPath: draft.coverPhotoPath,
      updatedAt: serverTimestamp(),
    });
  }

  /** Delete a recipe. Owner-only — enforced by the Firestore security rules. */
  async deleteRecipe(recipeId: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'recipes', recipeId));
  }

  /**
   * Create (or reuse) the "anyone with the link" share token for a recipe.
   * Writes a `shareLinks/{shareId}` lookup doc and stamps `shareId` on the recipe.
   * Owner-only. Returns the share token.
   */
  async createShareLink(recipe: Recipe): Promise<string> {
    if (recipe.shareId) {
      return recipe.shareId;
    }
    const shareLinkReference = doc(this.shareLinksCollection);
    const shareId = shareLinkReference.id;
    const batch = writeBatch(this.firestore);
    batch.set(shareLinkReference, { recipeId: recipe.recipeId });
    batch.update(doc(this.firestore, 'recipes', recipe.recipeId), { shareId, updatedAt: serverTimestamp() });
    await batch.commit();
    return shareId;
  }

  /** Revoke a recipe's share link (deletes the lookup doc, clears `shareId`). Owner-only. */
  async removeShareLink(recipe: Recipe): Promise<void> {
    if (!recipe.shareId) {
      return;
    }
    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, 'shareLinks', recipe.shareId));
    batch.update(doc(this.firestore, 'recipes', recipe.recipeId), { shareId: null, updatedAt: serverTimestamp() });
    await batch.commit();
  }

  /** Resolve a share token to its recipe id, or `null` if the link is invalid. */
  async findRecipeIdByShareId(shareId: string): Promise<string | null> {
    const snapshot = await getDoc(doc(this.firestore, 'shareLinks', shareId));
    return snapshot.exists() ? (snapshot.data()['recipeId'] as string) : null;
  }

  /** Add the visiting user to a recipe's `sharedWith` (they grant themselves access via the link). */
  async joinSharedRecipe(recipeId: string, userId: string): Promise<void> {
    const reference = doc(this.firestore, 'recipes', recipeId);
    await updateDoc(reference, { sharedWith: arrayUnion(userId), updatedAt: serverTimestamp() });
  }

  /** Revoke a specific user's shared access (removes from `sharedWith`). Owner-only. */
  async unshareWithUser(recipeId: string, userId: string): Promise<void> {
    const reference = doc(this.firestore, 'recipes', recipeId);
    await updateDoc(reference, { sharedWith: arrayRemove(userId), updatedAt: serverTimestamp() });
  }
}

/** Sort recipes by `updatedAt`, newest first (in place-safe, returns the array). */
function sortByUpdatedDescending(recipes: Recipe[]): Recipe[] {
  return recipes.sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime());
}

/** Lowercased, de-duplicated search terms from title + tags + ingredient names. */
function buildKeywords(draft: RecipeDraft): string[] {
  const parts = [draft.title, ...draft.tags, ...draft.ingredients.map((ingredient) => ingredient.name)];
  const words = parts
    .join(' ')
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  return Array.from(new Set(words));
}

function toRecipe(recipeId: string, data: DocumentData): Recipe {
  return {
    recipeId,
    title: data['title'] ?? '',
    description: data['description'] ?? '',
    type: data['type'] ?? 'other',
    authorId: data['authorId'] ?? '',
    visibility: data['visibility'] ?? 'private',
    sharedWith: data['sharedWith'] ?? [],
    rootId: data['rootId'] ?? recipeId,
    parentId: data['parentId'] ?? null,
    ingredients: ((data['ingredients'] ?? []) as DocumentData[]).map(toIngredient),
    steps: data['steps'] ?? [],
    tags: data['tags'] ?? [],
    keywords: data['keywords'] ?? [],
    servings: data['servings'] ?? null,
    prepTime: data['prepTime'] ?? null,
    cookTime: data['cookTime'] ?? null,
    coverPhotoPath: data['coverPhotoPath'] ?? null,
    shareId: data['shareId'] ?? null,
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

/** Normalize a stored ingredient, defaulting `ingredientId` for legacy (pre-catalog) data. */
function toIngredient(data: DocumentData): Ingredient {
  return {
    ingredientId: data['ingredientId'] ?? null,
    quantity: data['quantity'] ?? null,
    unit: data['unit'] ?? '',
    name: data['name'] ?? '',
  };
}

function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}
