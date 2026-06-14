import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { parseDurationToMinutes } from '../../core/models/duration.model';
import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { SessionStore } from '../../core/state/session.store';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';
import { RecipeShare } from './recipe-share';

@Component({
  selector: 'app-recipe-detail-page',
  imports: [TranslocoDirective, RouterLink, RecipeCard, RecipeShare],
  template: `
    <section class="page" *transloco="let t">
      @if (recipeResource.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (recipeResource.value(); as recipe) {
        @if (coverPhotoUrl.value(); as url) {
          <img [src]="url" [alt]="recipe.title" class="recipe-cover" />
        }

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

        @if (isSignedIn()) {
          <div class="recipe-detail-actions">
            <button type="button" class="button button--primary" [disabled]="isCloning()" (click)="clone(recipe)">
              {{ isCloning() ? t('recipeDetail.cloning') : t('actions.clone') }}
            </button>
            @if (isOwner()) {
              <a class="button" [routerLink]="['/recipes', recipe.recipeId, 'edit']">{{ t('actions.edit') }}</a>
              <button type="button" class="button" (click)="requestDelete()">{{ t('actions.delete') }}</button>
            }
          </div>

          @if (confirmingDelete()) {
            <div class="delete-confirm" role="alertdialog" aria-live="assertive">
              <p>{{ t('recipeDetail.deleteConfirm') }}</p>
              <div class="recipe-detail-actions">
                <button type="button" class="button button--danger" [disabled]="isDeleting()" (click)="confirmDelete(recipe)">
                  {{ isDeleting() ? t('recipeDetail.deleting') : t('actions.delete') }}
                </button>
                <button type="button" class="button" [disabled]="isDeleting()" (click)="cancelDelete()">
                  {{ t('actions.cancel') }}
                </button>
              </div>
            </div>
          }

          @if (isOwner()) {
            <app-recipe-share [recipe]="recipe" />
          }
        }

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

        @if (versionsResource.value().length > 0) {
          <section class="recipe-versions">
            <h2>{{ t('recipeDetail.otherVersions') }}</h2>
            <div class="recipe-grid">
              @for (version of versionsResource.value(); track version.recipeId) {
                <app-recipe-card [recipe]="version" />
              }
            </div>
          </section>
        }
      } @else {
        <p>{{ t('recipeDetail.notFound') }}</p>
      }
    </section>
  `,
})
export class RecipeDetailPage {
  private readonly recipeService = inject(RecipeService);
  private readonly storageService = inject(StorageService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Bound from the `:recipeId` route parameter (withComponentInputBinding). */
  readonly recipeId = input<string>('');

  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isCloning = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly isDeleting = signal(false);

  protected readonly recipeResource = resource({
    params: () => this.recipeId() || undefined,
    loader: ({ params }) => this.recipeService.getRecipe(params),
  });

  protected readonly isOwner = computed(() => {
    const recipe = this.recipeResource.value();
    const user = this.session.user();
    return !!recipe && !!user && recipe.authorId === user.uid;
  });

  private readonly coverPhotoPath = computed(() => this.recipeResource.value()?.coverPhotoPath ?? undefined);
  protected readonly coverPhotoUrl = resource({
    params: () => this.coverPhotoPath(),
    loader: ({ params }) => this.storageService.getPhotoUrl(params),
  });

  private readonly versionParams = computed(() => {
    const recipe = this.recipeResource.value();
    return recipe ? { rootId: recipe.rootId, recipeId: recipe.recipeId } : undefined;
  });
  protected readonly versionsResource = resource({
    params: () => this.versionParams(),
    defaultValue: [] as Recipe[],
    loader: ({ params }) =>
      this.recipeService.listVersions(params.rootId, this.session.user()?.uid ?? null, params.recipeId),
  });

  protected toMinutes(duration: string | null): number | null {
    return parseDurationToMinutes(duration);
  }

  async clone(recipe: Recipe): Promise<void> {
    const cloner = this.session.user();
    if (!cloner) {
      return;
    }
    this.isCloning.set(true);
    try {
      const newRecipeId = await this.recipeService.cloneRecipe(recipe, cloner);
      await this.router.navigateByUrl(`/recipes/${newRecipeId}`);
    } finally {
      this.isCloning.set(false);
    }
  }

  requestDelete(): void {
    this.confirmingDelete.set(true);
  }

  cancelDelete(): void {
    this.confirmingDelete.set(false);
  }

  async confirmDelete(recipe: Recipe): Promise<void> {
    this.isDeleting.set(true);
    try {
      await this.recipeService.deleteRecipe(recipe.recipeId);
      await this.router.navigateByUrl('/library');
    } finally {
      this.isDeleting.set(false);
    }
  }
}
