import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco, TranslocoLoader } from '@jsverse/transloco';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock firebase/firestore before any imports that pull in the real SDK.
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => null),
}));

import { FIRESTORE } from '../../core/firebase/firebase.providers';
import { ShoppingList } from '../../core/models/shopping-list.model';
import { ShoppingListStore } from '../../core/state/shopping-list.store';
import { SessionStore } from '../../core/state/session.store';
import { ShoppingListPage } from './shopping-list-page';

class StubLoader implements TranslocoLoader {
  getTranslation() {
    return of({
      'shoppingList.heading': 'Shopping list',
      'shoppingList.emptyNoLists': 'No lists yet.',
      'shoppingList.emptyList': 'List is empty.',
      'shoppingList.selectList': 'Select list',
      'shoppingList.newListPlaceholder': 'New list name',
      'shoppingList.createList': 'Create list',
      'shoppingList.newOption': 'New list…',
      'shoppingList.rename': 'Rename',
      'shoppingList.deleteList': 'Delete list',
      'shoppingList.deleteConfirm': 'Delete this list?',
      'shoppingList.addToList': 'Add to list',
      'shoppingList.added': 'Added to {{listName}}',
      'shoppingList.clear': 'Clear list',
      'shoppingList.clearConfirm': 'Clear all items?',
      'shoppingList.itemCountOne': '1 item',
      'shoppingList.itemCountOther': '{{count}} items',
      'common.signInRequired': 'Sign in to continue.',
      'common.loading': 'Loading...',
      'actions.signIn': 'Sign in',
      'actions.cancel': 'Cancel',
      'unit.gram': 'g',
      'unit.cup': 'cup',
    });
  }
}

function makeList(overrides: Partial<ShoppingList> = {}): ShoppingList {
  return {
    listId: 'list1',
    name: 'Groceries',
    items: [],
    isManuallyOrdered: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeShoppingListStoreStub(overrides: Partial<{
  lists: ShoppingList[];
  activeListId: string | null;
  isLoading: boolean;
}> = {}) {
  const lists = signal(overrides.lists ?? []);
  const activeListId = signal(overrides.activeListId ?? null);
  const isLoading = signal(overrides.isLoading ?? false);
  const activeList = () => lists().find((list) => list.listId === activeListId()) ?? null;
  const displayItems = () => activeList()?.items ?? [];
  const itemCount = () => activeList()?.items.length ?? 0;
  const uncheckedCount = () => activeList()?.items.filter((item) => !item.checked).length ?? 0;

  return {
    lists,
    activeListId,
    isLoading,
    activeList,
    displayItems,
    itemCount,
    uncheckedCount,
    loadLists: vi.fn(async () => {}),
    setActiveList: vi.fn((listId: string) => { activeListId.set(listId); }),
    createList: vi.fn(async () => 'new-list-id'),
    renameList: vi.fn(async () => {}),
    deleteList: vi.fn(async () => {}),
    addRecipeToList: vi.fn(async () => {}),
    toggleItem: vi.fn(async () => {}),
    clearActiveList: vi.fn(async () => {}),
  };
}

function makeSessionStoreStub(authenticated: boolean) {
  return {
    isAuthenticated: signal(authenticated),
    user: signal(authenticated ? { uid: 'user1', displayName: 'User', email: null, photoURL: null } : null),
  };
}

describe('ShoppingListPage', () => {
  let fixture: ComponentFixture<ShoppingListPage>;
  let shoppingListStoreStub: ReturnType<typeof makeShoppingListStoreStub>;

  async function setup(
    authenticated: boolean,
    storeConfig: Parameters<typeof makeShoppingListStoreStub>[0] = {},
  ): Promise<void> {
    shoppingListStoreStub = makeShoppingListStoreStub(storeConfig);
    const sessionStoreStub = makeSessionStoreStub(authenticated);

    await TestBed.configureTestingModule({
      imports: [ShoppingListPage],
      providers: [
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false },
          loader: StubLoader,
        }),
        { provide: SessionStore, useValue: sessionStoreStub },
        { provide: ShoppingListStore, useValue: shoppingListStoreStub },
        { provide: FIRESTORE, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingListPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Auth gate
  // -----------------------------------------------------------------------

  it('shows sign-in prompt when not authenticated', async () => {
    await setup(false);
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Sign in to continue.');
  });

  it('does not show the list controls when not authenticated', async () => {
    await setup(false);
    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector('select');
    expect(select).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it('shows empty-no-lists state when authenticated but no lists exist', async () => {
    await setup(true, { lists: [], activeListId: null });
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('No lists yet.');
  });

  it('shows the create form when there are no lists', async () => {
    await setup(true, { lists: [], activeListId: null });
    const input: HTMLInputElement | null = fixture.nativeElement.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Active list with items
  // -----------------------------------------------------------------------

  it('renders a checklist when the active list has items', async () => {
    const list = makeList({
      listId: 'list1',
      items: [
        {
          ingredientId: null,
          name: 'Milk',
          unit: 'liter',
          quantity: 1,
          checked: false,
          sourceRecipeIds: ['r1'],
        },
      ],
    });
    await setup(true, { lists: [list], activeListId: 'list1' });

    const listItems: NodeList = fixture.nativeElement.querySelectorAll('li.shopping-list-item');
    expect(listItems.length).toBe(1);
  });

  it('renders a real checkbox inside a label for each item', async () => {
    const list = makeList({
      listId: 'list1',
      items: [
        {
          ingredientId: null,
          name: 'Eggs',
          unit: 'piece',
          quantity: 6,
          checked: false,
          sourceRecipeIds: ['r1'],
        },
      ],
    });
    await setup(true, { lists: [list], activeListId: 'list1' });

    const label: HTMLLabelElement | null = fixture.nativeElement.querySelector('li.shopping-list-item label');
    const checkbox: HTMLInputElement | null = label?.querySelector('input[type="checkbox"]') ?? null;
    expect(label).toBeTruthy();
    expect(checkbox).toBeTruthy();
  });

  it('calls toggleItem when a checkbox changes', async () => {
    const list = makeList({
      listId: 'list1',
      items: [
        {
          ingredientId: null,
          name: 'Eggs',
          unit: 'piece',
          quantity: 6,
          checked: false,
          sourceRecipeIds: ['r1'],
        },
      ],
    });
    await setup(true, { lists: [list], activeListId: 'list1' });

    const checkbox: HTMLInputElement | null = fixture.nativeElement.querySelector('input[type="checkbox"]');
    checkbox?.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(shoppingListStoreStub.toggleItem).toHaveBeenCalledOnce();
  });

  // -----------------------------------------------------------------------
  // List switcher
  // -----------------------------------------------------------------------

  it('renders a select with list options when lists exist', async () => {
    const list = makeList({ listId: 'list1', name: 'Groceries' });
    await setup(true, { lists: [list], activeListId: 'list1' });

    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector('select');
    expect(select).toBeTruthy();
    const options = Array.from(select!.options);
    expect(options.some((opt) => opt.value === 'list1')).toBe(true);
  });

  it('includes the "New list…" sentinel option', async () => {
    const list = makeList({ listId: 'list1' });
    await setup(true, { lists: [list], activeListId: 'list1' });

    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector('select');
    const options = Array.from(select!.options);
    expect(options.some((opt) => opt.value === '__new__')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it('shows loading text when isLoading is true', async () => {
    await setup(true, { lists: [], isLoading: true });
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Loading...');
  });

  // -----------------------------------------------------------------------
  // Delete confirmation dialog
  // -----------------------------------------------------------------------

  it('shows delete confirmation when delete button is clicked', async () => {
    const list = makeList({ listId: 'list1' });
    await setup(true, { lists: [list], activeListId: 'list1' });

    const deleteButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.button--danger');
    deleteButton?.click();
    fixture.detectChanges();

    const dialog: HTMLElement | null = fixture.nativeElement.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
  });

  it('calls deleteList when confirmed', async () => {
    const list = makeList({ listId: 'list1' });
    await setup(true, { lists: [list], activeListId: 'list1' });

    // Click delete button to show confirm dialog
    const deleteButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.button--danger');
    deleteButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // The confirm dialog's danger button calls confirmDeleteList
    const buttons: NodeList = fixture.nativeElement.querySelectorAll('[role="alertdialog"] .button--danger');
    (buttons[0] as HTMLButtonElement)?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(shoppingListStoreStub.deleteList).toHaveBeenCalledWith('list1');
  });
});
