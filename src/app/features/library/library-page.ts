import { Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { SessionStore } from '../../core/state/session.store';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';

@Component({
  selector: 'app-library-page',
  imports: [TranslocoDirective, RouterLink, RecipeCard],
  template: `
    <section class="page" *transloco="let t">
      <div class="page-header">
        <h1>{{ t('library.heading') }}</h1>
        <a routerLink="/create" class="button button--primary">{{ t('library.newRecipe') }}</a>
      </div>

      @if (!isSignedIn()) {
        <p>{{ t('common.signInRequired') }}</p>
        <a routerLink="/login" class="button">{{ t('actions.signIn') }}</a>
      } @else {
        @if (recipesResource.isLoading()) {
          <p>{{ t('common.loading') }}</p>
        } @else if (recipesResource.value().length === 0) {
          <p>{{ t('library.empty') }}</p>
        } @else {
          <div class="recipe-grid">
            @for (recipe of recipesResource.value(); track recipe.recipeId) {
              <app-recipe-card [recipe]="recipe" />
            }
          </div>
        }

        <section class="shared-with-me">
          <h2>{{ t('library.sharedWithMe') }}</h2>
          @if (sharedResource.isLoading()) {
            <p>{{ t('common.loading') }}</p>
          } @else if (sharedResource.value().length === 0) {
            <p>{{ t('library.sharedEmpty') }}</p>
          } @else {
            <div class="recipe-grid">
              @for (recipe of sharedResource.value(); track recipe.recipeId) {
                <app-recipe-card [recipe]="recipe" />
              }
            </div>
          }
        </section>
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

  protected readonly sharedResource = resource({
    params: () => this.session.user()?.uid,
    defaultValue: [] as Recipe[],
    loader: ({ params }) => this.recipeService.listSharedWithMe(params),
  });
}
