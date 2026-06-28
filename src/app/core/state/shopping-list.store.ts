import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { Recipe } from '../models/recipe.model';
import {
  itemsFromRecipe,
  mergeItems,
  ShoppingList,
  ShoppingListItem,
  sortItemsAlphabetically,
} from '../models/shopping-list.model';
import { ShoppingListService } from '../services/shopping-list.service';
import { SessionStore } from './session.store';

const LAST_LIST_ID_KEY = 'cookbook.lastShoppingListId';

interface ShoppingListState {
  lists: ShoppingList[];
  activeListId: string | null;
  isLoading: boolean;
}

const initialState: ShoppingListState = {
  lists: [],
  activeListId: null,
  isLoading: false,
};

/**
 * Global shopping list state, backed by NgRx SignalStore.
 * Mirrors the LibraryStore + SavedRecipeService split:
 * Firebase side effects are delegated to `ShoppingListService`.
 */
export const ShoppingListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    activeList: computed(() =>
      store.lists().find((list) => list.listId === store.activeListId()) ?? null,
    ),
    /**
     * Items in display order. Since `isManuallyOrdered` is always `false` in
     * PR-A (reorder UI deferred to #29), we always sort alphabetically.
     */
    displayItems: computed(() => {
      const list = store.lists().find((list) => list.listId === store.activeListId());
      if (!list) {
        return [];
      }
      // When isManuallyOrdered is true (future PR #29), the stored array order
      // would be the source of truth. For now, always alphabetical.
      return sortItemsAlphabetically(list.items);
    }),
    itemCount: computed(() => {
      const list = store.lists().find((list) => list.listId === store.activeListId());
      return list?.items.length ?? 0;
    }),
    uncheckedCount: computed(() => {
      const list = store.lists().find((list) => list.listId === store.activeListId());
      return list?.items.filter((item) => !item.checked).length ?? 0;
    }),
  })),
  withMethods((store) => {
    const shoppingListService = inject(ShoppingListService);
    const session = inject(SessionStore);

    function userId(): string | undefined {
      return session.user()?.uid;
    }

    return {
      /**
       * Load all lists for the current user. Restores `activeListId` from
       * localStorage (fallback: newest list).
       */
      async loadLists(): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        patchState(store, { isLoading: true });
        try {
          const lists = await shoppingListService.listShoppingLists(uid);
          const savedListId = localStorage.getItem(LAST_LIST_ID_KEY);
          const restoredId =
            savedListId && lists.some((list) => list.listId === savedListId)
              ? savedListId
              : (lists[0]?.listId ?? null);
          patchState(store, { lists, activeListId: restoredId });
        } finally {
          patchState(store, { isLoading: false });
        }
      },

      /** Switch the active list and persist the choice to localStorage. */
      setActiveList(listId: string): void {
        patchState(store, { activeListId: listId });
        localStorage.setItem(LAST_LIST_ID_KEY, listId);
      },

      /** Create a new list with the given name. Refreshes the list and activates it. */
      async createList(name: string, initialItems: ShoppingListItem[] = []): Promise<string> {
        const uid = userId();
        if (!uid) {
          return '';
        }
        const listId = await shoppingListService.createList(uid, name, initialItems);
        const lists = await shoppingListService.listShoppingLists(uid);
        patchState(store, { lists, activeListId: listId });
        localStorage.setItem(LAST_LIST_ID_KEY, listId);
        return listId;
      },

      /** Rename the given list. Refreshes store state. */
      async renameList(listId: string, name: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        // Optimistic update
        patchState(store, {
          lists: store.lists().map((list) =>
            list.listId === listId ? { ...list, name } : list,
          ),
        });
        await shoppingListService.renameList(uid, listId, name);
        const lists = await shoppingListService.listShoppingLists(uid);
        patchState(store, { lists });
      },

      /** Delete the given list. Switches to the next available list. */
      async deleteList(listId: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        // Optimistic update
        const remainingLists = store.lists().filter((list) => list.listId !== listId);
        const nextActiveId =
          store.activeListId() === listId ? (remainingLists[0]?.listId ?? null) : store.activeListId();
        patchState(store, { lists: remainingLists, activeListId: nextActiveId });
        if (nextActiveId) {
          localStorage.setItem(LAST_LIST_ID_KEY, nextActiveId);
        } else {
          localStorage.removeItem(LAST_LIST_ID_KEY);
        }
        await shoppingListService.deleteList(uid, listId);
      },

      /**
       * Merge a recipe's scaled ingredients into the given list.
       * Creates the list first if `listId` is not found (should not happen in practice).
       */
      async addRecipeToList(listId: string, recipe: Recipe, targetServings: number): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        const list = store.lists().find((existingList) => existingList.listId === listId);
        if (!list) {
          return;
        }
        const incoming = itemsFromRecipe(recipe, targetServings);
        const mergedItems = mergeItems(list.items, incoming);

        // Optimistic update
        patchState(store, {
          lists: store.lists().map((existingList) =>
            existingList.listId === listId ? { ...existingList, items: mergedItems } : existingList,
          ),
        });

        await shoppingListService.setItems(uid, listId, mergedItems, list.isManuallyOrdered);
      },

      /** Toggle the checked state of an item within the active list. Optimistic-then-sync. */
      async toggleItem(itemIndex: number): Promise<void> {
        const uid = userId();
        const list = store.lists().find((existingList) => existingList.listId === store.activeListId());
        if (!uid || !list) {
          return;
        }
        const updatedItems = list.items.map((item, index) =>
          index === itemIndex ? { ...item, checked: !item.checked } : item,
        );
        // Optimistic update
        patchState(store, {
          lists: store.lists().map((existingList) =>
            existingList.listId === list.listId
              ? { ...existingList, items: updatedItems }
              : existingList,
          ),
        });
        await shoppingListService.setItems(uid, list.listId, updatedItems, list.isManuallyOrdered);
      },

      /** Clear all items from the active list. */
      async clearActiveList(): Promise<void> {
        const uid = userId();
        const list = store.lists().find((existingList) => existingList.listId === store.activeListId());
        if (!uid || !list) {
          return;
        }
        // Optimistic update
        patchState(store, {
          lists: store.lists().map((existingList) =>
            existingList.listId === list.listId ? { ...existingList, items: [] } : existingList,
          ),
        });
        await shoppingListService.setItems(uid, list.listId, [], list.isManuallyOrdered);
      },
    };
  }),
);
