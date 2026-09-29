export type DisplayOrientation = 'landscape';

/** Thiết kế hiện tại chỉ hỗ trợ viewport ngang. */
export function applyLandscapeViewport(): void {
  if (typeof document === 'undefined') return;
  const landscape = window.innerWidth > window.innerHeight;
  document.body.dataset.virtualOrientation = landscape ? 'auto' : 'landscape';
}

export function displayOrientation(): DisplayOrientation {
  return 'landscape';
}

/** Rotate the game viewport when the device orientation is locked. No GameState change. */
export function applyDisplayOrientation(): void {
  if (typeof document === 'undefined') return;
  const landscape = window.innerWidth > window.innerHeight;
  document.body.dataset.virtualOrientation = landscape ? 'auto' : 'landscape';
}

export function setDisplayOrientation(value: DisplayOrientation): void {
  void value;
  applyDisplayOrientation();
  window.dispatchEvent(new Event('thdh-display-orientation'));
}

export function effectiveDisplayLandscape(): boolean {
  return true;
}
