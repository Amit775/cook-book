import { FirebaseOptions } from 'firebase/app';

export const environment: { production: boolean; firebase: FirebaseOptions } = {
  production: false,
  // Same Firebase web config as production for now. If you create a separate
  // development Firebase project, put its config here instead.
  firebase: {
    apiKey: 'REPLACE_WITH_YOUR_FIREBASE_API_KEY',
    authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
    projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
    storageBucket: 'REPLACE_WITH_YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'REPLACE_WITH_YOUR_MESSAGING_SENDER_ID',
    appId: 'REPLACE_WITH_YOUR_APP_ID',
  },
};
