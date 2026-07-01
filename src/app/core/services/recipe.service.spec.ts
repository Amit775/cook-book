import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '../firebase/firebase.providers';
import { Recipe } from '../models/recipe.model';
import { RecipeService } from './recipe.service';
import { StorageService } from './storage.service';

// ---------------------------------------------------------------------------
// firebase/firestore module mock
// ---------------------------------------------------------------------------

const firestoreMocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDoc: vi.fn<any>(() => Promise.resolve({ exists: () => false })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocs: vi.fn<any>(() => Promise.resolve({ docs: [] })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverTimestamp: vi.fn<any>(() => 'SERVER_TS'),
}));

let nextDocId = 0;

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_collectionOrFirestore: unknown, ...segments: string[]) => {
    // When called with no extra segments (auto-id), generate a fake id.
    if (segments.length === 0) {
      const id = `auto-id-${++nextDocId}`;
      return { id, path: id };
    }
    const path = (segments as string[]).join('/');
    const id = (segments as string[])[segments.length - 1] ?? '';
    return { id, path };
  }),
  collection: vi.fn((_firestore: unknown, ...segments: string[]) => ({
    path: (segments as string[]).join('/'),
  })),
  setDoc: (...args: unknown[]) => (firestoreMocks.setDoc as Function)(...args),
  getDoc: (...args: unknown[]) => (firestoreMocks.getDoc as Function)(...args),
  getDocs: (...args: unknown[]) => (firestoreMocks.getDocs as Function)(...args),
  updateDoc: (...args: unknown[]) => (firestoreMocks.updateDoc as Function)(...args),
  deleteDoc: (...args: unknown[]) => (firestoreMocks.deleteDoc as Function)(...args),
  serverTimestamp: () => (firestoreMocks.serverTimestamp as Function)(),
  arrayUnion: vi.fn((...args: unknown[]) => args),
  arrayRemove: vi.fn((...args: unknown[]) => args),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
  Timestamp: { now: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'source-recipe-1',
    title: 'Test Recipe',
    description: '',
    type: 'meal',
    authorId: 'original-owner',
    visibility: 'public',
    sharedWith: [],
    rootId: 'root-1',
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
    ...overrides,
  };
}

function makeCloner() {
  return { uid: 'cloner-user-1' } as import('firebase/auth').User;
}

// ---------------------------------------------------------------------------
// RecipeService — cloneRecipe with copy-on-clone behaviour
// ---------------------------------------------------------------------------

describe('RecipeService — cloneRecipe', () => {
  let service: RecipeService;
  let storageServiceStub: { copyCoverPhoto: ReturnType<typeof vi.fn>; deleteCoverPhoto: ReturnType<typeof vi.fn>; uploadCoverPhoto: ReturnType<typeof vi.fn>; getPhotoUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    nextDocId = 0;

    storageServiceStub = {
      copyCoverPhoto: vi.fn(async () => 'recipe-photos/cloner-user-1/new-copy.jpg'),
      deleteCoverPhoto: vi.fn(async () => undefined),
      uploadCoverPhoto: vi.fn(async () => 'recipe-photos/cloner-user-1/upload.jpg'),
      getPhotoUrl: vi.fn(async () => 'https://example.com/photo.jpg'),
    };

    TestBed.configureTestingModule({
      providers: [
        RecipeService,
        { provide: FIRESTORE, useValue: {} },
        { provide: StorageService, useValue: storageServiceStub },
      ],
    });
    service = TestBed.inject(RecipeService);
  });

  it('calls copyCoverPhoto with the source path when the source has a cover', async () => {
    const source = makeRecipe({ coverPhotoPath: 'recipe-photos/original-owner/photo.jpg' });

    await service.cloneRecipe(source, makeCloner());

    expect(storageServiceStub.copyCoverPhoto).toHaveBeenCalledOnce();
    expect(storageServiceStub.copyCoverPhoto).toHaveBeenCalledWith(
      'recipe-photos/original-owner/photo.jpg',
      'cloner-user-1',
    );
  });

  it('stores the NEW (copied) path in Firestore — not the source path', async () => {
    const source = makeRecipe({ coverPhotoPath: 'recipe-photos/original-owner/photo.jpg' });
    storageServiceStub.copyCoverPhoto.mockResolvedValue('recipe-photos/cloner-user-1/copied.jpg');

    await service.cloneRecipe(source, makeCloner());

    expect(firestoreMocks.setDoc).toHaveBeenCalledOnce();
    const [, docData] = firestoreMocks.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(docData['coverPhotoPath']).toBe('recipe-photos/cloner-user-1/copied.jpg');
    expect(docData['coverPhotoPath']).not.toBe('recipe-photos/original-owner/photo.jpg');
  });

  it('creates the clone with coverPhotoPath: null when copyCoverPhoto returns null (copy failed)', async () => {
    const source = makeRecipe({ coverPhotoPath: 'recipe-photos/original-owner/photo.jpg' });
    storageServiceStub.copyCoverPhoto.mockResolvedValue(null);

    const newId = await service.cloneRecipe(source, makeCloner());

    expect(newId).toBeTruthy();
    const [, docData] = firestoreMocks.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(docData['coverPhotoPath']).toBeNull();
  });

  it('does NOT call copyCoverPhoto when the source has no cover', async () => {
    const source = makeRecipe({ coverPhotoPath: null });

    await service.cloneRecipe(source, makeCloner());

    expect(storageServiceStub.copyCoverPhoto).not.toHaveBeenCalled();
  });

  it('still calls setDoc (clone succeeds) even when copyCoverPhoto returns null', async () => {
    const source = makeRecipe({ coverPhotoPath: 'recipe-photos/original-owner/photo.jpg' });
    storageServiceStub.copyCoverPhoto.mockResolvedValue(null);

    await service.cloneRecipe(source, makeCloner());

    expect(firestoreMocks.setDoc).toHaveBeenCalledOnce();
  });

  it('returns the new recipe id', async () => {
    const source = makeRecipe();

    const result = await service.cloneRecipe(source, makeCloner());

    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
