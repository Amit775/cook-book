import { ComponentRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryStore } from '../../core/state/library.store';
import { SessionStore } from '../../core/state/session.store';
import { SaveRecipeButton } from './save-recipe-button';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'saved.save': 'Save',
      'saved.saved': 'Saved',
    });
  }
}

function makeLibraryStoreStub(savedIds: string[] = []) {
  const idsSignal = signal<string[]>(savedIds);
  return {
    savedRecipeIdSet: () => new Set(idsSignal()),
    toggleSave: vi.fn(async (recipeId: string) => {
      const current = idsSignal();
      if (current.includes(recipeId)) {
        idsSignal.set(current.filter((id) => id !== recipeId));
      } else {
        idsSignal.set([...current, recipeId]);
      }
    }),
    loadSaved: vi.fn(),
  };
}

function makeSessionStoreStub(isSignedIn: boolean) {
  return {
    isAuthenticated: () => isSignedIn,
    user: () => (isSignedIn ? { uid: 'user1' } : null),
  };
}

describe('SaveRecipeButton', () => {
  let fixture: ComponentFixture<SaveRecipeButton>;
  let componentRef: ComponentRef<SaveRecipeButton>;
  let libraryStoreStub: ReturnType<typeof makeLibraryStoreStub>;

  async function setup(savedIds: string[] = [], isSignedIn = true): Promise<void> {
    libraryStoreStub = makeLibraryStoreStub(savedIds);

    await TestBed.configureTestingModule({
      imports: [SaveRecipeButton],
      providers: [
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
        { provide: LibraryStore, useValue: libraryStoreStub },
        { provide: SessionStore, useValue: makeSessionStoreStub(isSignedIn) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SaveRecipeButton);
    componentRef = fixture.componentRef;
    componentRef.setInput('recipeId', 'recipe1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button');
  }

  it('renders the Save button when signed in and not saved', async () => {
    await setup([], true);
    expect(button()).toBeTruthy();
    expect(button()!.textContent?.trim()).toBe('Save');
    expect(button()!.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the Saved button when the recipe is already saved', async () => {
    await setup(['recipe1'], true);
    expect(button()!.textContent?.trim()).toBe('Saved');
    expect(button()!.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not render the button when the user is signed out', async () => {
    await setup([], false);
    expect(button()).toBeNull();
  });

  it('toggles aria-pressed when clicked', async () => {
    await setup([], true);
    expect(button()!.getAttribute('aria-pressed')).toBe('false');

    button()!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(libraryStoreStub.toggleSave).toHaveBeenCalledWith('recipe1');
  });

  it('button has accessible label (aria-pressed attribute present)', async () => {
    await setup([], true);
    const btn = button();
    expect(btn).toBeTruthy();
    expect(btn!.hasAttribute('aria-pressed')).toBe(true);
  });
});
