import { inject, Injectable } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { RecipeCollection, toRecipeCollection } from '../models/collection.model';

/**
 * Reads and writes saved-recipe and collection documents under
 * `users/{userId}/savedRecipes` and `users/{userId}/collections`.
 * Stateless — the `LibraryStore` holds any UI state.
 */
@Injectable({ providedIn: 'root' })
export class SavedRecipeService {
  private readonly firestore = inject(FIRESTORE);

  // -----------------------------------------------------------------------
  // Saved recipes
  // -----------------------------------------------------------------------

  /** Return all saved recipe ids for a user, ordered by savedAt descending. */
  async listSavedRecipeIds(userId: string): Promise<string[]> {
    const savedCollection = collection(this.firestore, 'users', userId, 'savedRecipes');
    const savedQuery = query(savedCollection, orderBy('savedAt', 'desc'));
    const snapshot = await getDocs(savedQuery);
    return snapshot.docs.map((document) => document.id);
  }

  /** Save a recipe for the user. Idempotent — uses `setDoc` so repeated calls are safe. */
  async save(userId: string, recipeId: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'savedRecipes', recipeId);
    await setDoc(reference, {
      recipeId,
      savedAt: serverTimestamp(),
    });
  }

  /** Remove a saved recipe for the user. */
  async unsave(userId: string, recipeId: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'savedRecipes', recipeId);
    await deleteDoc(reference);
  }

  // -----------------------------------------------------------------------
  // Collections
  // -----------------------------------------------------------------------

  /** Return all collections for a user, ordered by updatedAt descending. */
  async listCollections(userId: string): Promise<RecipeCollection[]> {
    const collectionsCollection = collection(this.firestore, 'users', userId, 'collections');
    const collectionsQuery = query(collectionsCollection, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(collectionsQuery);
    return snapshot.docs.map((document) => toRecipeCollection(document.id, document.data() as DocumentData));
  }

  /** Create a new collection with the given name. Returns the new collection id. */
  async createCollection(userId: string, name: string): Promise<string> {
    const collectionsCollection = collection(this.firestore, 'users', userId, 'collections');
    const reference = doc(collectionsCollection);
    await setDoc(reference, {
      name,
      recipeIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reference.id;
  }

  /** Rename an existing collection. */
  async renameCollection(userId: string, collectionId: string, name: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'collections', collectionId);
    await updateDoc(reference, { name, updatedAt: serverTimestamp() });
  }

  /** Delete a collection document. Does not remove saved-recipe membership docs. */
  async deleteCollection(userId: string, collectionId: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'collections', collectionId);
    await deleteDoc(reference);
  }

  /** Add a recipe id to a collection's `recipeIds` array. */
  async addRecipeToCollection(userId: string, collectionId: string, recipeId: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'collections', collectionId);
    await updateDoc(reference, {
      recipeIds: arrayUnion(recipeId),
      updatedAt: serverTimestamp(),
    });
  }

  /** Remove a recipe id from a collection's `recipeIds` array. */
  async removeRecipeFromCollection(userId: string, collectionId: string, recipeId: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'collections', collectionId);
    await updateDoc(reference, {
      recipeIds: arrayRemove(recipeId),
      updatedAt: serverTimestamp(),
    });
  }
}
