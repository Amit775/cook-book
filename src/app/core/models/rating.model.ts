import { DocumentData } from 'firebase/firestore';

/**
 * A single user's rating + optional review for a recipe.
 * Stored at `recipes/{recipeId}/ratings/{userId}`.
 */
export interface RecipeRating {
  /** User ID of the rater (equals the document ID). */
  authorId: string;
  /** Star rating, 1–5. */
  stars: number;
  /** Optional written review text (up to 1000 characters). */
  reviewText: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Denormalized aggregate stored on the recipe document itself.
 * Maintained by a client-side transaction on every rating write.
 */
export interface RatingAggregate {
  ratingCount: number;
  ratingSum: number;
  /** Average rounded to 1 decimal, or 0 when no ratings. */
  ratingAverage: number;
}

/**
 * A rating + the reviewer's display name (fetched from `users/{uid}`).
 * Used in the recent-reviews list.
 */
export interface ReviewEntry extends RecipeRating {
  userId: string;
  displayName: string;
}

/** Pure helper: (re)compute the average from sum and count. Returns 0 on divide-by-zero. */
export function computeAverage(sum: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  return Math.round((sum / count) * 10) / 10;
}

/** Map a Firestore document snapshot into a `RecipeRating`. */
export function toRecipeRating(data: DocumentData): RecipeRating {
  return {
    authorId: typeof data['authorId'] === 'string' ? data['authorId'] : '',
    stars: typeof data['stars'] === 'number' ? data['stars'] : 1,
    reviewText: typeof data['reviewText'] === 'string' ? data['reviewText'] : '',
    createdAt: data['createdAt']?.toDate?.() ?? new Date(0),
    updatedAt: data['updatedAt']?.toDate?.() ?? new Date(0),
  };
}

/** Extract the `RatingAggregate` fields from a recipe Firestore document. */
export function toRatingAggregate(data: DocumentData): RatingAggregate {
  return {
    ratingCount: typeof data['ratingCount'] === 'number' ? data['ratingCount'] : 0,
    ratingSum: typeof data['ratingSum'] === 'number' ? data['ratingSum'] : 0,
    ratingAverage: typeof data['ratingAverage'] === 'number' ? data['ratingAverage'] : 0,
  };
}
