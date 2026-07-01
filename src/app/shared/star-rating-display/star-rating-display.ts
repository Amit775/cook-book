import { Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Read-only aggregate star-rating display.
 * Shows decorative star glyphs (aria-hidden) alongside a single accessible text
 * label ("4.3 out of 5, 12 ratings") for screen readers.
 *
 * Usage:
 * ```html
 * <app-star-rating-display
 *   [average]="recipe.ratingAverage"
 *   [count]="recipe.ratingCount"
 * />
 * ```
 */
@Component({
  selector: 'app-star-rating-display',
  imports: [TranslocoDirective],
  template: `
    <div class="star-rating-display" *transloco="let t" [attr.aria-label]="accessibleLabel(t)">
      <span class="star-rating-display__stars" aria-hidden="true">
        @for (star of stars; track star) {
          <span [class.star-rating-display__star--filled]="star <= filledStars()">
            {{ star <= filledStars() ? '★' : '☆' }}
          </span>
        }
      </span>
      @if (count() > 0) {
        <span class="star-rating-display__average" aria-hidden="true">
          {{ average() }}
        </span>
        <span class="star-rating-display__count" aria-hidden="true">
          ({{ count() === 1 ? t('rating.countOne', { count: count() }) : t('rating.countOther', { count: count() }) }})
        </span>
      } @else {
        <span class="star-rating-display__empty" aria-hidden="true">{{ t('rating.noRatings') }}</span>
      }
    </div>
  `,
  styleUrl: './star-rating-display.scss',
})
export class StarRatingDisplay {
  /** Average rating (0–5, rounded to 1 decimal). */
  readonly average = input<number>(0);
  /** Total number of ratings. */
  readonly count = input<number>(0);

  protected readonly stars = [1, 2, 3, 4, 5] as const;

  /** Number of fully filled stars (floor of average). */
  protected readonly filledStars = computed(() => Math.floor(this.average()));

  /**
   * Single accessible text label used by aria-label on the container div.
   * Transloco `t` is passed in so this computed fn can call the translate function.
   */
  protected accessibleLabel(t: (key: string, params?: Record<string, unknown>) => string): string {
    const count = this.count();
    const average = this.average();
    if (count === 0) {
      return t('rating.noRatings');
    }
    const countLabel =
      count === 1
        ? t('rating.countOne', { count })
        : t('rating.countOther', { count });
    return t('rating.average', { average }) + ', ' + countLabel;
  }
}
