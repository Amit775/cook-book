import { Component, computed, inject, OnInit, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { form, FormField, minLength, required } from '@angular/forms/signals';

import { PlannedRecipe } from '../../core/models/meal-plan.model';
import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { MealPlanStore, TODAY_TOKEN } from '../../core/state/meal-plan.store';
import { SessionStore } from '../../core/state/session.store';
import { ShoppingListStore } from '../../core/state/shopping-list.store';

/** Day-of-week index → Transloco key suffix. */
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

let nextPageId = 0;

@Component({
  selector: 'app-meal-planner-page',
  imports: [TranslocoDirective, RouterLink, FormField],
  template: `
    <section class="page" *transloco="let t">
      <h1>{{ t('mealPlanner.heading') }}</h1>

      @if (!isSignedIn()) {
        <p>{{ t('common.signInRequired') }}</p>
        <a routerLink="/login" class="button button--primary">{{ t('actions.signIn') }}</a>
      } @else if (isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else {
        <!-- Week navigation -->
        <nav class="meal-planner-nav" [attr.aria-label]="t('mealPlanner.heading')">
          <button type="button" class="button" (click)="previousWeek()">
            {{ t('mealPlanner.previousWeek') }}
          </button>
          <button type="button" class="button" (click)="thisWeek()">
            {{ t('mealPlanner.thisWeek') }}
          </button>
          <button type="button" class="button" (click)="nextWeek()">
            {{ t('mealPlanner.nextWeek') }}
          </button>
          <span class="meal-planner-week-label">
            {{ t('mealPlanner.weekOf', { range: weekRangeLabel() }) }}
          </span>
        </nav>

        <!-- Recipe count live region -->
        <div aria-live="polite" aria-atomic="true" class="visually-hidden">
          {{
            assignedRecipeCount() === 1
              ? t('mealPlanner.recipeCountOne')
              : t('mealPlanner.recipeCountOther', { count: assignedRecipeCount() })
          }}
        </div>

        <!-- Generated list announcement -->
        @if (liveAnnouncement()) {
          <div aria-live="polite" aria-atomic="true" class="visually-hidden">
            {{ t('mealPlanner.generatedList', { listName: liveAnnouncement() }) }}
          </div>
        }

        @if (assignedRecipeCount() === 0) {
          <p class="empty-state">{{ t('mealPlanner.emptyWeek') }}</p>
        }

        <!-- 7-day grid -->
        <ul class="meal-planner-grid">
          @for (dateString of weekDates(); track dateString) {
            <li
              class="meal-planner-day"
              [class.is-today]="dateString === todayString()"
            >
              <section [attr.aria-labelledby]="dayHeadingId(dateString)">
                <h2 class="meal-planner-day-heading" [id]="dayHeadingId(dateString)">
                  {{ t('mealPlanner.day.' + dayKey(dateString)) }}
                  <span class="meal-planner-day-number">{{ dayNumber(dateString) }}</span>
                  @if (dateString === todayString()) {
                    <span class="meal-planner-today-badge">{{ t('mealPlanner.today') }}</span>
                  }
                </h2>

                <!-- Recipes for this day -->
                @if (dayRecipes(dateString).length > 0) {
                  <ul class="meal-planner-day-recipes">
                    @for (recipe of dayRecipes(dateString); track recipe.recipeId) {
                      <li class="meal-planner-recipe-card">
                        <a
                          [routerLink]="['/recipes', recipe.recipeId]"
                          class="meal-planner-recipe-title"
                        >
                          {{ recipe.title }}
                        </a>
                        <span class="meal-planner-recipe-type">{{ t('recipeType.' + recipe.type) }}</span>
                        <button
                          type="button"
                          class="button button--icon meal-planner-remove-btn"
                          [attr.aria-label]="t('mealPlanner.removeRecipe', { title: recipe.title, day: t('mealPlanner.day.' + dayKey(dateString)) })"
                          (click)="removeRecipe(dateString, recipe.recipeId)"
                        >
                          ×
                        </button>
                      </li>
                    }
                  </ul>
                } @else {
                  <p class="meal-planner-empty-day">{{ t('mealPlanner.emptyDay') }}</p>
                }

                <!-- Per-day "Add recipe" button -->
                <button
                  type="button"
                  class="button meal-planner-add-btn"
                  [id]="addButtonId(dateString)"
                  (click)="openPicker(dateString)"
                >
                  {{ t('mealPlanner.addRecipe') }}
                </button>
              </section>
            </li>
          }
        </ul>

        <!-- In-planner recipe picker overlay -->
        @if (showingPickerForDate()) {
          <div class="meal-planner-picker-overlay">
            <div
              class="meal-planner-picker-panel"
              role="dialog"
              [attr.aria-label]="t('mealPlanner.addRecipe')"
              [attr.aria-modal]="true"
            >
              <h2 class="meal-planner-picker-heading">{{ t('mealPlanner.addRecipe') }}</h2>
              @if (myRecipesResource.isLoading()) {
                <p>{{ t('common.loading') }}</p>
              } @else if (myRecipesResource.value().length === 0) {
                <p>{{ t('mealPlanner.emptyWeek') }}</p>
              } @else {
                <ul class="meal-planner-picker-list">
                  @for (recipe of myRecipesResource.value(); track recipe.recipeId) {
                    <li>
                      <button
                        type="button"
                        class="meal-planner-picker-item"
                        (click)="pickRecipe(recipe)"
                      >
                        <span class="meal-planner-picker-item-title">{{ recipe.title }}</span>
                        <span class="meal-planner-picker-item-type">{{ t('recipeType.' + recipe.type) }}</span>
                      </button>
                    </li>
                  }
                </ul>
              }
              <button type="button" class="button" (click)="closePicker()">
                {{ t('actions.cancel') }}
              </button>
            </div>
          </div>
        }

        <!-- Generate shopping list section -->
        <section class="meal-planner-generate-section" [attr.aria-label]="t('mealPlanner.generateList')">
          <h2>{{ t('mealPlanner.generateList') }}</h2>

          @if (shoppingLists().length > 0) {
            <!-- Select existing or new -->
            <div class="meal-planner-generate-row">
              <label [for]="ids.generateListSelect" class="visually-hidden">
                {{ t('shoppingList.selectList') }}
              </label>
              <select
                [id]="ids.generateListSelect"
                class="search-bar-select"
                [value]="selectedGenerateListId()"
                (change)="onGenerateListSelectChange($event)"
                [attr.aria-label]="t('shoppingList.selectList')"
              >
                <option value="__new__">{{ t('shoppingList.newOption') }}</option>
                @for (shoppingList of shoppingLists(); track shoppingList.listId) {
                  <option [value]="shoppingList.listId">{{ shoppingList.name }}</option>
                }
              </select>
            </div>
          }

          <!-- New-list name form (Signal Forms) — shown when "__new__" selected or no lists exist -->
          @if (selectedGenerateListId() === '__new__' || shoppingLists().length === 0) {
            <div class="new-list-inline">
              <label [for]="ids.generateListNameInput" class="visually-hidden">
                {{ t('shoppingList.newListPlaceholder') }}
              </label>
              <input
                [id]="ids.generateListNameInput"
                type="text"
                class="collection-name-input"
                [placeholder]="t('shoppingList.newListPlaceholder')"
                [formField]="generateListForm.name"
                (keydown.enter)="onGenerateSubmit()"
              />
            </div>
          }

          <button
            type="button"
            class="button button--primary"
            [disabled]="isGenerating() || assignedRecipeCount() === 0 || generateButtonDisabled()"
            (click)="onGenerateSubmit()"
          >
            {{ isGenerating() ? t('common.saving') : t('mealPlanner.generateList') }}
          </button>
        </section>
      }
    </section>
  `,
  styles: `
    .meal-planner-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-block-end: 1rem;
    }

    .meal-planner-week-label {
      font-weight: 600;
      margin-inline-start: 0.5rem;
    }

    .meal-planner-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 0.75rem;
      list-style: none;
      padding: 0;
      margin-block: 1rem;
    }

    @media (max-width: 700px) {
      .meal-planner-grid {
        grid-template-columns: 1fr;
      }
    }

    .meal-planner-day {
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 0.5rem;
      padding: 0.75rem;
    }

    .meal-planner-day.is-today {
      border-color: var(--color-primary, #4f46e5);
      border-width: 2px;
    }

    .meal-planner-day-heading {
      font-size: 0.9rem;
      font-weight: 600;
      margin-block-end: 0.5rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem;
    }

    .meal-planner-day-number {
      font-weight: 400;
      color: var(--color-text-muted, #64748b);
    }

    .meal-planner-today-badge {
      font-size: 0.7rem;
      background: var(--color-primary, #4f46e5);
      color: white;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
    }

    .meal-planner-day-recipes {
      list-style: none;
      padding: 0;
      margin-block-end: 0.5rem;
    }

    .meal-planner-recipe-card {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding-block: 0.25rem;
      border-block-end: 1px solid var(--color-border, #e2e8f0);
    }

    .meal-planner-recipe-title {
      flex: 1;
      font-size: 0.85rem;
      font-weight: 500;
      text-decoration: none;
      color: inherit;
    }

    .meal-planner-recipe-title:hover {
      text-decoration: underline;
    }

    .meal-planner-recipe-type {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }

    .meal-planner-remove-btn {
      padding: 0.1rem 0.4rem;
      font-size: 1rem;
      line-height: 1;
      min-inline-size: 1.5rem;
    }

    .meal-planner-empty-day {
      font-size: 0.8rem;
      color: var(--color-text-muted, #64748b);
      margin-block-end: 0.5rem;
    }

    .meal-planner-add-btn {
      width: 100%;
      font-size: 0.8rem;
      padding-block: 0.25rem;
    }

    .meal-planner-generate-section {
      margin-block-start: 2rem;
      padding: 1rem;
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 0.5rem;
    }

    .meal-planner-generate-row {
      margin-block-end: 0.75rem;
    }

    .meal-planner-picker-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .meal-planner-picker-panel {
      background: var(--color-surface, white);
      border-radius: 0.5rem;
      padding: 1.5rem;
      max-block-size: 80vh;
      overflow-y: auto;
      min-inline-size: 20rem;
      max-inline-size: 90vw;
    }

    .meal-planner-picker-heading {
      margin-block-end: 1rem;
    }

    .meal-planner-picker-list {
      list-style: none;
      padding: 0;
      margin-block-end: 1rem;
    }

    .meal-planner-picker-item {
      display: flex;
      flex-direction: column;
      width: 100%;
      text-align: start;
      padding: 0.5rem;
      border-radius: 0.25rem;
      cursor: pointer;
      background: none;
      border: none;
    }

    .meal-planner-picker-item:hover,
    .meal-planner-picker-item:focus {
      background: var(--color-surface-hover, #f1f5f9);
    }

    .meal-planner-picker-item-title {
      font-weight: 500;
    }

    .meal-planner-picker-item-type {
      font-size: 0.75rem;
      color: var(--color-text-muted, #64748b);
    }
  `,
})
export class MealPlannerPage implements OnInit {
  private readonly mealPlanStore = inject(MealPlanStore);
  private readonly session = inject(SessionStore);
  private readonly shoppingListStore = inject(ShoppingListStore);
  private readonly recipeService = inject(RecipeService);
  private readonly getToday = inject(TODAY_TOKEN);

  protected readonly isSignedIn = this.session.isAuthenticated;
  protected readonly isLoading = this.mealPlanStore.isLoading;
  protected readonly weekDates = this.mealPlanStore.weekDatesComputed;
  protected readonly assignedRecipeCount = this.mealPlanStore.assignedRecipeCount;
  protected readonly shoppingLists = this.shoppingListStore.lists;
  protected readonly liveAnnouncement = this.mealPlanStore.liveAnnouncement;

  protected readonly isGenerating = signal(false);
  /** The date string we're currently opening the recipe picker for, or null. */
  protected readonly showingPickerForDate = signal<string | null>(null);
  /** Which shopping list is selected for generate (defaults to "__new__"). */
  protected readonly selectedGenerateListId = signal('__new__');

  /** "Today" as a YYYY-MM-DD string for highlighting. */
  protected readonly todayString = computed(() => {
    const today = this.getToday();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  /** The user's own recipes, loaded once for the in-planner picker. */
  protected readonly myRecipesResource = resource({
    params: () => this.session.user()?.uid,
    defaultValue: [] as Recipe[],
    loader: ({ params }) => this.recipeService.listMyRecipes(params),
  });

  /** Week range label "DD/MM/YYYY – DD/MM" for the week-of display. */
  protected readonly weekRangeLabel = computed(() => {
    const dates = this.weekDates();
    if (dates.length === 0) {
      return '';
    }
    const [firstYear, firstMonth, firstDay] = dates[0].split('-');
    const lastDate = dates[dates.length - 1];
    const [, lastMonth, lastDay] = lastDate.split('-');
    return `${firstDay}/${firstMonth}/${firstYear} – ${lastDay}/${lastMonth}`;
  });

  private readonly uid = `meal-planner-${nextPageId++}`;
  protected readonly ids = {
    generateListSelect: `${this.uid}-generate-list-select`,
    generateListNameInput: `${this.uid}-generate-list-name`,
  };

  // Signal Forms for new-list-name field.
  private readonly generateListModel = signal({ name: '' });
  protected readonly generateListForm = form(this.generateListModel, (path) => {
    required(path.name);
    minLength(path.name, 2);
  });

  protected readonly generateButtonDisabled = computed(() => {
    if (this.selectedGenerateListId() === '__new__' || this.shoppingLists().length === 0) {
      return this.generateListForm.name().invalid();
    }
    return false;
  });

  async ngOnInit(): Promise<void> {
    if (this.session.isAuthenticated()) {
      await Promise.all([
        this.mealPlanStore.loadWeek(),
        this.shoppingListStore.loadLists(),
      ]);
      // Default new-list name to the week range.
      this.generateListModel.set({ name: this.defaultNewListName() });
    }
  }

  protected dayKey(dateString: string): string {
    const [year, month, day] = dateString.split('-').map(Number);
    const dayIndex = new Date(year, month - 1, day).getDay();
    return DAY_KEYS[dayIndex] ?? 'sunday';
  }

  protected dayNumber(dateString: string): string {
    const [, , day] = dateString.split('-');
    return String(Number(day));
  }

  protected dayHeadingId(dateString: string): string {
    return `${this.uid}-day-${dateString}`;
  }

  protected addButtonId(dateString: string): string {
    return `${this.uid}-add-${dateString}`;
  }

  protected dayRecipes(dateString: string): PlannedRecipe[] {
    return this.mealPlanStore.daysWithRecipes()[dateString] ?? [];
  }

  protected openPicker(dateString: string): void {
    this.showingPickerForDate.set(dateString);
  }

  protected closePicker(): void {
    this.showingPickerForDate.set(null);
  }

  protected async pickRecipe(recipe: Recipe): Promise<void> {
    const dateString = this.showingPickerForDate();
    if (!dateString) {
      return;
    }
    const planned: PlannedRecipe = {
      recipeId: recipe.recipeId,
      title: recipe.title,
      coverPhotoPath: recipe.coverPhotoPath,
      type: recipe.type,
      servings: recipe.servings,
    };
    await this.mealPlanStore.assignRecipe(dateString, planned);
    this.closePicker();
  }

  protected async removeRecipe(dateString: string, recipeId: string): Promise<void> {
    await this.mealPlanStore.removeRecipe(dateString, recipeId);
    // Move focus to the day's "Add recipe" button after removal.
    const addButton = document.getElementById(this.addButtonId(dateString));
    if (addButton) {
      addButton.focus();
    }
  }

  protected async previousWeek(): Promise<void> {
    await this.mealPlanStore.goToPreviousWeek();
    this.generateListModel.set({ name: this.defaultNewListName() });
  }

  protected async nextWeek(): Promise<void> {
    await this.mealPlanStore.goToNextWeek();
    this.generateListModel.set({ name: this.defaultNewListName() });
  }

  protected async thisWeek(): Promise<void> {
    await this.mealPlanStore.goToThisWeek();
    this.generateListModel.set({ name: this.defaultNewListName() });
  }

  protected onGenerateListSelectChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedGenerateListId.set(value);
  }

  protected async onGenerateSubmit(): Promise<void> {
    const listId = this.selectedGenerateListId();
    const isNewList = listId === '__new__' || this.shoppingLists().length === 0;

    if (isNewList) {
      const name = this.generateListModel().name.trim();
      if (name.length < 2) {
        return;
      }
      this.isGenerating.set(true);
      try {
        await this.mealPlanStore.generateShoppingList(null, name);
      } finally {
        this.isGenerating.set(false);
      }
    } else {
      this.isGenerating.set(true);
      try {
        await this.mealPlanStore.generateShoppingList(listId, '');
      } finally {
        this.isGenerating.set(false);
      }
    }
  }

  private defaultNewListName(): string {
    const dates = this.weekDates();
    if (dates.length === 0) {
      return '';
    }
    const [firstYear, firstMonth, firstDay] = dates[0].split('-');
    const lastDate = dates[dates.length - 1];
    const [, lastMonth, lastDay] = lastDate.split('-');
    return `${firstDay}/${firstMonth}/${firstYear} – ${lastDay}/${lastMonth}`;
  }
}
