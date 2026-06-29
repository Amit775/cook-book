import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { computed, signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MealPlan } from '../../core/models/meal-plan.model';
import { weekDates, formatWeekStartDate, startOfWeek } from '../../core/models/week.model';
import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { RecipeService } from '../../core/services/recipe.service';
import { MealPlanStore, TODAY_TOKEN } from '../../core/state/meal-plan.store';
import { SessionStore } from '../../core/state/session.store';
import { ShoppingListStore } from '../../core/state/shopping-list.store';
import { MealPlannerPage } from './meal-planner-page';

// ---------------------------------------------------------------------------
// Firebase SDK mock — hoisted before any imports that reach the real SDK
// ---------------------------------------------------------------------------

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'doc-id', path: 'mock/path' })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  collection: vi.fn(() => ({ path: 'mock-collection' })),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  Timestamp: class { toDate() { return new Date(); } },
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/photo.jpg')),
}));

// ---------------------------------------------------------------------------
// Transloco stub loader
// ---------------------------------------------------------------------------

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'mealPlanner.heading': 'Meal Planner',
      'mealPlanner.previousWeek': 'Previous week',
      'mealPlanner.nextWeek': 'Next week',
      'mealPlanner.thisWeek': 'This week',
      'mealPlanner.weekOf': 'Week of {{range}}',
      'mealPlanner.today': 'Today',
      'mealPlanner.emptyWeek': 'No recipes planned this week.',
      'mealPlanner.emptyDay': 'Nothing planned.',
      'mealPlanner.addRecipe': 'Add recipe',
      'mealPlanner.generateList': 'Create shopping list from this week',
      'mealPlanner.recipeCountOne': '1 recipe',
      'mealPlanner.recipeCountOther': '{{count}} recipes',
      'mealPlanner.generatedList': 'Created list {{listName}}',
      'mealPlanner.removeRecipe': 'Remove {{title}} from {{day}}',
      'mealPlanner.day.sunday': 'Sunday',
      'mealPlanner.day.monday': 'Monday',
      'mealPlanner.day.tuesday': 'Tuesday',
      'mealPlanner.day.wednesday': 'Wednesday',
      'mealPlanner.day.thursday': 'Thursday',
      'mealPlanner.day.friday': 'Friday',
      'mealPlanner.day.saturday': 'Saturday',
      'recipeType.meal': 'Meal',
      'recipeType.dessert': 'Dessert',
      'recipeType.cocktail': 'Cocktail',
      'recipeType.other': 'Other',
      'common.signInRequired': 'Sign in to continue.',
      'common.loading': 'Loading...',
      'common.saving': 'Saving...',
      'actions.signIn': 'Sign in',
      'actions.cancel': 'Cancel',
      'shoppingList.selectList': 'Select list',
      'shoppingList.newOption': 'New list…',
      'shoppingList.newListPlaceholder': 'New list name',
    });
  }
}

// ---------------------------------------------------------------------------
// Store stubs — keeps unit tests isolated from real Firestore
// ---------------------------------------------------------------------------

function makeMealPlanStoreStub(overrides: Partial<{
  currentWeekStartDate: string;
  currentPlan: MealPlan | null;
  isLoading: boolean;
}> = {}) {
  const fixedToday = new Date(2024, 5, 19); // Wed 2024-06-19
  const defaultWeekStart = formatWeekStartDate(startOfWeek(fixedToday));
  const currentWeekStartDate = signal(overrides.currentWeekStartDate ?? defaultWeekStart);
  const currentPlan = signal<MealPlan | null>(overrides.currentPlan ?? null);
  const isLoading = signal(overrides.isLoading ?? false);
  const liveAnnouncement = signal('');
  const weekDatesComputed = computed(() => weekDates(currentWeekStartDate()));
  const daysWithRecipes = computed(() => {
    const dates = weekDatesComputed();
    const plan = currentPlan();
    return dates.reduce<Record<string, import('../../core/models/meal-plan.model').PlannedRecipe[]>>((acc, date) => {
      acc[date] = plan?.days[date] ?? [];
      return acc;
    }, {});
  });
  const assignedRecipeCount = computed(() => {
    const plan = currentPlan();
    if (!plan) return 0;
    return Object.values(plan.days).reduce((sum, recipes) => sum + recipes.length, 0);
  });

  return {
    currentWeekStartDate,
    currentPlan,
    isLoading,
    liveAnnouncement,
    weekDatesComputed,
    daysWithRecipes,
    assignedRecipeCount,
    loadWeek: vi.fn(() => Promise.resolve()),
    goToPreviousWeek: vi.fn(() => Promise.resolve()),
    goToNextWeek: vi.fn(() => Promise.resolve()),
    goToThisWeek: vi.fn(() => Promise.resolve()),
    goToWeekOf: vi.fn(() => Promise.resolve()),
    assignRecipe: vi.fn(() => Promise.resolve()),
    removeRecipe: vi.fn(() => Promise.resolve()),
    generateShoppingList: vi.fn(() => Promise.resolve()),
    clearAnnouncement: vi.fn(),
  };
}

function makeSessionStoreStub(authenticated = false) {
  const user = signal(authenticated ? { uid: 'user1', displayName: 'Test' } as unknown as import('firebase/auth').User : null);
  return {
    user,
    status: signal(authenticated ? 'authenticated' as const : 'anonymous' as const),
    isAuthenticated: computed(() => user() !== null),
    displayName: computed(() => user()?.displayName ?? null),
    signOut: vi.fn(() => Promise.resolve()),
  };
}

function makeShoppingListStoreStub() {
  return {
    lists: signal([]),
    activeListId: signal<string | null>(null),
    activeList: computed(() => null),
    displayItems: computed(() => []),
    itemCount: computed(() => 0),
    uncheckedCount: computed(() => 0),
    isLoading: signal(false),
    loadLists: vi.fn(() => Promise.resolve()),
    setActiveList: vi.fn(),
    createList: vi.fn(() => Promise.resolve('new-list-id')),
    renameList: vi.fn(() => Promise.resolve()),
    deleteList: vi.fn(() => Promise.resolve()),
    addRecipeToList: vi.fn(() => Promise.resolve()),
    toggleItem: vi.fn(() => Promise.resolve()),
    clearActiveList: vi.fn(() => Promise.resolve()),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MealPlannerPage', () => {
  const fixedToday = new Date(2024, 5, 19); // Wed 2024-06-19

  function configure(authenticated = false, mealPlanOverrides: Parameters<typeof makeMealPlanStoreStub>[0] = {}) {
    const mealPlanStoreStub = makeMealPlanStoreStub(mealPlanOverrides);
    const sessionStoreStub = makeSessionStoreStub(authenticated);
    const shoppingListStoreStub = makeShoppingListStoreStub();

    TestBed.configureTestingModule({
      imports: [MealPlannerPage],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { defaultLang: 'en', availableLangs: ['en'] },
          loader: StubLoader,
        }),
        { provide: TODAY_TOKEN, useValue: () => fixedToday },
        { provide: MealPlanStore, useValue: mealPlanStoreStub },
        { provide: SessionStore, useValue: sessionStoreStub },
        { provide: ShoppingListStore, useValue: shoppingListStoreStub },
        { provide: FIRESTORE, useValue: {} },
        {
          provide: RecipeService,
          useValue: {
            listMyRecipes: vi.fn(() => Promise.resolve([])),
            getRecipe: vi.fn(() => Promise.resolve(null)),
          },
        },
      ],
    });
    return { mealPlanStoreStub, sessionStoreStub, shoppingListStoreStub };
  }

  it('renders the meal planner heading', async () => {
    configure();
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent?.trim()).toContain('Meal Planner');
  });

  it('shows sign-in prompt when not authenticated', async () => {
    configure(false);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Sign in to continue.');
  });

  it('renders 7 day cells when authenticated', async () => {
    configure(true);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const dayItems = compiled.querySelectorAll('.meal-planner-day');
    expect(dayItems.length).toBe(7);
  });

  it('highlights today in the grid', async () => {
    configure(true);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    // 2024-06-19 is a Wednesday, week starts 2024-06-16 (Sunday)
    // The "is-today" class should be on the cell for 2024-06-19
    const todayCell = compiled.querySelector('.meal-planner-day.is-today');
    expect(todayCell).toBeTruthy();
    expect(todayCell?.textContent).toContain('Today');
  });

  it('shows navigation buttons when authenticated', async () => {
    configure(true);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Previous week');
    expect(compiled.textContent).toContain('Next week');
    expect(compiled.textContent).toContain('This week');
  });

  it('shows empty week message when no recipes are assigned', async () => {
    configure(true, { currentPlan: null, isLoading: false });
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No recipes planned this week.');
  });

  it('shows generate shopping list section when authenticated', async () => {
    configure(true);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Create shopping list from this week');
  });

  it('calls loadWeek on init when authenticated', async () => {
    const { mealPlanStoreStub } = configure(true);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mealPlanStoreStub.loadWeek).toHaveBeenCalled();
  });

  it('uses the Sunday of the week containing the fixed today as the week start', async () => {
    const { mealPlanStoreStub } = configure(true);
    const weekStartDate = mealPlanStoreStub.currentWeekStartDate();
    // 2024-06-19 (Wed) → week starts 2024-06-16 (Sun)
    expect(weekStartDate).toBe('2024-06-16');
  });

  it('renders "Add recipe" buttons for each day', async () => {
    configure(true);
    const fixture = TestBed.createComponent(MealPlannerPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const addButtons = compiled.querySelectorAll('.meal-planner-add-btn');
    expect(addButtons.length).toBe(7);
  });
});
