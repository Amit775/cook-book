import { Component, computed, input, OnDestroy, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { RECIPE_TYPES } from '../../core/models/recipe-type.model';
import { DEFAULT_CRITERIA, RecipeFilterCriteria } from '../../core/models/recipe-filter.model';

let nextSearchBarId = 0;

/**
 * Presentational search-and-filter bar for recipes.
 *
 * Inputs:
 * - `criteria`     – the current filter state (controlled by the parent)
 * - `availableTags` – unique tag list derived from the loaded recipe set
 *
 * Output:
 * - `criteriaChange` – emitted whenever any control changes; parent must
 *   update `criteria` to reflect the new state (controlled pattern)
 *
 * The free-text input is debounced (~200 ms) before emitting so that the
 * filtered list does not re-compute on every keystroke.
 */
@Component({
  selector: 'app-recipe-search-bar',
  imports: [TranslocoDirective],
  template: `
    <div class="search-bar" *transloco="let t">
      <div class="search-bar-field search-bar-field--search">
        <label [for]="ids.search" class="search-bar-label">{{ t('search.label') }}</label>
        <input
          [id]="ids.search"
          type="search"
          class="search-bar-input"
          [placeholder]="t('search.placeholder')"
          [value]="criteria().searchText"
          (input)="onSearchInput($event)"
        />
      </div>

      <div class="search-bar-field">
        <label [for]="ids.type" class="search-bar-label">{{ t('search.filterType') }}</label>
        <select
          [id]="ids.type"
          class="search-bar-select"
          [value]="criteria().type ?? ''"
          (change)="onTypeChange($event)"
        >
          <option value="">{{ t('search.allTypes') }}</option>
          @for (recipeType of recipeTypes; track recipeType) {
            <option [value]="recipeType">{{ t('recipeType.' + recipeType) }}</option>
          }
        </select>
      </div>

      <div class="search-bar-field">
        <label [for]="ids.tag" class="search-bar-label">{{ t('search.filterTag') }}</label>
        <select
          [id]="ids.tag"
          class="search-bar-select"
          [value]="criteria().tag ?? ''"
          (change)="onTagChange($event)"
        >
          <option value="">{{ t('search.allTags') }}</option>
          @for (tag of availableTags(); track tag) {
            <option [value]="tag">{{ tag }}</option>
          }
        </select>
      </div>

      <div class="search-bar-field">
        <label [for]="ids.time" class="search-bar-label">{{ t('search.filterTime') }}</label>
        <select
          [id]="ids.time"
          class="search-bar-select"
          [value]="timeBucketValue()"
          (change)="onTimeChange($event)"
        >
          <option value="">{{ t('search.anyTime') }}</option>
          <option value="30">{{ t('search.timeUnder30') }}</option>
          <option value="60">{{ t('search.timeUnder60') }}</option>
          <option value="120">{{ t('search.timeUnder120') }}</option>
        </select>
      </div>

      <div class="search-bar-field">
        <label [for]="ids.sort" class="search-bar-label">{{ t('search.sort') }}</label>
        <select
          [id]="ids.sort"
          class="search-bar-select"
          [value]="criteria().sort"
          (change)="onSortChange($event)"
        >
          <option value="newest">{{ t('search.sortNewest') }}</option>
          <option value="quickest">{{ t('search.sortQuickest') }}</option>
        </select>
      </div>
    </div>
  `,
  styleUrl: './recipe-search-bar.scss',
})
export class RecipeSearchBar implements OnDestroy {
  /** The current filter + sort state. The parent controls this (read-only here). */
  readonly criteria = input<RecipeFilterCriteria>(DEFAULT_CRITERIA);

  /** Unique sorted tag list derived from the loaded recipe set by the parent. */
  readonly availableTags = input<string[]>([]);

  /** Emitted whenever any control changes. Parent must update `criteria`. */
  readonly criteriaChange = output<RecipeFilterCriteria>();

  protected readonly recipeTypes = RECIPE_TYPES;

  /** Stable unique id prefix so labels stay associated even with multiple bars on the page. */
  private readonly uid = `recipe-search-bar-${nextSearchBarId++}`;
  protected readonly ids = {
    search: `${this.uid}-search`,
    type: `${this.uid}-type`,
    tag: `${this.uid}-tag`,
    time: `${this.uid}-time`,
    sort: `${this.uid}-sort`,
  };

  /** String representation of the active time bucket for the select binding. */
  protected readonly timeBucketValue = computed(() =>
    this.criteria().maxTotalTimeMinutes !== null ? String(this.criteria().maxTotalTimeMinutes) : '',
  );

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected onSearchInput(event: Event): void {
    const searchText = (event.target as HTMLInputElement).value;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.criteriaChange.emit({ ...this.criteria(), searchText });
    }, 200);
  }

  protected onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.criteriaChange.emit({
      ...this.criteria(),
      type: value ? (value as RecipeFilterCriteria['type']) : null,
    });
  }

  protected onTagChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.criteriaChange.emit({ ...this.criteria(), tag: value || null });
  }

  protected onTimeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.criteriaChange.emit({
      ...this.criteria(),
      maxTotalTimeMinutes: value ? Number(value) : null,
    });
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as RecipeFilterCriteria['sort'];
    this.criteriaChange.emit({ ...this.criteria(), sort: value });
  }

  ngOnDestroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
  }
}
