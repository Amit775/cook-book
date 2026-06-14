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
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { Recipe, RecipeDraft } from '../models/recipe.model';

/**
 * Reads and writes recipe documents in the `recipes` collection. Stateless —
 * components/stores hold any UI state.
 */
@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly firestore = inject(FIRESTORE);
  private readonly recipesCollection = collection(this.firestore, 'recipes');

  /** Create a brand-new (original) recipe owned by `author`. Returns the new id. */
  async createRecipe(draft: RecipeDraft, author: User): Promise<string> {
    const reference = doc(this.recipesCollection);
    await setDoc(reference, {
      ...draft,
      authorId: author.uid,
      rootId: reference.id,
      parentId: null,
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
   * family's `rootId`, links back via `parentId`, and starts `private`. Returns
   * the new id.
   */
  async cloneRecipe(source: Recipe, cloner: User): Promise<string> {
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
      ingredients: source.ingredients,
      steps: source.steps,
      tags: source.tags,
      keywords: source.keywords,
      servings: source.servings,
      prepTime: source.prepTime,
      cookTime: source.cookTime,
      coverPhotoPath: source.coverPhotoPath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reference.id;
  }

  /**
   * Update an existing recipe's editable fields (rebuilds `keywords`, bumps
   * `updatedAt`). Never touches `authorId`/`rootId`/`parentId`/`createdAt`.
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

  /** Grant `userId` read access to a recipe (adds to `sharedWith`). Owner-only. */
  async shareWithUser(recipeId: string, userId: string): Promise<void> {
    const reference = doc(this.firestore, 'recipes', recipeId);
    await updateDoc(reference, { sharedWith: arrayUnion(userId), updatedAt: serverTimestamp() });
  }

  /** Revoke `userId`'s access to a recipe (removes from `sharedWith`). Owner-only. */
  async unshareWithUser(recipeId: string, userId: string): Promise<void> {
    const reference = doc(this.firestore, 'recipes', recipeId);
    await updateDoc(reference, { sharedWith: arrayRemove(userId), updatedAt: serverTimestamp() });
  }

  /** Recipes explicitly shared with the user (`sharedWith` contains them), newest first. */
  async listSharedWithMe(userId: string): Promise<Recipe[]> {
    const sharedQuery = query(this.recipesCollection, where('sharedWith', 'array-contains', userId));
    const snapshot = await getDocs(sharedQuery);
    return sortByUpdatedDescending(snapshot.docs.map((document) => toRecipe(document.id, document.data())));
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
    ingredients: data['ingredients'] ?? [],
    steps: data['steps'] ?? [],
    tags: data['tags'] ?? [],
    keywords: data['keywords'] ?? [],
    servings: data['servings'] ?? null,
    prepTime: data['prepTime'] ?? null,
    cookTime: data['cookTime'] ?? null,
    coverPhotoPath: data['coverPhotoPath'] ?? null,
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}
