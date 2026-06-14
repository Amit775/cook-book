import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

import { AuthService } from '../../core/services/auth.service';

type PhoneStep = 'phone' | 'code';

@Component({
  selector: 'app-login-page',
  imports: [TranslocoDirective],
  template: `
    <section class="page page--narrow" *transloco="let t">
      <h1>{{ t('login.heading') }}</h1>

      <button
        type="button"
        class="button button--primary button--block"
        [disabled]="isSubmitting()"
        (click)="signInWithGoogle()"
      >
        {{ t('login.google') }}
      </button>

      <div class="divider"><span>{{ t('login.or') }}</span></div>

      @if (step() === 'phone') {
        <form class="phone-form" (submit)="sendCode($event)">
          <label class="field">
            <span class="field-label">{{ t('login.phoneNumberLabel') }}</span>
            <input
              #phoneInput
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              dir="ltr"
              [value]="phoneNumber()"
              (input)="phoneNumber.set(phoneInput.value)"
              [placeholder]="t('login.phoneNumberPlaceholder')"
              aria-describedby="phone-hint"
            />
          </label>
          <p class="field-hint" id="phone-hint">{{ t('login.phoneHint') }}</p>
          <button type="submit" class="button button--block" [disabled]="!canSendCode() || isSubmitting()">
            {{ isSubmitting() ? t('login.sending') : t('login.sendCode') }}
          </button>
        </form>
      } @else {
        <form class="phone-form" (submit)="verifyCode($event)">
          <p class="code-sent" aria-live="polite">
            {{ t('login.codeSentTo', { phoneNumber: sanitizedPhoneNumber() }) }}
          </p>
          <label class="field">
            <span class="field-label">{{ t('login.codeLabel') }}</span>
            <input
              #codeInput
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              dir="ltr"
              maxlength="6"
              [value]="verificationCode()"
              (input)="verificationCode.set(codeInput.value)"
              [placeholder]="t('login.codePlaceholder')"
            />
          </label>
          <button type="submit" class="button button--primary button--block" [disabled]="!canVerify() || isSubmitting()">
            {{ isSubmitting() ? t('login.verifying') : t('login.verify') }}
          </button>
          <button type="button" class="link-button" (click)="changeNumber()">{{ t('login.changeNumber') }}</button>
        </form>
      }

      <!-- Invisible reCAPTCHA renders here; required by Firebase phone auth. -->
      <div id="recaptcha-container"></div>

      @if (errorMessage(); as errorKey) {
        <p class="error" role="alert">{{ t(errorKey) }}</p>
      }
    </section>
  `,
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly step = signal<PhoneStep>('phone');
  protected readonly phoneNumber = signal('');
  protected readonly verificationCode = signal('');
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly sanitizedPhoneNumber = computed(() => this.phoneNumber().replace(/[\s-]/g, ''));
  protected readonly canSendCode = computed(() => /^\+[1-9]\d{7,14}$/.test(this.sanitizedPhoneNumber()));
  protected readonly canVerify = computed(() => /^\d{6}$/.test(this.verificationCode().trim()));

  private recaptchaVerifier: RecaptchaVerifier | null = null;
  private confirmationResult: ConfirmationResult | null = null;

  async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.reportError(error, 'login.errorGoogleFailed');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async sendCode(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSendCode()) {
      return;
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      const verifier = this.ensureRecaptchaVerifier();
      this.confirmationResult = await this.authService.startPhoneSignIn(this.sanitizedPhoneNumber(), verifier);
      this.step.set('code');
    } catch (error) {
      this.resetRecaptcha();
      this.reportError(error, 'login.errorSendFailed');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  async verifyCode(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canVerify() || !this.confirmationResult) {
      return;
    }
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    try {
      await this.authService.confirmPhoneCode(this.confirmationResult, this.verificationCode().trim());
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.reportError(error, 'login.errorVerifyFailed');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  changeNumber(): void {
    this.step.set('phone');
    this.verificationCode.set('');
    this.confirmationResult = null;
    this.errorMessage.set(null);
  }

  private ensureRecaptchaVerifier(): RecaptchaVerifier {
    if (!this.recaptchaVerifier) {
      this.recaptchaVerifier = this.authService.createRecaptchaVerifier('recaptcha-container');
    }
    return this.recaptchaVerifier;
  }

  private resetRecaptcha(): void {
    this.recaptchaVerifier?.clear();
    this.recaptchaVerifier = null;
  }

  private reportError(error: unknown, messageKey: string): void {
    const code = (error as { code?: string }).code ?? 'unknown';
    console.error('[sign-in] failed:', code, error);
    this.errorMessage.set(messageKey);
  }
}
