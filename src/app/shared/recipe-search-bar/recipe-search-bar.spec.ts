import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RECIPE_TYPES } from '../../core/models/recipe-type.model';
import { DEFAULT_CRITERIA, RecipeFilterCriteria } from '../../core/models/recipe-filter.model';
import { RecipeSearchBar } from './recipe-search-bar';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'search.label': 'Search recipes',
      'search.placeholder': 'Search by title, ingredient or tag',
      'search.filterType': 'Type',
      'search.filterTag': 'Tag',
      'search.filterTime': 'Time',
      'search.allTypes': 'All types',
      'search.allTags': 'All tags',
      'search.anyTime': 'Any time',
      'search.timeUnder30': 'Under 30 min',
      'search.timeUnder60': 'Under 1 hour',
      'search.timeUnder120': 'Under 2 hours',
      'search.sort': 'Sort',
      'search.sortNewest': 'Newest',
      'search.sortQuickest': 'Quickest',
      'search.noResults': 'No results for these filters.',
      'recipeType.meal': 'Meal',
      'recipeType.dessert': 'Dessert',
      'recipeType.cocktail': 'Cocktail',
      'recipeType.other': 'Other',
    });
  }
}

describe('RecipeSearchBar', () => {
  let fixture: ComponentFixture<RecipeSearchBar>;
  let componentRef: ComponentRef<RecipeSearchBar>;
  let emitted: RecipeFilterCriteria[];

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [RecipeSearchBar],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecipeSearchBar);
    componentRef = fixture.componentRef;
    emitted = [];
    fixture.componentInstance.criteriaChange.subscribe((c: RecipeFilterCriteria) => {
      emitted.push(c);
      componentRef.setInput('criteria', c);
    });
    componentRef.setInput('criteria', DEFAULT_CRITERIA);
    componentRef.setInput('availableTags', ['vegan', 'quick', 'gluten free']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function searchInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input[type="search"]');
  }

  function selects(): HTMLSelectElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('select'));
  }

  function typeInSearch(text: string): void {
    const input = searchInput();
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Debounced text search
  // -----------------------------------------------------------------------

  it('does NOT emit immediately when typing into the search input', () => {
    typeInSearch('pasta');
    expect(emitted).toHaveLength(0);
  });

  it('emits criteriaChange with the typed text after ~200 ms debounce', async () => {
    typeInSearch('pasta');
    await vi.advanceTimersByTimeAsync(250);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].searchText).toBe('pasta');
  });

  it('debounces multiple keystrokes — only emits once after the last', async () => {
    typeInSearch('p');
    await vi.advanceTimersByTimeAsync(50);
    typeInSearch('pa');
    await vi.advanceTimersByTimeAsync(50);
    typeInSearch('pas');
    await vi.advanceTimersByTimeAsync(250);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].searchText).toBe('pas');
  });

  // -----------------------------------------------------------------------
  // Select changes emit immediately
  // -----------------------------------------------------------------------

  it('emits criteriaChange with the chosen type when the type select changes', () => {
    const typeSelect = selects().find((s) => s.id.includes('-type'))!;
    typeSelect.value = 'meal';
    typeSelect.dispatchEvent(new Event('change'));
    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe('meal');
  });

  it('sets type to null when the "all types" option is chosen', () => {
    const typeSelect = selects().find((s) => s.id.includes('-type'))!;
    typeSelect.value = '';
    typeSelect.dispatchEvent(new Event('change'));
    expect(emitted[0].type).toBeNull();
  });

  it('emits criteriaChange with the chosen tag when the tag select changes', () => {
    const tagSelect = selects().find((s) => s.id.includes('-tag'))!;
    tagSelect.value = 'vegan';
    tagSelect.dispatchEvent(new Event('change'));
    expect(emitted[0].tag).toBe('vegan');
  });

  it('emits criteriaChange with the chosen time bucket when the time select changes', () => {
    const timeSelect = selects().find((s) => s.id.includes('-time'))!;
    timeSelect.value = '30';
    timeSelect.dispatchEvent(new Event('change'));
    expect(emitted[0].maxTotalTimeMinutes).toBe(30);
  });

  it('sets maxTotalTimeMinutes to null when "any time" is chosen', () => {
    const timeSelect = selects().find((s) => s.id.includes('-time'))!;
    timeSelect.value = '';
    timeSelect.dispatchEvent(new Event('change'));
    expect(emitted[0].maxTotalTimeMinutes).toBeNull();
  });

  it('emits criteriaChange with the chosen sort when the sort select changes', () => {
    const sortSelect = selects().find((s) => s.id.includes('-sort'))!;
    sortSelect.value = 'quickest';
    sortSelect.dispatchEvent(new Event('change'));
    expect(emitted[0].sort).toBe('quickest');
  });

  // -----------------------------------------------------------------------
  // Type options rendered from RECIPE_TYPES
  // -----------------------------------------------------------------------

  it('renders one <option> per RECIPE_TYPE plus the "all types" option', () => {
    const typeSelect = selects().find((s) => s.id.includes('-type'))!;
    // +1 for the "all types" blank option
    expect(typeSelect.options.length).toBe(RECIPE_TYPES.length + 1);
  });

  // -----------------------------------------------------------------------
  // Tag options rendered from the tags input
  // -----------------------------------------------------------------------

  it('renders the tags provided via the availableTags input', () => {
    const tagSelect = selects().find((s) => s.id.includes('-tag'))!;
    const optionValues = Array.from(tagSelect.options)
      .map((o) => o.value)
      .filter((v) => v !== '');
    expect(optionValues).toEqual(['vegan', 'quick', 'gluten free']);
  });

  // -----------------------------------------------------------------------
  // Accessibility: every control has a programmatic label
  // -----------------------------------------------------------------------

  it('every input and select has an accessible label (for/id association)', () => {
    const allControls: HTMLElement[] = [
      searchInput(),
      ...selects(),
    ];
    for (const control of allControls) {
      const id = control.id;
      expect(id, `control ${control.tagName} missing id`).toBeTruthy();
      const label = fixture.nativeElement.querySelector(`label[for="${id}"]`);
      expect(label, `no <label for="${id}"> found`).toBeTruthy();
    }
  });
});
