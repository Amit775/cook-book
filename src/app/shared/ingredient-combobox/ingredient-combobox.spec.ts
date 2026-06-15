import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogIngredient } from '../../core/models/catalog-ingredient.model';
import { IngredientService } from '../../core/services/ingredient.service';
import { IngredientCombobox, IngredientSelection } from './ingredient-combobox';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({});
  }
}

class IngredientServiceStub {
  searchResults: CatalogIngredient[] = [];
  async search(): Promise<CatalogIngredient[]> {
    return this.searchResults;
  }
  async findOrCreate(): Promise<CatalogIngredient> {
    return { ingredientId: 'created', name: 'created', nameLower: 'created' };
  }
}

describe('IngredientCombobox', () => {
  let fixture: ComponentFixture<IngredientCombobox>;
  let componentRef: ComponentRef<IngredientCombobox>;
  let service: IngredientServiceStub;
  let selections: IngredientSelection[];

  beforeEach(async () => {
    vi.useFakeTimers();
    service = new IngredientServiceStub();
    await TestBed.configureTestingModule({
      imports: [IngredientCombobox],
      providers: [
        { provide: IngredientService, useValue: service },
        provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' }, loader: StubLoader }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IngredientCombobox);
    componentRef = fixture.componentRef;
    selections = [];
    // Mirror the parent form: a selection updates the controlled `value` input.
    fixture.componentInstance.selectionChange.subscribe((selection) => {
      selections.push(selection);
      componentRef.setInput('value', selection.name);
    });
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function type(text: string): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function options(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.combobox-option'));
  }

  it('emits a free-text selection with no catalog id while typing', () => {
    type('flo');
    expect(selections.at(-1)).toEqual({ name: 'flo', ingredientId: null });
  });

  it('emits the catalog id when an existing suggestion is chosen', async () => {
    service.searchResults = [{ ingredientId: 'abc', name: 'Flour', nameLower: 'flour' }];
    type('flo');
    await vi.advanceTimersByTimeAsync(250);
    await fixture.whenStable();
    fixture.detectChanges();

    const suggestion = options().find((option) => option.textContent?.trim() === 'Flour');
    expect(suggestion).toBeTruthy();
    suggestion!.dispatchEvent(new MouseEvent('click'));

    expect(selections.at(-1)).toEqual({ name: 'Flour', ingredientId: 'abc' });
  });

  it('offers an add-new option for unknown text and emits it with no id', async () => {
    service.searchResults = [];
    type('mango');
    await vi.advanceTimersByTimeAsync(250);
    await fixture.whenStable();
    fixture.detectChanges();

    const addOption = fixture.nativeElement.querySelector('.combobox-option--add') as HTMLElement | null;
    expect(addOption).toBeTruthy();
    addOption!.dispatchEvent(new MouseEvent('click'));

    expect(selections.at(-1)).toEqual({ name: 'mango', ingredientId: null });
  });
});
