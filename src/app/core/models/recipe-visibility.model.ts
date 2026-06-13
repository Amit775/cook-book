/**
 * Who can read a recipe.
 * - `private`: only the author.
 * - `unlisted`: anyone who has the direct link (not shown in public browse listings).
 * - `shared`: the author plus the users listed in `sharedWith`.
 * - `public`: anyone, and surfaced in public browse listings.
 */
export type RecipeVisibility = 'private' | 'unlisted' | 'shared' | 'public';

export const RECIPE_VISIBILITIES: readonly RecipeVisibility[] = ['private', 'unlisted', 'shared', 'public'];
