import { computed, inject, InjectionToken } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { MealPlan, PlannedRecipe } from '../models/meal-plan.model';
import { itemsFromRecipe, mergeItems, ShoppingListItem } from '../models/shopping-list.model';
import { addWeeks, formatWeekStartDate, startOfWeek, weekDates } from '../models/week.model';
import { MealPlanService } from '../services/meal-plan.service';
import { RecipeService } from '../services/recipe.service';
import { ShoppingListService } from '../services/shopping-list.service';
import { SessionStore } from './session.store';
import { ShoppingListStore } from './shopping-list.store';

/**
 * Injection token for "today". Injecting a factory instead of calling
 * `new Date()` at module scope lets tests override the clock.
 */
export const TODAY_TOKEN = new InjectionToken<() => Date>('TODAY_TOKEN', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

interface MealPlanState {
  /** The Sunday of the week currently shown, as YYYY-MM-DD. */
  currentWeekStartDate: string;
  /** The loaded meal plan for the current week, or `null` if none or not yet loaded. */
  currentPlan: MealPlan | null;
  isLoading: boolean;
  /** Announcement text for the aria-live region (added/generated confirmation). */
  liveAnnouncement: string;
}

/**
 * Global meal-plan state, backed by NgRx SignalStore.
 * Mirrors the ShoppingListStore split: Firebase I/O in `MealPlanService`,
 * UI state here.
 */
export const MealPlanStore = signalStore(
  { providedIn: 'root' },
  withState<MealPlanState>(() => {
    // Read "today" through the injected factory so module-scope `new Date()` is avoided.
    const today = inject(TODAY_TOKEN)();
    const weekStart = startOfWeek(today);
    return {
      currentWeekStartDate: formatWeekStartDate(weekStart),
      currentPlan: null,
      isLoading: false,
      liveAnnouncement: '',
    };
  }),
  withComputed((store) => ({
    /** The 7 YYYY-MM-DD strings (Sun…Sat) for the current week. */
    weekDatesComputed: computed(() => weekDates(store.currentWeekStartDate())),
    /**
     * Each day's array of PlannedRecipes (empty array when no recipes assigned).
     * Keyed by YYYY-MM-DD.
     */
    daysWithRecipes: computed(() => {
      const dates = weekDates(store.currentWeekStartDate());
      const plan = store.currentPlan();
      return dates.reduce<Record<string, PlannedRecipe[]>>((accumulator, date) => {
        accumulator[date] = plan?.days[date] ?? [];
        return accumulator;
      }, {});
    }),
    /** Total number of recipes assigned across all days in the current week. */
    assignedRecipeCount: computed(() => {
      const plan = store.currentPlan();
      if (!plan) {
        return 0;
      }
      return Object.values(plan.days).reduce((sum, recipes) => sum + recipes.length, 0);
    }),
  })),
  withMethods((store) => {
    const mealPlanService = inject(MealPlanService);
    const recipeService = inject(RecipeService);
    const shoppingListService = inject(ShoppingListService);
    const shoppingListStore = inject(ShoppingListStore);
    const session = inject(SessionStore);
    const getToday = inject(TODAY_TOKEN);

    function userId(): string | undefined {
      return session.user()?.uid;
    }

    /**
     * Merge many planned recipes into a flat list of shopping-list items.
     * This is the seam that #31 (standalone multi-recipe builder) can lift later.
     */
    async function mergeAllPlannedRecipes(planned: PlannedRecipe[]): Promise<ShoppingListItem[]> {
      const results = await Promise.allSettled(
        planned.map((plannedRecipe) => recipeService.getRecipe(plannedRecipe.recipeId)),
      );
      return results.reduce<ShoppingListItem[]>((accumulator, result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const plannedRecipe = planned[index];
          const targetServings = plannedRecipe.servings ?? result.value.servings ?? 1;
          const incoming = itemsFromRecipe(result.value, targetServings);
          return mergeItems(accumulator, incoming);
        }
        return accumulator;
      }, []);
    }

    return {
      /** Load the meal plan for the current week from Firestore. */
      async loadWeek(): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        patchState(store, { isLoading: true });
        try {
          const plan = await mealPlanService.getMealPlan(uid, store.currentWeekStartDate());
          patchState(store, { currentPlan: plan });
        } finally {
          patchState(store, { isLoading: false });
        }
      },

      /** Navigate to the previous week and load its plan. */
      async goToPreviousWeek(): Promise<void> {
        const previousWeek = addWeeks(store.currentWeekStartDate(), -1);
        patchState(store, { currentWeekStartDate: previousWeek, currentPlan: null });
        await this.loadWeek();
      },

      /** Navigate to the next week and load its plan. */
      async goToNextWeek(): Promise<void> {
        const nextWeek = addWeeks(store.currentWeekStartDate(), 1);
        patchState(store, { currentWeekStartDate: nextWeek, currentPlan: null });
        await this.loadWeek();
      },

      /** Jump to the week containing a specific date and load its plan. */
      async goToWeekOf(date: Date): Promise<void> {
        const weekStart = formatWeekStartDate(startOfWeek(date));
        patchState(store, { currentWeekStartDate: weekStart, currentPlan: null });
        await this.loadWeek();
      },

      /** Jump to the current week (today) and load its plan. */
      async goToThisWeek(): Promise<void> {
        const today = getToday();
        const weekStart = formatWeekStartDate(startOfWeek(today));
        patchState(store, { currentWeekStartDate: weekStart, currentPlan: null });
        await this.loadWeek();
      },

      /**
       * Add a recipe to a specific day. Optimistic update then persists.
       */
      async assignRecipe(dateString: string, recipe: PlannedRecipe): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }

        // Build the updated days map optimistically.
        const currentDays = { ...(store.currentPlan()?.days ?? {}) };
        const dayRecipes = [...(currentDays[dateString] ?? [])];
        // Avoid duplicates within the same day.
        if (!dayRecipes.some((existing) => existing.recipeId === recipe.recipeId)) {
          dayRecipes.push(recipe);
        }
        currentDays[dateString] = dayRecipes;

        const updatedPlan: MealPlan = {
          weekStartDate: store.currentWeekStartDate(),
          days: currentDays,
          createdAt: store.currentPlan()?.createdAt ?? new Date(),
          updatedAt: new Date(),
        };
        patchState(store, { currentPlan: updatedPlan });

        await mealPlanService.setDays(uid, store.currentWeekStartDate(), currentDays);
      },

      /**
       * Remove a recipe from a specific day. Optimistic update then persists.
       * Removes the first occurrence of the given recipeId.
       */
      async removeRecipe(dateString: string, recipeId: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }

        const currentDays = { ...(store.currentPlan()?.days ?? {}) };
        const dayRecipes = (currentDays[dateString] ?? []).filter((recipe) => recipe.recipeId !== recipeId);
        if (dayRecipes.length > 0) {
          currentDays[dateString] = dayRecipes;
        } else {
          delete currentDays[dateString];
        }

        const updatedPlan: MealPlan = {
          weekStartDate: store.currentWeekStartDate(),
          days: currentDays,
          createdAt: store.currentPlan()?.createdAt ?? new Date(),
          updatedAt: new Date(),
        };
        patchState(store, { currentPlan: updatedPlan });

        await mealPlanService.setDays(uid, store.currentWeekStartDate(), currentDays);
      },

      /**
       * Generate a shopping list from all recipes in the current week.
       *
       * - Re-fetches each live `Recipe` document (tolerates deleted recipes via
       *   `Promise.allSettled`).
       * - Merges all ingredients via `itemsFromRecipe` + `mergeItems` (the same
       *   helpers used by `ShoppingListStore.addRecipeToList`).
       * - Routes through `ShoppingListStore` so its active-list/localStorage
       *   bookkeeping stays in one place.
       *
       * This is the thin seam that #31 can reuse — `mergeAllPlannedRecipes` is
       * the reusable helper; the routing through `ShoppingListStore` stays here.
       *
       * @param existingListId When non-null, merge into this list. When null,
       *   create a new list named `newListName`.
       * @param newListName Name for the new list (used when `existingListId` is null).
       */
      async generateShoppingList(existingListId: string | null, newListName: string): Promise<void> {
        const uid = userId();
        if (!uid) {
          return;
        }
        const plan = store.currentPlan();
        const allPlanned = plan ? Object.values(plan.days).flat() : [];
        if (allPlanned.length === 0) {
          return;
        }

        const mergedItems = await mergeAllPlannedRecipes(allPlanned);
        if (mergedItems.length === 0) {
          return;
        }

        let targetListId: string;
        let targetListName: string;

        if (existingListId) {
          // Merge into existing list.
          const existingList = shoppingListStore.lists().find((list) => list.listId === existingListId);
          if (!existingList) {
            return;
          }
          const mergedAll = mergeItems(existingList.items, mergedItems);
          await shoppingListService.setItems(uid, existingListId, mergedAll, existingList.isManuallyOrdered);
          // Refresh the store and set the list as active.
          await shoppingListStore.loadLists();
          shoppingListStore.setActiveList(existingListId);
          targetListId = existingListId;
          targetListName = existingList.name;
        } else {
          // Create a new list pre-populated with all items.
          targetListId = await shoppingListStore.createList(newListName, mergedItems);
          targetListName = newListName;
        }

        patchState(store, { liveAnnouncement: targetListName });
        shoppingListStore.setActiveList(targetListId);
      },

      /** Clear the live announcement after it has been read. */
      clearAnnouncement(): void {
        patchState(store, { liveAnnouncement: '' });
      },
    };
  }),
);
