import { describe, expect, it } from 'vitest';

import { Ingredient } from './ingredient.model';
import { Recipe } from './recipe.model';
import {
  itemsFromRecipe,
  mergeItems,
  ShoppingListItem,
  sortItemsAlphabetically,
  toShoppingList,
} from './shopping-list.model';

// ---------------------------------------------------------------------------
// toShoppingList mapper
// ---------------------------------------------------------------------------

describe('toShoppingList mapper', () => {
  it('applies defensive defaults when data is empty', () => {
    const result = toShoppingList('list1', {});
    expect(result.listId).toBe('list1');
    expect(result.name).toBe('');
    expect(result.items).toEqual([]);
    expect(result.isManuallyOrdered).toBe(false);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('maps name, items, and isManuallyOrdered from data', () => {
    const result = toShoppingList('list2', {
      name: 'Weekly shopping',
      isManuallyOrdered: true,
      items: [
        {
          ingredientId: 'ing1',
          name: 'Flour',
          unit: 'gram',
          quantity: 500,
          checked: false,
          sourceRecipeIds: ['recipe1'],
        },
      ],
    });
    expect(result.name).toBe('Weekly shopping');
    expect(result.isManuallyOrdered).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Flour');
    expect(result.items[0].quantity).toBe(500);
  });

  it('applies defensive defaults per item when fields are missing', () => {
    const result = toShoppingList('list3', { items: [{}] });
    const item = result.items[0];
    expect(item.ingredientId).toBeNull();
    expect(item.name).toBe('');
    expect(item.unit).toBe('');
    expect(item.quantity).toBeNull();
    expect(item.checked).toBe(false);
    expect(item.sourceRecipeIds).toEqual([]);
  });

  it('converts Timestamp-like objects to Date', () => {
    const fakeTimestamp = { toDate: () => new Date('2024-06-01T00:00:00Z') };
    const result = toShoppingList('list4', { createdAt: fakeTimestamp, updatedAt: fakeTimestamp });
    expect(result.createdAt.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(result.updatedAt.toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// mergeItems
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    ingredientId: null,
    name: 'Sugar',
    unit: 'gram',
    quantity: 100,
    checked: false,
    sourceRecipeIds: ['recipe1'],
    ...overrides,
  };
}

describe('mergeItems', () => {
  it('returns existing items unchanged when incoming is empty', () => {
    const existing = [makeItem({ name: 'Flour' })];
    const result = mergeItems(existing, []);
    expect(result).toEqual(existing);
  });

  it('appends items that do not match any existing item', () => {
    const existing = [makeItem({ name: 'Flour', unit: 'gram' })];
    const incoming = [makeItem({ name: 'Sugar', unit: 'gram' })];
    const result = mergeItems(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it('sums quantities when merging by ingredientId', () => {
    const existing = [makeItem({ ingredientId: 'ing1', quantity: 100, unit: 'gram', sourceRecipeIds: ['r1'] })];
    const incoming = [makeItem({ ingredientId: 'ing1', quantity: 50, unit: 'gram', sourceRecipeIds: ['r2'] })];
    const result = mergeItems(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(150);
  });

  it('sums quantities when merging by nameLower|unit fallback key', () => {
    const existing = [makeItem({ ingredientId: null, name: 'flour', unit: 'cup', quantity: 2, sourceRecipeIds: ['r1'] })];
    const incoming = [makeItem({ ingredientId: null, name: 'Flour', unit: 'cup', quantity: 1, sourceRecipeIds: ['r2'] })];
    const result = mergeItems(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
  });

  it('accumulates sourceRecipeIds when merging', () => {
    const existing = [makeItem({ ingredientId: 'ing1', unit: 'gram', quantity: 100, sourceRecipeIds: ['r1'] })];
    const incoming = [makeItem({ ingredientId: 'ing1', unit: 'gram', quantity: 50, sourceRecipeIds: ['r2'] })];
    const result = mergeItems(existing, incoming);
    expect(result[0].sourceRecipeIds).toEqual(expect.arrayContaining(['r1', 'r2']));
  });

  it('deduplicates sourceRecipeIds when the same recipe is added twice', () => {
    const existing = [makeItem({ ingredientId: 'ing1', unit: 'gram', quantity: 100, sourceRecipeIds: ['r1'] })];
    const incoming = [makeItem({ ingredientId: 'ing1', unit: 'gram', quantity: 100, sourceRecipeIds: ['r1'] })];
    const result = mergeItems(existing, incoming);
    expect(result[0].sourceRecipeIds).toEqual(['r1']);
  });

  it('does NOT sum when quantity is null in existing (keeps null)', () => {
    const existing = [makeItem({ ingredientId: 'ing1', quantity: null, unit: 'gram', sourceRecipeIds: ['r1'] })];
    const incoming = [makeItem({ ingredientId: 'ing1', quantity: 200, unit: 'gram', sourceRecipeIds: ['r2'] })];
    const result = mergeItems(existing, incoming);
    expect(result[0].quantity).toBeNull();
  });

  it('does NOT sum when quantity is null in incoming (keeps null)', () => {
    const existing = [makeItem({ ingredientId: 'ing1', quantity: 200, unit: 'gram', sourceRecipeIds: ['r1'] })];
    const incoming = [makeItem({ ingredientId: 'ing1', quantity: null, unit: 'gram', sourceRecipeIds: ['r2'] })];
    const result = mergeItems(existing, incoming);
    expect(result[0].quantity).toBeNull();
  });

  it('treats same ingredientId with different unit as a separate line', () => {
    const existing = [makeItem({ ingredientId: 'ing1', unit: 'gram', quantity: 100 })];
    const incoming = [makeItem({ ingredientId: 'ing1', unit: 'cup', quantity: 1 })];
    const result = mergeItems(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it('does NOT mutate the original arrays', () => {
    const existing = [makeItem({ name: 'Flour', quantity: 100 })];
    const incoming = [makeItem({ name: 'Flour', quantity: 50 })];
    const existingCopy = [...existing];
    const incomingCopy = [...incoming];
    mergeItems(existing, incoming);
    expect(existing).toEqual(existingCopy);
    expect(incoming).toEqual(incomingCopy);
  });
});

// ---------------------------------------------------------------------------
// itemsFromRecipe
// ---------------------------------------------------------------------------

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    ingredientId: null,
    name: 'Flour',
    unit: 'gram',
    quantity: 200,
    ...overrides,
  };
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    recipeId: 'recipe1',
    title: 'Pancakes',
    description: '',
    type: 'meal',
    authorId: 'user1',
    visibility: 'public',
    sharedWith: [],
    rootId: 'recipe1',
    parentId: null,
    ingredients: [],
    steps: [],
    tags: [],
    keywords: [],
    servings: 4,
    prepTime: null,
    cookTime: null,
    coverPhotoPath: null,
    shareId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('itemsFromRecipe', () => {
  it('generates items with correct name, unit, and ingredientId from recipe', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ name: 'Sugar', unit: 'gram', quantity: 100, ingredientId: 'ing1' })],
      servings: 4,
    });
    const items = itemsFromRecipe(recipe, 4);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Sugar');
    expect(items[0].unit).toBe('gram');
    expect(items[0].ingredientId).toBe('ing1');
    expect(items[0].checked).toBe(false);
    expect(items[0].sourceRecipeIds).toEqual(['recipe1']);
  });

  it('scales quantity by targetServings / baseServings', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ quantity: 200, unit: 'gram' })],
      servings: 4,
    });
    const items = itemsFromRecipe(recipe, 8);
    expect(items[0].quantity).toBe(400);
  });

  it('halves quantity correctly', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ quantity: 200, unit: 'gram' })],
      servings: 4,
    });
    const items = itemsFromRecipe(recipe, 2);
    expect(items[0].quantity).toBe(100);
  });

  it('keeps null quantity as null (to taste)', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ quantity: null, unit: '' })],
      servings: 4,
    });
    const items = itemsFromRecipe(recipe, 8);
    expect(items[0].quantity).toBeNull();
  });

  it('defaults baseServings to 1 when recipe.servings is null', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ quantity: 100, unit: 'gram' })],
      servings: null,
    });
    // targetServings = 2, baseServings fallback = 1 → factor = 2
    const items = itemsFromRecipe(recipe, 2);
    expect(items[0].quantity).toBe(200);
  });

  it('does not produce NaN when recipe.servings is 0 (divide-by-zero guard)', () => {
    const recipe = makeRecipe({
      ingredients: [makeIngredient({ quantity: 100, unit: 'gram' })],
      servings: 0,
    });
    // baseServings 0 is treated as 1; factor = targetServings / 1
    const items = itemsFromRecipe(recipe, 4);
    expect(items[0].quantity).not.toBeNaN();
    expect(items[0].quantity).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// sortItemsAlphabetically
// ---------------------------------------------------------------------------

describe('sortItemsAlphabetically', () => {
  it('sorts items by name ascending (case-insensitive)', () => {
    const items = [
      makeItem({ name: 'Zucchini' }),
      makeItem({ name: 'apple' }),
      makeItem({ name: 'Banana' }),
    ];
    const sorted = sortItemsAlphabetically(items);
    expect(sorted.map((i) => i.name)).toEqual(['apple', 'Banana', 'Zucchini']);
  });

  it('does not mutate the original array', () => {
    const items = [makeItem({ name: 'Z' }), makeItem({ name: 'A' })];
    const original = [...items];
    sortItemsAlphabetically(items);
    expect(items).toEqual(original);
  });

  it('returns empty array when given empty array', () => {
    expect(sortItemsAlphabetically([])).toEqual([]);
  });
});
