import { inject, Injectable } from '@angular/core';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase.providers';
import { UserProfile } from '../models/user-profile.model';

/**
 * Reads and writes user profile documents under `users/{userId}`.
 */
@Injectable({ providedIn: 'root' })
export class UserProfileService {
  private readonly firestore = inject(FIRESTORE);
  private readonly usersCollection = collection(this.firestore, 'users');

  /**
   * Create the signed-in user's profile on first sign-in (preserving `createdAt`
   * across logins), and backfill `email` for profiles created before it was tracked.
   */
  async ensureProfile(user: User): Promise<void> {
    const reference = doc(this.firestore, 'users', user.uid);
    const snapshot = await getDoc(reference);
    const email = user.email?.toLowerCase() ?? null;
    if (!snapshot.exists()) {
      await setDoc(reference, {
        userId: user.uid,
        displayName: user.displayName ?? '',
        email,
        photoUrl: user.photoURL ?? null,
        phoneNumber: user.phoneNumber ?? null,
        createdAt: serverTimestamp(),
      });
      return;
    }
    if (email && !snapshot.data()['email']) {
      await updateDoc(reference, { email });
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const snapshot = await getDoc(doc(this.firestore, 'users', userId));
    return snapshot.exists() ? toProfile(snapshot.id, snapshot.data()) : null;
  }

  /** Find a user by email (case-insensitive). Used to pick share recipients. */
  async findByEmail(email: string): Promise<UserProfile | null> {
    const lookup = query(this.usersCollection, where('email', '==', email.trim().toLowerCase()), limit(1));
    const snapshot = await getDocs(lookup);
    const document = snapshot.docs[0];
    return document ? toProfile(document.id, document.data()) : null;
  }
}

function toProfile(userId: string, data: DocumentData): UserProfile {
  return {
    userId,
    displayName: data['displayName'] ?? '',
    email: data['email'] ?? null,
    photoUrl: data['photoUrl'] ?? null,
    phoneNumber: data['phoneNumber'] ?? null,
    createdAt: data['createdAt'] instanceof Timestamp ? data['createdAt'].toDate() : new Date(),
  };
}
