/** Presentation-only viewport profile and region helpers. No save/gameplay state lives here. */
export type LayoutProfile = 'portrait' | 'landscape-compact' | 'landscape-wide';
export type ViewMode = 'side' | 'topdown' | undefined;

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutDescriptor {
  profile: LayoutProfile;
  viewport: LayoutBounds;
  header: LayoutBounds;
  playfield: LayoutBounds;
  rail: LayoutBounds;
  drawer: LayoutBounds;
  shortcuts: LayoutBounds;
  safeArea: { top: number; right: number; bottom: number; left: number };
}

export function profileFor(width: number, height: number): LayoutProfile {
  return width < 900 || height < 420 ? 'landscape-compact' : 'landscape-wide';
}

/** Logical pixel-art canvas size that matches the usable viewport's orientation. */
export function gameDimensionsForViewport(width: number, height: number): { width: number; height: number } {
  const landscapeWidth = Math.max(width, height);
  const landscapeHeight = Math.min(width, height);
  return { width: landscapeWidth / Math.max(1, landscapeHeight) > 2 ? 720 : 640, height: 360 };
}

/** Pure D8 selection. A live session takes priority, followed by explicit player choice. */
export function effectiveViewMode(_profile: LayoutProfile, viewMode: ViewMode, isLive: boolean): Exclude<ViewMode, undefined> {
  if (isLive) return 'side';
  if (viewMode === 'side') return 'side';
  return 'topdown';
}

function cssSafeArea(): LayoutDescriptor['safeArea'] {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const safe = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  probe.remove();
  return safe;
}

/** Bounds are CSS pixels inside #game, after safe-area insets have been removed by index.html. */
export function layoutFor(width: number, height: number, safeArea = cssSafeArea()): LayoutDescriptor {
  const profile = profileFor(width, height);
  const viewport = { x: 0, y: 0, width, height };
  if (profile === 'portrait') {
    return {
      profile, viewport,
      header: { x: 0, y: 0, width, height: Math.min(72, height * 0.12) },
      playfield: { x: 0, y: 72, width, height: Math.max(0, height - 170) },
      rail: { x: 0, y: height - 98, width, height: 98 },
      drawer: { x: 0, y: 72, width, height: height - 170 },
      shortcuts: { x: 0, y: height - 56, width, height: 56 }, safeArea,
    };
  }
  const headerH = Math.min(54, height * 0.16);
  const shortcutsH = Math.min(58, height * 0.18);
  const railW = profile === 'landscape-wide' ? Math.min(260, width * 0.28) : 0;
  return {
    profile, viewport,
    header: { x: 0, y: 0, width, height: headerH },
    playfield: { x: 0, y: headerH, width: width - railW, height: Math.max(0, height - headerH - shortcutsH) },
    rail: { x: width - railW, y: headerH, width: railW, height: Math.max(0, height - headerH - shortcutsH) },
    drawer: { x: Math.max(0, width - Math.min(320, width * 0.72)), y: headerH, width: Math.min(320, width * 0.72), height: height - headerH - shortcutsH },
    shortcuts: { x: 0, y: height - shortcutsH, width, height: shortcutsH }, safeArea,
  };
}

export function currentLayout(root?: HTMLElement | null): LayoutDescriptor {
  const el = root ?? (typeof document === 'undefined' ? null : document.getElementById('game'));
  const rect = el?.getBoundingClientRect();
  const width = el?.clientWidth || rect?.width || (typeof window === 'undefined' ? 360 : window.innerWidth);
  const height = el?.clientHeight || rect?.height || (typeof window === 'undefined' ? 640 : window.innerHeight);
  return layoutFor(width, height);
}
