import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { StarRatingDisplay } from './star-rating-display';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'rating.average': '{{average}} out of 5',
      'rating.countOne': '1 rating',
      'rating.countOther': '{{count}} ratings',
      'rating.noRatings': 'No ratings yet',
    });
  }
}

describe('StarRatingDisplay', () => {
  let fixture: ComponentFixture<StarRatingDisplay>;

  async function setup(average = 0, count = 0): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [StarRatingDisplay],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StarRatingDisplay);
    fixture.componentRef.setInput('average', average);
    fixture.componentRef.setInput('count', count);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders with no ratings (count = 0)', async () => {
    await setup(0, 0);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('No ratings yet');
  });

  it('renders the count label for a single rating', async () => {
    await setup(5, 1);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('1 rating');
  });

  it('renders the count label for multiple ratings', async () => {
    await setup(4.3, 12);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('12 ratings');
  });

  it('renders 5 star span elements', async () => {
    await setup(3, 2);
    const stars: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('.star-rating-display__stars span');
    expect(stars.length).toBe(5);
  });

  it('renders filled stars up to floor(average)', async () => {
    await setup(3.7, 4);
    // Math.floor(3.7) = 3, so stars 1–3 should be filled
    const filled: NodeListOf<Element> = fixture.nativeElement.querySelectorAll('.star-rating-display__star--filled');
    expect(filled.length).toBe(3);
  });

  it('has an aria-label on the container div', async () => {
    await setup(4, 2);
    const container: HTMLElement = fixture.nativeElement.querySelector('[aria-label]');
    expect(container).toBeTruthy();
    const label = container.getAttribute('aria-label');
    expect(label).toBeTruthy();
    expect(label).toContain('4');
  });
});
