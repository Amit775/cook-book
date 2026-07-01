import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '../firebase/firebase.providers';
import { RatingService } from './rating.service';

// ---------------------------------------------------------------------------
// Firestore SDK module mock
// Duck-type the SDK types (don't instanceof); keep isolate:true compatible.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDoc: vi.fn<any>(() =>
    Promise.resolve({ exists: () => false, data: () => undefined }),
  ),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocs: vi.fn<any>(() => Promise.resolve({ empty: true, docs: [] })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runTransaction: vi.fn<any>((...args: any[]) => {
    const callback = args[1] as (txn: unknown) => Promise<void>;
    const txn = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get: vi.fn<any>(() =>
        Promise.resolve({ exists: () => false, data: () => undefined }),
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set: vi.fn<any>(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: vi.fn<any>(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete: vi.fn<any>(),
    };
    return callback(txn).then(() => txn);
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverTimestamp: vi.fn<any>(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_firestoreOrCollection: unknown, ...segments: string[]) => {
    const path = segments.filter(Boolean).join('/');
    const id = segments[segments.length - 1] ?? 'auto-id';
    return { id, path };
  }),
  collection: vi.fn((_firestore: unknown, ...segments: string[]) => ({
    path: segments.filter(Boolean).join('/'),
  })),
  query: vi.fn((...args: unknown[]) => args[0]),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  getDoc: (...args: unknown[]) => (mocks.getDoc as Function)(...args),
  getDocs: (...args: unknown[]) => (mocks.getDocs as Function)(...args),
  runTransaction: (...args: unknown[]) => (mocks.runTransaction as Function)(...args),
  serverTimestamp: () => (mocks.serverTimestamp as Function)(),
  Timestamp: class {},
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRatingDocData(stars: number) {
  return {
    authorId: 'user1',
    stars,
    reviewText: 'Good',
    createdAt: { toDate: () => new Date() },
    updatedAt: { toDate: () => new Date() },
  };
}

function makeRecipe(ratingCount = 0, ratingSum = 0) {
  return {
    recipeId: 'recipe1',
    title: 'Test',
    description: '',
    type: 'meal' as const,
    authorId: 'author1',
    visibility: 'public' as const,
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
    ratingCount,
    ratingSum,
    ratingAverage: 0,
  };
}

// ---------------------------------------------------------------------------
// RatingService tests
// ---------------------------------------------------------------------------

describe('RatingService', () => {
  let service: RatingService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runTransaction to its default (callback-executing) implementation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.runTransaction.mockImplementation((...args: any[]) => {
      const callback = args[1] as (txn: unknown) => Promise<void>;
      const txn = {
        get: vi.fn(() =>
          Promise.resolve({ exists: () => false, data: () => undefined }),
        ),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return callback(txn).then(() => txn);
    });

    TestBed.configureTestingModule({
      providers: [
        RatingService,
        { provide: FIRESTORE, useValue: {} },
      ],
    });
    service = TestBed.inject(RatingService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // getMyRating
  // -------------------------------------------------------------------------

  it('getMyRating() returns null when no doc exists', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });
    const result = await service.getMyRating('recipe1', 'user1');
    expect(result).toBeNull();
  });

  it('getMyRating() maps the rating doc when it exists', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => makeRatingDocData(4),
    });
    const result = await service.getMyRating('recipe1', 'user1');
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(4);
    expect(result!.authorId).toBe('user1');
  });

  // -------------------------------------------------------------------------
  // setRating — new rating
  // -------------------------------------------------------------------------

  it('setRating() creates a new rating and updates the aggregate', async () => {
    let capturedTxn: { set: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.runTransaction.mockImplementationOnce(async (...args: any[]) => {
      const callback = args[1] as (txn: unknown) => Promise<void>;
      const txn = {
        get: vi.fn()
          .mockResolvedValueOnce({
            // recipe doc: no existing ratings yet
            exists: () => true,
            data: () => ({ ratingCount: 0, ratingSum: 0 }),
          })
          .mockResolvedValueOnce({ exists: () => false, data: () => undefined }), // rating doc: none
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      capturedTxn = txn;
      await callback(txn);
      return txn;
    });

    await service.setRating(makeRecipe(), 'user1', 5, 'Delicious!');

    expect(capturedTxn).not.toBeNull();
    expect(capturedTxn!.set).toHaveBeenCalledOnce();
    const setArgs = capturedTxn!.set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(setArgs[1]['stars']).toBe(5);
    expect(setArgs[1]['reviewText']).toBe('Delicious!');
    expect(setArgs[1]['authorId']).toBe('user1');
    expect(capturedTxn!.update).toHaveBeenCalledOnce();
    const updateArgs = capturedTxn!.update.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(updateArgs[1]['ratingCount']).toBe(1);
    expect(updateArgs[1]['ratingSum']).toBe(5);
    expect(updateArgs[1]['ratingAverage']).toBe(5);
  });

  // -------------------------------------------------------------------------
  // setRating — editing existing rating
  // -------------------------------------------------------------------------

  it('setRating() adjusts sum by delta when editing an existing rating', async () => {
    let capturedTxn: { update: ReturnType<typeof vi.fn> } | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mocks.runTransaction.mockImplementationOnce(async (...args: any[]) => {
      const callback = args[1] as (txn: unknown) => Promise<void>;
      const txn = {
        get: vi.fn()
          .mockResolvedValueOnce({
            // recipe doc: 2 ratings, sum=8
            exists: () => true,
            data: () => ({ ratingCount: 2, ratingSum: 8 }),
          })
          .mockResolvedValueOnce({
            // user's existing rating: 4 stars
            exists: () => true,
            data: () => makeRatingDocData(4),
          }),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      capturedTxn = txn;
      await callback(txn);
      return txn;
    });

    // Editing from 4★ to 2★ → sum goes from 8 to 6, count stays 2
    await service.setRating(makeRecipe(2, 8), 'user1', 2, 'Changed my mind');

    const updateArgs = capturedTxn!.update.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(updateArgs[1]['ratingCount']).toBe(2);
    expect(updateArgs[1]['ratingSum']).toBe(6);
    expect(updateArgs[1]['ratingAverage']).toBe(3);
  });

  // -------------------------------------------------------------------------
  // listReviews
  // -------------------------------------------------------------------------

  it('listReviews() returns an empty array when no reviews exist', async () => {
    mocks.getDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const result = await service.listReviews('recipe1');
    expect(result).toEqual([]);
  });

  it('listReviews() maps docs to ReviewEntry with user display names', async () => {
    mocks.getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'user1',
          data: () => makeRatingDocData(5),
        },
      ],
    });
    // User profile fetch
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ displayName: 'Alice' }),
    });

    const result = await service.listReviews('recipe1');
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe('user1');
    expect(result[0].displayName).toBe('Alice');
    expect(result[0].stars).toBe(5);
  });

  it('listReviews() falls back to userId when user profile is missing', async () => {
    mocks.getDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'user99', data: () => makeRatingDocData(3) }],
    });
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });

    const result = await service.listReviews('recipe1');
    expect(result[0].displayName).toBe('user99');
  });
});
