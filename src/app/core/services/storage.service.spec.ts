import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FIREBASE_STORAGE } from '../firebase/firebase.providers';
import { StorageService } from './storage.service';

// ---------------------------------------------------------------------------
// firebase/storage module mock
// ---------------------------------------------------------------------------
// vi.hoisted() creates the stub container before vi.mock() hoisting so the
// factory can safely close over `storageMocks` at module-eval time.

const storageMocks = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteObject: vi.fn<any>(() => Promise.resolve()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBytes: vi.fn<any>(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadBytes: vi.fn<any>(() => Promise.resolve({ ref: { fullPath: 'uploaded/path' } })),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDownloadURL: vi.fn<any>(() => Promise.resolve('https://example.com/photo.jpg')),
}));

// Track refs created by ref() so tests can assert the correct path was used.
const createdRefs: { path: string }[] = [];

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage: unknown, path: string) => {
    const fakeRef = { path, fullPath: path };
    createdRefs.push(fakeRef);
    return fakeRef;
  }),
  deleteObject: (...args: unknown[]) => (storageMocks.deleteObject as Function)(...args),
  getBytes: (...args: unknown[]) => (storageMocks.getBytes as Function)(...args),
  uploadBytes: (...args: unknown[]) => (storageMocks.uploadBytes as Function)(...args),
  getDownloadURL: (...args: unknown[]) => (storageMocks.getDownloadURL as Function)(...args),
}));

// ---------------------------------------------------------------------------
// firebase/app mock — FirebaseError must be a real class so `instanceof` works.
// We provide a minimal implementation that won't interfere with isolate: true.
// ---------------------------------------------------------------------------
vi.mock('firebase/app', () => {
  class FirebaseError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = 'FirebaseError';
      this.code = code;
    }
  }
  return { FirebaseError };
});

// Re-import AFTER mocks so the service picks up the stubs.
import { FirebaseError } from 'firebase/app';

// ---------------------------------------------------------------------------
// StorageService — unit tests
// ---------------------------------------------------------------------------

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    createdRefs.length = 0;
    TestBed.configureTestingModule({
      providers: [
        StorageService,
        { provide: FIREBASE_STORAGE, useValue: {} },
      ],
    });
    service = TestBed.inject(StorageService);
  });

  // -------------------------------------------------------------------------
  // deleteCoverPhoto
  // -------------------------------------------------------------------------

  describe('deleteCoverPhoto', () => {
    it('calls deleteObject with a ref built from the given path', async () => {
      await service.deleteCoverPhoto('recipe-photos/user1/photo.jpg');

      expect(storageMocks.deleteObject).toHaveBeenCalledOnce();
      const [passedRef] = storageMocks.deleteObject.mock.calls[0] as [{ path: string }];
      expect(passedRef.path).toBe('recipe-photos/user1/photo.jpg');
    });

    it('is a no-op when path is null', async () => {
      await service.deleteCoverPhoto(null);
      expect(storageMocks.deleteObject).not.toHaveBeenCalled();
    });

    it('is a no-op when path is empty string', async () => {
      await service.deleteCoverPhoto('');
      expect(storageMocks.deleteObject).not.toHaveBeenCalled();
    });

    it('resolves silently when storage/object-not-found is thrown', async () => {
      storageMocks.deleteObject.mockRejectedValueOnce(new FirebaseError('storage/object-not-found', 'not found'));

      await expect(service.deleteCoverPhoto('recipe-photos/user1/photo.jpg')).resolves.toBeUndefined();
    });

    it('re-throws errors that are not storage/object-not-found', async () => {
      const networkError = new FirebaseError('storage/unknown', 'network error');
      storageMocks.deleteObject.mockRejectedValueOnce(networkError);

      await expect(service.deleteCoverPhoto('recipe-photos/user1/photo.jpg')).rejects.toThrow('network error');
    });

    it('re-throws non-FirebaseError errors', async () => {
      const genericError = new Error('something went wrong');
      storageMocks.deleteObject.mockRejectedValueOnce(genericError);

      await expect(service.deleteCoverPhoto('recipe-photos/user1/photo.jpg')).rejects.toThrow('something went wrong');
    });
  });

  // -------------------------------------------------------------------------
  // copyCoverPhoto
  // -------------------------------------------------------------------------

  describe('copyCoverPhoto', () => {
    it('reads the source bytes and uploads to a new owner-prefixed path', async () => {
      const result = await service.copyCoverPhoto('recipe-photos/ownerA/photo.jpg', 'ownerB');

      expect(storageMocks.getBytes).toHaveBeenCalledOnce();
      const [sourceRef] = storageMocks.getBytes.mock.calls[0] as [{ path: string }];
      expect(sourceRef.path).toBe('recipe-photos/ownerA/photo.jpg');

      expect(storageMocks.uploadBytes).toHaveBeenCalledOnce();
      const [destRef] = storageMocks.uploadBytes.mock.calls[0] as [{ path: string }];
      expect(destRef.path).toMatch(/^recipe-photos\/ownerB\/.+\.jpg$/);

      // Returned path must match what was uploaded to
      expect(result).toBe(destRef.path);
    });

    it('returns null and does not throw when getBytes fails (source missing)', async () => {
      storageMocks.getBytes.mockRejectedValueOnce(new FirebaseError('storage/object-not-found', 'not found'));

      const result = await service.copyCoverPhoto('recipe-photos/ownerA/photo.jpg', 'ownerB');

      expect(result).toBeNull();
      expect(storageMocks.uploadBytes).not.toHaveBeenCalled();
    });

    it('returns null and does not throw when uploadBytes fails', async () => {
      storageMocks.uploadBytes.mockRejectedValueOnce(new Error('upload failed'));

      const result = await service.copyCoverPhoto('recipe-photos/ownerA/photo.jpg', 'ownerB');

      expect(result).toBeNull();
    });

    it('preserves the file extension from the source path in the destination path', async () => {
      const result = await service.copyCoverPhoto('recipe-photos/ownerA/photo.png', 'ownerB');

      expect(result).toMatch(/\.png$/);
    });
  });
});
