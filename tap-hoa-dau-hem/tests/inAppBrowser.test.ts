import { describe, expect, it } from 'vitest';
import { chromeIntentUrl, isInAppBrowser, prefersRedirect } from '../src/services/inAppBrowser';

describe('trình duyệt trong ứng dụng', () => {
  it('nhận diện các trình duyệt trong ứng dụng phổ biến', () => {
    for (const ua of [
      'Mozilla/5.0 FBAN/FBIOS',
      'Mozilla/5.0 FBAV/123',
      'Mozilla/5.0 FB_IAB/FB4A',
      'Mozilla/5.0 Messenger/123',
      'Mozilla/5.0 Instagram 333.0',
      'Mozilla/5.0 Zalo/24',
      'Mozilla/5.0 TikTok 38.0',
      'Mozilla/5.0 Line/14.0',
      'Mozilla/5.0 (Linux; Android 14; wv)',
    ]) expect(isInAppBrowser(ua), ua).toBe(true);
  });

  it('không chặn Safari và Chrome thường', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Safari/604.1')).toBe(false);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe(false);
  });

  it('chỉ tạo intent Chrome cho link HTTPS trên Android', () => {
    expect(chromeIntentUrl('https://example.com/game?day=3', 'Android 14')).toContain('intent://example.com/game?day=3#Intent;');
    expect(chromeIntentUrl('https://example.com/game', 'iPhone')).toBeNull();
    expect(chromeIntentUrl('http://example.com/game', 'Android 14')).toBeNull();
  });

  it('dùng redirect trên điện thoại, popup trên desktop kể cả màn hình cảm ứng', () => {
    expect(prefersRedirect('Mozilla/5.0 (iPhone) Safari/604.1')).toBe(true);
    expect(prefersRedirect('Mozilla/5.0 (Linux; Android 14) Chrome/120')).toBe(true);
    expect(prefersRedirect('Mozilla/5.0 (Windows NT 10.0) Chrome/120', 10)).toBe(false);
    expect(prefersRedirect('Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605.1', 5)).toBe(true);
  });
});
