import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StarRatingInput } from './star-rating-input';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'rating.rateThis': 'Rate this recipe',
      'rating.starOne': '1 star',
      'rating.starOther': '{{count}} stars',
    });
  }
}

describe('StarRatingInput', () => {
  let fixture: ComponentFixture<StarRatingInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StarRatingInput],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StarRatingInput);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders 5 radio inputs', () => {
    const radios: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(5);
  });

  it('renders a <fieldset> for the radio group', () => {
    const fieldset: HTMLFieldSetElement = fixture.nativeElement.querySelector('fieldset');
    expect(fieldset).toBeTruthy();
  });

  it('renders a visually-hidden <legend>', () => {
    const legend: HTMLLegendElement = fixture.nativeElement.querySelector('legend');
    expect(legend).toBeTruthy();
    expect(legend.classList.contains('visually-hidden')).toBe(true);
  });

  it('emits valueChange when a radio is changed', () => {
    const emitted: number[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    const radios: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll('input[type="radio"]');
    radios[2].dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(emitted).toEqual([3]);
  });

  it('reflects the input value by checking the correct radio', async () => {
    fixture.componentRef.setInput('value', 4);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const radios: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll('input[type="radio"]');
    // The 4th radio (index 3) should be checked
    expect((radios[3] as HTMLInputElement).checked).toBe(true);
  });

  it('disables all radios when disabled input is true', async () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const fieldset: HTMLFieldSetElement = fixture.nativeElement.querySelector('fieldset');
    expect(fieldset.disabled).toBe(true);
  });
});
