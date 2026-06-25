import { Component, computed, inject, OnInit, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { applyFilters, DEFAULT_CRITERIA, RecipeFilterCriteria } from '../../core/models/recipe-filter.model';
import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { LibraryStore } from '../../core/state/library.store';
import { SessionStore } from '../../core/state/session.store';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';
import { RecipeSearchBar } from '../../shared/recipe-search-bar/recipe-search-bar';
import { CollectionsSection } from './collections-section';

@Component({
  selector: 'app-library-page',
  imports: [TranslocoDirective, RouterLink, RecipeCard, RecipeSearchBar, CollectionsSection],
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

        @if (recipesResource.isLoading()) {
          <p>{{ t('common.loading') }}</p>
        } @else if (filteredRecipes().length === 0 && recipesResource.value().length > 0) {
          <p>{{ t('search.noResults') }}</p>
        } @else if (recipesResource.value().length === 0) {
          <p>{{ t('library.empty') }}</p>
        } @else {
          <div class="recipe-grid">
            @for (recipe of filteredRecipes(); track recipe.recipeId) {
              <app-recipe-card [recipe]="recipe" />
            }
          </div>
        }

        <!-- Saved recipes section -->
        <section class="saved-section">
          <h2>{{ t('saved.sectionTitle') }}</h2>
          @if (isSavedLoading()) {
            <p>{{ t('common.loading') }}</p>
          } @else if (savedRecipes().length === 0) {
            <p>{{ t('saved.empty') }}</p>
          } @else {
            <div class="recipe-grid">
              @for (recipe of savedRecipes(); track recipe.recipeId) {
                <app-recipe-card [recipe]="recipe" />
              }
            </div>
          }
        </section>

        <!-- Collections section -->
        <app-collections-section />

        <!-- Shared with me section -->
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
export class LibraryPage implements OnInit {
  private readonly recipeService = inject(RecipeService);
  private readonly session = inject(SessionStore);
  private readonly libraryStore = inject(LibraryStore);

  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isSavedLoading = this.libraryStore.isSavedLoading;

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

  /** Current filter + sort state for the owned-recipes grid. */
  protected readonly criteria = signal<RecipeFilterCriteria>(DEFAULT_CRITERIA);

  /** Unique sorted list of all tags present in the user's owned recipes. */
  protected readonly availableTags = computed(() => {
    const all = this.recipesResource.value().flatMap((recipe) => recipe.tags);
    return [...new Set(all)].sort((first, second) => first.localeCompare(second));
  });

  /** The filtered + sorted subset of owned recipes shown in the grid. */
  protected readonly filteredRecipes = computed(() =>
    applyFilters(this.recipesResource.value(), this.criteria()),
  );

  /**
   * Saved recipes resolved from their ids. Dangling refs (recipe deleted or
   * turned private) are excluded — null results are filtered out.
   */
  protected readonly savedRecipes = computed(() => {
    // Resolved from the savedResource below
    return this._savedRecipes();
  });

  private readonly _savedRecipes = signal<Recipe[]>([]);

  async ngOnInit(): Promise<void> {
    if (this.session.isAuthenticated()) {
      await Promise.all([
        this.libraryStore.loadSaved(),
        this.libraryStore.loadCollections(),
      ]);
      await this.resolveSavedRecipes();
    }
  }

  private async resolveSavedRecipes(): Promise<void> {
    const ids = this.libraryStore.savedRecipeIds();
    const results = await Promise.all(ids.map((id) => this.recipeService.getRecipe(id)));
    this._savedRecipes.set(results.filter((r): r is Recipe => r !== null));
  }
}
