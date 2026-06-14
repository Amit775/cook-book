import { Component, inject, input, resource } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { parseDurationToMinutes } from '../../core/models/duration.model';
import { RecipeService } from '../../core/services/recipe.service';

@Component({
  selector: 'app-recipe-detail-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page" *transloco="let t">
      @if (recipeResource.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (recipeResource.value(); as recipe) {
        <h1>{{ recipe.title }}</h1>
        <p class="recipe-meta">
          <span>{{ t('recipeType.' + recipe.type) }}</span>
          @if (recipe.servings) {
            <span>· {{ recipe.servings }} {{ t('recipeDetail.servings') }}</span>
          }
          @if (toMinutes(recipe.prepTime); as minutes) {
            <span>· {{ t('recipeDetail.prepTime') }} {{ minutes }}′</span>
          }
          @if (toMinutes(recipe.cookTime); as minutes) {
            <span>· {{ t('recipeDetail.cookTime') }} {{ minutes }}′</span>
          }
        </p>

        @if (recipe.description) {
          <p>{{ recipe.description }}</p>
        }

        <h2>{{ t('recipeDetail.ingredients') }}</h2>
        <ul>
          @for (ingredient of recipe.ingredients; track $index) {
            <li>{{ ingredient.quantity }} {{ ingredient.unit }} {{ ingredient.name }}</li>
          }
        </ul>

        <h2>{{ t('recipeDetail.steps') }}</h2>
        <ol>
          @for (step of recipe.steps; track $index) {
            <li>{{ step }}</li>
          }
        </ol>
      } @else {
        <p>{{ t('recipeDetail.notFound') }}</p>
      }
    </section>
  `,
})
export class RecipeDetailPage {
  private readonly recipeService = inject(RecipeService);

  /** Bound from the `:recipeId` route parameter (withComponentInputBinding). */
  readonly recipeId = input<string>('');

  protected readonly recipeResource = resource({
    params: () => this.recipeId() || undefined,
    loader: ({ params }) => this.recipeService.getRecipe(params),
  });

  protected toMinutes(duration: string | null): number | null {
    return parseDurationToMinutes(duration);
  }
}
