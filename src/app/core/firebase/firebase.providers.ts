import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, FirebaseOptions, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

/**
 * DI tokens for the initialized Firebase services. Inject these in services
 * instead of reaching for the global Firebase singletons, so the dependency is
 * explicit and easy to replace in tests.
 */
export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('FIREBASE_STORAGE');

/**
 * Initialize Firebase once and expose its Auth, Firestore, and Storage handles
 * through DI. Call from the application config providers.
 */
export function provideFirebase(options: FirebaseOptions): EnvironmentProviders {
  const firebaseApp = initializeApp(options);
  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useValue: firebaseApp },
    { provide: FIREBASE_AUTH, useValue: getAuth(firebaseApp) },
    { provide: FIRESTORE, useValue: getFirestore(firebaseApp) },
    { provide: FIREBASE_STORAGE, useValue: getStorage(firebaseApp) },
  ]);
}
