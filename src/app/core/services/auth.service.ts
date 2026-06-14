import { inject, Injectable } from '@angular/core';
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
 * Stateless wrapper around Firebase Authentication. Holds no UI state itself —
 * the current user/session state lives in `SessionStore`. Supported sign-in
 * methods: Google and Phone.
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

  /**
   * Begin phone sign-in. Sends an SMS to `phoneNumber` (E.164, e.g. +972501234567)
   * and resolves with a `ConfirmationResult` used to confirm the received code.
   * Requires a reCAPTCHA verifier (see `createRecaptchaVerifier`).
   */
  startPhoneSignIn(phoneNumber: string, verifier: RecaptchaVerifier): Promise<ConfirmationResult> {
    return signInWithPhoneNumber(this.auth, phoneNumber, verifier);
  }

  /** Confirm the SMS code for a pending phone sign-in, completing the sign-in. */
  confirmPhoneCode(confirmationResult: ConfirmationResult, code: string): Promise<void> {
    return confirmationResult.confirm(code).then(() => undefined);
  }

  /** Create an invisible reCAPTCHA verifier bound to the element with the given id. */
  createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
    return new RecaptchaVerifier(this.auth, containerId, { size: 'invisible' });
  }

  signOut(): Promise<void> {
    return signOut(this.auth);
  }
}
