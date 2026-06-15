import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { CatalogIngredient } from '../../core/models/catalog-ingredient.model';
import { IngredientService } from '../../core/services/ingredient.service';

let nextComboboxId = 0;

/** The value emitted when the user picks an existing entry or types a new one. */
export interface IngredientSelection {
  name: string;
  /** Catalog id when an existing entry was chosen; `null` for a free-typed name. */
  ingredientId: string | null;
}

/**
 * Autocomplete combobox for ingredient names. Suggests existing catalog entries
 * as the user types and offers an "add new" option (Jira-tag style) so unknown
 * ingredients can be added inline. Implements the ARIA list-autocomplete pattern.
 */
@Component({
  selector: 'app-ingredient-combobox',
  imports: [TranslocoDirective],
  template: `
    <div class="combobox" *transloco="let t">
      <input
        type="text"
        class="combobox-input"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="isListboxVisible()"
        [attr.aria-controls]="listboxId"
        [attr.aria-activedescendant]="activeOptionId()"
        [attr.aria-label]="ariaLabel()"
        [placeholder]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (focus)="onFocus()"
        (blur)="onBlur()"
      />
      @if (isListboxVisible()) {
        <ul class="combobox-listbox" role="listbox" [id]="listboxId" [attr.aria-label]="t('recipeEditor.ingredientSuggestions')">
          @for (suggestion of suggestions.value(); track suggestion.ingredientId; let i = $index) {
            <li
              class="combobox-option"
              role="option"
              [id]="optionId(i)"
              [class.is-active]="activeIndex() === i"
              [attr.aria-selected]="activeIndex() === i"
              (mousedown)="$event.preventDefault()"
              (click)="selectSuggestion(suggestion)"
            >
              {{ suggestion.name }}
            </li>
          }
          @if (showAddOption()) {
            <li
              class="combobox-option combobox-option--add"
              role="option"
              [id]="optionId(suggestions.value().length)"
              [class.is-active]="activeIndex() === suggestions.value().length"
              [attr.aria-selected]="activeIndex() === suggestions.value().length"
              (mousedown)="$event.preventDefault()"
              (click)="selectNew()"
            >
              {{ t('recipeEditor.addNewIngredient', { name: trimmedValue() }) }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class IngredientCombobox {
  private readonly ingredientService = inject(IngredientService);

  /** Current ingredient name (controlled by the parent form). */
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly ariaLabel = input<string>('');

  /** Emitted whenever the name changes — by typing (id `null`) or by selecting. */
  readonly selectionChange = output<IngredientSelection>();

  private readonly uid = `ingredient-combobox-${nextComboboxId++}`;
  protected readonly listboxId = `${this.uid}-listbox`;

  private readonly isOpen = signal(false);
  protected readonly activeIndex = signal(-1);
  private readonly searchTerm = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly suggestions = resource({
    params: () => this.searchTerm() || undefined,
    defaultValue: [] as CatalogIngredient[],
    loader: ({ params }) => this.ingredientService.search(params),
  });

  protected readonly trimmedValue = computed(() => this.value().trim());

  /** Show "add new" when the typed name doesn't already match a loaded suggestion. */
  protected readonly showAddOption = computed(() => {
    const term = this.trimmedValue().toLowerCase();
    if (!term || this.suggestions.isLoading()) {
      return false;
    }
    return !this.suggestions.value().some((suggestion) => suggestion.nameLower === term);
  });

  protected readonly isListboxVisible = computed(
    () => this.isOpen() && (this.suggestions.value().length > 0 || this.showAddOption()),
  );

  protected readonly activeOptionId = computed(() =>
    this.activeIndex() >= 0 ? this.optionId(this.activeIndex()) : null,
  );

  protected optionId(index: number): string {
    return `${this.uid}-option-${index}`;
  }

  protected onInput(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.selectionChange.emit({ name, ingredientId: null });
    this.scheduleSearch(name.trim());
    this.isOpen.set(true);
    this.activeIndex.set(-1);
  }

  protected onFocus(): void {
    if (this.trimmedValue()) {
      this.scheduleSearch(this.trimmedValue());
      this.isOpen.set(true);
    }
  }

  protected onBlur(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const optionCount = this.suggestions.value().length + (this.showAddOption() ? 1 : 0);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.isOpen.set(true);
        if (optionCount > 0) {
          this.activeIndex.update((index) => Math.min(index + 1, optionCount - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.update((index) => Math.max(index - 1, 0));
        break;
      case 'Enter':
        if (this.isListboxVisible() && this.activeIndex() >= 0) {
          event.preventDefault();
          this.selectAt(this.activeIndex());
        }
        break;
      case 'Escape':
        this.isOpen.set(false);
        this.activeIndex.set(-1);
        break;
    }
  }

  protected selectSuggestion(suggestion: CatalogIngredient): void {
    this.selectionChange.emit({ name: suggestion.name, ingredientId: suggestion.ingredientId });
    this.close();
  }

  protected selectNew(): void {
    this.selectionChange.emit({ name: this.trimmedValue(), ingredientId: null });
    this.close();
  }

  private selectAt(index: number): void {
    const suggestions = this.suggestions.value();
    if (index < suggestions.length) {
      this.selectSuggestion(suggestions[index]);
    } else {
      this.selectNew();
    }
  }

  private scheduleSearch(term: string): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.searchTerm.set(term), 200);
  }

  private close(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }
}
