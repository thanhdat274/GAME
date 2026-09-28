import { describe, expect, it } from 'vitest';
import { resolveAuthDomain } from '../src/services/firebase';

describe('authDomain cho đăng nhập redirect', () => {
  it('domain có proxy /__/auth dùng chính nó, bỏ qua firebaseapp.com trong env', () => {
    expect(resolveAuthDomain('tap-hoa-dau-hem.vercel.app', 'tap-hoa-dau-hem.firebaseapp.com')).toBe('tap-hoa-dau-hem.vercel.app');
  });

  it('localhost và domain khác dùng authDomain cấu hình', () => {
    expect(resolveAuthDomain('localhost', 'tap-hoa-dau-hem.firebaseapp.com')).toBe('tap-hoa-dau-hem.firebaseapp.com');
    expect(resolveAuthDomain('cong-game.example', 'tap-hoa-dau-hem.firebaseapp.com')).toBe('tap-hoa-dau-hem.firebaseapp.com');
  });

  it('danh sách proxy lấy từ env, không cấu hình thì dùng hostname', () => {
    expect(resolveAuthDomain('game.example', 'x.firebaseapp.com', 'a.example, game.example')).toBe('game.example');
    expect(resolveAuthDomain('game.example', '')).toBe('game.example');
  });
});
