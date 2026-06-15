import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Recipe } from '../../core/models/recipe.model';
import { RecipeService } from '../../core/services/recipe.service';
import { CookingModePage } from './cooking-mode-page';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({});
  }
}

function makeRecipe(steps: string[]): Recipe {
  return {
    recipeId: 'r1',
    title: 'Test',
    description: '',
    type: 'meal',
    authorId: 'u1',
    visibility: 'public',
    sharedWith: [],
    rootId: 'r1',
    parentId: null,
    ingredients: [],
    steps,
    tags: [],
    keywords: [],
    servings: 2,
    prepTime: null,
    cookTime: null,
    coverPhotoPath: null,
    shareId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

class RecipeServiceStub {
  recipe = makeRecipe(['Bake for 1 minutes']);
  async getRecipe(): Promise<Recipe> {
    return this.recipe;
  }
}

describe('CookingModePage timers', () => {
  let fixture: ComponentFixture<CookingModePage>;

  async function setup(steps: string[]): Promise<void> {
    const service = new RecipeServiceStub();
    service.recipe = makeRecipe(steps);
    await TestBed.configureTestingModule({
      imports: [CookingModePage],
      providers: [
        provideRouter([]),
        { provide: RecipeService, useValue: service },
        provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' }, loader: StubLoader }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CookingModePage);
    fixture.componentRef.setInput('recipeId', 'r1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function startButton(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.step-timer-start');
  }

  it('offers a start-timer button for a step with a duration', async () => {
    await setup(['Bake for 1 minutes']);
    expect(startButton()).toBeTruthy();
  });

  it('offers no timer for a step without a duration', async () => {
    await setup(['Shake with ice']);
    expect(startButton()).toBeNull();
  });

  it('counts down and announces when time is up', async () => {
    await setup(['Bake for 1 minutes']);
    vi.useFakeTimers();

    startButton()!.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();
    expect(text()).toContain('1:00');

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(text()).toContain('0:59');

    vi.advanceTimersByTime(59_000);
    fixture.detectChanges();
    expect(text()).toContain('cooking.timerDone');
  });
});
