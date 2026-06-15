/**
 * An entry in the shared ingredient catalog (`ingredients` collection). Recipes
 * reference a catalog entry by `ingredientId` so the same product written in
 * different ways converges on one canonical entry — which later powers
 * substitute suggestions.
 */
export interface CatalogIngredient {
  /** Firestore document id. */
  ingredientId: string;
  /** Canonical display name, for example "flour". */
  name: string;
  /** Lowercased name, used for prefix search and exact-match de-duplication. */
  nameLower: string;
}
