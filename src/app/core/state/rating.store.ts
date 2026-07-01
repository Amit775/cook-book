import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { RatingAggregate, RecipeRating, ReviewEntry } from '../models/rating.model';
import { Recipe } from '../models/recipe.model';
import { RatingService } from '../services/rating.service';
import { SessionStore } from './session.store';

interface RatingState {
  /** The current user's existing rating for the loaded recipe, or `null` if none. */
  myRating: RecipeRating | null;
  /** Recent reviews fetched from Firestore. */
  reviews: ReviewEntry[];
  /**
   * Live aggregate — seeded from the recipe's own fields on load, then kept
   * up-to-date after each successful submit so the display doesn't go stale.
   * The recipe's aggregate fields on the parent `recipe()` input are
   * authoritative on first load; this state takes over after a submit.
   */
  aggregate: RatingAggregate | null;
  /** Whether a rating submission is in flight. */
  isSaving: boolean;
  /** Whether the initial load is in flight. */
  isLoading: boolean;
  /** Announcement text for the aria-live region after a successful save. */
  saveAnnouncement: string;
  /** User-facing error message, or null when all is well. */
  errorMessage: string | null;
}

const initialState: RatingState = {
  myRating: null,
  reviews: [],
  aggregate: null,
  isSaving: false,
  isLoading: false,
  saveAnnouncement: '',
  errorMessage: null,
};

/**
 * Per-recipe rating UI state. The recipe detail page calls `load()` on mount;
 * `submit()` writes via `RatingService` and updates local state after the save.
 *
 * This store is `providedIn: 'root'` so it persists across navigation, but
 * `load()` resets state on each call, so stale data is never shown.
 */
export const RatingStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const ratingService = inject(RatingService);
    const session = inject(SessionStore);

    function userId(): string | undefined {
      return session.user()?.uid;
    }

    return {
      /**
       * Load the current user's rating and the recent-reviews list for a recipe.
       * Seeds `aggregate` from the recipe's own denormalized fields so the
       * display is immediately accurate before any submit.
       */
      async load(recipe: Recipe): Promise<void> {
        const uid = userId();
        patchState(store, {
          isLoading: true,
          myRating: null,
          reviews: [],
          saveAnnouncement: '',
          errorMessage: null,
          // Seed the live aggregate from the recipe's current fields.
          aggregate: {
            ratingCount: recipe.ratingCount,
            ratingSum: recipe.ratingSum,
            ratingAverage: recipe.ratingAverage,
          },
        });
        try {
          const [myRating, reviews] = await Promise.all([
            uid ? ratingService.getMyRating(recipe.recipeId, uid) : Promise.resolve(null),
            ratingService.listReviews(recipe.recipeId),
          ]);
          patchState(store, { myRating, reviews });
        } catch {
          patchState(store, { errorMessage: 'load-failed' });
        } finally {
          patchState(store, { isLoading: false });
        }
      },

      /**
       * Submit (create or update) the current user's rating.
       * Re-fetches the updated rating doc and reviews list so the UI reflects
       * the committed state. Also re-reads the recipe doc to get the fresh
       * aggregate that the transaction just wrote.
       */
      async submit(recipe: Recipe, stars: number, reviewText: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        patchState(store, { isSaving: true, saveAnnouncement: '', errorMessage: null });
        try {
          await ratingService.setRating(recipe, uid, stars, reviewText);
          // Refresh the user's own rating, the reviews list, AND the fresh aggregate
          // from the recipe doc (which the transaction just updated).
          const [myRating, reviews, freshAggregate] = await Promise.all([
            ratingService.getMyRating(recipe.recipeId, uid),
            ratingService.listReviews(recipe.recipeId),
            ratingService.getAggregate(recipe.recipeId),
          ]);
          patchState(store, { myRating, reviews, aggregate: freshAggregate, saveAnnouncement: 'saved' });
        } catch {
          patchState(store, { errorMessage: 'save-failed' });
        } finally {
          patchState(store, { isSaving: false });
        }
      },

      /** Clear the save announcement after it has been read by the screen reader. */
      clearAnnouncement(): void {
        patchState(store, { saveAnnouncement: '' });
      },
    };
  }),
);
