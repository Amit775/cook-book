/**
 * Measuring units for ingredient quantities. Stored on an ingredient as the
 * key (e.g. `'cup'`) and shown via the `unit.<key>` translation. Israeli-first.
 */
export type RecipeUnit =
  | 'gram'
  | 'kilogram'
  | 'milliliter'
  | 'liter'
  | 'cup'
  | 'tablespoon'
  | 'teaspoon'
  | 'piece'
  | 'pinch'
  | 'package'
  | 'toTaste';

export const RECIPE_UNITS: readonly RecipeUnit[] = [
  'gram',
  'kilogram',
  'milliliter',
  'liter',
  'cup',
  'tablespoon',
  'teaspoon',
  'piece',
  'pinch',
  'package',
  'toTaste',
];

/** Whether a stored unit string is one of the known structured units. */
export function isRecipeUnit(value: string): value is RecipeUnit {
  return (RECIPE_UNITS as readonly string[]).includes(value);
}
