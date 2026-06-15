import { inject, Injectable } from '@angular/core';
import { User } from 'firebase/auth';
import { doc, DocumentData, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { UserProfile } from '../models/user-profile.model';

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

  /** Read a single profile, used to show who a recipe is shared with. */
  async getProfile(userId: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(doc(this.firestore, 'users', userId));
    return snapshot.exists() ? toProfile(snapshot.id, snapshot.data()) : null;
  }
}

function toProfile(userId: string, data: DocumentData): UserProfile {
  return {
    userId,
    displayName: data['displayName'] ?? '',
    photoUrl: data['photoUrl'] ?? null,
    phoneNumber: data['phoneNumber'] ?? null,
    createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : new Date(),
  };
}
