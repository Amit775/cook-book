import { inject, Injectable } from '@angular/core';
import { doc, DocumentData, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { FIRESTORE } from '../firebase/firebase.providers';
import { MealPlan, PlannedRecipe, toMealPlan } from '../models/meal-plan.model';

/**
 * Reads and writes meal plan documents under
 * `users/{userId}/mealPlans/{weekStartDate}`.
 * Stateless — the `MealPlanStore` holds UI state.
 */
@Injectable({ providedIn: 'root' })
export class MealPlanService {
  private readonly firestore = inject(FIRESTORE);

  /** Return the meal plan for a given week, or `null` when none exists. */
  async getMealPlan(userId: string, weekStartDate: string): Promise<MealPlan | null> {
    const reference = doc(this.firestore, 'users', userId, 'mealPlans', weekStartDate);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) {
      return null;
    }
    return toMealPlan(snapshot.id, snapshot.data() as DocumentData);
  }

  /**
   * Upsert the days map for a week. Preserves `createdAt` if the document
   * already exists by using `setDoc` with `merge: true` for the timestamp fields.
   */
  async setDays(userId: string, weekStartDate: string, days: Record<string, PlannedRecipe[]>): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'mealPlans', weekStartDate);
    const snapshot = await getDoc(reference);
    const payload: Record<string, unknown> = {
      days,
      updatedAt: serverTimestamp(),
    };
    if (!snapshot.exists()) {
      payload['createdAt'] = serverTimestamp();
    }
    await setDoc(reference, payload, { merge: true });
  }

  /** Delete a meal plan document. */
  async deleteMealPlan(userId: string, weekStartDate: string): Promise<void> {
    const reference = doc(this.firestore, 'users', userId, 'mealPlans', weekStartDate);
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(reference);
  }
}
