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

  private wakeLock: WakeLockSentinelLike | null = null;

  constructor() {
    afterNextRender(() => void this.requestWakeLock());
    inject(DestroyRef).onDestroy(() => void this.releaseWakeLock());
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
    this.currentStepIndex.update((index) => Math.max(0, index - 1));
  }

  nextStep(): void {
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
