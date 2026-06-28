import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { FIRESTORE } from '../firebase/firebase.providers';
import { ShoppingList, ShoppingListItem, toShoppingList } from '../models/shopping-list.model';

/**
 * Reads and writes shopping list documents under
 * `users/{userId}/shoppingLists/{listId}`.
 * Stateless — the `ShoppingListStore` holds UI state.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListService {
  private readonly firestore = inject(FIRESTORE);

  /** Return all shopping lists for a user, ordered by updatedAt descending. */
  async listShoppingLists(userId: string): Promise<ShoppingList[]> {
    const listsCollection = collection(this.firestore, 'users', userId, 'shoppingLists');
    const listsQuery = query(listsCollection, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(listsQuery);
    return snapshot.docs.map((document) => toShoppingList(document.id, document.data() as DocumentData));
  }

  /** Return a single shopping list by id. */
  async getList(userId: string, listId: string): Promise<ShoppingList | null> {
    const reference = doc(this.firestore, 'users', userId, 'shoppingLists', listId);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) {
      return null;
    }
    return toShoppingList(snapshot.id, snapshot.data() as DocumentData);
  }

  /**
   * Create a new shopping list with the given name and items.
   * Returns the new list's Firestore document id.
   */
  async createList(userId: string, name: string, items: ShoppingListItem[]): Promise<string> {
    const listsCollection = collection(this.firestore, 'users', userId, 'shoppingLists');
    const reference = doc(listsCollection);
    await setDoc(reference, {
      name,
      items,
      isManuallyOrdered: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return reference.id;
  }

  /** Rename an existing list. */
  async renameList(userId: string, listId: string, name: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'shoppingLists', listId);
    await updateDoc(reference, { name, updatedAt: serverTimestamp() });
  }

  /** Delete a shopping list document. */
  async deleteList(userId: string, listId: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'shoppingLists', listId);
    await deleteDoc(reference);
  }

  /** Replace the entire `items` array and update `isManuallyOrdered` + `updatedAt`. */
  async setItems(
    userId: string,
    listId: string,
    items: ShoppingListItem[],
    isManuallyOrdered: boolean,
  ): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'shoppingLists', listId);
    await updateDoc(reference, { items, isManuallyOrdered, updatedAt: serverTimestamp() });
  }
}
