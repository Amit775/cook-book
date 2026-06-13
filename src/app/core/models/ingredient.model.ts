export interface Ingredient {
  /** Numeric amount, for example 200. `null` for "to taste" style ingredients. */
  quantity: number | null;
  /** Unit of measure, for example "grams", "ml", "cups". Empty string when unitless. */
  unit: string;
  /** Ingredient name, for example "flour". */
  name: string;
}
