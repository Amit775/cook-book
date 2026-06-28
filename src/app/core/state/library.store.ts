import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { RecipeCollection } from '../models/collection.model';
import { SavedRecipeService } from '../services/saved-recipe.service';
import { SessionStore } from './session.store';

interface LibraryState {
  savedRecipeIds: string[];
  collections: RecipeCollection[];
  isSavedLoading: boolean;
  isCollectionsLoading: boolean;
}

const initialState: LibraryState = {
  savedRecipeIds: [],
  collections: [],
  isSavedLoading: false,
  isCollectionsLoading: false,
};

/**
 * Global library state: saved recipe ids and the user's collections.
 * Backed by NgRx SignalStore. Shared between the recipe detail page (save toggle,
 * add-to-collection select) and the Library page (Saved grid + Collections section).
 *
 * Firebase side effects are delegated to `SavedRecipeService`; this store only
 * holds the resulting UI state.
 */
export const LibraryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    /** O(1) membership check — use this in templates instead of `.includes()`. */
    savedRecipeIdSet: computed(() => new Set(store.savedRecipeIds())),
  })),
  withMethods((store) => {
    const savedRecipeService = inject(SavedRecipeService);
    const session = inject(SessionStore);

    function userId(): string | undefined {
      return session.user()?.uid;
    }

    return {
      /** Load saved recipe ids from Firestore into the store. */
      async loadSaved(): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        patchState(store, { isSavedLoading: true });
        try {
          const savedRecipeIds = await savedRecipeService.listSavedRecipeIds(uid);
          patchState(store, { savedRecipeIds });
        } finally {
          patchState(store, { isSavedLoading: false });
        }
      },

      /** Load collections from Firestore into the store. */
      async loadCollections(): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        patchState(store, { isCollectionsLoading: true });
        try {
          const collections = await savedRecipeService.listCollections(uid);
          patchState(store, { collections });
        } finally {
          patchState(store, { isCollectionsLoading: false });
        }
      },

      /** Toggle save/unsave for a recipe. Updates local state optimistically then syncs. */
      async toggleSave(recipeId: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        const isSaved = store.savedRecipeIdSet().has(recipeId);
        if (isSaved) {
          patchState(store, { savedRecipeIds: store.savedRecipeIds().filter((id) => id !== recipeId) });
          await savedRecipeService.unsave(uid, recipeId);
        } else {
          patchState(store, { savedRecipeIds: [recipeId, ...store.savedRecipeIds()] });
          await savedRecipeService.save(uid, recipeId);
        }
      },

      /** Create a new collection, refresh the list, and return the new id. */
      async createCollection(name: string): Promise<string> {
        const uid = userId();
        if (!uid) {
          return '';
        }
        const collectionId = await savedRecipeService.createCollection(uid, name);
        const collections = await savedRecipeService.listCollections(uid);
        patchState(store, { collections });
        return collectionId;
      },

      /** Rename an existing collection and refresh the list. */
      async renameCollection(collectionId: string, name: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        await savedRecipeService.renameCollection(uid, collectionId, name);
        const collections = await savedRecipeService.listCollections(uid);
        patchState(store, { collections });
      },

      /** Delete a collection and refresh the list. */
      async deleteCollection(collectionId: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        await savedRecipeService.deleteCollection(uid, collectionId);
        patchState(store, {
          collections: store.collections().filter((existingCollection) => existingCollection.collectionId !== collectionId),
        });
      },

      /** Add a recipe to a collection and refresh the list. */
      async addRecipeToCollection(collectionId: string, recipeId: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        await savedRecipeService.addRecipeToCollection(uid, collectionId, recipeId);
        const collections = await savedRecipeService.listCollections(uid);
        patchState(store, { collections });
      },

      /** Remove a recipe from a collection and refresh the list. */
      async removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        await savedRecipeService.removeRecipeFromCollection(uid, collectionId, recipeId);
        const collections = await savedRecipeService.listCollections(uid);
        patchState(store, { collections });
      },
    };
  }),
);
