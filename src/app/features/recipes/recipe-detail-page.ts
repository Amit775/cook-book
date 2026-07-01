import { Component, computed, inject, input, linkedSignal, OnInit, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { parseDurationToMinutes } from '../../core/models/duration.model';
import { PlannedRecipe } from '../../core/models/meal-plan.model';
import { formatQuantity, scaleQuantity } from '../../core/models/quantity.model';
import { Recipe } from '../../core/models/recipe.model';
import { isRecipeUnit } from '../../core/models/recipe-unit.model';
import { RecipeService } from '../../core/services/recipe.service';
import { StorageService } from '../../core/services/storage.service';
import { LibraryStore } from '../../core/state/library.store';
import { MealPlanStore } from '../../core/state/meal-plan.store';
import { SessionStore } from '../../core/state/session.store';
import { ShoppingListStore } from '../../core/state/shopping-list.store';
import { RecipeCard } from '../../shared/recipe-card/recipe-card';
import { SaveRecipeButton } from '../../shared/save-recipe-button/save-recipe-button';
import { RecipeRatingSection } from './recipe-rating-section';
import { RecipeShare } from './recipe-share';

let nextDetailPageId = 0;

/** Day-of-week index → Transloco key suffix (mirrored from meal-planner-page). */
const DETAIL_PAGE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

@Component({
  selector: 'app-recipe-detail-page',
  imports: [TranslocoDirective, RouterLink, RecipeCard, RecipeShare, SaveRecipeButton, RecipeRatingSection],
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
          @if (toMinutes(recipe.prepTime); as minutes) {
            <span>· {{ t('recipeDetail.prepTime') }} {{ minutes }}′</span>
          }
          @if (toMinutes(recipe.cookTime); as minutes) {
            <span>· {{ t('recipeDetail.cookTime') }} {{ minutes }}′</span>
          }
        </p>

        <div class="recipe-detail-actions">
          <a
            class="button button--primary cook-button"
            [routerLink]="['/recipes', recipe.recipeId, 'cook']"
            [queryParams]="{ servings: targetServings() }"
          >
            {{ t('cooking.start') }}
          </a>
        </div>

        @if (isSignedIn()) {
          <div class="recipe-detail-actions">
            <button type="button" class="button button--primary" [disabled]="isCloning()" (click)="clone(recipe)">
              {{ isCloning() ? t('recipeDetail.cloning') : t('actions.clone') }}
            </button>
            <app-save-recipe-button [recipeId]="recipe.recipeId" />
            @if (isOwner()) {
              <a class="button" [routerLink]="['/recipes', recipe.recipeId, 'edit']">{{ t('actions.edit') }}</a>
              <button type="button" class="button" (click)="requestDelete()">{{ t('actions.delete') }}</button>
            }
          </div>

          <!-- Add to collection (always shown when signed in so user can create first collection inline) -->
          <div class="add-to-collection-row">
            <label [for]="ids.collectionSelect" class="visually-hidden">
              {{ t('collections.addToCollection') }}
            </label>
            <select
              [id]="ids.collectionSelect"
              class="search-bar-select"
              [value]="selectedCollectionId()"
              (change)="onCollectionSelectChange($event)"
              [attr.aria-label]="t('collections.addToCollection')"
            >
              <option value="">{{ t('collections.addToCollection') }}</option>
              @for (col of collections(); track col.collectionId) {
                <option [value]="col.collectionId">{{ col.name }}</option>
              }
              <option value="__new__">{{ t('collections.newOption') }}</option>
            </select>
            @if (addingToCollection()) {
              <span aria-live="polite" class="visually-hidden">{{ t('common.saving') }}</span>
            }
          </div>

          <!-- Inline new collection form -->
          @if (showingNewCollectionForm()) {
            <div class="new-collection-inline">
              <label [for]="ids.newCollectionInput" class="visually-hidden">
                {{ t('collections.newPlaceholder') }}
              </label>
              <input
                [id]="ids.newCollectionInput"
                type="text"
                class="collection-name-input"
                [placeholder]="t('collections.newPlaceholder')"
                [value]="newCollectionName()"
                (input)="newCollectionName.set(getInputValue($event))"
                (keydown.enter)="createAndAddToCollection(recipe.recipeId)"
                (keydown.escape)="cancelNewCollection()"
              />
              <button
                type="button"
                class="button button--primary"
                [disabled]="newCollectionName().trim().length === 0 || isCreatingCollection()"
                (click)="createAndAddToCollection(recipe.recipeId)"
              >
                {{ t('collections.create') }}
              </button>
              <button type="button" class="button" (click)="cancelNewCollection()">
                {{ t('actions.cancel') }}
              </button>
            </div>
          }

          <!-- Add to shopping list picker -->
          <div class="add-to-collection-row">
            <label [for]="ids.shoppingListSelect" class="visually-hidden">
              {{ t('shoppingList.addToList') }}
            </label>
            <select
              [id]="ids.shoppingListSelect"
              class="search-bar-select"
              [value]="selectedShoppingListId()"
              (change)="onShoppingListSelectChange($event, recipe)"
              [attr.aria-label]="t('shoppingList.addToList')"
            >
              <option value="">{{ t('shoppingList.addToList') }}</option>
              @for (shoppingList of shoppingLists(); track shoppingList.listId) {
                <option [value]="shoppingList.listId">{{ shoppingList.name }}</option>
              }
              <option value="__new__">{{ t('shoppingList.newOption') }}</option>
            </select>
            @if (addedToListName()) {
              <span aria-live="polite" class="add-to-list-confirmation">
                {{ t('shoppingList.added', { listName: addedToListName() }) }}
              </span>
            }
          </div>

          <!-- Inline new shopping list form -->
          @if (showingNewShoppingListForm()) {
            <div class="new-collection-inline">
              <label [for]="ids.newShoppingListInput" class="visually-hidden">
                {{ t('shoppingList.newListPlaceholder') }}
              </label>
              <input
                [id]="ids.newShoppingListInput"
                type="text"
                class="collection-name-input"
                [placeholder]="t('shoppingList.newListPlaceholder')"
                [value]="newShoppingListName()"
                (input)="newShoppingListName.set(getInputValue($event))"
                (keydown.enter)="createAndAddToShoppingList(recipe)"
                (keydown.escape)="cancelNewShoppingList()"
              />
              <button
                type="button"
                class="button button--primary"
                [disabled]="newShoppingListName().trim().length < 2 || isCreatingShoppingList()"
                (click)="createAndAddToShoppingList(recipe)"
              >
                {{ t('shoppingList.createList') }}
              </button>
              <button type="button" class="button" (click)="cancelNewShoppingList()">
                {{ t('actions.cancel') }}
              </button>
            </div>
          }

          <!-- Add to meal plan picker -->
          <div class="add-to-collection-row">
            <label [for]="ids.mealPlanSelect" class="visually-hidden">
              {{ t('mealPlanner.addToPlan') }}
            </label>
            <select
              [id]="ids.mealPlanSelect"
              class="search-bar-select"
              [value]="selectedMealPlanDay()"
              (change)="onMealPlanSelectChange($event, recipe)"
              [attr.aria-label]="t('mealPlanner.addToPlan')"
            >
              <option value="">{{ t('mealPlanner.addToPlan') }}</option>
              @for (dateString of mealPlanWeekDates(); track dateString) {
                <option [value]="dateString">
                  {{ t('mealPlanner.day.' + mealPlanDayKey(dateString)) }}
                  {{ mealPlanDayNumber(dateString) }}
                </option>
              }
            </select>
            @if (addedToMealPlanDay()) {
              <span aria-live="polite" class="add-to-list-confirmation">
                {{ t('mealPlanner.addedToDay', { day: t('mealPlanner.day.' + addedToMealPlanDay()) }) }}
              </span>
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

        <div class="ingredients-header">
          <h2>{{ t('recipeDetail.ingredients') }}</h2>
          @if (recipe.servings) {
            <div class="servings-stepper" role="group" [attr.aria-label]="t('recipeDetail.adjustServings')">
              <button
                type="button"
                class="icon-button"
                [attr.aria-label]="t('recipeDetail.fewerServings')"
                (click)="decreaseServings()"
              >
                −
              </button>
              <span class="servings-value">{{ targetServings() }} {{ t('recipeDetail.servings') }}</span>
              <button
                type="button"
                class="icon-button"
                [attr.aria-label]="t('recipeDetail.moreServings')"
                (click)="increaseServings()"
              >
                +
              </button>
            </div>
          }
        </div>
        <ul class="ingredient-list">
          @for (ingredient of recipe.ingredients; track $index) {
            <li>
              <span class="ingredient-amount">
                {{ scaledQuantity(ingredient.quantity) }}
                {{ isKnownUnit(ingredient.unit) ? t('unit.' + ingredient.unit) : ingredient.unit }}
              </span>
              {{ ingredient.name }}
            </li>
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

        <app-recipe-rating-section [recipe]="recipe" />
      } @else {
        <p>{{ t('recipeDetail.notFound') }}</p>
      }
    </section>
  `,
})
export class RecipeDetailPage implements OnInit {
  private readonly recipeService = inject(RecipeService);
  private readonly storageService = inject(StorageService);
  private readonly session = inject(SessionStore);
  private readonly libraryStore = inject(LibraryStore);
  private readonly shoppingListStore = inject(ShoppingListStore);
  private readonly mealPlanStore = inject(MealPlanStore);
  private readonly router = inject(Router);

  /** Bound from the `:recipeId` route parameter (withComponentInputBinding). */
  readonly recipeId = input<string>('');

  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isCloning = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly isDeleting = signal(false);

  protected readonly collections = this.libraryStore.collections;

  protected readonly selectedCollectionId = signal('');
  protected readonly showingNewCollectionForm = signal(false);
  protected readonly newCollectionName = signal('');
  protected readonly isCreatingCollection = signal(false);
  protected readonly addingToCollection = signal(false);

  // Shopping list picker state
  protected readonly shoppingLists = this.shoppingListStore.lists;
  protected readonly selectedShoppingListId = signal('');
  protected readonly showingNewShoppingListForm = signal(false);
  protected readonly newShoppingListName = signal('');
  protected readonly isCreatingShoppingList = signal(false);
  /** Name of the list last added to (shown in the aria-live confirmation). Cleared after 3 s. */
  protected readonly addedToListName = signal<string | null>(null);

  // Meal plan picker state
  protected readonly mealPlanWeekDates = this.mealPlanStore.weekDatesComputed;
  protected readonly selectedMealPlanDay = signal('');
  /** Localized day name of the day last added to (shown in the aria-live confirmation). */
  protected readonly addedToMealPlanDay = signal<string | null>(null);

  /** Stable unique id prefix for label associations. */
  private readonly uid = `recipe-detail-${nextDetailPageId++}`;
  protected readonly ids = {
    collectionSelect: `${this.uid}-collection-select`,
    newCollectionInput: `${this.uid}-new-collection`,
    shoppingListSelect: `${this.uid}-shopping-list-select`,
    newShoppingListInput: `${this.uid}-new-shopping-list`,
    mealPlanSelect: `${this.uid}-meal-plan-select`,
  };

  protected readonly recipeResource = resource({
    params: () => this.recipeId() || undefined,
    loader: ({ params }) => this.recipeService.getRecipe(params),
  });

  protected readonly isOwner = computed(() => {
    const recipe = this.recipeResource.value();
    const user = this.session.user();
    return !!recipe && !!user && recipe.authorId === user.uid;
  });

  /** Target serving count for the scaler; defaults to the recipe's own servings. */
  protected readonly targetServings = linkedSignal(() => this.recipeResource.value()?.servings ?? null);
  private readonly scaleFactor = computed(() => {
    const base = this.recipeResource.value()?.servings ?? null;
    const target = this.targetServings();
    return base && target ? target / base : 1;
  });
  protected readonly isKnownUnit = isRecipeUnit;

  increaseServings(): void {
    this.targetServings.update((value) => (value ?? 1) + 1);
  }

  decreaseServings(): void {
    this.targetServings.update((value) => Math.max(1, (value ?? 1) - 1));
  }

  scaledQuantity(quantity: number | null): string {
    return formatQuantity(scaleQuantity(quantity, this.scaleFactor()));
  }

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

  async ngOnInit(): Promise<void> {
    if (this.session.isAuthenticated()) {
      await Promise.all([
        this.libraryStore.loadSaved(),
        this.libraryStore.loadCollections(),
        this.shoppingListStore.loadLists(),
        this.mealPlanStore.loadWeek(),
      ]);
      // Pre-select the last-used list if available.
      const lastListId = this.shoppingListStore.activeListId();
      if (lastListId) {
        this.selectedShoppingListId.set(lastListId);
      }
    }
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
      // Firestore write first (ordering invariant), then Storage delete.
      await this.recipeService.deleteRecipe(recipe.recipeId);
      // After Firestore doc is gone, clean up the Storage object if no other
      // owned recipe still references it (same-owner reference guard).
      await this.deleteOrphanedCoverIfSafe(recipe);
      await this.router.navigateByUrl('/library');
    } finally {
      this.isDeleting.set(false);
    }
  }

  /**
   * Delete the cover Storage object for a just-deleted recipe, guarded by an
   * in-memory check that no other recipe owned by the current user still
   * references the same path. Failures are swallowed — never block navigation.
   */
  private async deleteOrphanedCoverIfSafe(recipe: Recipe): Promise<void> {
    if (!recipe.coverPhotoPath) {
      return;
    }
    try {
      const userId = this.session.user()?.uid;
      if (!userId) {
        return;
      }
      const ownedRecipes = await this.recipeService.listMyRecipes(userId);
      const isStillReferenced = ownedRecipes.some(
        (owned) => owned.recipeId !== recipe.recipeId && owned.coverPhotoPath === recipe.coverPhotoPath,
      );
      if (isStillReferenced) {
        return; // another owned recipe still uses this object — skip delete
      }
      await this.storageService.deleteCoverPhoto(recipe.coverPhotoPath);
    } catch (error) {
      console.error('[RecipeDetailPage] Failed to delete orphaned cover photo:', error);
      // Never block navigation
    }
  }

  protected getInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onCollectionSelectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__new__') {
      this.showingNewCollectionForm.set(true);
      this.selectedCollectionId.set('');
      // Reset the select to the placeholder
      (event.target as HTMLSelectElement).value = '';
    } else if (value) {
      this.selectedCollectionId.set(value);
      const recipeId = this.recipeId();
      if (recipeId) {
        this.addToExistingCollection(value, recipeId);
      }
      // Reset select after action
      (event.target as HTMLSelectElement).value = '';
      this.selectedCollectionId.set('');
    }
  }

  private async addToExistingCollection(collectionId: string, recipeId: string): Promise<void> {
    this.addingToCollection.set(true);
    try {
      await this.libraryStore.addRecipeToCollection(collectionId, recipeId);
    } finally {
      this.addingToCollection.set(false);
    }
  }

  cancelNewCollection(): void {
    this.showingNewCollectionForm.set(false);
    this.newCollectionName.set('');
  }

  async createAndAddToCollection(recipeId: string): Promise<void> {
    const name = this.newCollectionName().trim();
    if (!name) {
      return;
    }
    this.isCreatingCollection.set(true);
    try {
      const collectionId = await this.libraryStore.createCollection(name);
      await this.libraryStore.addRecipeToCollection(collectionId, recipeId);
      this.cancelNewCollection();
    } finally {
      this.isCreatingCollection.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Shopping list picker
  // ---------------------------------------------------------------------------

  protected onShoppingListSelectChange(event: Event, recipe: Recipe): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '__new__') {
      this.showingNewShoppingListForm.set(true);
      this.selectedShoppingListId.set('');
      (event.target as HTMLSelectElement).value = '';
    } else if (value) {
      this.selectedShoppingListId.set(value);
      void this.addToShoppingList(value, recipe);
      (event.target as HTMLSelectElement).value = '';
      this.selectedShoppingListId.set('');
    }
  }

  private async addToShoppingList(listId: string, recipe: Recipe): Promise<void> {
    await this.shoppingListStore.addRecipeToList(listId, recipe, this.targetServings() ?? recipe.servings ?? 1);
    // Record last-used list and show confirmation.
    this.shoppingListStore.setActiveList(listId);
    const list = this.shoppingListStore.lists().find((l) => l.listId === listId);
    if (list) {
      this.addedToListName.set(list.name);
      // Clear confirmation after 3 seconds.
      setTimeout(() => this.addedToListName.set(null), 3000);
    }
  }

  protected cancelNewShoppingList(): void {
    this.showingNewShoppingListForm.set(false);
    this.newShoppingListName.set('');
  }

  protected async createAndAddToShoppingList(recipe: Recipe): Promise<void> {
    const name = this.newShoppingListName().trim();
    if (name.length < 2) {
      return;
    }
    this.isCreatingShoppingList.set(true);
    try {
      const listId = await this.shoppingListStore.createList(name);
      await this.shoppingListStore.addRecipeToList(listId, recipe, this.targetServings() ?? recipe.servings ?? 1);
      const list = this.shoppingListStore.lists().find((l) => l.listId === listId);
      if (list) {
        this.addedToListName.set(list.name);
        setTimeout(() => this.addedToListName.set(null), 3000);
      }
      this.cancelNewShoppingList();
    } finally {
      this.isCreatingShoppingList.set(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Meal plan picker
  // ---------------------------------------------------------------------------

  protected mealPlanDayKey(dateString: string): string {
    const [year, month, day] = dateString.split('-').map(Number);
    const dayIndex = new Date(year, month - 1, day).getDay();
    return DETAIL_PAGE_DAY_KEYS[dayIndex] ?? 'sunday';
  }

  protected mealPlanDayNumber(dateString: string): string {
    const [, , day] = dateString.split('-');
    return String(Number(day));
  }

  protected onMealPlanSelectChange(event: Event, recipe: Recipe): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value) {
      this.selectedMealPlanDay.set(value);
      void this.addToMealPlan(value, recipe);
      // Reset select to placeholder.
      (event.target as HTMLSelectElement).value = '';
      this.selectedMealPlanDay.set('');
    }
  }

  private async addToMealPlan(dateString: string, recipe: Recipe): Promise<void> {
    const planned: PlannedRecipe = {
      recipeId: recipe.recipeId,
      title: recipe.title,
      coverPhotoPath: recipe.coverPhotoPath,
      type: recipe.type,
      servings: this.targetServings() ?? recipe.servings,
    };
    await this.mealPlanStore.assignRecipe(dateString, planned);
    const dayKey = this.mealPlanDayKey(dateString);
    // We show the day key as the confirmation label (localized on the template side).
    this.addedToMealPlanDay.set(dayKey);
    setTimeout(() => this.addedToMealPlanDay.set(null), 3000);
  }
}
