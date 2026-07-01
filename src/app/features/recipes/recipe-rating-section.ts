import { Component, inject, input, OnChanges, signal, SimpleChanges } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { Recipe } from '../../core/models/recipe.model';
import { RatingStore } from '../../core/state/rating.store';
import { SessionStore } from '../../core/state/session.store';
import { StarRatingDisplay } from '../../shared/star-rating-display/star-rating-display';
import { StarRatingInput } from '../../shared/star-rating-input/star-rating-input';

/**
 * The ratings & reviews block rendered on the recipe detail page.
 *
 * Responsibilities:
 * - Show the aggregate (average + count) via `StarRatingDisplay`.
 * - When the user is signed in: let them pick 1–5 stars via `StarRatingInput`,
 *   add an optional review text, and submit.
 * - Show the most recent reviews (up to 10).
 * - Announce save success to screen readers via an aria-live region.
 *
 * Delegates all Firestore I/O to `RatingStore` / `RatingService`.
 */
@Component({
  selector: 'app-recipe-rating-section',
  imports: [TranslocoDirective, StarRatingDisplay, StarRatingInput],
  template: `
    <section class="recipe-ratings" *transloco="let t">
      <h2>{{ t('rating.sectionTitle') }}</h2>

      <!-- Aggregate display -->
      <app-star-rating-display
        [average]="recipe().ratingAverage"
        [count]="recipe().ratingCount"
      />

      @if (ratingStore.isLoading()) {
        <p>{{ t('common.loading') }}</p>
      } @else if (isSignedIn()) {
        <!-- Rating editor -->
        <div class="recipe-ratings__editor">
          <p class="recipe-ratings__your-rating-label">
            {{ ratingStore.myRating() ? t('rating.yourRating') : t('rating.rateThis') }}
          </p>
          <app-star-rating-input
            [value]="selectedStars()"
            [disabled]="ratingStore.isSaving()"
            (valueChange)="selectedStars.set($event)"
          />

          <label class="recipe-ratings__review-label" [for]="reviewTextareaId">
            {{ t('rating.reviewLabel') }}
          </label>
          <textarea
            [id]="reviewTextareaId"
            class="recipe-ratings__review-textarea"
            [placeholder]="t('rating.reviewPlaceholder')"
            [value]="reviewText()"
            [disabled]="ratingStore.isSaving()"
            maxlength="1000"
            rows="3"
            (input)="reviewText.set(getTextareaValue($event))"
          ></textarea>

          <button
            type="button"
            class="button button--primary"
            [disabled]="selectedStars() === 0 || ratingStore.isSaving()"
            (click)="submit()"
          >
            @if (ratingStore.isSaving()) {
              {{ t('rating.saving') }}
            } @else if (ratingStore.myRating()) {
              {{ t('rating.update') }}
            } @else {
              {{ t('rating.submit') }}
            }
          </button>
        </div>

        <!-- Accessible save-success announcement -->
        <div aria-live="polite" class="visually-hidden">
          @if (ratingStore.saveAnnouncement() === 'saved') {
            {{ t('rating.saved') }}
          }
        </div>
      } @else {
        <p class="recipe-ratings__sign-in-prompt">{{ t('rating.signInToRate') }}</p>
      }

      <!-- Recent reviews list -->
      @if (ratingStore.reviews().length > 0) {
        <section class="recipe-ratings__reviews" aria-label="{{ t('rating.reviewsTitle') }}">
          <h3>{{ t('rating.reviewsTitle') }}</h3>
          <ul class="recipe-ratings__review-list">
            @for (review of ratingStore.reviews(); track review.userId) {
              <li class="recipe-ratings__review-item">
                <div class="recipe-ratings__review-header">
                  <strong>{{ review.displayName }}</strong>
                  <span class="recipe-ratings__review-stars" aria-hidden="true">
                    @for (star of starsArray; track star) {
                      {{ star <= review.stars ? '★' : '☆' }}
                    }
                  </span>
                  <span class="visually-hidden">
                    {{ review.stars === 1 ? t('rating.starOne') : t('rating.starOther', { count: review.stars }) }}
                  </span>
                </div>
                @if (review.reviewText) {
                  <p class="recipe-ratings__review-text">{{ review.reviewText }}</p>
                }
              </li>
            }
          </ul>
        </section>
      }
    </section>
  `,
  styleUrl: './recipe-rating-section.scss',
})
export class RecipeRatingSection implements OnChanges {
  protected readonly ratingStore = inject(RatingStore);
  private readonly session = inject(SessionStore);

  readonly recipe = input.required<Recipe>();

  protected readonly isSignedIn = this.session.isAuthenticated;

  protected readonly selectedStars = signal<number>(0);
  protected readonly reviewText = signal<string>('');

  /** Stable id for the textarea label association. */
  protected readonly reviewTextareaId = 'recipe-rating-review-textarea';

  protected readonly starsArray = [1, 2, 3, 4, 5] as const;

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['recipe']) {
      const recipeId = this.recipe().recipeId;
      if (recipeId) {
        await this.ratingStore.load(recipeId);
        // Pre-fill editor with existing rating if any.
        const existing = this.ratingStore.myRating();
        if (existing) {
          this.selectedStars.set(existing.stars);
          this.reviewText.set(existing.reviewText);
        }
      }
    }
  }

  protected async submit(): Promise<void> {
    const stars = this.selectedStars();
    if (stars === 0) {
      return;
    }
    await this.ratingStore.submit(this.recipe(), stars, this.reviewText());
    // Announce then clear after 3 s.
    setTimeout(() => this.ratingStore.clearAnnouncement(), 3000);
  }

  protected getTextareaValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }
}
