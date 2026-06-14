import { Component, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { StorageService } from '../../core/services/storage.service';

/**
 * Compact recipe card linking to the recipe detail page. Resolves the cover
 * photo storage path to a download URL on demand. Used in browse and library grids.
 */
@Component({
  selector: 'app-recipe-card',
  imports: [RouterLink, TranslocoDirective],
  template: `
    <a class="recipe-card" [routerLink]="['/recipes', recipe().recipeId]" *transloco="let t">
      <div class="recipe-card-media">
        @if (coverPhotoUrl.value(); as url) {
          <img [src]="url" [alt]="recipe().title" loading="lazy" />
        } @else {
          <span class="recipe-card-placeholder" aria-hidden="true">🍽️</span>
        }
      </div>
      <div class="recipe-card-body">
        <h3 class="recipe-card-title">{{ recipe().title }}</h3>
        <span class="recipe-card-type">{{ t('recipeType.' + recipe().type) }}</span>
      </div>
    </a>
  `,
  styleUrl: './recipe-card.scss',
})
export class RecipeCard {
  private readonly storageService = inject(StorageService);

  readonly recipe = input.required<Recipe>();

  protected readonly coverPhotoUrl = resource({
    params: () => this.recipe().coverPhotoPath ?? undefined,
    loader: ({ params }) => this.storageService.getPhotoUrl(params),
  });
}
