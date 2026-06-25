import { describe, expect, it } from 'vitest';

import { Recipe } from './recipe.model';
import {
  applyFilters,
  DEFAULT_CRITERIA,
  matchesKeyword,
  RecipeFilterCriteria,
  totalTimeMinutes,
} from './recipe-filter.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'r1',
    title: 'Test Recipe',
    description: '',
    type: 'meal',
    authorId: 'u1',
    visibility: 'public',
    sharedWith: [],
    rootId: 'r1',
    parentId: null,
    ingredients: [],
    steps: [],
    tags: [],
    keywords: ['test', 'recipe'],
    servings: null,
    prepTime: null,
    cookTime: null,
    coverPhotoPath: null,
    shareId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// totalTimeMinutes
// ---------------------------------------------------------------------------

describe('totalTimeMinutes', () => {
  it('returns null when both prepTime and cookTime are absent', () => {
    expect(totalTimeMinutes(makeRecipe({ prepTime: null, cookTime: null }))).toBeNull();
  });

  it('returns prep-only time when only prepTime is set', () => {
    expect(totalTimeMinutes(makeRecipe({ prepTime: 'PT20M', cookTime: null }))).toBe(20);
  });

  it('returns cook-only time when only cookTime is set', () => {
    expect(totalTimeMinutes(makeRecipe({ prepTime: null, cookTime: 'PT45M' }))).toBe(45);
  });

  it('sums prep + cook when both are set', () => {
    expect(totalTimeMinutes(makeRecipe({ prepTime: 'PT15M', cookTime: 'PT45M' }))).toBe(60);
  });

  it('handles hours correctly', () => {
    expect(totalTimeMinutes(makeRecipe({ prepTime: 'PT1H', cookTime: 'PT30M' }))).toBe(90);
  });

  it('handles invalid duration strings as zero', () => {
    // parseDurationToMinutes returns null for invalid → treated as 0; other field is null too → null
    expect(totalTimeMinutes(makeRecipe({ prepTime: 'invalid', cookTime: null }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// matchesKeyword
// ---------------------------------------------------------------------------

describe('matchesKeyword', () => {
  it('returns true for empty search text', () => {
    expect(matchesKeyword(makeRecipe(), '')).toBe(true);
  });

  it('returns true for whitespace-only search text', () => {
    expect(matchesKeyword(makeRecipe(), '   ')).toBe(true);
  });

  it('matches a single token present in keywords', () => {
    const recipe = makeRecipe({ keywords: ['pasta', 'italian', 'quick'] });
    expect(matchesKeyword(recipe, 'pasta')).toBe(true);
  });

  it('returns false when a token is absent from keywords', () => {
    const recipe = makeRecipe({ keywords: ['pasta', 'italian'] });
    expect(matchesKeyword(recipe, 'vegan')).toBe(false);
  });

  it('matches case-insensitively', () => {
    const recipe = makeRecipe({ keywords: ['pasta', 'italian'] });
    expect(matchesKeyword(recipe, 'Pasta')).toBe(true);
  });

  it('requires ALL tokens (AND semantics) for multi-word input', () => {
    const recipe = makeRecipe({ keywords: ['pasta', 'italian', 'quick'] });
    expect(matchesKeyword(recipe, 'pasta quick')).toBe(true);
    expect(matchesKeyword(recipe, 'pasta vegan')).toBe(false);
  });

  it('is whole-token only — a partial prefix does not match', () => {
    const recipe = makeRecipe({ keywords: ['pasta'] });
    expect(matchesKeyword(recipe, 'past')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — type filter
// ---------------------------------------------------------------------------

describe('applyFilters — type filter', () => {
  const recipes: Recipe[] = [
    makeRecipe({ recipeId: 'r1', type: 'meal', keywords: ['meal'] }),
    makeRecipe({ recipeId: 'r2', type: 'dessert', keywords: ['dessert'] }),
    makeRecipe({ recipeId: 'r3', type: 'cocktail', keywords: ['cocktail'] }),
  ];

  it('returns all recipes when type is null', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, type: null });
    expect(result).toHaveLength(3);
  });

  it('filters to only the matching type', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, type: 'dessert' });
    expect(result.map((r) => r.recipeId)).toEqual(['r2']);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — tag filter
// ---------------------------------------------------------------------------

describe('applyFilters — tag filter', () => {
  const recipes: Recipe[] = [
    makeRecipe({ recipeId: 'r1', tags: ['vegan', 'quick'], keywords: [] }),
    makeRecipe({ recipeId: 'r2', tags: ['quick'], keywords: [] }),
    makeRecipe({ recipeId: 'r3', tags: ['vegan', 'gluten free'], keywords: [] }),
  ];

  it('returns all recipes when tag is null', () => {
    expect(applyFilters(recipes, { ...DEFAULT_CRITERIA, tag: null })).toHaveLength(3);
  });

  it('filters by exact tag membership', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, tag: 'vegan' });
    expect(result.map((r) => r.recipeId)).toEqual(expect.arrayContaining(['r1', 'r3']));
    expect(result).toHaveLength(2);
  });

  it('matches a multi-word tag exactly', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, tag: 'gluten free' });
    expect(result.map((r) => r.recipeId)).toEqual(['r3']);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — total-time filter
// ---------------------------------------------------------------------------

describe('applyFilters — total-time filter', () => {
  const recipes: Recipe[] = [
    makeRecipe({ recipeId: 'prep-only', prepTime: 'PT20M', cookTime: null, keywords: [] }),
    makeRecipe({ recipeId: 'cook-only', prepTime: null, cookTime: 'PT45M', keywords: [] }),
    makeRecipe({ recipeId: 'both-60', prepTime: 'PT15M', cookTime: 'PT45M', keywords: [] }),
    makeRecipe({ recipeId: 'both-120', prepTime: 'PT1H', cookTime: 'PT1H', keywords: [] }),
    makeRecipe({ recipeId: 'no-time', prepTime: null, cookTime: null, keywords: [] }),
  ];

  it('returns all recipes (including no-time) when maxTotalTimeMinutes is null', () => {
    expect(applyFilters(recipes, { ...DEFAULT_CRITERIA, maxTotalTimeMinutes: null })).toHaveLength(5);
  });

  it('excludes recipes with no time when a limit is active', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, maxTotalTimeMinutes: 60 });
    const ids = result.map((r) => r.recipeId);
    expect(ids).not.toContain('no-time');
  });

  it('includes recipes exactly at the boundary', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, maxTotalTimeMinutes: 60 });
    const ids = result.map((r) => r.recipeId);
    expect(ids).toContain('both-60');
  });

  it('excludes recipes over the limit', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, maxTotalTimeMinutes: 60 });
    const ids = result.map((r) => r.recipeId);
    expect(ids).not.toContain('both-120');
  });

  it('handles prep-only recipes', () => {
    const result = applyFilters(recipes, { ...DEFAULT_CRITERIA, maxTotalTimeMinutes: 30 });
    const ids = result.map((r) => r.recipeId);
    expect(ids).toContain('prep-only');
    expect(ids).not.toContain('cook-only');
  });
});

// ---------------------------------------------------------------------------
// applyFilters — combined filters
// ---------------------------------------------------------------------------

describe('applyFilters — combined filters', () => {
  const recipes: Recipe[] = [
    makeRecipe({
      recipeId: 'match',
      type: 'meal',
      tags: ['quick'],
      keywords: ['pasta'],
      prepTime: 'PT10M',
      cookTime: 'PT15M',
    }),
    makeRecipe({
      recipeId: 'wrong-type',
      type: 'dessert',
      tags: ['quick'],
      keywords: ['pasta'],
      prepTime: 'PT10M',
      cookTime: 'PT15M',
    }),
    makeRecipe({
      recipeId: 'no-tag',
      type: 'meal',
      tags: [],
      keywords: ['pasta'],
      prepTime: 'PT10M',
      cookTime: 'PT15M',
    }),
    makeRecipe({
      recipeId: 'too-slow',
      type: 'meal',
      tags: ['quick'],
      keywords: ['pasta'],
      prepTime: 'PT1H',
      cookTime: 'PT1H',
    }),
  ];

  it('applies all active filters together (AND logic across criteria)', () => {
    const criteria: RecipeFilterCriteria = {
      searchText: 'pasta',
      type: 'meal',
      tag: 'quick',
      maxTotalTimeMinutes: 60,
      sort: 'newest',
    };
    const result = applyFilters(recipes, criteria);
    expect(result.map((r) => r.recipeId)).toEqual(['match']);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — sort: newest
// ---------------------------------------------------------------------------

describe('applyFilters — sort newest', () => {
  const older = makeRecipe({ recipeId: 'older', updatedAt: new Date('2024-01-01'), keywords: [] });
  const newer = makeRecipe({ recipeId: 'newer', updatedAt: new Date('2024-06-01'), keywords: [] });
  const newest = makeRecipe({ recipeId: 'newest', updatedAt: new Date('2024-12-01'), keywords: [] });

  it('orders by updatedAt descending', () => {
    const result = applyFilters([older, newest, newer], { ...DEFAULT_CRITERIA, sort: 'newest' });
    expect(result.map((r) => r.recipeId)).toEqual(['newest', 'newer', 'older']);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — sort: quickest
// ---------------------------------------------------------------------------

describe('applyFilters — sort quickest', () => {
  const fast = makeRecipe({ recipeId: 'fast', prepTime: 'PT10M', cookTime: null, keywords: [] });
  const medium = makeRecipe({ recipeId: 'medium', prepTime: 'PT20M', cookTime: 'PT10M', keywords: [] });
  const slow = makeRecipe({ recipeId: 'slow', prepTime: 'PT1H', cookTime: 'PT30M', keywords: [] });
  const noTime = makeRecipe({ recipeId: 'no-time', prepTime: null, cookTime: null, keywords: [] });

  it('orders by total time ascending, nulls last', () => {
    const result = applyFilters([noTime, slow, fast, medium], { ...DEFAULT_CRITERIA, sort: 'quickest' });
    expect(result.map((r) => r.recipeId)).toEqual(['fast', 'medium', 'slow', 'no-time']);
  });
});
