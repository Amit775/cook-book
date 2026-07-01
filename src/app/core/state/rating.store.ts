import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { RecipeRating, ReviewEntry } from '../models/rating.model';
import { Recipe } from '../models/recipe.model';
import { RatingService } from '../services/rating.service';
import { SessionStore } from './session.store';

interface RatingState {
  /** The current user's existing rating for the loaded recipe, or `null` if none. */
  myRating: RecipeRating | null;
  /** Recent reviews fetched from Firestore. */
  reviews: ReviewEntry[];
  /** Whether a rating submission is in flight. */
  isSaving: boolean;
  /** Whether the initial load is in flight. */
  isLoading: boolean;
  /** Announcement text for the aria-live region after a successful save. */
  saveAnnouncement: string;
}

const initialState: RatingState = {
  myRating: null,
  reviews: [],
  isSaving: false,
  isLoading: false,
  saveAnnouncement: '',
};

/**
 * Per-recipe rating UI state. The recipe detail page calls `load()` on mount;
 * `submit()` writes via `RatingService` and updates local state optimistically.
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
      /** Load the current user's rating and the recent-reviews list for a recipe. */
      async load(recipeId: string): Promise<void> {
        const uid = userId();
        patchState(store, { isLoading: true, myRating: null, reviews: [], saveAnnouncement: '' });
        try {
          const [myRating, reviews] = await Promise.all([
            uid ? ratingService.getMyRating(recipeId, uid) : Promise.resolve(null),
            ratingService.listReviews(recipeId),
          ]);
          patchState(store, { myRating, reviews });
        } finally {
          patchState(store, { isLoading: false });
        }
      },

      /**
       * Submit (create or update) the current user's rating.
       * Refreshes the reviews list after saving so the new entry appears.
       */
      async submit(recipe: Recipe, stars: number, reviewText: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        patchState(store, { isSaving: true, saveAnnouncement: '' });
        try {
          await ratingService.setRating(recipe, uid, stars, reviewText);
          // Refresh both the user's own rating and the reviews list.
          const [myRating, reviews] = await Promise.all([
            ratingService.getMyRating(recipe.recipeId, uid),
            ratingService.listReviews(recipe.recipeId),
          ]);
          patchState(store, { myRating, reviews, saveAnnouncement: 'saved' });
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
