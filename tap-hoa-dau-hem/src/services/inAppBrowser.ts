const IN_APP_MARKERS = ['FBAN', 'FBAV', 'FB_IAB', 'Messenger', 'Instagram', 'Zalo', 'TikTok', 'musical_ly', 'Line', '; wv)'];

export function isInAppBrowser(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  const ua = userAgent.toLowerCase();
  return IN_APP_MARKERS.some((marker) => ua.includes(marker.toLowerCase()));
}

export function chromeIntentUrl(
  href = typeof location === 'undefined' ? '' : location.href,
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): string | null {
  if (!href.startsWith('https://') || !/android/i.test(userAgent)) return null;
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;end`;
}
