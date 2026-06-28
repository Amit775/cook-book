import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';

import { toRecipeCollection } from './collection.model';

// ---------------------------------------------------------------------------
// toRecipeCollection mapper unit tests
// ---------------------------------------------------------------------------

describe('toRecipeCollection mapper', () => {
  it('applies defensive defaults when data is empty', () => {
    const result = toRecipeCollection('col1', {});
    expect(result.collectionId).toBe('col1');
    expect(result.name).toBe('');
    expect(result.recipeIds).toEqual([]);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('converts Timestamp fields to Date', () => {
    const ts = Timestamp.fromDate(new Date('2024-01-01T00:00:00Z'));
    const result = toRecipeCollection('col2', {
      name: 'Favourites',
      recipeIds: ['r1', 'r2'],
      createdAt: ts,
      updatedAt: ts,
    });
    expect(result.name).toBe('Favourites');
    expect(result.recipeIds).toEqual(['r1', 'r2']);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('preserves existing recipeIds array', () => {
    const result = toRecipeCollection('col3', { recipeIds: ['a', 'b', 'c'] });
    expect(result.recipeIds).toEqual(['a', 'b', 'c']);
  });
});
