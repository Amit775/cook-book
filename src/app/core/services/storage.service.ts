import { inject, Injectable } from '@angular/core';
import { FirebaseError } from 'firebase/app';
import { deleteObject, getBytes, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FIREBASE_STORAGE } from '../firebase/firebase.providers';

/**
 * Uploads, copies, deletes, and resolves recipe cover photos in Cloud Storage.
 * Stateless — recipe documents store the storage *path* (not the download URL);
 * call `getPhotoUrl` to resolve a path to a displayable URL.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly storage = inject(FIREBASE_STORAGE);

  /**
   * Upload a cover photo for `userId` and return its storage path. Files live
   * under `recipe-photos/{userId}/{uuid}.{extension}`, matching the Storage rules.
   */
  async uploadCoverPhoto(file: File, userId: string): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `recipe-photos/${userId}/${crypto.randomUUID()}.${extension}`;
    await uploadBytes(ref(this.storage, path), file);
    return path;
  }

  /**
   * Copy a cover photo from `sourcePath` to a new object owned by `ownerUserId`.
   * The new path lives under `recipe-photos/{ownerUserId}/{uuid}.{ext}` so the
   * clone fully owns its own Storage object and the parent's object can be
   * deleted independently. Returns the new path, or `null` if the source is
   * missing or unreadable (copy failures must not prevent the clone from being
   * created).
   */
  async copyCoverPhoto(sourcePath: string, ownerUserId: string): Promise<string | null> {
    try {
      const bytes = await getBytes(ref(this.storage, sourcePath));
      const extension = sourcePath.split('.').pop()?.toLowerCase() || 'jpg';
      const destinationPath = `recipe-photos/${ownerUserId}/${crypto.randomUUID()}.${extension}`;
      await uploadBytes(ref(this.storage, destinationPath), bytes);
      return destinationPath;
    } catch (error) {
      console.error('[StorageService] copyCoverPhoto failed — clone will have no cover:', error);
      return null;
    }
  }

  /**
   * Delete the Storage object at `path`. No-op when `path` is null/empty.
   * Silently resolves when the object is already gone (`storage/object-not-found`).
   * All other errors are re-thrown so callers can log them.
   */
  async deleteCoverPhoto(path: string | null): Promise<void> {
    if (!path) {
      return;
    }
    try {
      await deleteObject(ref(this.storage, path));
    } catch (error) {
      if (error instanceof FirebaseError && error.code === 'storage/object-not-found') {
        return; // already gone — treat as success
      }
      throw error;
    }
  }

  /** Resolve a storage path to a public download URL. */
  getPhotoUrl(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }
}
