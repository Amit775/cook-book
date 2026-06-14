import { inject, Injectable } from '@angular/core';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FIREBASE_STORAGE } from '../firebase/firebase.providers';

/**
 * Uploads and resolves recipe cover photos in Cloud Storage. Stateless — recipe
 * documents store the storage *path* (not the download URL); call `getPhotoUrl`
 * to resolve a path to a displayable URL.
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

  /** Resolve a storage path to a public download URL. */
  getPhotoUrl(path: string): Promise<string> {
    return getDownloadURL(ref(this.storage, path));
  }
}
