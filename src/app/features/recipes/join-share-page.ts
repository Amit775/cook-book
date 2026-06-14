import { Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { RecipeService } from '../../core/services/recipe.service';
import { SessionStore } from '../../core/state/session.store';

/**
 * Lands a "share link" visitor: when signed in, adds them to the recipe's
 * `sharedWith` and forwards to the recipe; when signed out, sends them to login
 * and returns here afterwards.
 */
@Component({
  selector: 'app-join-share-page',
  imports: [TranslocoDirective, RouterLink],
  template: `
    <section class="page page--narrow" *transloco="let t">
      <h1>{{ t('share.title') }}</h1>
      @if (errorKey(); as key) {
        <p class="error" role="alert">{{ t(key) }}</p>
        <a routerLink="/" class="button">{{ t('nav.browse') }}</a>
      } @else {
        <p aria-live="polite">{{ t('share.joining') }}</p>
      }
    </section>
  `,
})
export class JoinSharePage {
  private readonly recipeService = inject(RecipeService);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  /** Bound from the `:shareId` route parameter. */
  readonly shareId = input<string>('');
  protected readonly errorKey = signal<string | null>(null);
  private handled = false;

  constructor() {
    effect(() => {
      const status = this.session.status();
      const shareId = this.shareId();
      if (status === 'initializing' || !shareId || this.handled) {
        return;
      }
      this.handled = true;
      if (status === 'anonymous') {
        // Sign in, then come back to this same URL to finish joining.
        void this.router.navigate(['/login'], { queryParams: { redirect: `/share/${shareId}` } });
        return;
      }
      void this.join(shareId);
    });
  }

  private async join(shareId: string): Promise<void> {
    const user = this.session.user();
    if (!user) {
      return;
    }
    try {
      const recipeId = await this.recipeService.findRecipeIdByShareId(shareId);
      if (!recipeId) {
        this.errorKey.set('share.linkInvalid');
        return;
      }
      await this.recipeService.joinSharedRecipe(recipeId, user.uid);
      await this.router.navigateByUrl(`/recipes/${recipeId}`);
    } catch {
      this.errorKey.set('share.joinFailed');
    }
  }
}
