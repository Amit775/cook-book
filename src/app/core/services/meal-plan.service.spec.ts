import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIRESTORE } from '../firebase/firebase.providers';
import { MealPlanService } from './meal-plan.service';

// ---------------------------------------------------------------------------
// Firestore SDK module mock — mirrors shopping-list.service.spec.ts pattern
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteDoc: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDoc: vi.fn<any>(() => Promise.resolve({ exists: () => false })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serverTimestamp: vi.fn<any>(() => 'SERVER_TIMESTAMP'),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_firestoreOrCollection: unknown, ...segments: string[]) => {
    const allSegments = (segments as string[]).filter((segment) => segment !== undefined);
    const path = allSegments.join('/');
    const id = allSegments[allSegments.length - 1] ?? 'auto-id';
    return { id, path };
  }),
  getDoc: (...args: unknown[]) => (mocks.getDoc as Function)(...args),
  setDoc: (...args: unknown[]) => (mocks.setDoc as Function)(...args),
  deleteDoc: (...args: unknown[]) => (mocks.deleteDoc as Function)(...args),
  serverTimestamp: () => (mocks.serverTimestamp as Function)(),
}));

// ---------------------------------------------------------------------------
// MealPlanService tests
// ---------------------------------------------------------------------------

describe('MealPlanService', () => {
  let service: MealPlanService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        MealPlanService,
        { provide: FIRESTORE, useValue: {} },
      ],
    });
    service = TestBed.inject(MealPlanService);
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // getMealPlan
  // -----------------------------------------------------------------------

  it('getMealPlan() returns null when the document does not exist', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
    const result = await service.getMealPlan('user1', '2024-06-16');
    expect(result).toBeNull();
  });

  it('getMealPlan() returns a mapped MealPlan when the document exists', async () => {
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: '2024-06-16',
      data: () => ({
        days: {
          '2024-06-16': [
            { recipeId: 'r1', title: 'Pasta', coverPhotoPath: null, type: 'meal', servings: 2 },
          ],
        },
        createdAt: null,
        updatedAt: null,
      }),
    });
    const result = await service.getMealPlan('user1', '2024-06-16');
    expect(result).not.toBeNull();
    expect(result!.weekStartDate).toBe('2024-06-16');
    expect(result!.days['2024-06-16']).toHaveLength(1);
    expect(result!.days['2024-06-16'][0].recipeId).toBe('r1');
  });

  it('getMealPlan() reads from the correct Firestore path', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
    await service.getMealPlan('user1', '2024-06-16');
    // doc() was called with FIRESTORE + path segments
    const { doc } = await import('firebase/firestore');
    expect(doc).toHaveBeenCalledWith({}, 'users', 'user1', 'mealPlans', '2024-06-16');
  });

  // -----------------------------------------------------------------------
  // setDays — new document
  // -----------------------------------------------------------------------

  it('setDays() writes days, updatedAt, and createdAt when document is new', async () => {
    // First getDoc (existence check) returns not exists
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });

    const days = {
      '2024-06-16': [{ recipeId: 'r1', title: 'Pasta', coverPhotoPath: null, type: 'meal' as const, servings: 2 }],
    };
    await service.setDays('user1', '2024-06-16', days);

    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const args = mocks.setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>, unknown];
    expect(args[0].path).toBe('users/user1/mealPlans/2024-06-16');
    expect(args[1]['days']).toEqual(days);
    expect(args[1]['updatedAt']).toBe('SERVER_TIMESTAMP');
    expect(args[1]['createdAt']).toBe('SERVER_TIMESTAMP');
    expect(args[2]).toEqual({ merge: true });
  });

  it('setDays() does NOT write createdAt when document already exists', async () => {
    // getDoc returns existing document
    mocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      id: '2024-06-16',
      data: () => ({ days: {}, createdAt: { toDate: () => new Date() }, updatedAt: { toDate: () => new Date() } }),
    });

    await service.setDays('user1', '2024-06-16', {});

    expect(mocks.setDoc).toHaveBeenCalledOnce();
    const args = mocks.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect('createdAt' in args[1]).toBe(false);
    expect(args[1]['updatedAt']).toBe('SERVER_TIMESTAMP');
  });

  it('setDays() writes to the correct Firestore path', async () => {
    mocks.getDoc.mockResolvedValueOnce({ exists: () => false });
    await service.setDays('user1', '2024-06-23', {});

    const args = mocks.setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(args[0].path).toBe('users/user1/mealPlans/2024-06-23');
  });

  // -----------------------------------------------------------------------
  // deleteMealPlan
  // -----------------------------------------------------------------------

  it('deleteMealPlan() calls deleteDoc with the correct path', async () => {
    await service.deleteMealPlan('user1', '2024-06-16');

    expect(mocks.deleteDoc).toHaveBeenCalledOnce();
    const args = mocks.deleteDoc.mock.calls[0] as [{ path: string }];
    expect(args[0].path).toBe('users/user1/mealPlans/2024-06-16');
  });
});
