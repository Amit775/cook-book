import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

import { FIRESTORE } from '../firebase/firebase.providers';
import { computeAverage, RecipeRating, ReviewEntry, toRecipeRating } from '../models/rating.model';
import { Recipe } from '../models/recipe.model';

/**
 * Stateless Firestore I/O for recipe ratings.
 * UI state lives in `RatingStore`; transactions live here.
 */
@Injectable({ providedIn: 'root' })
export class RatingService {
  private readonly firestore = inject(FIRESTORE);

  /** Fetch the current user's rating for a recipe, or `null` if none exists. */
  async getMyRating(recipeId: string, userId: string): Promise<RecipeRating | null> {
    const reference = doc(this.firestore, 'recipes', recipeId, 'ratings', userId);
    const snapshot = await getDoc(reference);
    return snapshot.exists() ? toRecipeRating(snapshot.data() as DocumentData) : null;
  }

  /**
   * Write (create or update) the user's rating for a recipe.
   * Uses a Firestore transaction so the aggregate (sum + count + average) on the
   * recipe doc stays consistent with the individual rating doc.
   * Does NOT touch `updatedAt` on the recipe doc.
   */
  async setRating(recipe: Recipe, userId: string, stars: number, reviewText: string): Promise<void> {
    const recipeReference = doc(this.firestore, 'recipes', recipe.recipeId);
    const ratingReference = doc(this.firestore, 'recipes', recipe.recipeId, 'ratings', userId);

    await runTransaction(this.firestore, async (transaction) => {
      const [recipeSnapshot, ratingSnapshot] = await Promise.all([
        transaction.get(recipeReference),
        transaction.get(ratingReference),
      ]);

      const recipeData = recipeSnapshot.data() as DocumentData | undefined;
      const currentSum: number = typeof recipeData?.['ratingSum'] === 'number' ? recipeData['ratingSum'] : 0;
      const currentCount: number =
        typeof recipeData?.['ratingCount'] === 'number' ? recipeData['ratingCount'] : 0;

      let newSum: number;
      let newCount: number;

      if (ratingSnapshot.exists()) {
        // Editing an existing rating — adjust sum by delta, keep count the same.
        const existingRating = toRecipeRating(ratingSnapshot.data() as DocumentData);
        newSum = currentSum + (stars - existingRating.stars);
        newCount = currentCount;
      } else {
        // New rating — bump sum and count.
        newSum = currentSum + stars;
        newCount = currentCount + 1;
      }

      const newAverage = computeAverage(newSum, newCount);

      // Write the user's rating doc.
      transaction.set(ratingReference, {
        authorId: userId,
        stars,
        reviewText,
        updatedAt: serverTimestamp(),
        ...(ratingSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
      });

      // Update only the three aggregate fields — do NOT touch `updatedAt` on the recipe.
      transaction.update(recipeReference, {
        ratingCount: newCount,
        ratingSum: newSum,
        ratingAverage: newAverage,
      });
    });
  }

  /**
   * Fetch the most recent reviews for a recipe (star + text + author display name).
   * Author display names are fetched from `users/{uid}` (one doc-get per reviewer).
   * Missing user documents are gracefully handled (displayName falls back to userId).
   */
  async listReviews(recipeId: string, maximumCount = 10): Promise<ReviewEntry[]> {
    const ratingsReference = collection(this.firestore, 'recipes', recipeId, 'ratings');
    const ratingsQuery = query(ratingsReference, orderBy('updatedAt', 'desc'), limit(maximumCount));
    const ratingsSnapshot = await getDocs(ratingsQuery);

    if (ratingsSnapshot.empty) {
      return [];
    }

    const entries = await Promise.all(
      ratingsSnapshot.docs.map(async (ratingDocument) => {
        const userId = ratingDocument.id;
        const rating = toRecipeRating(ratingDocument.data() as DocumentData);

        // Fetch the reviewer's display name.
        let displayName = userId;
        try {
          const userSnapshot = await getDoc(doc(this.firestore, 'users', userId));
          if (userSnapshot.exists()) {
            const userData = userSnapshot.data() as DocumentData;
            displayName = typeof userData['displayName'] === 'string' && userData['displayName']
              ? userData['displayName']
              : userId;
          }
        } catch {
          // If the user doc is unreachable, fall back to userId.
        }

        return { ...rating, userId, displayName } satisfies ReviewEntry;
      }),
    );

    return entries;
  }

  /** Remove a user's rating (used for delete, exposed for symmetry). */
  async removeRating(recipe: Recipe, userId: string): Promise<void> {
    const recipeReference = doc(this.firestore, 'recipes', recipe.recipeId);
    const ratingReference = doc(this.firestore, 'recipes', recipe.recipeId, 'ratings', userId);

    await runTransaction(this.firestore, async (transaction) => {
      const [recipeSnapshot, ratingSnapshot] = await Promise.all([
        transaction.get(recipeReference),
        transaction.get(ratingReference),
      ]);

      if (!ratingSnapshot.exists()) {
        return; // Nothing to remove.
      }

      const existingRating = toRecipeRating(ratingSnapshot.data() as DocumentData);
      const recipeData = recipeSnapshot.data() as DocumentData | undefined;
      const currentSum: number = typeof recipeData?.['ratingSum'] === 'number' ? recipeData['ratingSum'] : 0;
      const currentCount: number =
        typeof recipeData?.['ratingCount'] === 'number' ? recipeData['ratingCount'] : 0;

      const newCount = Math.max(0, currentCount - 1);
      const newSum = Math.max(0, currentSum - existingRating.stars);
      const newAverage = computeAverage(newSum, newCount);

      transaction.delete(ratingReference);
      transaction.update(recipeReference, {
        ratingCount: newCount,
        ratingSum: newSum,
        ratingAverage: newAverage,
      });
    });
  }
}

/** Expose Timestamp for duck-typing in tests (no instanceof dependency). */
export { Timestamp };
