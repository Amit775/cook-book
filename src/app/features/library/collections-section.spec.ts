import { ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeCollection } from '../../core/models/collection.model';
import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { FIREBASE_STORAGE } from '../../core/firebase/firebase.providers';
import { LibraryStore } from '../../core/state/library.store';
import { CollectionsSection } from './collections-section';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'collections.sectionTitle': 'Collections',
      'collections.empty': 'No collections yet. Create your first!',
      'collections.newPlaceholder': 'New collection name',
      'collections.create': 'Create collection',
      'collections.rename': 'Rename',
      'collections.delete': 'Delete collection',
      'collections.deleteConfirm': "Delete this collection? This can't be undone.",
      'collections.addToCollection': 'Add to collection',
      'collections.removeFromCollection': 'Remove from collection',
      'collections.newOption': 'New collection…',
      'collections.recipeCountOne': '{{count}} recipe',
      'collections.recipeCountOther': '{{count}} recipes',
      'actions.cancel': 'Cancel',
      'actions.delete': 'Delete',
      'common.loading': 'Loading...',
    });
  }
}

function makeRecipe(recipeId: string): Recipe {
  return {
    recipeId,
    title: `Recipe ${recipeId}`,
    description: '',
    type: 'meal',
    authorId: 'user1',
    visibility: 'public',
    sharedWith: [],
    rootId: recipeId,
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
    ratingCount: 0,
    ratingSum: 0,
    ratingAverage: 0,
  };
}

function makeCollection(collectionId: string, recipeIds: string[] = []): RecipeCollection {
  return {
    collectionId,
    name: `Collection ${collectionId}`,
    recipeIds,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeLibraryStoreStub(initialCollections: RecipeCollection[] = []) {
  const collectionsSignal = signal<RecipeCollection[]>(initialCollections);
  return {
    collections: collectionsSignal,
    isCollectionsLoading: () => false,
    createCollection: vi.fn(async (name: string) => {
      const id = `new-${name}`;
      collectionsSignal.update((collections) => [...collections, makeCollection(id)]);
      return id;
    }),
    renameCollection: vi.fn(async (collectionId: string, name: string) => {
      collectionsSignal.update((collections) =>
        collections.map((collection) => (collection.collectionId === collectionId ? { ...collection, name } : collection)),
      );
    }),
    deleteCollection: vi.fn(async (collectionId: string) => {
      collectionsSignal.update((collections) => collections.filter((collection) => collection.collectionId !== collectionId));
    }),
    addRecipeToCollection: vi.fn(),
    removeRecipeFromCollection: vi.fn(async (collectionId: string, recipeId: string) => {
      collectionsSignal.update((collections) =>
        collections.map((collection) =>
          collection.collectionId === collectionId
            ? { ...collection, recipeIds: collection.recipeIds.filter((id) => id !== recipeId) }
            : collection,
        ),
      );
    }),
  };
}

describe('CollectionsSection', () => {
  let fixture: ComponentFixture<CollectionsSection>;
  let componentRef: ComponentRef<CollectionsSection>;
  let libraryStoreStub: ReturnType<typeof makeLibraryStoreStub>;
  let recipeServiceStub: { getRecipe: ReturnType<typeof vi.fn> };

  async function setup(collections: RecipeCollection[] = [], recipeMap: Record<string, Recipe | null> = {}): Promise<void> {
    libraryStoreStub = makeLibraryStoreStub(collections);
    recipeServiceStub = {
      getRecipe: vi.fn((id: string) => Promise.resolve(recipeMap[id] ?? null)),
    };

    await TestBed.configureTestingModule({
      imports: [CollectionsSection],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
        { provide: LibraryStore, useValue: libraryStoreStub },
        { provide: RecipeService, useValue: recipeServiceStub },
        { provide: FIREBASE_STORAGE, useValue: {} },
        { provide: StorageService, useValue: { getPhotoUrl: () => Promise.resolve('') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsSection);
    componentRef = fixture.componentRef;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function getInput(): HTMLInputElement | null {
    return fixture.nativeElement.querySelector('input[type="text"]');
  }

  function getCreateButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button');
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('shows empty message when there are no collections', async () => {
    await setup([]);
    expect(text()).toContain('No collections yet');
  });

  // -------------------------------------------------------------------------
  // Collection names rendered
  // -------------------------------------------------------------------------

  it('renders collection names', async () => {
    await setup([makeCollection('c1'), makeCollection('c2')]);
    expect(text()).toContain('Collection c1');
    expect(text()).toContain('Collection c2');
  });

  // -------------------------------------------------------------------------
  // Create flow
  // -------------------------------------------------------------------------

  it('create button is disabled when input is empty', async () => {
    await setup([]);
    const btn = getCreateButton();
    expect(btn?.disabled).toBe(true);
  });

  it('calls createCollection when form is submitted with a name', async () => {
    await setup([]);
    const input = getInput()!;
    input.value = 'My Collection';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    btn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(libraryStoreStub.createCollection).toHaveBeenCalledWith('My Collection');
  });

  // -------------------------------------------------------------------------
  // Delete flow
  // -------------------------------------------------------------------------

  it('shows confirm dialog when delete is clicked', async () => {
    await setup([makeCollection('c1')]);
    const deleteButton: HTMLButtonElement = fixture.nativeElement.querySelector('[class*="danger"]');
    deleteButton?.click();
    fixture.detectChanges();

    expect(text()).toContain("Delete this collection");
  });

  it('calls deleteCollection on confirm', async () => {
    await setup([makeCollection('c1')]);
    // Trigger delete request
    const deleteButton: HTMLButtonElement = fixture.nativeElement.querySelector('[class*="danger"]');
    deleteButton?.click();
    fixture.detectChanges();

    // Confirm
    const allDangerButtons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[class*="danger"]'),
    );
    const confirmButton = allDangerButtons[allDangerButtons.length - 1];
    confirmButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(libraryStoreStub.deleteCollection).toHaveBeenCalledWith('c1');
  });

  // -------------------------------------------------------------------------
  // Dangling reference handling
  // -------------------------------------------------------------------------

  it('filters out null (deleted) recipe references from member grids', async () => {
    const collection = makeCollection('c1', ['exists', 'deleted']);
    const existingRecipe = makeRecipe('exists');
    await setup([collection], { exists: existingRecipe, deleted: null });

    // Wait one more tick for async ngOnInit to complete and signal update to propagate
    await fixture.whenStable();
    fixture.detectChanges();

    expect(text()).toContain('Recipe exists');
    expect(text()).not.toContain('Recipe deleted');
  });

  it('filters out permission-denied (private/unreadable) recipes without breaking the grid', async () => {
    const collection = makeCollection('c1', ['readable', 'private']);
    const readableRecipe = makeRecipe('readable');
    // Configure the recipe service stub to reject for the 'private' id
    await setup([collection], { readable: readableRecipe, private: null });
    // Override the getRecipe stub after setup to simulate a permission-denied rejection
    recipeServiceStub.getRecipe.mockImplementation((id: string) => {
      if (id === 'private') {
        return Promise.reject(new Error('permission-denied'));
      }
      return Promise.resolve(id === 'readable' ? readableRecipe : null);
    });

    // Trigger a re-load by calling ngOnInit equivalent (reload member recipes)
    // by accessing the component instance via the fixture
    const component = fixture.componentInstance as CollectionsSection & { loadMemberRecipes?(): Promise<void> };
    // Re-trigger ngOnInit which calls loadMemberRecipes
    await (fixture.componentInstance as unknown as { ngOnInit(): Promise<void> }).ngOnInit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // The readable recipe must still render; the private one must be silently dropped.
    expect(text()).toContain('Recipe readable');
    expect(text()).not.toContain('Recipe private');
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has a heading for the section', async () => {
    await setup([]);
    const h2: HTMLHeadingElement | null = fixture.nativeElement.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2!.textContent?.trim()).toBe('Collections');
  });

  it('the create input has an associated label', async () => {
    await setup([]);
    const input = getInput();
    expect(input).toBeTruthy();
    const id = input!.id;
    const label = fixture.nativeElement.querySelector(`label[for="${id}"]`);
    expect(label).toBeTruthy();
  });
});
