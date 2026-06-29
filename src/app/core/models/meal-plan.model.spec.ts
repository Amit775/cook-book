import { describe, expect, it } from 'vitest';

import { toMealPlan } from './meal-plan.model';

describe('toMealPlan', () => {
  it('returns empty days when data.days is absent', () => {
    const plan = toMealPlan('2024-06-16', {});
    expect(plan.weekStartDate).toBe('2024-06-16');
    expect(plan.days).toEqual({});
  });

  it('returns empty days when data.days is null', () => {
    const plan = toMealPlan('2024-06-16', { days: null });
    expect(plan.days).toEqual({});
  });

  it('returns empty days when data.days is an array (malformed)', () => {
    const plan = toMealPlan('2024-06-16', { days: [] });
    expect(plan.days).toEqual({});
  });

  it('maps a valid day with planned recipes', () => {
    const plan = toMealPlan('2024-06-16', {
      days: {
        '2024-06-16': [
          { recipeId: 'r1', title: 'Pasta', coverPhotoPath: null, type: 'meal', servings: 2 },
        ],
      },
    });
    expect(plan.days['2024-06-16']).toHaveLength(1);
    expect(plan.days['2024-06-16'][0].recipeId).toBe('r1');
    expect(plan.days['2024-06-16'][0].title).toBe('Pasta');
    expect(plan.days['2024-06-16'][0].servings).toBe(2);
  });

  it('filters out planned recipes missing recipeId', () => {
    const plan = toMealPlan('2024-06-16', {
      days: {
        '2024-06-16': [{ title: 'No ID recipe', type: 'meal' }],
      },
    });
    // Day should be absent (no valid recipes)
    expect(plan.days['2024-06-16']).toBeUndefined();
  });

  it('omits days that become empty after filtering', () => {
    const plan = toMealPlan('2024-06-16', {
      days: {
        '2024-06-16': [{ type: 'meal' }],
      },
    });
    expect(Object.keys(plan.days)).toHaveLength(0);
  });

  it('defaults unknown type to "meal"', () => {
    const plan = toMealPlan('2024-06-16', {
      days: {
        '2024-06-16': [{ recipeId: 'r1', title: 'Test', type: 'invalid_type' }],
      },
    });
    expect(plan.days['2024-06-16'][0].type).toBe('meal');
  });

  it('defaults missing servings to null', () => {
    const plan = toMealPlan('2024-06-16', {
      days: {
        '2024-06-16': [{ recipeId: 'r1', title: 'Test', type: 'dessert' }],
      },
    });
    expect(plan.days['2024-06-16'][0].servings).toBeNull();
  });

  it('converts Firestore Timestamps for createdAt and updatedAt', () => {
    const fakeTimestamp = { toDate: () => new Date(2024, 5, 16) };
    const plan = toMealPlan('2024-06-16', {
      createdAt: fakeTimestamp,
      updatedAt: fakeTimestamp,
    });
    expect(plan.createdAt).toEqual(new Date(2024, 5, 16));
    expect(plan.updatedAt).toEqual(new Date(2024, 5, 16));
  });

  it('defaults dates to a Date instance when Timestamp is absent', () => {
    const plan = toMealPlan('2024-06-16', {});
    expect(plan.createdAt).toBeInstanceOf(Date);
    expect(plan.updatedAt).toBeInstanceOf(Date);
  });

  it('maps multiple days correctly', () => {
    const plan = toMealPlan('2024-06-16', {
      days: {
        '2024-06-16': [{ recipeId: 'r1', title: 'Sunday dinner', type: 'meal', servings: 4 }],
        '2024-06-17': [
          { recipeId: 'r2', title: 'Breakfast', type: 'meal', servings: 2 },
          { recipeId: 'r3', title: 'Dessert', type: 'dessert', servings: null },
        ],
      },
    });
    expect(Object.keys(plan.days)).toHaveLength(2);
    expect(plan.days['2024-06-17']).toHaveLength(2);
  });
});
