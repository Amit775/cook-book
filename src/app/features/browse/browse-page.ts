import { Component, computed, inject, resource, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { applyFilters, DEFAULT_CRITERIA, RecipeFilterCriteria } from '../../core/models/recipe-filter.model';
import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { RecipeSearchBar } from '../../shared/recipe-search-bar/recipe-search-bar';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';

/**
 * Public landing page: a welcome header and a grid of publicly browsable recipes.
 * Search, filter, and sort are applied client-side over the full public set so
 * the Firestore query shape remains unchanged (rules-safe).
 */
@Component({
  selector: 'app-browse-page',
  imports: [TranslocoDirective, RecipeCard, RecipeSearchBar],
  template: `
    <section class="page" *transloco="let t">
      <header class="browse-intro">
        <h1>{{ t('browse.heading') }}</h1>
        <p>{{ t('browse.subheading') }}</p>
      </header>

      @if (recipesResource.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else {
        <app-recipe-search-bar
          [criteria]="criteria()"
          [availableTags]="availableTags()"
          (criteriaChange)="criteria.set($event)"
        />

        <div aria-live="polite" aria-atomic="true" class="visually-hidden">
          {{
            t(
              filteredRecipes().length === 1 ? 'search.resultCountOne' : 'search.resultCountOther',
              { count: filteredRecipes().length }
            )
          }}
        </div>

        @if (filteredRecipes().length === 0 && recipesResource.value().length > 0) {
          <p>{{ t('search.noResults') }}</p>
        } @else if (recipesResource.value().length === 0) {
          <p>{{ t('browse.empty') }}</p>
        } @else {
          <div class="recipe-grid">
            @for (recipe of filteredRecipes(); track recipe.recipeId) {
              <app-recipe-card [recipe]="recipe" />
            }
          </div>
        }
      }
    </section>
  `,
})
export class BrowsePage {
  private readonly recipeService = inject(RecipeService);

  protected readonly recipesResource = resource({
    defaultValue: [] as Recipe[],
    loader: () => this.recipeService.listPublicRecipes(),
  });

  /** Current filter + sort state; updated when the search bar emits. */
  protected readonly criteria = signal<RecipeFilterCriteria>(DEFAULT_CRITERIA);

  /** Unique sorted list of all tags present in the loaded recipe set. */
  protected readonly availableTags = computed(() => {
    const all = this.recipesResource.value().flatMap((recipe) => recipe.tags);
    return [...new Set(all)].sort((first, second) => first.localeCompare(second));
  });

  /** The filtered + sorted subset shown in the grid. */
  protected readonly filteredRecipes = computed(() =>
    applyFilters(this.recipesResource.value(), this.criteria()),
  );
}
