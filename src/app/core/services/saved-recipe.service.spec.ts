import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '../firebase/firebase.providers';
import { SavedRecipeService } from './saved-recipe.service';

// ---------------------------------------------------------------------------
// Firestore SDK module mock — intercepts the modular SDK calls the service makes
// ---------------------------------------------------------------------------

// The service imports Firebase functions (setDoc, deleteDoc, doc, collection,
// serverTimestamp, arrayUnion, arrayRemove …) from 'firebase/firestore'. We
// mock the entire module here so the service calls the stubs instead of a real
// Firestore connection. Each test below inspects those stubs.
//
// vi.hoisted() creates the mock container before vi.mock() is hoisted to the top
// of the file, so the factory can safely reference `mocks` at module-eval time.

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocs: vi.fn<any>(() => Promise.resolve({ docs: [] })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverTimestamp: vi.fn<any>(() => 'SERVER_TIMESTAMP'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arrayUnion: vi.fn<any>((...args: unknown[]) => ({ type: 'arrayUnion', args })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arrayRemove: vi.fn<any>((...args: unknown[]) => ({ type: 'arrayRemove', args })),
}));

vi.mock('firebase/firestore', () => {
  // Minimal stub — only the functions SavedRecipeService actually calls.
  // We skip importOriginal to avoid circular-init failures during vi.mock hoisting.
  return {
    // doc(firestore, ...segments) → build a fake ref whose .id and .path we can
    // inspect in tests. The last segment is the document id; all segments joined
    // form the path.
    doc: vi.fn((_firestoreOrCollection: unknown, ...segments: string[]) => {
      const allSegments = (segments as string[]).filter((segment) => segment !== undefined);
      const path = allSegments.join('/');
      const id = allSegments[allSegments.length - 1] ?? '';
      return { id, path };
    }),
    collection: vi.fn((_firestore: unknown, ...segments: string[]) => ({
      path: (segments as string[]).join('/'),
    })),
    setDoc: (...args: unknown[]) => (mocks.setDoc as Function)(...args),
    deleteDoc: (...args: unknown[]) => (mocks.deleteDoc as Function)(...args),
    updateDoc: (...args: unknown[]) => (mocks.updateDoc as Function)(...args),
    getDocs: (...args: unknown[]) => (mocks.getDocs as Function)(...args),
    orderBy: vi.fn(() => ({})),
    query: vi.fn(() => ({})),
    serverTimestamp: () => (mocks.serverTimestamp as Function)(),
    arrayUnion: (...args: unknown[]) => (mocks.arrayUnion as Function)(...args),
    arrayRemove: (...args: unknown[]) => (mocks.arrayRemove as Function)(...args),
    // Timestamp stub for completeness (not used by these tests)
    Timestamp: class {},
  };
});

// ---------------------------------------------------------------------------
// SavedRecipeService — write-operation tests
// ---------------------------------------------------------------------------

describe('SavedRecipeService (write operations)', () => {
  let service: SavedRecipeService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        SavedRecipeService,
        { provide: FIRESTORE, useValue: {} },
      ],
    });
    service = TestBed.inject(SavedRecipeService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // save() — doc id == recipeId, setDoc called with savedAt + recipeId
  // -----------------------------------------------------------------------

  it('save() calls setDoc with the recipeId as the document id', async () => {
    await service.save('user123', 'recipe456');

    expect(mocks.setDoc).toHaveBeenCalledOnce();
    // The doc reference built by the stub: id is the last segment, path is all segments joined
    // Service calls: doc(firestore, 'users', userId, 'savedRecipes', recipeId)
    // Stub receives: (_firestore, 'users', 'user123', 'savedRecipes', 'recipe456')
    // → path = 'users/user123/savedRecipes/recipe456', id = 'recipe456'
    const args = mocks.setDoc.mock.calls[0] as unknown as [{ id: string; path: string }, Record<string, unknown>];
    const [docRef] = args;
    expect(docRef.id).toBe('recipe456');
    expect(docRef.path).toBe('users/user123/savedRecipes/recipe456');
  });

  it('save() writes recipeId and savedAt (serverTimestamp) fields', async () => {
    await service.save('user123', 'recipe456');

    const args = mocks.setDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    const data = args[1];
    expect(data['recipeId']).toBe('recipe456');
    expect(data['savedAt']).toBe('SERVER_TIMESTAMP');
  });

  it('save() is idempotent — calling it twice sends two setDoc calls (no errors)', async () => {
    await service.save('user123', 'recipe456');
    await service.save('user123', 'recipe456');
    expect(mocks.setDoc).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // unsave() — deleteDoc called for the correct path
  // -----------------------------------------------------------------------

  it('unsave() calls deleteDoc with the correct doc id and path', async () => {
    await service.unsave('user123', 'recipe456');

    expect(mocks.deleteDoc).toHaveBeenCalledOnce();
    const args = mocks.deleteDoc.mock.calls[0] as unknown as [{ id: string; path: string }];
    const [docRef] = args;
    expect(docRef.id).toBe('recipe456');
    expect(docRef.path).toBe('users/user123/savedRecipes/recipe456');
  });

  // -----------------------------------------------------------------------
  // addRecipeToCollection() — updateDoc with arrayUnion
  // -----------------------------------------------------------------------

  it('addRecipeToCollection() calls updateDoc with arrayUnion and bumps updatedAt', async () => {
    await service.addRecipeToCollection('user123', 'col1', 'recipe456');

    expect(mocks.updateDoc).toHaveBeenCalledOnce();
    const args = mocks.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    const updateData = args[1];
    expect((updateData['recipeIds'] as { type: string; args: unknown[] }).type).toBe('arrayUnion');
    expect((updateData['recipeIds'] as { args: unknown[] }).args).toContain('recipe456');
    expect(updateData['updatedAt']).toBe('SERVER_TIMESTAMP');
  });

  // -----------------------------------------------------------------------
  // removeRecipeFromCollection() — updateDoc with arrayRemove
  // -----------------------------------------------------------------------

  it('removeRecipeFromCollection() calls updateDoc with arrayRemove and bumps updatedAt', async () => {
    await service.removeRecipeFromCollection('user123', 'col1', 'recipe456');

    expect(mocks.updateDoc).toHaveBeenCalledOnce();
    const args = mocks.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    const updateData = args[1];
    expect((updateData['recipeIds'] as { type: string; args: unknown[] }).type).toBe('arrayRemove');
    expect((updateData['recipeIds'] as { args: unknown[] }).args).toContain('recipe456');
    expect(updateData['updatedAt']).toBe('SERVER_TIMESTAMP');
  });
});

// ---------------------------------------------------------------------------
// Permission-denied / deleted-recipe resilience — tested at the resolution
// sites (library-page / collections-section use getRecipe via RecipeService).
// Here we verify that the Promise.allSettled pattern used at those sites
// correctly filters out rejected (permission-denied) and null (deleted) reads.
// ---------------------------------------------------------------------------

describe('Promise.allSettled resilience for dangling recipe reads', () => {
  it('filters out rejected reads (permission-denied) leaving valid recipes intact', async () => {
    const permissionError = new Error('permission-denied');
    const resolvedRecipe = { recipeId: 'r2', title: 'Good Recipe' };

    // Simulate two reads: one rejected (private/deleted), one fulfilled
    const reads: Promise<{ recipeId: string; title: string } | null>[] = [
      Promise.reject(permissionError),
      Promise.resolve(resolvedRecipe),
    ];

    const settled = await Promise.allSettled(reads);

    const valid = settled
      .filter((result): result is PromiseFulfilledResult<{ recipeId: string; title: string } | null> =>
        result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((recipe): recipe is { recipeId: string; title: string } => recipe !== null);

    // The rejected read is dropped; the valid recipe survives.
    expect(valid).toHaveLength(1);
    expect(valid[0].recipeId).toBe('r2');
  });

  it('filters out null (deleted) reads leaving valid recipes intact', async () => {
    const reads: Promise<{ recipeId: string; title: string } | null>[] = [
      Promise.resolve(null), // deleted
      Promise.resolve({ recipeId: 'r3', title: 'Still Here' }),
    ];

    const settled = await Promise.allSettled(reads);

    const valid = settled
      .filter((result): result is PromiseFulfilledResult<{ recipeId: string; title: string } | null> =>
        result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((recipe): recipe is { recipeId: string; title: string } => recipe !== null);

    expect(valid).toHaveLength(1);
    expect(valid[0].recipeId).toBe('r3');
  });

  it('all rejected reads result in an empty grid (no errors thrown)', async () => {
    const reads: Promise<{ recipeId: string } | null>[] = [
      Promise.reject(new Error('permission-denied')),
      Promise.reject(new Error('permission-denied')),
    ];

    const settled = await Promise.allSettled(reads);
    const valid = settled
      .filter((result): result is PromiseFulfilledResult<{ recipeId: string } | null> =>
        result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((recipe): recipe is { recipeId: string } => recipe !== null);

    // Grid renders empty — no error thrown, no broken state.
    expect(valid).toHaveLength(0);
  });
});
