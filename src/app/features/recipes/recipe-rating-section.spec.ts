import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Recipe } from '../../core/models/recipe.model';
import { RatingStore } from '../../core/state/rating.store';
import { SessionStore } from '../../core/state/session.store';
import { RecipeRatingSection } from './recipe-rating-section';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'rating.sectionTitle': 'Ratings & reviews',
      'rating.average': '{{average}} out of 5',
      'rating.countOne': '1 rating',
      'rating.countOther': '{{count}} ratings',
      'rating.noRatings': 'No ratings yet',
      'rating.yourRating': 'Your rating',
      'rating.rateThis': 'Rate this recipe',
      'rating.starOne': '1 star',
      'rating.starOther': '{{count}} stars',
      'rating.reviewLabel': 'Review (optional)',
      'rating.reviewPlaceholder': 'Share your thoughts...',
      'rating.submit': 'Submit rating',
      'rating.update': 'Update rating',
      'rating.saving': 'Saving...',
      'rating.saved': 'Rating saved!',
      'rating.signInToRate': 'Sign in to rate this recipe.',
      'rating.reviewsTitle': 'Recent reviews',
      'common.loading': 'Loading...',
    });
  }
}

function makeRecipe(): Recipe {
  return {
    recipeId: 'recipe1',
    title: 'Test Recipe',
    description: '',
    type: 'meal',
    authorId: 'author1',
    visibility: 'public',
    sharedWith: [],
    rootId: 'recipe1',
    parentId: null,
    ingredients: [],
    steps: [],
    tags: [],
    keywords: [],
    servings: null,
    prepTime: null,
    cookTime: null,
    coverPhotoPath: null,
    shareId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ratingCount: 0,
    ratingSum: 0,
    ratingAverage: 0,
  };
}

function makeRatingStoreStub(overrides: Partial<{
  isLoading: boolean;
  isSaving: boolean;
  myRating: unknown;
  reviews: unknown[];
  saveAnnouncement: string;
  aggregate: unknown;
  errorMessage: string | null;
}> = {}) {
  return {
    isLoading: signal(overrides.isLoading ?? false),
    isSaving: signal(overrides.isSaving ?? false),
    myRating: signal(overrides.myRating ?? null),
    reviews: signal(overrides.reviews ?? []),
    saveAnnouncement: signal(overrides.saveAnnouncement ?? ''),
    aggregate: signal(overrides.aggregate ?? null),
    errorMessage: signal(overrides.errorMessage ?? null),
    load: vi.fn(async () => {}),
    submit: vi.fn(async () => {}),
    clearAnnouncement: vi.fn(),
  };
}

function makeSessionStoreStub(authenticated: boolean) {
  return {
    isAuthenticated: signal(authenticated),
    user: signal(authenticated ? { uid: 'user1', displayName: 'Alice', email: null, photoURL: null } : null),
  };
}

describe('RecipeRatingSection', () => {
  let fixture: ComponentFixture<RecipeRatingSection>;
  let ratingStoreStub: ReturnType<typeof makeRatingStoreStub>;

  async function setup(authenticated: boolean, storeOverrides = {}): Promise<void> {
    ratingStoreStub = makeRatingStoreStub(storeOverrides);

    await TestBed.configureTestingModule({
      imports: [RecipeRatingSection],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
        { provide: RatingStore, useValue: ratingStoreStub },
        { provide: SessionStore, useValue: makeSessionStoreStub(authenticated) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecipeRatingSection);
    fixture.componentRef.setInput('recipe', makeRecipe());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the section heading', async () => {
    await setup(true);
    expect(fixture.nativeElement.textContent).toContain('Ratings & reviews');
  });

  it('calls load() on ngOnChanges', async () => {
    await setup(true);
    // load() now receives the full Recipe object (not just the recipeId string)
    expect(ratingStoreStub.load).toHaveBeenCalledWith(expect.objectContaining({ recipeId: 'recipe1' }));
  });

  it('shows the rating editor when signed in', async () => {
    await setup(true);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(textarea).toBeTruthy();
  });

  it('does not show the editor when not signed in', async () => {
    await setup(false);
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(textarea).toBeNull();
  });

  it('shows sign-in prompt when not signed in', async () => {
    await setup(false);
    expect(fixture.nativeElement.textContent).toContain('Sign in to rate this recipe.');
  });

  it('shows loading indicator when isLoading is true', async () => {
    await setup(true, { isLoading: true });
    expect(fixture.nativeElement.textContent).toContain('Loading...');
  });

  it('shows "Update rating" when user has an existing rating', async () => {
    await setup(true, {
      myRating: { authorId: 'user1', stars: 3, reviewText: '', createdAt: new Date(), updatedAt: new Date() },
    });
    // Need to set selectedStars to enable the button
    fixture.componentInstance['selectedStars'].set(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Update rating');
  });

  it('submit button is disabled when no stars are selected', async () => {
    await setup(true);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="button"].button--primary');
    expect(button.disabled).toBe(true);
  });

  it('submit button is enabled when stars > 0 and not saving', async () => {
    await setup(true);
    fixture.componentInstance['selectedStars'].set(4);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="button"].button--primary');
    expect(button.disabled).toBe(false);
  });

  it('shows reviews list when reviews exist', async () => {
    await setup(true, {
      reviews: [{
        userId: 'user2',
        displayName: 'Bob',
        authorId: 'user2',
        stars: 5,
        reviewText: 'Fantastic!',
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
    });
    expect(fixture.nativeElement.textContent).toContain('Bob');
    expect(fixture.nativeElement.textContent).toContain('Fantastic!');
  });
});
