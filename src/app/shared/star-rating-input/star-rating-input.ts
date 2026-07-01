import { Component, input, OnChanges, output, signal, SimpleChanges } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Accessible interactive star-rating control implemented as a native radio group.
 * Uses visually-hidden `<input type="radio">` elements with visible star labels,
 * giving keyboard operation (arrow keys + Space/Enter) and correct ARIA semantics
 * for free. Each radio's accessible name is the localized "N stars" label.
 *
 * Usage:
 * ```html
 * <app-star-rating-input [value]="3" (valueChange)="onStarsChange($event)" />
 * ```
 */
@Component({
  selector: 'app-star-rating-input',
  imports: [TranslocoDirective],
  template: `
    <fieldset class="star-rating-input" *transloco="let t" [disabled]="disabled()">
      <legend class="visually-hidden">{{ t('rating.rateThis') }}</legend>
      @for (star of stars; track star) {
        <label class="star-rating-input__label" [class.star-rating-input__label--filled]="star <= selectedValue()">
          <input
            class="visually-hidden"
            type="radio"
            name="star-rating"
            [value]="star"
            [checked]="star === selectedValue()"
            [attr.aria-label]="star === 1 ? t('rating.starOne') : t('rating.starOther', { count: star })"
            (change)="onRadioChange(star)"
          />
          <span aria-hidden="true">{{ star <= selectedValue() ? '★' : '☆' }}</span>
        </label>
      }
    </fieldset>
  `,
  styleUrl: './star-rating-input.scss',
})
export class StarRatingInput implements OnChanges {
  /** Current selected star value (1–5, or 0 for no selection). */
  readonly value = input<number>(0);
  /** Whether the control is disabled (e.g. while saving or when not signed in). */
  readonly disabled = input<boolean>(false);
  /** Emitted when the user selects a star. */
  readonly valueChange = output<number>();

  protected readonly stars = [1, 2, 3, 4, 5] as const;
  protected readonly selectedValue = signal<number>(0);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) {
      this.selectedValue.set(this.value());
    }
  }

  protected onRadioChange(star: number): void {
    this.selectedValue.set(star);
    this.valueChange.emit(star);
  }
}
