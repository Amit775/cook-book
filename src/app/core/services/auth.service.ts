import { inject, Injectable } from '@angular/core';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';

/**
 * Stateless wrapper around Firebase Authentication. Holds no UI state itself —
 * the current user/session state lives in `SessionStore`. Sign-in is Google only.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);

  /** Subscribe to auth state changes. Returns the unsubscribe function. */
  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(this.auth, callback);
  }

  signInWithGoogle(): Promise<void> {
    return signInWithPopup(this.auth, new GoogleAuthProvider()).then(() => undefined);
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
