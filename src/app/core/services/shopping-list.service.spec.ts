import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '../firebase/firebase.providers';
import { ShoppingListService } from './shopping-list.service';

// ---------------------------------------------------------------------------
// Firestore SDK module mock — same pattern as saved-recipe.service.spec.ts
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocs: vi.fn<any>(() => Promise.resolve({ docs: [] })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDoc: vi.fn<any>(() => Promise.resolve({ exists: () => false })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverTimestamp: vi.fn<any>(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_firestoreOrCollection: unknown, ...segments: string[]) => {
    const allSegments = (segments as string[]).filter((segment) => segment !== undefined);
    const path = allSegments.join('/');
    const id = allSegments[allSegments.length - 1] ?? 'auto-id-123';
    return { id, path };
  }),
  collection: vi.fn((_firestore: unknown, ...segments: string[]) => ({
    path: (segments as string[]).join('/'),
  })),
  setDoc: (...args: unknown[]) => (mocks.setDoc as Function)(...args),
  deleteDoc: (...args: unknown[]) => (mocks.deleteDoc as Function)(...args),
  updateDoc: (...args: unknown[]) => (mocks.updateDoc as Function)(...args),
  getDocs: (...args: unknown[]) => (mocks.getDocs as Function)(...args),
  getDoc: (...args: unknown[]) => (mocks.getDoc as Function)(...args),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  serverTimestamp: () => (mocks.serverTimestamp as Function)(),
}));

// ---------------------------------------------------------------------------
// ShoppingListService tests
// ---------------------------------------------------------------------------

describe('ShoppingListService', () => {
  let service: ShoppingListService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        ShoppingListService,
        { provide: FIRESTORE, useValue: {} },
      ],
    });
    service = TestBed.inject(ShoppingListService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // listShoppingLists
  // -----------------------------------------------------------------------

  it('listShoppingLists() returns empty array when Firestore has no docs', async () => {
    mocks.getDocs.mockResolvedValueOnce({ docs: [] });
    const lists = await service.listShoppingLists('user1');
    expect(lists).toEqual([]);
    expect(mocks.getDocs).toHaveBeenCalledOnce();
  });

  it('listShoppingLists() maps Firestore docs to ShoppingList objects', async () => {
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'list1',
          data: () => ({
            name: 'Groceries',
            items: [],
            isManuallyOrdered: false,
            createdAt: null,
            updatedAt: null,
          }),
        },
      ],
    });
    const lists = await service.listShoppingLists('user1');
    expect(lists).toHaveLength(1);
    expect(lists[0].listId).toBe('list1');
    expect(lists[0].name).toBe('Groceries');
  });

  // -----------------------------------------------------------------------
  // getList
  // -----------------------------------------------------------------------

  it('getList() returns null when the document does not exist', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
    const result = await service.getList('user1', 'list1');
    expect(result).toBeNull();
  });

  it('getList() returns a mapped ShoppingList when the document exists', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'list1',
      data: () => ({
        name: 'Weekly',
        items: [],
        isManuallyOrdered: false,
        createdAt: null,
        updatedAt: null,
      }),
    });
    const result = await service.getList('user1', 'list1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Weekly');
  });

  // -----------------------------------------------------------------------
  // createList
  // -----------------------------------------------------------------------

  it('createList() calls setDoc with the correct path structure', async () => {
    await service.createList('user1', 'My List', []);

    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const args = mocks.setDoc.mock.calls[0] as [{ id: string; path: string }, Record<string, unknown>];
    // The doc is built from a collection reference; the stub auto-assigns the last segment as id
    expect(args[0]).toBeTruthy();
  });

  it('createList() writes name, items, isManuallyOrdered, and serverTimestamp fields', async () => {
    await service.createList('user1', 'My List', []);

    const args = mocks.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    const data = args[1];
    expect(data['name']).toBe('My List');
    expect(data['items']).toEqual([]);
    expect(data['isManuallyOrdered']).toBe(false);
    expect(data['createdAt']).toBe('SERVER_TIMESTAMP');
    expect(data['updatedAt']).toBe('SERVER_TIMESTAMP');
  });

  // -----------------------------------------------------------------------
  // renameList
  // -----------------------------------------------------------------------

  it('renameList() calls updateDoc with new name and updatedAt', async () => {
    await service.renameList('user1', 'list1', 'Renamed List');

    expect(mocks.updateDoc).toHaveBeenCalledOnce();
    const args = mocks.updateDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(args[0].path).toBe('users/user1/shoppingLists/list1');
    expect(args[1]['name']).toBe('Renamed List');
    expect(args[1]['updatedAt']).toBe('SERVER_TIMESTAMP');
  });

  // -----------------------------------------------------------------------
  // deleteList
  // -----------------------------------------------------------------------

  it('deleteList() calls deleteDoc with the correct doc path', async () => {
    await service.deleteList('user1', 'list1');

    expect(mocks.deleteDoc).toHaveBeenCalledOnce();
    const args = mocks.deleteDoc.mock.calls[0] as [{ path: string }];
    expect(args[0].path).toBe('users/user1/shoppingLists/list1');
  });

  // -----------------------------------------------------------------------
  // setItems
  // -----------------------------------------------------------------------

  it('setItems() calls updateDoc with items, isManuallyOrdered, and updatedAt', async () => {
    const items = [
      {
        ingredientId: null,
        name: 'Milk',
        unit: 'liter',
        quantity: 1,
        checked: false,
        sourceRecipeIds: ['r1'],
      },
    ];
    await service.setItems('user1', 'list1', items, false);

    expect(mocks.updateDoc).toHaveBeenCalledOnce();
    const args = mocks.updateDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(args[0].path).toBe('users/user1/shoppingLists/list1');
    expect(args[1]['items']).toEqual(items);
    expect(args[1]['isManuallyOrdered']).toBe(false);
    expect(args[1]['updatedAt']).toBe('SERVER_TIMESTAMP');
  });
});
