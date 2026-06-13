import { Component, inject, signal } from '@angular/core';
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
        <button type="button" class="button button--primary" (click)="signInWithGoogle()">
          {{ t('login.google') }}
        </button>
        <!-- Phone sign-in flow (reCAPTCHA + SMS code entry) lands in Phase 1. -->
        <button type="button" class="button" disabled>{{ t('login.phone') }}</button>
      </div>

      @if (errorMessage()) {
        <p class="error" role="alert">{{ errorMessage() }}</p>
      }
    </section>
  `,
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal<string | null>(null);

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    try {
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl('/');
    } catch {
      this.errorMessage.set('Sign-in failed. Please try again.');
    }
  }
}
