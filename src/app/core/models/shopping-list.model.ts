import { DocumentData } from 'firebase/firestore';

import { Ingredient } from './ingredient.model';
import { Recipe } from './recipe.model';
import { scaleQuantity } from './quantity.model';

export interface ShoppingListItem {
  /** Reference to the shared ingredient catalog entry, or `null` for free-text lines. */
  ingredientId: string | null;
  name: string;
  unit: string;
  quantity: number | null;
  checked: boolean;
  /** Ids of all recipes that contributed this item (accumulates across merges). */
  sourceRecipeIds: string[];
}

export interface ShoppingList {
  /** Firestore document id. */
  listId: string;
  name: string;
  items: ShoppingListItem[];
  /**
   * When `true`, the stored array order is the source of truth (user has
   * dragged or keyboard-moved items). When `false`, items render alphabetically.
   * Defaults to `false`. Manual reorder is implemented in a follow-up (#29).
   */
  isManuallyOrdered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Map a Firestore document snapshot to a `ShoppingList`, applying defensive defaults. */
export function toShoppingList(listId: string, data: DocumentData): ShoppingList {
  return {
    listId,
    name: data['name'] ?? '',
    items: Array.isArray(data['items']) ? (data['items'] as ShoppingListItem[]).map(toShoppingListItem) : [],
    isManuallyOrdered: data['isManuallyOrdered'] ?? false,
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

function toShoppingListItem(raw: unknown): ShoppingListItem {
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    ingredientId: typeof item['ingredientId'] === 'string' ? item['ingredientId'] : null,
    name: typeof item['name'] === 'string' ? item['name'] : '',
    unit: typeof item['unit'] === 'string' ? item['unit'] : '',
    quantity: typeof item['quantity'] === 'number' ? item['quantity'] : null,
    checked: item['checked'] === true,
    sourceRecipeIds: Array.isArray(item['sourceRecipeIds'])
      ? (item['sourceRecipeIds'] as unknown[]).filter((id): id is string => typeof id === 'string')
      : [],
  };
}

function toDate(value: unknown): Date {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date();
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Compute the merge key for a `ShoppingListItem`.
 * Uses `ingredientId` when set; falls back to `nameLower|unit`.
 */
function mergeKey(item: Pick<ShoppingListItem, 'ingredientId' | 'name' | 'unit'>): string {
  if (item.ingredientId) {
    return `id:${item.ingredientId}`;
  }
  return `${item.name.toLowerCase()}|${item.unit}`;
}

/**
 * Merge `incoming` items into `existing` items.
 *
 * - Merge key = `ingredientId` when present, else `nameLower + '|' + unit`.
 * - Lines merge only when key **and** unit match (no unit conversion).
 * - `null` quantities never sum — the merged item keeps `null`.
 * - `sourceRecipeIds` accumulates across merges.
 * - Items not present in `existing` are appended at the end.
 */
export function mergeItems(existing: ShoppingListItem[], incoming: ShoppingListItem[]): ShoppingListItem[] {
  const result: ShoppingListItem[] = [...existing];
  const indexMap = new Map<string, number>();
  for (let i = 0; i < result.length; i++) {
    indexMap.set(mergeKey(result[i]), i);
  }

  for (const item of incoming) {
    const key = mergeKey(item);
    const existingIndex = indexMap.get(key);
    if (existingIndex !== undefined) {
      const existingItem = result[existingIndex];
      // Merge only when key AND unit match (already enforced by key including unit for nameLower keys;
      // for ingredientId keys we also need to check unit).
      if (existingItem.unit === item.unit) {
        const mergedQuantity =
          existingItem.quantity === null || item.quantity === null
            ? null
            : existingItem.quantity + item.quantity;
        const mergedSourceRecipeIds = Array.from(
          new Set([...existingItem.sourceRecipeIds, ...item.sourceRecipeIds]),
        );
        result[existingIndex] = {
          ...existingItem,
          quantity: mergedQuantity,
          sourceRecipeIds: mergedSourceRecipeIds,
        };
      } else {
        // Same ingredientId but different unit — treat as a separate line.
        result.push(item);
        indexMap.set(`${key}|unit:${item.unit}`, result.length - 1);
      }
    } else {
      result.push(item);
      indexMap.set(key, result.length - 1);
    }
  }

  return result;
}

/**
 * Generate a list of `ShoppingListItem`s from a recipe's ingredients, scaled
 * to `targetServings`. Uses `scaleQuantity` from `quantity.model.ts`.
 */
export function itemsFromRecipe(recipe: Recipe, targetServings: number): ShoppingListItem[] {
  const baseServings = recipe.servings ?? 1;
  const scaleFactor = targetServings / baseServings;

  return recipe.ingredients.map(
    (ingredient: Ingredient): ShoppingListItem => ({
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      unit: ingredient.unit,
      quantity: scaleQuantity(ingredient.quantity, scaleFactor),
      checked: false,
      sourceRecipeIds: [recipe.recipeId],
    }),
  );
}

/**
 * Return a new array with items sorted alphabetically by `name` (case-insensitive).
 * Does not mutate the original array.
 */
export function sortItemsAlphabetically(items: ShoppingListItem[]): ShoppingListItem[] {
  return [...items].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
