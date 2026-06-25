import { parseDurationToMinutes } from './duration.model';
import { Recipe } from './recipe.model';
import { RecipeType } from './recipe-type.model';

/** The two orderings available in the search UI. */
export type SortOption = 'newest' | 'quickest';

/**
 * All filter + sort state that the search bar owns. Immutable value object —
 * any change creates a new object rather than mutating in place.
 */
export interface RecipeFilterCriteria {
  /** Raw text from the search input. Tokenised before matching. */
  searchText: string;
  /** When non-null, only recipes of this type are included. */
  type: RecipeType | null;
  /** When non-null, only recipes whose `tags[]` contains exactly this tag are included. */
  tag: string | null;
  /**
   * When non-null, only recipes whose total time (prep + cook) is <= this value
   * are included. Recipes with no time set are EXCLUDED when a limit is active.
   */
  maxTotalTimeMinutes: number | null;
  sort: SortOption;
}

/** The default (empty / pass-all) criteria. */
export const DEFAULT_CRITERIA: RecipeFilterCriteria = {
  searchText: '',
  type: null,
  tag: null,
  maxTotalTimeMinutes: null,
  sort: 'newest',
};

/**
 * Sum of `prepTime` and `cookTime` in minutes.
 * Returns `null` when neither field is set (or neither parses to a positive number).
 */
export function totalTimeMinutes(recipe: Recipe): number | null {
  const prep = parseDurationToMinutes(recipe.prepTime) ?? 0;
  const cook = parseDurationToMinutes(recipe.cookTime) ?? 0;
  // If both are zero it means neither was actually set → no time data.
  if (prep === 0 && cook === 0) {
    return null;
  }
  return prep + cook;
}

/**
 * Returns `true` when every whitespace-separated token in `searchText` appears
 * in the recipe's `keywords[]` array (case-insensitive, whole-token match).
 * An empty or whitespace-only search text always matches.
 */
export function matchesKeyword(recipe: Recipe, searchText: string): boolean {
  const trimmed = searchText.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  const tokens = trimmed.split(/\s+/);
  return tokens.every((token) => recipe.keywords.includes(token));
}

/**
 * Filter and sort an array of recipes by the given criteria.
 * This is a pure function: the input array is never mutated.
 */
export function applyFilters(recipes: Recipe[], criteria: RecipeFilterCriteria): Recipe[] {
  const filtered = recipes.filter((recipe) => {
    // Keyword search (AND across tokens)
    if (!matchesKeyword(recipe, criteria.searchText)) {
      return false;
    }

    // Type filter
    if (criteria.type !== null && recipe.type !== criteria.type) {
      return false;
    }

    // Tag filter (exact membership)
    if (criteria.tag !== null && !recipe.tags.includes(criteria.tag)) {
      return false;
    }

    // Total-time filter — recipes with no time data are excluded when a limit is active
    if (criteria.maxTotalTimeMinutes !== null) {
      const total = totalTimeMinutes(recipe);
      if (total === null || total > criteria.maxTotalTimeMinutes) {
        return false;
      }
    }

    return true;
  });

  // Sort
  if (criteria.sort === 'newest') {
    filtered.sort((first, second) => second.updatedAt.getTime() - first.updatedAt.getTime());
  } else {
    // quickest — nulls sort last
    filtered.sort((first, second) => {
      const firstTime = totalTimeMinutes(first);
      const secondTime = totalTimeMinutes(second);
      if (firstTime === null && secondTime === null) return 0;
      if (firstTime === null) return 1;
      if (secondTime === null) return -1;
      return firstTime - secondTime;
    });
  }

  return filtered;
}
