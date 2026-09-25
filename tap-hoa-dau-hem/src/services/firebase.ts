type Module = Record<string, (...args: any[]) => any>;

const FIREBASE_VERSION = '12.19.0';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;

export interface FirebaseServices {
  app: any;
  auth: any;
  db: any;
  appSdk: Module;
  authSdk: Module;
  firestoreSdk: Module;
}

let services: Promise<FirebaseServices> | null = null;

export function cloudSaveEnabled(): boolean {
  return env.VITE_CLOUD_SAVE !== 'off' && env.VITE_CLOUD_SAVE !== 'false' && firebaseConfigured();
}

export function firebaseConfigured(): boolean {
  return Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_APP_ID);
}

export async function getFirebase(): Promise<FirebaseServices> {
  if (!cloudSaveEnabled()) throw new Error('Đồng bộ cloud hiện đang tắt.');
  if (!firebaseConfigured()) throw new Error('Chưa cấu hình Firebase cho bản game này.');
  if (!services) {
    services = Promise.all([
      import(/* @vite-ignore */ `${CDN}/firebase-app.js`),
      import(/* @vite-ignore */ `${CDN}/firebase-auth.js`),
      import(/* @vite-ignore */ `${CDN}/firebase-firestore.js`),
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
      return {
        app,
        auth: authSdk.initializeAuth(app, { persistence: authSdk.browserLocalPersistence }),
        db: firestoreSdk.getFirestore(app),
        appSdk,
        authSdk,
        firestoreSdk,
      };
    }).catch((error) => {
      services = null;
      throw error;
    });
  }
  return services;
}

export function hasAuthHint(): boolean {
  try {
    return localStorage.getItem('thdh.auth.hint') === 'google';
  } catch {
    return false;
  }
}

export function setAuthHint(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem('thdh.auth.hint', 'google');
    else localStorage.removeItem('thdh.auth.hint');
  } catch {
    // Private browsing may deny localStorage; sign-in still works for this session.
  }
}

export const firebaseSdkCdn = CDN;
