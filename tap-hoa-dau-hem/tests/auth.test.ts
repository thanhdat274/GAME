import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebase = vi.hoisted(() => ({
  getFirebase: vi.fn(),
  setAuthHint: vi.fn(),
  hasAuthHint: vi.fn(() => false),
}));

vi.mock('../src/services/firebase', () => firebase);

import { signInWithGoogle } from '../src/services/auth';

describe('đăng nhập Google', () => {
  const auth = {};
  const signInWithPopup = vi.fn(async () => ({}));
  const signInWithRedirect = vi.fn(async () => ({}));

  beforeEach(() => {
    vi.clearAllMocks();
    firebase.getFirebase.mockResolvedValue({
      auth,
      authSdk: { GoogleAuthProvider: class {}, signInWithPopup, signInWithRedirect },
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

  it('điện thoại dùng redirect', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone) Safari/604.1', maxTouchPoints: 5 });
    expect(await signInWithGoogle()).toBe('redirect');
    expect(signInWithRedirect).toHaveBeenCalledOnce();
    expect(signInWithPopup).not.toHaveBeenCalled();
  });

  it('trình duyệt nhúng bị chặn trước khi tải Firebase', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 FBAN/FBIOS', maxTouchPoints: 5 });
    await expect(signInWithGoogle()).rejects.toThrow('Chrome hoặc Safari');
    expect(firebase.getFirebase).not.toHaveBeenCalled();
  });
});
