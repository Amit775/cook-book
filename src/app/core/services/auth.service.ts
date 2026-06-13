import { computed, inject, Injectable, signal } from '@angular/core';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';

/**
 * Wraps Firebase Authentication and exposes the current user as a signal.
 * Supported sign-in methods: Google and Phone.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);

  readonly currentUser = signal<User | null>(this.auth.currentUser);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  constructor() {
    onAuthStateChanged(this.auth, (user) => this.currentUser.set(user));
  }

  signInWithGoogle(): Promise<void> {
    return signInWithPopup(this.auth, new GoogleAuthProvider()).then(() => undefined);
  }

  /**
   * Begin phone sign-in. The returned `ConfirmationResult` is used to confirm
   * the SMS code the user receives. Requires a reCAPTCHA verifier (see
   * `createRecaptchaVerifier`). The full code-entry UI lands in Phase 1.
   */
  startPhoneSignIn(phoneNumber: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
    return signInWithPhoneNumber(this.auth, phoneNumber, verifier);
  }

  createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
    return new RecaptchaVerifier(this.auth, containerId, { size: 'invisible' });
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
