import { inject, Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  DocumentData,
  endAt,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAt,
  where,
} from 'firebase/firestore';

import { FIRESTORE } from '../firebase/firebase.providers';
import { CatalogIngredient } from '../models/catalog-ingredient.model';

/**
 * Reads and writes the shared ingredient catalog (`ingredients` collection).
 * The catalog lets the editor offer existing ingredients (Jira-tag style) so the
 * same product converges on one entry instead of many near-duplicates.
 */
@Injectable({ providedIn: 'root' })
export class IngredientService {
  private readonly firestore = inject(FIRESTORE);
  private readonly ingredientsCollection = collection(this.firestore, 'ingredients');

  /** Catalog entries whose name starts with `prefix` (case-insensitive), name-ordered. */
  async search(prefix: string, max = 8): Promise<CatalogIngredient[]> {
    const term = prefix.trim().toLowerCase();
    if (!term) {
      return [];
    }
    const prefixQuery = query(
      this.ingredientsCollection,
      orderBy('nameLower'),
      startAt(term),
      endAt(term + ''),
      limit(max),
    );
    const snapshot = await getDocs(prefixQuery);
    return snapshot.docs.map((document) => toCatalogIngredient(document.id, document.data()));
  }

  /**
   * Return the catalog entry whose lowercased name exactly matches `name`,
   * creating it (attributed to `userId`) if none exists yet.
   */
  async findOrCreate(name: string, userId: string): Promise<CatalogIngredient> {
    const trimmedName = name.trim();
    const nameLower = trimmedName.toLowerCase();
    const existingQuery = query(this.ingredientsCollection, where('nameLower', '==', nameLower), limit(1));
    const existing = await getDocs(existingQuery);
    if (!existing.empty) {
      const document = existing.docs[0];
      return toCatalogIngredient(document.id, document.data());
    }
    const reference = await addDoc(this.ingredientsCollection, {
      name: trimmedName,
      nameLower,
      createdBy: userId,
      createdAt: serverTimestamp(),
    });
    return { ingredientId: reference.id, name: trimmedName, nameLower };
  }
}

function toCatalogIngredient(ingredientId: string, data: DocumentData): CatalogIngredient {
  return {
    ingredientId,
    name: data['name'] ?? '',
    nameLower: data['nameLower'] ?? '',
  };
}
