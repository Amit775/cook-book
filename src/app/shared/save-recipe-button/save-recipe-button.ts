import { Component, computed, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { LibraryStore } from '../../core/state/library.store';
import { SessionStore } from '../../core/state/session.store';

/**
 * Presentational save/unsave toggle button. Reads saved state from `LibraryStore`
 * and dispatches the toggle through it. Hidden when the user is not signed in.
 */
@Component({
  selector: 'app-save-recipe-button',
  imports: [TranslocoDirective],
  template: `
    @if (isSignedIn()) {
      <button
        type="button"
        class="button"
        [class.button--primary]="isSaved()"
        [attr.aria-pressed]="isSaved()"
        (click)="toggle()"
        *transloco="let t"
      >
        {{ isSaved() ? t('saved.saved') : t('saved.save') }}
      </button>
    }
  `,
})
export class SaveRecipeButton {
  private readonly libraryStore = inject(LibraryStore);
  private readonly session = inject(SessionStore);

  readonly recipeId = input.required<string>();

  protected readonly isSignedIn = this.session.isAuthenticated;

  protected readonly isSaved = computed(() => this.libraryStore.savedRecipeIdSet().has(this.recipeId()));

  toggle(): void {
    this.libraryStore.toggleSave(this.recipeId());
  }
}
