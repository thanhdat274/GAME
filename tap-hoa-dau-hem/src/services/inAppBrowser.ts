/** Embedded browsers that Google blocks from signing in. */
const RULES: [RegExp, string][] = [
  [/Messenger|MessengerForiOS|\bOrca-Android\b/i, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/Zalo/i, 'Zalo'],
  [/TikTok|musical_ly|BytedanceWebview|trill_/i, 'TikTok'],
  [/\bLine\//i, 'Line'],
];

export function detectInAppBrowser(userAgent: string): string | null {
  for (const [rule, name] of RULES) if (rule.test(userAgent)) return name;
  if (/Android/i.test(userAgent) && /;\s*wv\)/i.test(userAgent)) return 'ứng dụng này';
  return null;
}

export function isInAppBrowser(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return detectInAppBrowser(userAgent) !== null;
}

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

export function prefersRedirect(userAgent: string, maxTouchPoints = 0): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function chromeIntentUrl(
  href = typeof location === 'undefined' ? '' : location.href,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): string | null {
  if (!href.startsWith('https://') || !isAndroid(userAgent)) return null;
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;end`;
}
