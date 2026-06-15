export interface Ingredient {
  /**
   * Reference to the shared ingredient catalog entry (`ingredients/{id}`), or
   * `null` for free-text/legacy ingredients not linked to the catalog.
   */
  ingredientId: string | null;
  /** Numeric amount, for example 200. `null` for "to taste" style ingredients. */
  quantity: number | null;
  /** Unit of measure, for example "grams", "ml", "cups". Empty string when unitless. */
  unit: string;
  /** Ingredient name, for example "flour". */
  name: string;
}
