import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
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

// Blank component used as a catch-all route so navigateByUrl('/library') and
// similar calls don't throw NG04002 "cannot match any routes" in tests.
@Component({ template: '' })
class BlankComponent {}

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
      'share.title': 'Share',
      'share.peopleWithAccess': 'People with access',
      'share.createHint': 'Create a link',
      'share.createLink': 'Create link',
      'share.noOne': 'No one',
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

// ---------------------------------------------------------------------------
// RecipeDetailPage — cover photo cleanup on recipe delete
// ---------------------------------------------------------------------------

describe('RecipeDetailPage — orphaned cover cleanup on delete', () => {
  let fixture: ComponentFixture<RecipeDetailPage>;
  let storageServiceStub: {
    getPhotoUrl: ReturnType<typeof vi.fn>;
    deleteCoverPhoto: ReturnType<typeof vi.fn>;
    copyCoverPhoto: ReturnType<typeof vi.fn>;
  };
  let recipeServiceStub: {
    getRecipe: ReturnType<typeof vi.fn>;
    listVersions: ReturnType<typeof vi.fn>;
    cloneRecipe: ReturnType<typeof vi.fn>;
    deleteRecipe: ReturnType<typeof vi.fn>;
    listMyRecipes: ReturnType<typeof vi.fn>;
  };

  async function setup(recipe: Recipe, ownedRecipes: Recipe[] = []): Promise<void> {
    storageServiceStub = {
      getPhotoUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
      deleteCoverPhoto: vi.fn(async () => undefined),
      copyCoverPhoto: vi.fn(async () => null),
    };
    recipeServiceStub = {
      getRecipe: vi.fn(async () => recipe),
      listVersions: vi.fn(async () => []),
      cloneRecipe: vi.fn(async () => 'new-recipe-id'),
      deleteRecipe: vi.fn(async () => {}),
      listMyRecipes: vi.fn(async () => ownedRecipes),
    };
    const sessionStoreStub = makeSessionStoreStub(true);
    const libraryStoreStub = makeLibraryStoreStub();

    await TestBed.configureTestingModule({
      imports: [RecipeDetailPage],
      providers: [
        provideRouter([{ path: '**', component: BlankComponent }]),
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

  it('calls deleteCoverPhoto with the cover path after a successful recipe delete', async () => {
    const recipe = { ...makeRecipe(), coverPhotoPath: 'recipe-photos/user1/photo.jpg' };
    await setup(recipe, [recipe]);

    await fixture.componentInstance.confirmDelete(recipe);

    expect(recipeServiceStub.deleteRecipe).toHaveBeenCalledOnce();
    expect(storageServiceStub.deleteCoverPhoto).toHaveBeenCalledWith('recipe-photos/user1/photo.jpg');
  });

  it('does NOT call deleteCoverPhoto when the recipe has no cover', async () => {
    const recipe = makeRecipe(); // coverPhotoPath: null
    await setup(recipe, [recipe]);

    await fixture.componentInstance.confirmDelete(recipe);

    expect(recipeServiceStub.deleteRecipe).toHaveBeenCalledOnce();
    expect(storageServiceStub.deleteCoverPhoto).not.toHaveBeenCalled();
  });

  it('skips delete when another owned recipe still references the same path (same-owner guard)', async () => {
    const sharedPath = 'recipe-photos/user1/shared.jpg';
    const recipe = { ...makeRecipe(), coverPhotoPath: sharedPath };
    const otherRecipe = { ...makeRecipe(), recipeId: 'recipe2', coverPhotoPath: sharedPath };
    await setup(recipe, [recipe, otherRecipe]);

    await fixture.componentInstance.confirmDelete(recipe);

    expect(recipeServiceStub.deleteRecipe).toHaveBeenCalledOnce();
    // Guard fires — another owned recipe uses the same path; skip delete.
    expect(storageServiceStub.deleteCoverPhoto).not.toHaveBeenCalled();
  });

  it('still navigates to /library when deleteCoverPhoto resolves (missing object)', async () => {
    // deleteCoverPhoto resolves silently for missing objects (already tested in service).
    const recipe = { ...makeRecipe(), coverPhotoPath: 'recipe-photos/user1/photo.jpg' };
    await setup(recipe, [recipe]);

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    await fixture.componentInstance.confirmDelete(recipe);

    expect(navigateSpy).toHaveBeenCalledWith('/library');
  });

  it('still navigates to /library even when deleteCoverPhoto throws', async () => {
    const recipe = { ...makeRecipe(), coverPhotoPath: 'recipe-photos/user1/photo.jpg' };
    await setup(recipe, [recipe]);
    storageServiceStub.deleteCoverPhoto.mockRejectedValue(new Error('storage error'));

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');

    await fixture.componentInstance.confirmDelete(recipe);

    expect(navigateSpy).toHaveBeenCalledWith('/library');
  });
});
