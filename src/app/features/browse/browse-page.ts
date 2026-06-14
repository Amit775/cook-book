import { Component, inject, resource } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';

/**
 * Public landing page: a welcome header and a grid of publicly browsable recipes.
 */
@Component({
  selector: 'app-browse-page',
  imports: [TranslocoDirective, RecipeCard],
  template: `
    <section class="page" *transloco="let t">
      <header class="browse-intro">
        <h1>{{ t('browse.heading') }}</h1>
        <p>{{ t('browse.subheading') }}</p>
      </header>

      @if (recipesResource.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (recipesResource.value().length === 0) {
        <p>{{ t('browse.empty') }}</p>
      } @else {
        <div class="recipe-grid">
          @for (recipe of recipesResource.value(); track recipe.recipeId) {
            <app-recipe-card [recipe]="recipe" />
          }
        </div>
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
}
