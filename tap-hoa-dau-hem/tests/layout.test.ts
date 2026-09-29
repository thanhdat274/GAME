import { describe, expect, it } from 'vitest';
import { effectiveViewMode, gameDimensionsForViewport, layoutFor, profileFor } from '../src/ui/layout';

describe('responsive presentation layout', () => {
  it('chooses a landscape logical canvas for desktop and rotated phones', () => {
    expect(gameDimensionsForViewport(1920, 1080)).toEqual({ width: 640, height: 360 });
    expect(gameDimensionsForViewport(812, 375)).toEqual({ width: 720, height: 360 });
    expect(gameDimensionsForViewport(375, 812)).toEqual({ width: 360, height: 780 });
  });

  it('classifies portrait, compact landscape, and wide landscape by usable viewport', () => {
    expect(profileFor(375, 812)).toBe('portrait');
    expect(profileFor(812, 375)).toBe('landscape-compact');
    expect(profileFor(1366, 768)).toBe('landscape-wide');
    expect(profileFor(667, 375)).toBe('landscape-compact');
  });

  it('selects effective view without changing the explicit setting', () => {
    expect(effectiveViewMode('landscape-wide', undefined, true)).toBe('side');
    expect(effectiveViewMode('landscape-wide', 'side', false)).toBe('side');
    expect(effectiveViewMode('landscape-wide', 'topdown', false)).toBe('topdown');
    expect(effectiveViewMode('landscape-wide', undefined, false)).toBe('topdown');
    expect(effectiveViewMode('portrait', undefined, false)).toBe('side');
  });

  it('reserves a rail only when the landscape viewport can support one', () => {
    const compact = layoutFor(667, 375, { top: 12, right: 0, bottom: 8, left: 0 });
    const wide = layoutFor(1366, 768);
    expect(compact.rail.width).toBe(0);
    expect(wide.rail.width).toBeGreaterThan(0);
    expect(wide.playfield.x + wide.playfield.width).toBe(wide.rail.x);
    expect(compact.safeArea.top).toBe(12);
  });

  it('calculates balanced 2-column widths and margins in landscape mode', () => {
    const landscapeW = 640;
    const colW = Math.floor((landscapeW - 24) / 2);
    expect(colW).toBe(308);
    // Left column ends before right column begins
    const col0Right = 8 + colW;
    const col1Left = 8 + colW + 8;
    expect(col1Left).toBeGreaterThan(col0Right);
    expect(col1Left + colW).toBeLessThanOrEqual(landscapeW - 8);
  });
});

