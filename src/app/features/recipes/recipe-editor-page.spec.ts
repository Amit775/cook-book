import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Must mock firebase/firestore before anything imports it so the SDK never
// initialises. We apply a top-level vi.mock() which Vitest hoists above imports.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ id: 'new-id', path: 'recipes/new-id' })),
  collection: vi.fn(() => ({ path: 'recipes' })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => null),
  arrayUnion: vi.fn((...args: unknown[]) => args),
  arrayRemove: vi.fn((...args: unknown[]) => args),
  Timestamp: { now: vi.fn() },
}));

// Also mock firebase/storage so StorageService can be injected (it imports
// firebase/storage at module level).
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(() => Promise.resolve()),
  getBytes: vi.fn(() => Promise.resolve(new Uint8Array())),
  deleteObject: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/photo.jpg')),
}));

vi.mock('firebase/app', () => {
  class FirebaseError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'FirebaseError';
      this.code = code;
    }
  }
  return { FirebaseError };
});

import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { FIREBASE_STORAGE } from '../../core/firebase/firebase.providers';
import { Recipe } from '../../core/models/recipe.model';
import { IngredientService } from '../../core/services/ingredient.service';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { SessionStore } from '../../core/state/session.store';
import { RecipeEditorPage } from './recipe-editor-page';

// Blank component used as a catch-all route target so navigateByUrl never
// throws NG04002 "cannot match any routes" during tests.
@Component({ template: '' })
class BlankComponent {}

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'recipeEditor.editHeading': 'Edit',
      'create.heading': 'Create',
      'common.signInRequired': 'Sign in required',
      'common.loading': 'Loading…',
      'common.saving': 'Saving…',
      'actions.signIn': 'Sign in',
      'recipeEditor.title': 'Title',
      'recipeEditor.description': 'Description',
      'recipeEditor.type': 'Type',
      'recipeEditor.visibility': 'Visibility',
      'recipeEditor.servings': 'Servings',
      'recipeEditor.prepTimeMinutes': 'Prep time',
      'recipeEditor.cookTimeMinutes': 'Cook time',
      'recipeEditor.ingredients': 'Ingredients',
      'recipeEditor.steps': 'Steps',
      'recipeEditor.tags': 'Tags',
      'recipeEditor.coverPhoto': 'Cover photo',
      'recipeEditor.removeCover': 'Remove cover',
      'recipeEditor.errors.titleRequired': 'Title required',
      'actions.save': 'Save',
      'actions.cancel': 'Cancel',
      'actions.addIngredient': 'Add ingredient',
      'actions.addStep': 'Add step',
      'actions.remove': 'Remove',
      'recipeType.meal': 'Meal',
      'recipeType.dessert': 'Dessert',
      'recipeType.cocktail': 'Cocktail',
      'recipeType.other': 'Other',
      'visibility.private': 'Private',
      'visibility.public': 'Public',
      'visibility.shared': 'Shared',
    });
  }
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'recipe1',
    title: 'My Recipe',
    description: '',
    type: 'meal',
    authorId: 'user1',
    visibility: 'private',
    sharedWith: [],
    rootId: 'recipe1',
    parentId: null,
    ingredients: [{ ingredientId: 'ing1', quantity: 1, unit: 'cup', name: 'Flour' }],
    steps: ['Mix well'],
    tags: [],
    keywords: [],
    servings: null,
    prepTime: null,
    cookTime: null,
    coverPhotoPath: null,
    shareId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(uid = 'user1') {
  return { uid, displayName: 'User', email: null, photoURL: null };
}

interface SetupOptions {
  recipeId?: string;
  recipe?: Recipe | null;
  authenticated?: boolean;
  userId?: string;
  ownedRecipes?: Recipe[];
}

describe('RecipeEditorPage — orphaned cover cleanup', () => {
  let fixture: ComponentFixture<RecipeEditorPage>;
  let storageServiceStub: {
    uploadCoverPhoto: ReturnType<typeof vi.fn>;
    copyCoverPhoto: ReturnType<typeof vi.fn>;
    deleteCoverPhoto: ReturnType<typeof vi.fn>;
    getPhotoUrl: ReturnType<typeof vi.fn>;
  };
  let recipeServiceStub: {
    getRecipe: ReturnType<typeof vi.fn>;
    updateRecipe: ReturnType<typeof vi.fn>;
    createRecipe: ReturnType<typeof vi.fn>;
    listMyRecipes: ReturnType<typeof vi.fn>;
    cloneRecipe: ReturnType<typeof vi.fn>;
    deleteRecipe: ReturnType<typeof vi.fn>;
  };
  let ingredientServiceStub: {
    findOrCreate: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };

  async function setup(options: SetupOptions = {}): Promise<void> {
    const { recipeId = '', recipe = null, authenticated = true, userId = 'user1', ownedRecipes = [] } = options;

    const user = authenticated ? makeUser(userId) : null;

    storageServiceStub = {
      uploadCoverPhoto: vi.fn(async () => `recipe-photos/${userId}/new-photo.jpg`),
      copyCoverPhoto: vi.fn(async () => `recipe-photos/${userId}/copied.jpg`),
      deleteCoverPhoto: vi.fn(async () => undefined),
      getPhotoUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
    };

    recipeServiceStub = {
      getRecipe: vi.fn(async () => recipe),
      updateRecipe: vi.fn(async () => undefined),
      createRecipe: vi.fn(async () => 'new-recipe-id'),
      listMyRecipes: vi.fn(async () => ownedRecipes),
      cloneRecipe: vi.fn(async () => 'cloned-recipe-id'),
      deleteRecipe: vi.fn(async () => undefined),
    };

    ingredientServiceStub = {
      findOrCreate: vi.fn(async (name: string) => ({ ingredientId: `ing-${name}`, name })),
      list: vi.fn(async () => []),
    };

    const sessionStoreStub = {
      isAuthenticated: signal(authenticated),
      user: signal(user),
    };

    await TestBed.configureTestingModule({
      imports: [RecipeEditorPage],
      providers: [
        provideRouter([{ path: '**', component: BlankComponent }]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
        { provide: SessionStore, useValue: sessionStoreStub },
        { provide: RecipeService, useValue: recipeServiceStub },
        { provide: StorageService, useValue: storageServiceStub },
        { provide: IngredientService, useValue: ingredientServiceStub },
        { provide: FIRESTORE, useValue: {} },
        { provide: FIREBASE_STORAGE, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecipeEditorPage);
    if (recipeId) {
      fixture.componentRef.setInput('recipeId', recipeId);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Helper: invoke save() through the component instance's private method
   * by calling save() on a submit event and letting the async flow run.
   * We test the guard and delete side-effects by inspecting stub call counts.
   */
  async function triggerSave(): Promise<void> {
    const submitEvent = new Event('submit');
    submitEvent.preventDefault = vi.fn();
    fixture.componentInstance.save(submitEvent);
    await fixture.whenStable();
  }

  describe('edit mode — cover replacement and deletion', () => {
    it('deletes the previous cover path after a successful update when a new file is uploaded', async () => {
      const recipe = makeRecipe({ coverPhotoPath: 'recipe-photos/user1/old.jpg' });
      await setup({ recipeId: 'recipe1', recipe, ownedRecipes: [] });

      // Simulate selecting a new cover file.
      const fakeFile = new File(['data'], 'new.jpg', { type: 'image/jpeg' });
      fixture.componentInstance['coverPhotoFile'].set(fakeFile);
      storageServiceStub.uploadCoverPhoto.mockResolvedValue('recipe-photos/user1/new.jpg');

      await triggerSave();

      expect(recipeServiceStub.updateRecipe).toHaveBeenCalledOnce();
      expect(storageServiceStub.deleteCoverPhoto).toHaveBeenCalledWith('recipe-photos/user1/old.jpg');
    });

    it('deletes the previous cover when the user removes it (no new file, existingCoverPhotoPath becomes null)', async () => {
      const recipe = makeRecipe({ coverPhotoPath: 'recipe-photos/user1/old.jpg' });
      await setup({ recipeId: 'recipe1', recipe, ownedRecipes: [] });

      // removeCoverPhoto() clears existingCoverPhotoPath to null.
      fixture.componentInstance.removeCoverPhoto();
      fixture.detectChanges();

      await triggerSave();

      expect(recipeServiceStub.updateRecipe).toHaveBeenCalledOnce();
      expect(storageServiceStub.deleteCoverPhoto).toHaveBeenCalledWith('recipe-photos/user1/old.jpg');
    });

    it('does NOT delete the cover when it is unchanged (no new file, same path kept)', async () => {
      const recipe = makeRecipe({ coverPhotoPath: 'recipe-photos/user1/photo.jpg' });
      await setup({ recipeId: 'recipe1', recipe, ownedRecipes: [] });

      // No file selected, existingCoverPhotoPath stays as original.
      await triggerSave();

      expect(recipeServiceStub.updateRecipe).toHaveBeenCalledOnce();
      expect(storageServiceStub.deleteCoverPhoto).not.toHaveBeenCalled();
    });

    it('does NOT delete anything in create mode even with a new file', async () => {
      await setup({ recipeId: '', recipe: null });

      // Populate the model with valid data so the form passes validation and
      // submit() invokes the async callback.
      fixture.componentInstance['model'].set({
        title: 'Brand New Recipe',
        description: '',
        type: 'meal',
        visibility: 'private',
        servings: null,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        ingredients: [{ ingredientId: null, quantity: null, unit: '', name: 'Sugar' }],
        steps: ['Mix'],
        tagsText: '',
      });
      fixture.detectChanges();

      const fakeFile = new File(['data'], 'new.jpg', { type: 'image/jpeg' });
      fixture.componentInstance['coverPhotoFile'].set(fakeFile);

      await triggerSave();

      expect(recipeServiceStub.createRecipe).toHaveBeenCalledOnce();
      expect(storageServiceStub.deleteCoverPhoto).not.toHaveBeenCalled();
    });

    it('navigates to the recipe detail page even when deleteCoverPhoto throws', async () => {
      const recipe = makeRecipe({ coverPhotoPath: 'recipe-photos/user1/old.jpg' });
      await setup({ recipeId: 'recipe1', recipe, ownedRecipes: [] });

      storageServiceStub.deleteCoverPhoto.mockRejectedValue(new Error('storage unavailable'));
      const fakeFile = new File(['data'], 'new.jpg', { type: 'image/jpeg' });
      fixture.componentInstance['coverPhotoFile'].set(fakeFile);

      // Should not throw; navigation still occurs.
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl');

      await triggerSave();

      expect(navigateSpy).toHaveBeenCalledWith('/recipes/recipe1');
    });

    it('skips delete when another owned recipe still references the same path (same-owner guard)', async () => {
      const recipe = makeRecipe({ coverPhotoPath: 'recipe-photos/user1/shared.jpg' });
      const otherRecipe = makeRecipe({ recipeId: 'recipe2', coverPhotoPath: 'recipe-photos/user1/shared.jpg' });
      await setup({ recipeId: 'recipe1', recipe, ownedRecipes: [recipe, otherRecipe] });

      // Replace with a new file so previousPath !== newPath.
      const fakeFile = new File(['data'], 'new.jpg', { type: 'image/jpeg' });
      fixture.componentInstance['coverPhotoFile'].set(fakeFile);

      await triggerSave();

      expect(recipeServiceStub.updateRecipe).toHaveBeenCalledOnce();
      // The guard detects another owned recipe uses the same path — skip delete.
      expect(storageServiceStub.deleteCoverPhoto).not.toHaveBeenCalled();
    });
  });
});
