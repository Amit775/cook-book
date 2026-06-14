import { inject, Injectable } from '@angular/core';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
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
    return snapshot.docs
      .map((document) => toRecipe(document.id, document.data()))
      .sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime());
  }
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
