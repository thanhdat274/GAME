import { describe, expect, it } from 'vitest';
import { chromeIntentUrl, isInAppBrowser } from '../src/services/inAppBrowser';

describe('trình duyệt trong ứng dụng', () => {
  it('nhận diện Facebook, Messenger, Zalo và Android WebView', () => {
    expect(isInAppBrowser('Mozilla/5.0 FBAN/FBIOS')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 Messenger/123')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 Zalo/24')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Linux; Android 14; wv)')).toBe(true);
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
});
