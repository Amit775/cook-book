import { IsoDuration } from './duration.model';
import { Ingredient } from './ingredient.model';
import { RecipeType } from './recipe-type.model';
import { RecipeVisibility } from './recipe-visibility.model';

export interface Recipe {
  /** Firestore document id. */
  recipeId: string;
  title: string;
  description: string;
  type: RecipeType;
  /** User id of the author/owner. */
  authorId: string;
  visibility: RecipeVisibility;
  /** User ids this recipe is explicitly shared with (used when visibility is `shared`). */
  sharedWith: string[];
  /** The original ancestor of this recipe's clone family. Equals `recipeId` for an original. */
  rootId: string;
  /** The recipe this one was cloned from, or `null` for an original. */
  parentId: string | null;
  ingredients: Ingredient[];
  /** Ordered preparation steps. */
  steps: string[];
  /** Free-form tags, for example "vegan", "quick". */
  tags: string[];
  /** Lowercased search terms (title + tags + ingredient names) for `array-contains` queries. */
  keywords: string[];
  servings: number | null;
  /** Preparation time as an ISO 8601 duration, for example `PT20M`. */
  prepTime: IsoDuration | null;
  /** Cooking time as an ISO 8601 duration, for example `PT1H`. */
  cookTime: IsoDuration | null;
  /** Cloud Storage path of the cover photo, or `null`. */
  coverPhotoPath: string | null;
  /** Secret token for the "anyone with the link" share URL, or `null` if no link. */
  shareId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Denormalized rating aggregate fields — maintained by client-side transaction
   * in `RatingService.setRating`. Not author-editable (excluded from `RecipeDraft`).
   */
  ratingCount: number;
  ratingSum: number;
  /** Average rounded to 1 decimal; 0 when no ratings. */
  ratingAverage: number;
}

/**
 * The author-editable fields of a recipe. `recipeId`, `authorId`, `rootId`,
 * `createdAt`, `updatedAt`, and the three rating aggregate fields are assigned
 * by the data layer, not the editor.
 */
export type RecipeDraft = Omit<Recipe, 'recipeId' | 'authorId' | 'rootId' | 'shareId' | 'createdAt' | 'updatedAt' | 'ratingCount' | 'ratingSum' | 'ratingAverage'>;
