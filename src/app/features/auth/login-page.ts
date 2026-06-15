import { Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page page--narrow" *transloco="let t">
      <h1>{{ t('login.heading') }}</h1>

      <div class="auth-buttons">
        <button
          type="button"
          class="button button--primary button--block"
          [disabled]="isSubmitting()"
          (click)="signInWithGoogle()"
        >
          {{ t('login.google') }}
        </button>
      </div>

      @if (errorMessage(); as errorKey) {
        <p class="error" role="alert">{{ t(errorKey) }}</p>
      }
    </section>
  `,
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /** Internal path to return to after sign-in (e.g. a /share/:id link), bound from `?redirect=`. */
  readonly redirect = input<string>('');

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl(this.redirectTarget());
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unknown';
      console.error('[sign-in] Google sign-in failed:', code, error);
      this.errorMessage.set('login.errorGoogleFailed');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /** Only allow returning to internal paths (defends against open-redirects). */
  private redirectTarget(): string {
    const target = this.redirect();
    return target.startsWith('/') ? target : '/';
  }
}
