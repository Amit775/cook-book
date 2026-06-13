import { FirebaseOptions } from 'firebase/app';

export const environment: { production: boolean; firebase: FirebaseOptions } = {
  production: true,
  // Firebase web config is not secret — it is shipped to the client by design.
  // Security is enforced by Firestore/Storage rules + Auth, not by hiding these values.
  // Replace the placeholders below with the values from your Firebase project settings.
  firebase: {
    apiKey: 'REPLACE_WITH_YOUR_FIREBASE_API_KEY',
    authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
    projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
    storageBucket: 'REPLACE_WITH_YOUR_PROJECT.firebasestorage.app',
    messagingSenderId: 'REPLACE_WITH_YOUR_MESSAGING_SENDER_ID',
    appId: 'REPLACE_WITH_YOUR_APP_ID',
  },
};
