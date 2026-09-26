import { getFirebase, hasAuthHint, setAuthHint } from './firebase';
import { isInAppBrowser, prefersRedirect } from './inAppBrowser';

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
  provider.setCustomParameters?.({ prompt: 'select_account' });
  if (prefersRedirect(navigator.userAgent, navigator.maxTouchPoints)) {
    setAuthHint(true);
    try {
      await authSdk.signInWithRedirect(auth, provider);
    } catch (error) {
      setAuthHint(false);
      throw error;
    }
    return 'redirect';
  }
  await authSdk.signInWithPopup(auth, provider);
  setAuthHint(true);
  return 'popup';
}

export function googleSignInErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Bạn đã hủy đăng nhập. Tiến trình vẫn được lưu trên máy.';
  if (code === 'auth/popup-blocked') return 'Trình duyệt đã chặn cửa sổ Google. Hãy cho phép cửa sổ bật lên rồi thử lại.';
  if (code === 'auth/unauthorized-domain') return 'Tên miền này chưa được thêm vào Authorized domains trong Firebase Authentication.';
  if (code === 'auth/network-request-failed') return 'Không kết nối được Google. Kiểm tra mạng rồi thử lại.';
  return error instanceof Error ? error.message : 'Có lỗi khi đăng nhập Google.';
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
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      action();
    };
    const detach = authSdk.onAuthStateChanged(auth, (user: any) => {
      finish(() => resolve(user ? toAccountUser(user) : null));
    }, (error: unknown) => finish(() => reject(error)));
    unsubscribe = detach;
    // Firebase calls the observer asynchronously, but keep this safe for SDK
    // adapters and tests that may resolve the initial auth state synchronously.
    if (settled) detach();
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
