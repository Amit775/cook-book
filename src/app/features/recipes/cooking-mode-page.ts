import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { formatQuantity, scaleQuantity } from '../../core/models/quantity.model';
import { isRecipeUnit } from '../../core/models/recipe-unit.model';
import { parseStepDurations } from '../../core/models/step-timer.model';
import { RecipeService } from '../../core/services/recipe.service';

/**
 * Minimal shape of the Screen Wake Lock API. Declared locally so we don't depend
 * on the `dom` lib including it (support varies by TypeScript lib version).
 */
interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function toggleIndex(set: ReadonlySet<number>, index: number): ReadonlySet<number> {
  const next = new Set(set);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  return next;
}

@Component({
  selector: 'app-cooking-mode-page',
  imports: [TranslocoDirective, RouterLink],
  host: { '(document:visibilitychange)': 'onVisibilityChange()' },
  template: `
    <section class="cooking-mode" *transloco="let t">
      @if (recipeResource.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (recipeResource.value(); as recipe) {
        <header class="cooking-header">
          <a class="button cooking-exit" [routerLink]="['/recipes', recipe.recipeId]">
            {{ t('cooking.exit') }}
          </a>
          <h1 class="cooking-title">{{ recipe.title }}</h1>
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
        </header>

        @if (recipe.ingredients.length > 0) {
          <section class="cooking-section">
            <h2>{{ t('recipeDetail.ingredients') }}</h2>
            <ul class="check-list">
              @for (ingredient of recipe.ingredients; track $index; let i = $index) {
                <li class="check-item" [class.is-checked]="checkedIngredients().has(i)">
                  <label>
                    <input
                      type="checkbox"
                      [checked]="checkedIngredients().has(i)"
                      (change)="toggleIngredient(i)"
                    />
                    <span class="ingredient-amount">
                      {{ scaledQuantity(ingredient.quantity) }}
                      {{ isKnownUnit(ingredient.unit) ? t('unit.' + ingredient.unit) : ingredient.unit }}
                    </span>
                    {{ ingredient.name }}
                  </label>
                </li>
              }
            </ul>
          </section>
        }

        @if (recipe.steps.length > 0) {
          <section class="cooking-section cooking-steps">
            <h2>{{ t('recipeDetail.steps') }}</h2>
            <p class="cooking-step-progress" aria-live="polite">
              {{ t('cooking.stepProgress', { current: currentStepIndex() + 1, total: recipe.steps.length }) }}
            </p>
            <p class="cooking-step-text" [class.is-checked]="checkedSteps().has(currentStepIndex())">
              {{ recipe.steps[currentStepIndex()] }}
            </p>

            @if (timerRemaining() !== null) {
              <div class="step-timer">
                <div class="step-timer-display" [class.is-done]="isTimerDone()" role="timer" aria-live="polite">
                  {{ isTimerDone() ? t('cooking.timerDone') : formatTimer(timerRemaining()!) }}
                </div>
                <div class="step-timer-controls">
                  @if (isTimerDone()) {
                    <button type="button" class="button" (click)="resetTimer()">{{ t('cooking.timerDismiss') }}</button>
                  } @else if (isTimerRunning()) {
                    <button type="button" class="button" (click)="pauseTimer()">{{ t('cooking.timerPause') }}</button>
                    <button type="button" class="button" (click)="resetTimer()">{{ t('cooking.timerReset') }}</button>
                  } @else {
                    <button type="button" class="button button--primary" (click)="resumeTimer()">{{ t('cooking.timerResume') }}</button>
                    <button type="button" class="button" (click)="resetTimer()">{{ t('cooking.timerReset') }}</button>
                  }
                </div>
              </div>
            } @else if (currentStepDurations().length > 0) {
              <div class="step-timer-starts">
                @for (duration of currentStepDurations(); track $index) {
                  <button type="button" class="button step-timer-start" (click)="startTimer(duration.seconds)">
                    {{ t('cooking.startTimer', { label: duration.label }) }}
                  </button>
                }
              </div>
            }

            <div class="cooking-step-controls">
              <button
                type="button"
                class="button"
                [disabled]="currentStepIndex() === 0"
                (click)="previousStep()"
              >
                {{ t('cooking.previous') }}
              </button>
              <button type="button" class="button button--primary" (click)="markDone()">
                {{ checkedSteps().has(currentStepIndex()) ? t('cooking.markUndone') : t('cooking.markDone') }}
              </button>
              <button
                type="button"
                class="button"
                [disabled]="currentStepIndex() === recipe.steps.length - 1"
                (click)="nextStep()"
              >
                {{ t('cooking.next') }}
              </button>
            </div>
          </section>
        }
      } @else {
        <p>{{ t('recipeDetail.notFound') }}</p>
      }
    </section>
  `,
})
export class CookingModePage {
  private readonly recipeService = inject(RecipeService);
  private readonly document = inject(DOCUMENT);

  /** Bound from the `:recipeId` route parameter (withComponentInputBinding). */
  readonly recipeId = input<string>('');
  /** Optional `?servings=` query param carried over from the detail page scaler. */
  readonly servings = input<string>('');

  protected readonly recipeResource = resource({
    params: () => this.recipeId() || undefined,
    loader: ({ params }) => this.recipeService.getRecipe(params),
  });

  /** Target serving count: the query-param override if valid, else the recipe's own. */
  protected readonly targetServings = linkedSignal(() => {
    const fromQuery = Number(this.servings());
    if (this.servings() && Number.isFinite(fromQuery) && fromQuery > 0) {
      return fromQuery;
    }
    return this.recipeResource.value()?.servings ?? null;
  });

  private readonly scaleFactor = computed(() => {
    const base = this.recipeResource.value()?.servings ?? null;
    const target = this.targetServings();
    return base && target ? target / base : 1;
  });

  protected readonly isKnownUnit = isRecipeUnit;
  protected readonly checkedIngredients = signal<ReadonlySet<number>>(new Set());
  protected readonly checkedSteps = signal<ReadonlySet<number>>(new Set());
  protected readonly currentStepIndex = signal(0);

  /** Durations detected in the current step's text, offered as tap-to-start timers. */
  protected readonly currentStepDurations = computed(() => {
    const steps = this.recipeResource.value()?.steps ?? [];
    return parseStepDurations(steps[this.currentStepIndex()] ?? '');
  });

  /** Remaining seconds on the running/paused timer, or `null` when no timer is set. */
  protected readonly timerRemaining = signal<number | null>(null);
  protected readonly isTimerRunning = signal(false);
  protected readonly isTimerDone = computed(() => this.timerRemaining() === 0);
  private timerIntervalId: ReturnType<typeof setInterval> | null = null;

  private wakeLock: WakeLockSentinelLike | null = null;

  constructor() {
    afterNextRender(() => void this.requestWakeLock());
    inject(DestroyRef).onDestroy(() => {
      this.clearTimerInterval();
      void this.releaseWakeLock();
    });
  }

  increaseServings(): void {
    this.targetServings.update((value) => (value ?? 1) + 1);
  }

  decreaseServings(): void {
    this.targetServings.update((value) => Math.max(1, (value ?? 1) - 1));
  }

  scaledQuantity(quantity: number | null): string {
    return formatQuantity(scaleQuantity(quantity, this.scaleFactor()));
  }

  toggleIngredient(index: number): void {
    this.checkedIngredients.update((set) => toggleIndex(set, index));
  }

  previousStep(): void {
    this.resetTimer();
    this.currentStepIndex.update((index) => Math.max(0, index - 1));
  }

  nextStep(): void {
    this.resetTimer();
    const lastIndex = (this.recipeResource.value()?.steps.length ?? 1) - 1;
    this.currentStepIndex.update((index) => Math.min(lastIndex, index + 1));
  }

  /** Toggle the current step's done state; advance to the next step when marking done. */
  markDone(): void {
    const index = this.currentStepIndex();
    const wasChecked = this.checkedSteps().has(index);
    this.checkedSteps.update((set) => toggleIndex(set, index));
    if (!wasChecked) {
      this.nextStep();
    }
  }

  startTimer(seconds: number): void {
    this.clearTimerInterval();
    this.timerRemaining.set(seconds);
    this.isTimerRunning.set(true);
    this.runTimerInterval();
  }

  pauseTimer(): void {
    this.isTimerRunning.set(false);
    this.clearTimerInterval();
  }

  resumeTimer(): void {
    if ((this.timerRemaining() ?? 0) > 0) {
      this.isTimerRunning.set(true);
      this.runTimerInterval();
    }
  }

  resetTimer(): void {
    this.clearTimerInterval();
    this.isTimerRunning.set(false);
    this.timerRemaining.set(null);
  }

  formatTimer(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  private runTimerInterval(): void {
    this.timerIntervalId = setInterval(() => {
      const remaining = (this.timerRemaining() ?? 0) - 1;
      if (remaining <= 0) {
        this.timerRemaining.set(0);
        this.isTimerRunning.set(false);
        this.clearTimerInterval();
        this.notifyTimerDone();
      } else {
        this.timerRemaining.set(remaining);
      }
    }, 1000);
  }

  private clearTimerInterval(): void {
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  /** Alert when a timer finishes: a short beep and a vibration where supported. */
  private notifyTimerDone(): void {
    const view = this.document.defaultView;
    view?.navigator?.vibrate?.([200, 100, 200]);
    const AudioContextConstructor = view?.AudioContext;
    if (!AudioContextConstructor) {
      return;
    }
    try {
      const audioContext = new AudioContextConstructor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.8);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.8);
      oscillator.onended = () => void audioContext.close();
    } catch {
      // Audio can be unavailable (autoplay policy, no device); the visual alert still shows.
    }
  }

  protected onVisibilityChange(): void {
    // The browser auto-releases the wake lock when the tab is hidden; re-acquire on return.
    if (this.document.visibilityState === 'visible') {
      void this.requestWakeLock();
    }
  }

  private async requestWakeLock(): Promise<void> {
    const wakeLock = (this.document.defaultView?.navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock || this.wakeLock) {
      return;
    }
    try {
      this.wakeLock = await wakeLock.request('screen');
    } catch {
      // Wake lock can be rejected (e.g. low battery); cooking mode still works without it.
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        // Ignore release failures during teardown.
      }
    }
  }
}
