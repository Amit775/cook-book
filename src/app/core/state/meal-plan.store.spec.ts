/**
 * Unit tests for MealPlanStore.
 *
 * Strategy: provide the real store with stub collaborators (SessionStore,
 * MealPlanService, ShoppingListStore, ShoppingListService, RecipeService).
 * Firebase SDK calls are never made — the stubs intercept them.
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShoppingList, ShoppingListItem } from '../models/shopping-list.model';
import { MealPlanService } from '../services/meal-plan.service';
import { RecipeService } from '../services/recipe.service';
import { ShoppingListService } from '../services/shopping-list.service';
import { SessionStore } from './session.store';
import { ShoppingListStore } from './shopping-list.store';
import { MealPlanStore, TODAY_TOKEN } from './meal-plan.store';
import type { MealPlan, PlannedRecipe } from '../models/meal-plan.model';
import type { Recipe } from '../models/recipe.model';

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

/** Minimal User-like object the store reads via session.user()?.uid */
const FAKE_USER = { uid: 'user-1', displayName: 'Test User' };

function makeSessionStoreStub(authenticated = true) {
  const userSignal = signal<{ uid: string; displayName: string } | null>(
    authenticated ? FAKE_USER : null,
  );
  return {
    user: userSignal.asReadonly(),
    isAuthenticated: signal(authenticated).asReadonly(),
    displayName: signal(authenticated ? FAKE_USER.displayName : null).asReadonly(),
    signOut: vi.fn(),
  };
}

function makeShoppingListStoreStub() {
  const listsSignal = signal<ShoppingList[]>([]);
  return {
    lists: listsSignal.asReadonly(),
    activeListId: signal<string | null>(null).asReadonly(),
    activeList: signal<ShoppingList | null>(null).asReadonly(),
    isLoading: signal(false).asReadonly(),
    displayItems: signal<ShoppingListItem[]>([]).asReadonly(),
    itemCount: signal(0).asReadonly(),
    uncheckedCount: signal(0).asReadonly(),
    loadLists: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    setActiveList: vi.fn<(id: string) => void>(),
    createList: vi.fn<() => Promise<string>>(() => Promise.resolve('new-list-id')),
    addRecipeToList: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    // Internal mutable reference so tests can inspect what lists were set.
    _setLists: (lists: ShoppingList[]) => listsSignal.set(lists),
  };
}

/** Minimal Recipe used in generateShoppingList tests. */
const FAKE_RECIPE: Recipe = {
  recipeId: 'recipe-1',
  title: 'Pasta',
  description: '',
  type: 'meal',
  authorId: 'user-1',
  visibility: 'private',
  sharedWith: [],
  rootId: 'recipe-1',
  parentId: null,
  servings: 2,
  prepTime: 'PT10M',
  cookTime: 'PT20M',
  ingredients: [
    { ingredientId: null, name: 'Noodles', quantity: 200, unit: 'grams' },
  ],
  steps: [],
  tags: [],
  keywords: [],
  coverPhotoPath: null,
  shareId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PLANNED_RECIPE: PlannedRecipe = {
  recipeId: 'recipe-1',
  title: 'Pasta',
  coverPhotoPath: null,
  type: 'meal',
  servings: 4, // Override servings from recipe default of 2.
};

const WEEK_START = '2024-06-16'; // A known Sunday.

/** Build a MealPlan for the given week. */
function makeMealPlan(days: MealPlan['days'] = {}): MealPlan {
  return {
    weekStartDate: WEEK_START,
    days,
    createdAt: new Date('2024-06-16'),
    updatedAt: new Date('2024-06-16'),
  };
}

// ---------------------------------------------------------------------------
// Test setup helper
// ---------------------------------------------------------------------------

interface TestHarness {
  store: InstanceType<typeof MealPlanStore>;
  mealPlanService: {
    getMealPlan: ReturnType<typeof vi.fn>;
    setDays: ReturnType<typeof vi.fn>;
    deleteMealPlan: ReturnType<typeof vi.fn>;
  };
  shoppingListStoreStub: ReturnType<typeof makeShoppingListStoreStub>;
  shoppingListServiceStub: {
    setItems: ReturnType<typeof vi.fn>;
  };
  recipeServiceStub: {
    getRecipe: ReturnType<typeof vi.fn>;
  };
}

function configure(options: { authenticated?: boolean; fixedDate?: string } = {}): TestHarness {
  const { authenticated = true, fixedDate = '2024-06-18' } = options;

  const mealPlanService = {
    getMealPlan: vi.fn<() => Promise<MealPlan | null>>(() => Promise.resolve(null)),
    setDays: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    deleteMealPlan: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };

  const shoppingListStoreStub = makeShoppingListStoreStub();

  const shoppingListServiceStub = {
    setItems: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };

  const recipeServiceStub = {
    getRecipe: vi.fn<() => Promise<Recipe | null>>(() => Promise.resolve(FAKE_RECIPE)),
    listMyRecipes: vi.fn<() => Promise<Recipe[]>>(() => Promise.resolve([])),
  };

  const [y, m, d] = fixedDate.split('-').map(Number);
  const fixedToday = new Date(y, m - 1, d);
  const todayFactory = () => fixedToday;

  TestBed.configureTestingModule({
    providers: [
      { provide: TODAY_TOKEN, useValue: todayFactory },
      { provide: MealPlanService, useValue: mealPlanService },
      { provide: ShoppingListStore, useValue: shoppingListStoreStub },
      { provide: ShoppingListService, useValue: shoppingListServiceStub },
      { provide: RecipeService, useValue: recipeServiceStub },
      { provide: SessionStore, useValue: makeSessionStoreStub(authenticated) },
    ],
  });

  const store = TestBed.inject(MealPlanStore);

  return { store, mealPlanService, shoppingListStoreStub, shoppingListServiceStub, recipeServiceStub };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MealPlanStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('sets currentWeekStartDate to the Sunday of today', () => {
      // fixedDate 2024-06-18 is a Tuesday; its Sunday is 2024-06-16.
      const { store } = configure({ fixedDate: '2024-06-18' });
      expect(store.currentWeekStartDate()).toBe('2024-06-16');
    });

    it('weekDatesComputed returns 7 dates starting from currentWeekStartDate', () => {
      const { store } = configure({ fixedDate: '2024-06-18' });
      const dates = store.weekDatesComputed();
      expect(dates).toHaveLength(7);
      expect(dates[0]).toBe('2024-06-16');
      expect(dates[6]).toBe('2024-06-22');
    });

    it('assignedRecipeCount starts at 0', () => {
      const { store } = configure();
      expect(store.assignedRecipeCount()).toBe(0);
    });

    it('currentPlan starts null', () => {
      const { store } = configure();
      expect(store.currentPlan()).toBeNull();
    });

    it('isLoading starts false', () => {
      const { store } = configure();
      expect(store.isLoading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // loadWeek
  // -------------------------------------------------------------------------

  describe('loadWeek()', () => {
    it('does nothing when unauthenticated', async () => {
      const { store, mealPlanService } = configure({ authenticated: false });
      await store.loadWeek();
      expect(mealPlanService.getMealPlan).not.toHaveBeenCalled();
    });

    it('loads the plan and stores it', async () => {
      const plan = makeMealPlan();
      const { store, mealPlanService } = configure();
      mealPlanService.getMealPlan.mockResolvedValueOnce(plan);
      await store.loadWeek();
      expect(store.currentPlan()).toBe(plan);
    });

    it('stores null when no plan exists for the week', async () => {
      const { store, mealPlanService } = configure();
      mealPlanService.getMealPlan.mockResolvedValueOnce(null);
      await store.loadWeek();
      expect(store.currentPlan()).toBeNull();
    });

    it('sets isLoading=true during the load then resets to false', async () => {
      const { store, mealPlanService } = configure();
      let wasLoading = false;
      mealPlanService.getMealPlan.mockImplementationOnce(async () => {
        wasLoading = store.isLoading();
        return null;
      });
      await store.loadWeek();
      expect(wasLoading).toBe(true);
      expect(store.isLoading()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Week navigation
  // -------------------------------------------------------------------------

  describe('week navigation', () => {
    it('goToPreviousWeek() moves back one week and calls loadWeek', async () => {
      const { store, mealPlanService } = configure({ fixedDate: '2024-06-18' });
      // currentWeekStartDate is 2024-06-16; previous Sunday is 2024-06-09.
      await store.goToPreviousWeek();
      expect(store.currentWeekStartDate()).toBe('2024-06-09');
      expect(mealPlanService.getMealPlan).toHaveBeenCalledWith('user-1', '2024-06-09');
    });

    it('goToNextWeek() moves forward one week and calls loadWeek', async () => {
      const { store, mealPlanService } = configure({ fixedDate: '2024-06-18' });
      // currentWeekStartDate is 2024-06-16; next Sunday is 2024-06-23.
      await store.goToNextWeek();
      expect(store.currentWeekStartDate()).toBe('2024-06-23');
      expect(mealPlanService.getMealPlan).toHaveBeenCalledWith('user-1', '2024-06-23');
    });

    it('goToThisWeek() resets to the week containing today', async () => {
      const { store, mealPlanService } = configure({ fixedDate: '2024-06-18' });
      // Navigate away first, then come back.
      await store.goToNextWeek();
      expect(store.currentWeekStartDate()).toBe('2024-06-23');
      mealPlanService.getMealPlan.mockClear();
      await store.goToThisWeek();
      expect(store.currentWeekStartDate()).toBe('2024-06-16'); // Back to today's week.
      expect(mealPlanService.getMealPlan).toHaveBeenCalledWith('user-1', '2024-06-16');
    });

    it('navigation clears currentPlan while loading', async () => {
      const { store, mealPlanService } = configure();
      const plan = makeMealPlan({ '2024-06-16': [PLANNED_RECIPE] });
      mealPlanService.getMealPlan.mockResolvedValueOnce(plan);
      await store.loadWeek();
      expect(store.currentPlan()).toBe(plan);

      let planDuringLoad: MealPlan | null | undefined;
      mealPlanService.getMealPlan.mockImplementationOnce(async () => {
        planDuringLoad = store.currentPlan();
        return null;
      });
      await store.goToNextWeek();
      // The plan should be cleared before the load resolves.
      expect(planDuringLoad).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // assignRecipe — deduplication
  // -------------------------------------------------------------------------

  describe('assignRecipe()', () => {
    it('adds a recipe to the specified day', async () => {
      const { store, mealPlanService } = configure();
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      const assigned = store.daysWithRecipes()[WEEK_START];
      expect(assigned).toHaveLength(1);
      expect(assigned[0].recipeId).toBe('recipe-1');
      expect(mealPlanService.setDays).toHaveBeenCalledOnce();
    });

    it('does not add duplicate when same recipeId already assigned to day', async () => {
      const { store } = configure();
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE); // Duplicate.
      const assigned = store.daysWithRecipes()[WEEK_START];
      expect(assigned).toHaveLength(1); // Still 1, not 2.
    });

    it('allows the same recipe on different days', async () => {
      const { store } = configure();
      const tuesday = '2024-06-18';
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      await store.assignRecipe(tuesday, PLANNED_RECIPE);
      expect(store.daysWithRecipes()[WEEK_START]).toHaveLength(1);
      expect(store.daysWithRecipes()[tuesday]).toHaveLength(1);
    });

    it('adds multiple different recipes to the same day', async () => {
      const { store } = configure();
      const second: PlannedRecipe = { ...PLANNED_RECIPE, recipeId: 'recipe-2', title: 'Salad' };
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      await store.assignRecipe(WEEK_START, second);
      expect(store.daysWithRecipes()[WEEK_START]).toHaveLength(2);
    });

    it('does nothing when unauthenticated', async () => {
      const { store, mealPlanService } = configure({ authenticated: false });
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      expect(mealPlanService.setDays).not.toHaveBeenCalled();
    });

    it('updates assignedRecipeCount', async () => {
      const { store } = configure();
      expect(store.assignedRecipeCount()).toBe(0);
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      expect(store.assignedRecipeCount()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // removeRecipe — empties day key
  // -------------------------------------------------------------------------

  describe('removeRecipe()', () => {
    it('removes a recipe from a day', async () => {
      const { store } = configure();
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      await store.removeRecipe(WEEK_START, 'recipe-1');
      expect(store.daysWithRecipes()[WEEK_START]).toHaveLength(0);
    });

    it('removes only the targeted recipe when multiple are assigned', async () => {
      const { store } = configure();
      const second: PlannedRecipe = { ...PLANNED_RECIPE, recipeId: 'recipe-2', title: 'Salad' };
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      await store.assignRecipe(WEEK_START, second);
      await store.removeRecipe(WEEK_START, 'recipe-1');
      const remaining = store.daysWithRecipes()[WEEK_START];
      expect(remaining).toHaveLength(1);
      expect(remaining[0].recipeId).toBe('recipe-2');
    });

    it('deletes the day key from currentPlan.days when last recipe is removed', async () => {
      const { store } = configure();
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      expect(store.currentPlan()?.days).toHaveProperty(WEEK_START);
      await store.removeRecipe(WEEK_START, 'recipe-1');
      expect(store.currentPlan()?.days).not.toHaveProperty(WEEK_START);
    });

    it('persists the updated days to Firestore', async () => {
      const { store, mealPlanService } = configure();
      await store.assignRecipe(WEEK_START, PLANNED_RECIPE);
      mealPlanService.setDays.mockClear();
      await store.removeRecipe(WEEK_START, 'recipe-1');
      expect(mealPlanService.setDays).toHaveBeenCalledOnce();
      const [, , days] = mealPlanService.setDays.mock.calls[0] as [string, string, Record<string, PlannedRecipe[]>];
      expect(days).not.toHaveProperty(WEEK_START);
    });
  });

  // -------------------------------------------------------------------------
  // generateShoppingList — new list branch
  // -------------------------------------------------------------------------

  describe('generateShoppingList() — new list', () => {
    it('does nothing when plan has no recipes', async () => {
      const { store, shoppingListStoreStub } = configure();
      await store.generateShoppingList(null, 'My List');
      expect(shoppingListStoreStub.createList).not.toHaveBeenCalled();
    });

    it('creates a new shopping list with merged ingredients', async () => {
      const { store, shoppingListStoreStub, recipeServiceStub, mealPlanService } = configure();
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();

      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList(null, 'Week of June');

      expect(shoppingListStoreStub.createList).toHaveBeenCalledOnce();
      const callArgs = shoppingListStoreStub.createList.mock.calls[0] as unknown[];
      const name = callArgs[0] as string;
      const items = callArgs[1] as ShoppingListItem[];
      expect(name).toBe('Week of June');
      expect(items.length).toBeGreaterThan(0);
    });

    it('scales ingredients by the plannedRecipe.servings override', async () => {
      const { store, shoppingListStoreStub, recipeServiceStub, mealPlanService } = configure();
      // PLANNED_RECIPE has servings=4; FAKE_RECIPE has servings=2 (baseline).
      // Quantity should be 200g * (4/2) = 400g.
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList(null, 'Scaled List');

      const callArgs = shoppingListStoreStub.createList.mock.calls[0] as unknown[];
      const items = callArgs[1] as ShoppingListItem[];
      const noodles = items.find((item) => item.name === 'Noodles');
      expect(noodles).toBeDefined();
      expect(noodles!.quantity).toBeCloseTo(400); // 200g * (4 planned / 2 recipe) = 400g
    });

    it('sets liveAnnouncement to the new list name', async () => {
      const { store, recipeServiceStub, mealPlanService } = configure();
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList(null, 'Announced List');
      expect(store.liveAnnouncement()).toBe('Announced List');
    });

    it('sets the new list as the active list', async () => {
      const { store, shoppingListStoreStub, recipeServiceStub, mealPlanService } = configure();
      shoppingListStoreStub.createList.mockResolvedValueOnce('created-list-id');
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList(null, 'Active List');
      expect(shoppingListStoreStub.setActiveList).toHaveBeenCalledWith('created-list-id');
    });
  });

  // -------------------------------------------------------------------------
  // generateShoppingList — existing list branch
  // -------------------------------------------------------------------------

  describe('generateShoppingList() — existing list', () => {
    const EXISTING_LIST: ShoppingList = {
      listId: 'list-99',
      name: 'Groceries',
      items: [
        { ingredientId: null, name: 'Bread', quantity: 1, unit: 'loaf', checked: false, sourceRecipeIds: [] },
      ],
      isManuallyOrdered: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('merges items into the existing list', async () => {
      const { store, shoppingListStoreStub, shoppingListServiceStub, recipeServiceStub, mealPlanService } = configure();
      shoppingListStoreStub._setLists([EXISTING_LIST]);
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList('list-99', '');

      expect(shoppingListServiceStub.setItems).toHaveBeenCalledOnce();
      const setItemsArgs = shoppingListServiceStub.setItems.mock.calls[0] as unknown[];
      const listId = setItemsArgs[1] as string;
      const mergedItems = setItemsArgs[2] as ShoppingListItem[];
      expect(listId).toBe('list-99');
      // Both Bread (existing) and Noodles (from recipe) should be present.
      const names = mergedItems.map((i) => i.name);
      expect(names).toContain('Bread');
      expect(names).toContain('Noodles');
    });

    it('reloads shopping lists and sets the existing list as active', async () => {
      const { store, shoppingListStoreStub, recipeServiceStub, mealPlanService } = configure();
      shoppingListStoreStub._setLists([EXISTING_LIST]);
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList('list-99', '');

      expect(shoppingListStoreStub.loadLists).toHaveBeenCalledOnce();
      expect(shoppingListStoreStub.setActiveList).toHaveBeenCalledWith('list-99');
    });

    it('does nothing when the existingListId is not found in the store', async () => {
      const { store, shoppingListStoreStub, shoppingListServiceStub, mealPlanService } = configure();
      // List is empty — 'list-99' won't be found.
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      await store.generateShoppingList('list-99', '');
      expect(shoppingListServiceStub.setItems).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // generateShoppingList — Promise.allSettled tolerance
  // -------------------------------------------------------------------------

  describe('generateShoppingList() — Promise.allSettled tolerance', () => {
    it('still creates a list when one recipe fetch fails (deleted recipe)', async () => {
      const { store, shoppingListStoreStub, recipeServiceStub, mealPlanService } = configure();
      const deletedRecipe: PlannedRecipe = { ...PLANNED_RECIPE, recipeId: 'deleted-recipe', title: 'Deleted' };
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE, deletedRecipe] }),
      );
      await store.loadWeek();

      // First fetch succeeds, second fetch (deleted) fails.
      recipeServiceStub.getRecipe
        .mockResolvedValueOnce(FAKE_RECIPE)
        .mockRejectedValueOnce(new Error('not found'));

      await store.generateShoppingList(null, 'Partial List');

      // Should still have created a list with the surviving recipe's ingredients.
      expect(shoppingListStoreStub.createList).toHaveBeenCalledOnce();
      const callArgs = shoppingListStoreStub.createList.mock.calls[0] as unknown[];
      const items = callArgs[1] as ShoppingListItem[];
      expect(items.length).toBeGreaterThan(0);
    });

    it('does not create a list when all recipe fetches fail', async () => {
      const { store, shoppingListStoreStub, recipeServiceStub, mealPlanService } = configure();
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockRejectedValueOnce(new Error('not found'));
      await store.generateShoppingList(null, 'Empty List');
      expect(shoppingListStoreStub.createList).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // clearAnnouncement
  // -------------------------------------------------------------------------

  describe('clearAnnouncement()', () => {
    it('resets liveAnnouncement to empty string', async () => {
      const { store, recipeServiceStub, mealPlanService } = configure();
      mealPlanService.getMealPlan.mockResolvedValueOnce(
        makeMealPlan({ [WEEK_START]: [PLANNED_RECIPE] }),
      );
      await store.loadWeek();
      recipeServiceStub.getRecipe.mockResolvedValueOnce(FAKE_RECIPE);
      await store.generateShoppingList(null, 'Some List');
      expect(store.liveAnnouncement()).not.toBe('');
      store.clearAnnouncement();
      expect(store.liveAnnouncement()).toBe('');
    });
  });
});
