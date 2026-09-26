import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
export const AUTH_HINT_KEY = 'thdh.auth.hint';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  appSdk: typeof import('firebase/app');
  authSdk: typeof import('firebase/auth');
  firestoreSdk: typeof import('firebase/firestore');
}

let services: Promise<FirebaseServices> | null = null;

export function cloudSaveEnabled(): boolean {
  return env.VITE_CLOUD_SAVE !== 'off' && env.VITE_CLOUD_SAVE !== 'false' && firebaseConfigured();
}

export function firebaseConfigured(): boolean {
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

/** SDK is loaded only when cloud save is used. */
export async function getFirebase(): Promise<FirebaseServices> {
  if (!cloudSaveEnabled()) throw new Error('Đồng bộ cloud hiện đang tắt hoặc chưa cấu hình Firebase.');
  if (!services) {
    services = Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ]).then(([appSdk, authSdk, firestoreSdk]) => {
      const config = {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || window.location.hostname,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      };
      const app = appSdk.initializeApp(config);
      const auth = authSdk.initializeAuth(app, {
        persistence: authSdk.browserLocalPersistence,
        popupRedirectResolver: authSdk.browserPopupRedirectResolver,
      });
      const db = firestoreSdk.getFirestore(app);
      if (import.meta.env.DEV && env.VITE_USE_FIREBASE_EMULATORS === 'true') {
        authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        firestoreSdk.connectFirestoreEmulator(db, '127.0.0.1', 8080);
      }
      auth.languageCode = 'vi';
      return { app, auth, db, appSdk, authSdk, firestoreSdk };
    }).catch((error) => {
      services = null;
      throw error;
    });
  }
  return services;
}

export function hasAuthHint(): boolean {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === 'google';
  } catch {
    return false;
  }
}

export function setAuthHint(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(AUTH_HINT_KEY, 'google');
    else localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    // Private browsing may deny localStorage; sign-in still works for this session.
  }
}
