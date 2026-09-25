import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

/** Cờ localStorage: thiết bị này từng đăng nhập nên tự tải Firebase khi mở game. */
export const AUTH_HINT_KEY = 'thdh.auth.hint';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  // Nên đặt là domain của game (kèm rewrite /__/auth trong vercel.json) để redirect chạy trên Safari.
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

/** Lưu cloud bật khi có cấu hình Firebase và không bị tắt bằng `VITE_CLOUD_SAVE=off`. */
export function cloudEnabled(): boolean {
  return env.VITE_CLOUD_SAVE !== 'off' && !!config.apiKey && !!config.projectId && !!config.appId;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasAuthHint(): boolean {
  try {
    return storage()?.getItem(AUTH_HINT_KEY) === 'google';
  } catch {
    return false;
  }
}

export function setAuthHint(on: boolean): void {
  try {
    if (on) storage()?.setItem(AUTH_HINT_KEY, 'google');
    else storage()?.removeItem(AUTH_HINT_KEY);
  } catch {
    /* bỏ qua */
  }
}

export interface FirebaseKit {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  authMod: typeof import('firebase/auth');
  fsMod: typeof import('firebase/firestore');
}

let kit: Promise<FirebaseKit> | null = null;

/** Tải SDK Firebase bằng import() động: người chơi khách không tải gì cả. */
export function loadFirebase(): Promise<FirebaseKit> {
  if (!cloudEnabled()) return Promise.reject(new Error('Lưu cloud đang tắt'));
  kit ??= (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = appMod.initializeApp(config);
    const auth = authMod.initializeAuth(app, {
      persistence: authMod.browserLocalPersistence,
      popupRedirectResolver: authMod.browserPopupRedirectResolver,
    });
    auth.languageCode = 'vi';
    const db = fsMod.getFirestore(app);
    return { app, auth, db, authMod, fsMod };
  })();
  kit.catch(() => {
    kit = null;
  });
  return kit;
}
