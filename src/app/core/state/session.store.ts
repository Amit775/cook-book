import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { User } from 'firebase/auth';

import { AuthService } from '../services/auth.service';
import { UserProfileService } from '../services/user-profile.service';

export type SessionStatus = 'initializing' | 'authenticated' | 'anonymous';

interface SessionState {
  user: User | null;
  status: SessionStatus;
}

const initialState: SessionState = {
  user: null,
  status: 'initializing',
};

/**
 * Global authentication/session state, backed by NgRx SignalStore. The single
 * source of truth for "who is signed in". Subscribes to Firebase auth changes on
 * init, ensures a profile document exists on sign-in, and delegates sign-out to
 * `AuthService`. Sign-in operations live on `AuthService` (called from the login
 * page); the signed-in user flows back here through the auth-state listener.
 */
export const SessionStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    isAuthenticated: computed(() => store.user() !== null),
    displayName: computed(() => store.user()?.displayName ?? null),
  })),
  withMethods(() => {
    const authService = inject(AuthService);
    return {
      signOut: () => authService.signOut(),
    };
  }),
  withHooks({
    onInit(store) {
      const authService = inject(AuthService);
      const userProfileService = inject(UserProfileService);
      authService.onAuthStateChanged((user) => {
        patchState(store, { user, status: user ? 'authenticated' : 'anonymous' });
        if (user) {
          userProfileService
            .ensureProfile(user)
            .catch((error) => console.error('[session] failed to ensure user profile:', error));
        }
      });
    },
  }),
);
