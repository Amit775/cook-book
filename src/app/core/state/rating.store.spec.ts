import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecipeRating, ReviewEntry } from '../models/rating.model';
import { RatingService } from '../services/rating.service';
import { SessionStore } from './session.store';
import { RatingStore } from './rating.store';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeRating(stars = 4): RecipeRating {
  return {
    authorId: 'user1',
    stars,
    reviewText: 'Great!',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeReview(userId = 'user1', stars = 4): ReviewEntry {
  return {
    ...makeRating(stars),
    userId,
    displayName: 'Alice',
  };
}

function makeRecipe() {
  return {
    recipeId: 'recipe1',
    title: 'Pasta',
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
    ratingCount: 0,
    ratingSum: 0,
    ratingAverage: 0,
  };
}

function makeSessionStoreStub(uid: string | null = 'user1') {
  return {
    user: signal(uid ? { uid, displayName: 'Alice', email: null, photoURL: null } : null),
    isAuthenticated: signal(uid !== null),
  };
}

// ---------------------------------------------------------------------------
// RatingStore tests
// ---------------------------------------------------------------------------

describe('RatingStore', () => {
  let ratingServiceStub: {
    getMyRating: ReturnType<typeof vi.fn>;
    listReviews: ReturnType<typeof vi.fn>;
    setRating: ReturnType<typeof vi.fn>;
    getAggregate: ReturnType<typeof vi.fn>;
  };

  function setup(uid: string | null = 'user1') {
    ratingServiceStub = {
      getMyRating: vi.fn(async () => null),
      listReviews: vi.fn(async () => []),
      setRating: vi.fn(async () => undefined),
      getAggregate: vi.fn(async () => ({ ratingCount: 1, ratingSum: 5, ratingAverage: 5 })),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: RatingService, useValue: ratingServiceStub },
        { provide: SessionStore, useValue: makeSessionStoreStub(uid) },
      ],
    });

    return TestBed.inject(RatingStore);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty/false initial state', () => {
    const store = setup();
    expect(store.myRating()).toBeNull();
    expect(store.reviews()).toEqual([]);
    expect(store.isSaving()).toBe(false);
    expect(store.isLoading()).toBe(false);
    expect(store.saveAnnouncement()).toBe('');
  });

  it('load() sets myRating and reviews from the service', async () => {
    const store = setup();
    const rating = makeRating();
    const review = makeReview();
    ratingServiceStub.getMyRating.mockResolvedValue(rating);
    ratingServiceStub.listReviews.mockResolvedValue([review]);

    await store.load(makeRecipe());

    expect(store.myRating()).toEqual(rating);
    expect(store.reviews()).toEqual([review]);
    expect(store.isLoading()).toBe(false);
  });

  it('load() skips getMyRating when not signed in', async () => {
    const store = setup(null); // anonymous
    await store.load(makeRecipe());

    expect(ratingServiceStub.getMyRating).not.toHaveBeenCalled();
    expect(store.myRating()).toBeNull();
  });

  it('submit() calls setRating and refreshes state', async () => {
    const store = setup();
    const updatedRating = makeRating(5);
    const review = makeReview('user1', 5);
    ratingServiceStub.getMyRating.mockResolvedValue(updatedRating);
    ratingServiceStub.listReviews.mockResolvedValue([review]);

    await store.submit(makeRecipe(), 5, 'Excellent!');

    expect(ratingServiceStub.setRating).toHaveBeenCalledWith(
      expect.any(Object),
      'user1',
      5,
      'Excellent!',
    );
    expect(store.myRating()).toEqual(updatedRating);
    expect(store.reviews()).toEqual([review]);
    expect(store.saveAnnouncement()).toBe('saved');
    expect(store.isSaving()).toBe(false);
  });

  it('submit() does nothing when not signed in', async () => {
    const store = setup(null);
    await store.submit(makeRecipe(), 5, 'Great!');
    expect(ratingServiceStub.setRating).not.toHaveBeenCalled();
  });

  it('clearAnnouncement() resets saveAnnouncement to empty string', async () => {
    const store = setup();
    ratingServiceStub.getMyRating.mockResolvedValue(makeRating());
    ratingServiceStub.listReviews.mockResolvedValue([]);
    await store.submit(makeRecipe(), 5, '');
    expect(store.saveAnnouncement()).toBe('saved');

    store.clearAnnouncement();
    expect(store.saveAnnouncement()).toBe('');
  });
});
