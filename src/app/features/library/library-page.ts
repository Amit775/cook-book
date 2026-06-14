import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { SessionStore } from '../../core/state/session.store';

@Component({
  selector: 'app-library-page',
  imports: [TranslocoDirective, RouterLink],
  template: `
    <section class="page" *transloco="let t">
      <div class="page-header">
        <h1>{{ t('library.heading') }}</h1>
        <a routerLink="/create" class="button button--primary">{{ t('library.newRecipe') }}</a>
      </div>

      @if (!isSignedIn()) {
        <p>{{ t('common.signInRequired') }}</p>
        <a routerLink="/login" class="button">{{ t('actions.signIn') }}</a>
      } @else if (recipesResource.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (recipesResource.value().length === 0) {
        <p>{{ t('library.empty') }}</p>
      } @else {
        <ul class="recipe-list">
          @for (recipe of recipesResource.value(); track recipe.recipeId) {
            <li>
              <a [routerLink]="['/recipes', recipe.recipeId]">{{ recipe.title }}</a>
              <span class="recipe-list-type">{{ t('recipeType.' + recipe.type) }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class LibraryPage {
  private readonly recipeService = inject(RecipeService);
  private readonly session = inject(SessionStore);

  protected readonly isSignedIn = this.session.isAuthenticated;

  protected readonly recipesResource = resource({
    params: () => this.session.user()?.uid,
    defaultValue: [] as Recipe[],
    loader: ({ params }) => this.recipeService.listMyRecipes(params),
  });
}
