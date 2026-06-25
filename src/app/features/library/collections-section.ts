import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { LibraryStore } from '../../core/state/library.store';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';

let nextCollectionsSectionId = 0;

/**
 * Displays the user's recipe collections with inline create / rename / delete
 * and remove-recipe-from-collection flows. Embedded in the Library page.
 */
@Component({
  selector: 'app-collections-section',
  imports: [TranslocoDirective, RecipeCard],
  template: `
    <section *transloco="let t">
      <h2>{{ t('collections.sectionTitle') }}</h2>

      <!-- Create new collection -->
      <div class="collection-create-row">
        <label [for]="ids.newCollectionInput" class="visually-hidden">{{ t('collections.newPlaceholder') }}</label>
        <input
          [id]="ids.newCollectionInput"
          type="text"
          class="collection-name-input"
          [placeholder]="t('collections.newPlaceholder')"
          [value]="newCollectionName()"
          (input)="newCollectionName.set(getInputValue($event))"
          (keydown.enter)="createCollection()"
        />
        <button
          type="button"
          class="button button--primary"
          [disabled]="newCollectionName().trim().length === 0 || isCreating()"
          (click)="createCollection()"
        >
          {{ t('collections.create') }}
        </button>
      </div>

      @if (isCollectionsLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (collections().length === 0) {
        <p>{{ t('collections.empty') }}</p>
      } @else {
        <ul class="collection-list">
          @for (collection of collections(); track collection.collectionId) {
            <li class="collection-item">
              <!-- Rename mode toggle -->
              @if (renamingId() === collection.collectionId) {
                <div class="collection-rename-row">
                  <label [for]="ids.renameInput" class="visually-hidden">{{ t('collections.rename') }}</label>
                  <input
                    [id]="ids.renameInput"
                    #renameInput
                    type="text"
                    class="collection-name-input"
                    [value]="renameValue()"
                    (input)="renameValue.set(getInputValue($event))"
                    (keydown.enter)="confirmRename(collection.collectionId)"
                    (keydown.escape)="cancelRename()"
                  />
                  <button
                    type="button"
                    class="button button--primary"
                    [disabled]="renameValue().trim().length === 0"
                    (click)="confirmRename(collection.collectionId)"
                  >
                    {{ t('collections.rename') }}
                  </button>
                  <button type="button" class="button" (click)="cancelRename()">
                    {{ t('actions.cancel') }}
                  </button>
                </div>
              } @else {
                <div class="collection-header">
                  <h3 class="collection-name">{{ collection.name }}</h3>
                  <span class="collection-count">
                    {{
                      t(
                        collection.recipeIds.length === 1
                          ? 'collections.recipeCountOne'
                          : 'collections.recipeCountOther',
                        { count: collection.recipeIds.length }
                      )
                    }}
                  </span>
                  <div class="collection-actions">
                    <button
                      type="button"
                      class="button"
                      [attr.aria-label]="t('collections.rename') + ' ' + collection.name"
                      (click)="startRename(collection.collectionId, collection.name)"
                    >
                      {{ t('collections.rename') }}
                    </button>
                    <button
                      type="button"
                      class="button button--danger"
                      [attr.aria-label]="t('collections.delete') + ' ' + collection.name"
                      (click)="requestDelete(collection.collectionId)"
                    >
                      {{ t('collections.delete') }}
                    </button>
                  </div>
                </div>
              }

              <!-- Delete confirm dialog -->
              @if (deletingId() === collection.collectionId) {
                <div class="delete-confirm" role="alertdialog" aria-live="assertive">
                  <p>{{ t('collections.deleteConfirm') }}</p>
                  <div class="collection-actions">
                    <button
                      type="button"
                      class="button button--danger"
                      [disabled]="isDeleting()"
                      (click)="confirmDelete(collection.collectionId)"
                    >
                      {{ t('actions.delete') }}
                    </button>
                    <button
                      type="button"
                      class="button"
                      [disabled]="isDeleting()"
                      (click)="cancelDelete()"
                    >
                      {{ t('actions.cancel') }}
                    </button>
                  </div>
                </div>
              }

              <!-- Member recipes grid -->
              @if (memberRecipes(collection.collectionId); as members) {
                @if (members.length > 0) {
                  <div class="recipe-grid">
                    @for (recipe of members; track recipe.recipeId) {
                      <div class="collection-recipe-item">
                        <app-recipe-card [recipe]="recipe" />
                        <button
                          type="button"
                          class="button"
                          [attr.aria-label]="t('collections.removeFromCollection') + ' ' + recipe.title"
                          (click)="removeFromCollection(collection.collectionId, recipe.recipeId)"
                        >
                          {{ t('collections.removeFromCollection') }}
                        </button>
                      </div>
                    }
                  </div>
                }
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class CollectionsSection implements OnInit {
  private readonly libraryStore = inject(LibraryStore);
  private readonly recipeService = inject(RecipeService);

  protected readonly collections = this.libraryStore.collections;
  protected readonly isCollectionsLoading = this.libraryStore.isCollectionsLoading;

  protected readonly newCollectionName = signal('');
  protected readonly isCreating = signal(false);
  protected readonly renamingId = signal<string | null>(null);
  protected readonly renameValue = signal('');
  protected readonly deletingId = signal<string | null>(null);
  protected readonly isDeleting = signal(false);

  /** Stable unique id prefix for label associations. */
  private readonly uid = `collections-section-${nextCollectionsSectionId++}`;
  protected readonly ids = {
    newCollectionInput: `${this.uid}-new-collection`,
    renameInput: `${this.uid}-rename`,
  };

  /**
   * Map from collectionId → loaded Recipe[]. Populated lazily when collections
   * are loaded. Dangling ids (deleted/private recipes) are filtered to null and
   * excluded from the rendered list.
   */
  private readonly memberRecipeCache = signal<Map<string, Recipe[]>>(new Map());

  /** Look up resolved recipes for a collection. Called from the template. */
  protected memberRecipes(collectionId: string): Recipe[] {
    return this.memberRecipeCache().get(collectionId) ?? [];
  }

  async ngOnInit(): Promise<void> {
    await this.loadMemberRecipes();
  }

  /** Called whenever collections change — re-resolve member recipes. */
  private async loadMemberRecipes(): Promise<void> {
    const allCollections = this.libraryStore.collections();
    const allRecipeIds = new Set(allCollections.flatMap((c) => c.recipeIds));
    const recipeMap = new Map<string, Recipe>();

    await Promise.all(
      [...allRecipeIds].map(async (recipeId) => {
        const recipe = await this.recipeService.getRecipe(recipeId);
        if (recipe) {
          recipeMap.set(recipeId, recipe);
        }
      }),
    );

    const updatedCache = new Map<string, Recipe[]>();
    for (const collection of allCollections) {
      updatedCache.set(
        collection.collectionId,
        collection.recipeIds.map((id) => recipeMap.get(id)).filter((r): r is Recipe => r !== undefined),
      );
    }
    this.memberRecipeCache.set(updatedCache);
  }

  protected getInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async createCollection(): Promise<void> {
    const name = this.newCollectionName().trim();
    if (!name) {
      return;
    }
    this.isCreating.set(true);
    try {
      await this.libraryStore.createCollection(name);
      this.newCollectionName.set('');
      await this.loadMemberRecipes();
    } finally {
      this.isCreating.set(false);
    }
  }

  startRename(collectionId: string, currentName: string): void {
    this.renamingId.set(collectionId);
    this.renameValue.set(currentName);
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameValue.set('');
  }

  async confirmRename(collectionId: string): Promise<void> {
    const name = this.renameValue().trim();
    if (!name) {
      return;
    }
    await this.libraryStore.renameCollection(collectionId, name);
    this.cancelRename();
  }

  requestDelete(collectionId: string): void {
    this.deletingId.set(collectionId);
  }

  cancelDelete(): void {
    this.deletingId.set(null);
  }

  async confirmDelete(collectionId: string): Promise<void> {
    this.isDeleting.set(true);
    try {
      await this.libraryStore.deleteCollection(collectionId);
      this.deletingId.set(null);
    } finally {
      this.isDeleting.set(false);
    }
  }

  async removeFromCollection(collectionId: string, recipeId: string): Promise<void> {
    await this.libraryStore.removeRecipeFromCollection(collectionId, recipeId);
    await this.loadMemberRecipes();
  }
}
