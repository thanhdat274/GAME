import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  getFirebase: vi.fn(),
  setAuthHint: vi.fn(),
  hasAuthHint: vi.fn(() => false),
}));

vi.mock('../src/services/firebase', () => firebase);

import { currentAccount, deleteCurrentAccount, finishRedirectSignIn, googleSignInErrorMessage, signInWithGoogle, signOutGoogle } from '../src/services/auth';

describe('đăng nhập Google và quản lý tài khoản', () => {
  const user = {
    uid: 'user-1', displayName: 'Người chơi', photoURL: 'https://example.test/avatar.png', email: 'player@example.test',
    metadata: { lastSignInTime: new Date().toISOString() },
  };
  const auth = { currentUser: user };
  const signInWithPopup = vi.fn(async () => ({ user }));
  const signInWithRedirect = vi.fn(async () => undefined);
  const signOut = vi.fn(async () => undefined);
  const deleteUser = vi.fn(async () => undefined);
  const reauthenticateWithPopup = vi.fn(async () => undefined);
  const getRedirectResult = vi.fn(async () => ({ user }));
  const deleteDoc = vi.fn(async () => undefined);
  const doc = vi.fn((...segments: string[]) => ({ path: segments.join('/') }));

  beforeEach(() => {
    vi.clearAllMocks();
    firebase.hasAuthHint.mockReturnValue(false);
    firebase.getFirebase.mockResolvedValue({
      auth,
      db: {},
      authSdk: { GoogleAuthProvider: class {}, signInWithPopup, signInWithRedirect, signOut, deleteUser, reauthenticateWithPopup, getRedirectResult },
      firestoreSdk: { doc, deleteDoc },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('desktop cảm ứng dùng popup', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', maxTouchPoints: 10 });
    expect(await signInWithGoogle()).toBe('popup');
    expect(signInWithPopup).toHaveBeenCalledOnce();
    expect(signInWithRedirect).not.toHaveBeenCalled();
    expect(firebase.setAuthHint).toHaveBeenCalledWith(true);
  });

  it('điện thoại dùng redirect và đặt cờ trước khi rời trang', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1', maxTouchPoints: 5 });
    expect(await signInWithGoogle()).toBe('redirect');
    expect(firebase.setAuthHint).toHaveBeenNthCalledWith(1, true);
    expect(signInWithRedirect).toHaveBeenCalledOnce();
    expect(signInWithPopup).not.toHaveBeenCalled();
  });

  it('gỡ cờ đăng nhập nếu redirect bị lỗi', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1', maxTouchPoints: 5 });
    signInWithRedirect.mockRejectedValueOnce(new Error('redirect failed'));
    await expect(signInWithGoogle()).rejects.toThrow('redirect failed');
    expect(firebase.setAuthHint).toHaveBeenNthCalledWith(1, true);
    expect(firebase.setAuthHint).toHaveBeenNthCalledWith(2, false);
  });

  it('trình duyệt nhúng bị chặn trước khi tải Firebase', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 FBAN/FBIOS', maxTouchPoints: 5 });
    await expect(signInWithGoogle()).rejects.toThrow('Chrome hoặc Safari');
    expect(firebase.getFirebase).not.toHaveBeenCalled();
  });

  it('hiển thị hướng xử lý rõ ràng khi hủy, bị chặn popup hoặc domain chưa được cấp quyền', () => {
    expect(googleSignInErrorMessage({ code: 'auth/popup-closed-by-user' })).toContain('đã hủy');
    expect(googleSignInErrorMessage({ code: 'auth/popup-blocked' })).toContain('cho phép cửa sổ bật lên');
    expect(googleSignInErrorMessage({ code: 'auth/unauthorized-domain' })).toContain('Authorized domains');
  });

  it('hoàn tất redirect và chuẩn hóa hồ sơ Google', async () => {
    firebase.hasAuthHint.mockReturnValue(true);
    const result = await finishRedirectSignIn();
    expect(result).toEqual({ uid: 'user-1', displayName: 'Người chơi', photoURL: 'https://example.test/avatar.png', email: 'player@example.test' });
    expect(getRedirectResult).toHaveBeenCalledWith(auth);
    expect(firebase.setAuthHint).toHaveBeenCalledWith(true);
  });

  it('không tải Firebase nếu chưa từng bật đăng nhập', async () => {
    expect(await finishRedirectSignIn()).toBeNull();
    expect(await currentAccount()).toBeNull();
    expect(firebase.getFirebase).not.toHaveBeenCalled();
  });

  it('đọc tài khoản ban đầu một lần rồi tháo listener', async () => {
    firebase.hasAuthHint.mockReturnValue(true);
    let notify!: (value: typeof user) => void;
    const unsubscribe = vi.fn();
    const onAuthStateChanged = vi.fn((_auth: unknown, callback: (value: typeof user) => void) => {
      notify = callback;
      return unsubscribe;
    });
    firebase.getFirebase.mockResolvedValue({ auth, authSdk: { onAuthStateChanged } });
    const pending = currentAccount();
    await Promise.resolve();
    notify(user);
    expect(await pending).toMatchObject({ uid: 'user-1', displayName: 'Người chơi' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('trả lỗi observer và tháo listener', async () => {
    firebase.hasAuthHint.mockReturnValue(true);
    const unsubscribe = vi.fn();
    const onAuthStateChanged = vi.fn((_auth: unknown, _callback: unknown, onError: (error: Error) => void) => {
      queueMicrotask(() => onError(new Error('auth observer failed')));
      return unsubscribe;
    });
    firebase.getFirebase.mockResolvedValue({ auth, authSdk: { onAuthStateChanged } });
    await expect(currentAccount()).rejects.toThrow('auth observer failed');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('đăng xuất rồi xóa cờ đăng nhập', async () => {
    await signOutGoogle();
    expect(signOut).toHaveBeenCalledWith(auth);
    expect(firebase.setAuthHint).toHaveBeenCalledWith(false);
  });

  it('xóa save, server clock và tài khoản sau khi đăng nhập gần đây', async () => {
    await deleteCurrentAccount();
    expect(doc).toHaveBeenNthCalledWith(1, {}, 'users', 'user-1', 'saves', 'main');
    expect(doc).toHaveBeenNthCalledWith(2, {}, 'users', 'user-1', 'meta', 'clock');
    expect(deleteDoc).toHaveBeenCalledTimes(2);
    expect(deleteUser).toHaveBeenCalledWith(user);
    expect(firebase.setAuthHint).toHaveBeenCalledWith(false);
  });

  it('yêu cầu Google xác thực lại nếu phiên đăng nhập đã cũ', async () => {
    const oldUser = { ...user, metadata: { lastSignInTime: '2020-01-01T00:00:00.000Z' } };
    firebase.getFirebase.mockResolvedValue({
      auth: { currentUser: oldUser },
      db: {},
      authSdk: { GoogleAuthProvider: class {}, reauthenticateWithPopup, deleteUser },
      firestoreSdk: { doc, deleteDoc },
    });
    await deleteCurrentAccount();
    expect(reauthenticateWithPopup).toHaveBeenCalledWith(oldUser, expect.anything());
    expect(deleteUser).toHaveBeenCalledWith(oldUser);
  });
});
