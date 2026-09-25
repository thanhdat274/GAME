import { getFirebase, hasAuthHint, setAuthHint } from './firebase';
import { isInAppBrowser } from './inAppBrowser';

export interface AccountUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}

export async function signInWithGoogle(): Promise<'redirect' | 'popup'> {
  if (isInAppBrowser()) throw new Error('Google không cho đăng nhập trong trình duyệt này. Hãy mở game bằng Chrome hoặc Safari.');
  const { auth, authSdk } = await getFirebase();
  const Provider = authSdk.GoogleAuthProvider as unknown as new () => any;
  const provider = new Provider();
  if (matchMedia('(pointer: coarse)').matches) {
    setAuthHint(true);
    await authSdk.signInWithRedirect(auth, provider);
    return 'redirect';
  }
  await authSdk.signInWithPopup(auth, provider);
  setAuthHint(true);
  return 'popup';
}

export async function finishRedirectSignIn(): Promise<AccountUser | null> {
  if (!hasAuthHint()) return null;
  const { auth, authSdk } = await getFirebase();
  const result = await authSdk.getRedirectResult(auth);
  if (result?.user) setAuthHint(true);
  return result?.user ? toAccountUser(result.user) : null;
}

export async function currentAccount(): Promise<AccountUser | null> {
  if (!hasAuthHint()) return null;
  const { auth, authSdk } = await getFirebase();
  return new Promise((resolve, reject) => {
    const unsubscribe = authSdk.onAuthStateChanged(auth, (user: any) => {
      unsubscribe();
      resolve(user ? toAccountUser(user) : null);
    }, reject);
  });
}

export async function signOutGoogle(): Promise<void> {
  const { auth, authSdk } = await getFirebase();
  await authSdk.signOut(auth);
  setAuthHint(false);
}

export async function deleteCurrentAccount(): Promise<void> {
  const { auth, authSdk, db, firestoreSdk } = await getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn chưa đăng nhập.');
  const lastSignIn = Date.parse(user.metadata?.lastSignInTime ?? '');
  if (!Number.isFinite(lastSignIn) || Date.now() - lastSignIn > 4 * 60_000) {
    const Provider = authSdk.GoogleAuthProvider as unknown as new () => any;
    await authSdk.reauthenticateWithPopup(user, new Provider());
  }
  const save = firestoreSdk.doc(db, 'users', user.uid, 'saves', 'main');
  await firestoreSdk.deleteDoc(save);
  const meta = firestoreSdk.doc(db, 'users', user.uid, 'meta', 'clock');
  await firestoreSdk.deleteDoc(meta);
  await authSdk.deleteUser(user);
  setAuthHint(false);
}

function toAccountUser(user: any): AccountUser {
  return { uid: user.uid, displayName: user.displayName ?? null, photoURL: user.photoURL ?? null, email: user.email ?? null };
}
