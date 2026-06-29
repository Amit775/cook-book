import { DocumentData } from 'firebase/firestore';

import { RecipeType } from './recipe-type.model';

/**
 * A lightweight recipe reference stored inside a meal plan day.
 * Denormalized title/coverPhotoPath/type/servings so the planner can render
 * cards without re-fetching every recipe document.
 */
export interface PlannedRecipe {
  recipeId: string;
  title: string;
  coverPhotoPath: string | null;
  type: RecipeType;
  /** Serving count captured at assign-time for shopping-list scaling. */
  servings: number | null;
}

/**
 * One user's meal plan for a single week.
 * Doc id = `weekStartDate` (YYYY-MM-DD, local date, Sunday).
 * Path: `users/{userId}/mealPlans/{weekStartDate}`.
 */
export interface MealPlan {
  /** The Sunday that starts this week, formatted as YYYY-MM-DD. */
  weekStartDate: string;
  /**
   * Map of YYYY-MM-DD → ordered array of planned recipes for that day.
   * Days with no recipes are absent from the map (not stored as empty arrays).
   */
  days: Record<string, PlannedRecipe[]>;
  createdAt: Date;
  updatedAt: Date;
}

/** Map a Firestore document snapshot to a `MealPlan`, applying defensive defaults. */
export function toMealPlan(weekStartDate: string, data: DocumentData): MealPlan {
  return {
    weekStartDate,
    days: todays(data['days']),
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function todays(raw: unknown): Record<string, PlannedRecipe[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, PlannedRecipe[]> = {};
  for (const [dateKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const planned = value.map(toPlannedRecipe).filter((recipe): recipe is PlannedRecipe => recipe !== null);
      if (planned.length > 0) {
        result[dateKey] = planned;
      }
    }
  }
  return result;
}

function toPlannedRecipe(raw: unknown): PlannedRecipe | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const recipeId = typeof item['recipeId'] === 'string' ? item['recipeId'] : null;
  if (!recipeId) {
    return null;
  }
  return {
    recipeId,
    title: typeof item['title'] === 'string' ? item['title'] : '',
    coverPhotoPath: typeof item['coverPhotoPath'] === 'string' ? item['coverPhotoPath'] : null,
    type: isRecipeType(item['type']) ? item['type'] : 'meal',
    servings: typeof item['servings'] === 'number' ? item['servings'] : null,
  };
}

function isRecipeType(value: unknown): value is RecipeType {
  return value === 'meal' || value === 'dessert' || value === 'cocktail' || value === 'other';
}

function toDate(value: unknown): Date {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date();
}
