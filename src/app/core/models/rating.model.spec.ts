import { describe, expect, it } from 'vitest';

import { computeAverage, toRatingAggregate, toRecipeRating } from './rating.model';

describe('computeAverage', () => {
  it('returns 0 when count is 0 (divide-by-zero guard)', () => {
    expect(computeAverage(0, 0)).toBe(0);
    expect(computeAverage(10, 0)).toBe(0);
  });

  it('returns the correct average rounded to 1 decimal', () => {
    expect(computeAverage(10, 2)).toBe(5);
    expect(computeAverage(7, 2)).toBe(3.5);
    expect(computeAverage(13, 3)).toBe(4.3);
  });
});

describe('toRecipeRating', () => {
  it('maps valid Firestore data correctly', () => {
    const mockDate = { toDate: () => new Date('2024-01-01') };
    const data = {
      authorId: 'user1',
      stars: 4,
      reviewText: 'Great recipe!',
      createdAt: mockDate,
      updatedAt: mockDate,
    };
    const result = toRecipeRating(data);
    expect(result.authorId).toBe('user1');
    expect(result.stars).toBe(4);
    expect(result.reviewText).toBe('Great recipe!');
  });

  it('applies defensive defaults for missing fields', () => {
    const result = toRecipeRating({});
    expect(result.authorId).toBe('');
    expect(result.stars).toBe(1);
    expect(result.reviewText).toBe('');
    expect(result.createdAt).toEqual(new Date(0));
    expect(result.updatedAt).toEqual(new Date(0));
  });
});

describe('toRatingAggregate', () => {
  it('maps valid data correctly', () => {
    const data = { ratingCount: 5, ratingSum: 20, ratingAverage: 4.0 };
    const result = toRatingAggregate(data);
    expect(result.ratingCount).toBe(5);
    expect(result.ratingSum).toBe(20);
    expect(result.ratingAverage).toBe(4.0);
  });

  it('defaults all fields to 0 for missing data', () => {
    const result = toRatingAggregate({});
    expect(result.ratingCount).toBe(0);
    expect(result.ratingSum).toBe(0);
    expect(result.ratingAverage).toBe(0);
  });
});
