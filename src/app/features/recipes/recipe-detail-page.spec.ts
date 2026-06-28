import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock firebase/firestore to prevent the real SDK from initialising during tests.
// LibraryStore → SavedRecipeService → firebase/firestore (real SDK would throw
// "Expected first argument to doc() to be a CollectionReference" in unit tests).
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => null),
  arrayUnion: vi.fn((...args: unknown[]) => args),
  arrayRemove: vi.fn((...args: unknown[]) => args),
}));

import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { LibraryStore } from '../../core/state/library.store';
import { SessionStore } from '../../core/state/session.store';
import { RecipeDetailPage } from './recipe-detail-page';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'collections.addToCollection': 'Add to collection',
      'collections.newOption': 'New collection…',
      'collections.create': 'Create collection',
      'collections.newPlaceholder': 'New collection name',
      'common.saving': 'Saving…',
      'common.loading': 'Loading…',
      'actions.clone': 'Clone',
      'actions.cancel': 'Cancel',
      'actions.delete': 'Delete',
      'actions.edit': 'Edit',
      'cooking.start': 'Start cooking',
      'recipeDetail.cloning': 'Cloning…',
      'recipeDetail.deleteConfirm': 'Are you sure?',
      'recipeDetail.deleting': 'Deleting…',
      'recipeDetail.ingredients': 'Ingredients',
      'recipeDetail.steps': 'Steps',
      'recipeDetail.notFound': 'Not found',
      'recipeDetail.otherVersions': 'Other versions',
      'recipeDetail.prepTime': 'Prep',
      'recipeDetail.cookTime': 'Cook',
      'recipeDetail.adjustServings': 'Adjust servings',
      'recipeDetail.fewerServings': 'Fewer',
      'recipeDetail.moreServings': 'More',
      'recipeDetail.servings': 'servings',
      'recipeType.meal': 'Meal',
      'recipeType.dessert': 'Dessert',
      'recipeType.cocktail': 'Cocktail',
      'saved.save': 'Save',
      'saved.saved': 'Saved',
    });
  }
}

function makeRecipe(): Recipe {
  return {
    recipeId: 'recipe1',
    title: 'Test Recipe',
    description: '',
    type: 'meal',
    authorId: 'user1',
    visibility: 'public',
    sharedWith: [],
    rootId: 'recipe1',
    parentId: null,
    ingredients: [],
    steps: [],
    tags: [],
    keywords: [],
    servings: null,
    prepTime: null,
    cookTime: null,
    coverPhotoPath: null,
    shareId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeSessionStoreStub(authenticated: boolean) {
  return {
    isAuthenticated: signal(authenticated),
    user: signal(authenticated ? { uid: 'user1', displayName: 'User', email: null, photoURL: null } : null),
  };
}

function makeLibraryStoreStub(savedIds: string[] = []) {
  return {
    savedRecipeIdSet: signal(new Set(savedIds)),
    collections: signal([]),
    isSavedLoading: signal(false),
    isCollectionsLoading: signal(false),
    loadSaved: vi.fn(async () => {}),
    loadCollections: vi.fn(async () => {}),
    toggleSave: vi.fn(async () => {}),
    createCollection: vi.fn(async () => 'new-col-id'),
    renameCollection: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
    addRecipeToCollection: vi.fn(async () => {}),
    removeRecipeFromCollection: vi.fn(async () => {}),
  };
}

describe('RecipeDetailPage — add-to-collection select visibility', () => {
  let fixture: ComponentFixture<RecipeDetailPage>;

  async function setup(authenticated: boolean): Promise<void> {
    const sessionStoreStub = makeSessionStoreStub(authenticated);
    const libraryStoreStub = makeLibraryStoreStub();
    const recipeServiceStub = {
      getRecipe: vi.fn(async () => makeRecipe()),
      listVersions: vi.fn(async () => []),
      cloneRecipe: vi.fn(async () => 'new-recipe-id'),
      deleteRecipe: vi.fn(async () => {}),
    };
    const storageServiceStub = {
      getPhotoUrl: vi.fn(async () => ''),
    };

    await TestBed.configureTestingModule({
      imports: [RecipeDetailPage],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
        { provide: SessionStore, useValue: sessionStoreStub },
        { provide: LibraryStore, useValue: libraryStoreStub },
        { provide: RecipeService, useValue: recipeServiceStub },
        { provide: StorageService, useValue: storageServiceStub },
        { provide: FIRESTORE, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecipeDetailPage);
    fixture.componentRef.setInput('recipeId', 'recipe1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function getCollectionSelect(): HTMLSelectElement | null {
    return fixture.nativeElement.querySelector('select');
  }

  function getNewCollectionOption(): HTMLOptionElement | null {
    const select = getCollectionSelect();
    if (!select) return null;
    return Array.from(select.options).find((opt) => opt.value === '__new__') ?? null;
  }

  it('shows the add-to-collection select when signed in and user has zero collections', async () => {
    await setup(true);

    const select = getCollectionSelect();
    expect(select).toBeTruthy();
  });

  it('the select includes the "New collection…" option even with zero existing collections', async () => {
    await setup(true);

    const newOption = getNewCollectionOption();
    expect(newOption).toBeTruthy();
  });

  it('does not show the add-to-collection select when signed out', async () => {
    await setup(false);

    const select = getCollectionSelect();
    expect(select).toBeNull();
  });
});
