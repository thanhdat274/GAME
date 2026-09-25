/** Trình duyệt nhúng trong app mà Google chặn đăng nhập (lỗi `disallowed_useragent`). */
const RULES: [RegExp, string][] = [
  [/Messenger|MessengerForiOS|\bOrca-Android\b/i, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/Zalo/i, 'Zalo'],
  [/TikTok|musical_ly|BytedanceWebview|trill_/i, 'TikTok'],
  [/\bLine\//i, 'Line'],
];

/** Trả về tên app nếu user agent là trình duyệt nhúng, ngược lại null. */
export function detectInAppBrowser(ua: string): string | null {
  for (const [re, name] of RULES) if (re.test(ua)) return name;
  // Android WebView đánh dấu "; wv)" trong user agent.
  if (/Android/i.test(ua) && /;\s*wv\)/.test(ua)) return 'ứng dụng này';
  return null;
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

/** Link intent mở trang hiện tại bằng Chrome trên Android. */
export function chromeIntentUrl(href: string): string {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;end`;
}

/** Điện thoại/máy tính bảng thì đăng nhập bằng redirect, máy tính dùng popup. */
export function prefersRedirect(ua: string, maxTouchPoints = 0): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS báo là Mac nhưng có màn cảm ứng.
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}
