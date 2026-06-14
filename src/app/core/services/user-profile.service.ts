import { inject, Injectable } from '@angular/core';
import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';

/**
 * Reads and writes user profile documents under `users/{userId}`.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly firestore = inject(FIRESTORE);

  /**
   * Create the signed-in user's profile document on first sign-in. No-op if a
   * profile already exists, so `createdAt` is preserved across logins.
   */
  async ensureProfile(user: User): Promise<void> {
    const reference = doc(this.firestore, 'users', user.uid);
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) {
      return;
    }
    await setDoc(reference, {
      userId: user.uid,
      displayName: user.displayName ?? '',
      photoUrl: user.photoURL ?? null,
      phoneNumber: user.phoneNumber ?? null,
      createdAt: serverTimestamp(),
    });
  }
}
