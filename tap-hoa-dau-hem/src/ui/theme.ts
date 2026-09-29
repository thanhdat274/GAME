import Phaser from 'phaser';
import { gameDimensionsForViewport } from './layout';

export interface GameDimensions { width: number; height: number }

/** Logical canvas base chosen from the safe-area-adjusted #game box. */
export function computeGameDimensions(): GameDimensions {
  if (typeof process !== 'undefined' && (process.env?.VITEST || process.env?.NODE_ENV === 'test')) return { width: 360, height: 640 };
  if (typeof window === 'undefined') return { width: 360, height: 640 };
  const gameEl = typeof document !== 'undefined' ? document.getElementById('game') : null;
  const rect = gameEl?.getBoundingClientRect();
  const w = (gameEl?.clientWidth && gameEl.clientWidth > 0) ? gameEl.clientWidth : (rect?.width || window.innerWidth);
  const h = (gameEl?.clientHeight && gameEl.clientHeight > 0) ? gameEl.clientHeight : (rect?.height || window.innerHeight);
  if (!w || !h) return { width: 360, height: 640 };
  return gameDimensionsForViewport(w, h);
}

/** Compatibility helper for callers that only need the height. */
export function computeGameHeight(): number { return computeGameDimensions().height; }

const initialDimensions = computeGameDimensions();
export let W = initialDimensions.width;
export let H = initialDimensions.height;

/** The one mutation point for logical canvas dimensions; ES module imports stay live. */
export function setGameSize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 320 || height < 320) return;
  W = Math.round(width);
  H = Math.round(height);
}
// Keep a fixed integer render scale: several pixel-art textures and UI badges use it for crisp sizing.
export const ZOOM = 2;

export const C = {
  bg: 0x2b1d14,
  hud: 0x3b2618,
  wall: 0xf6e3c4,
  wallLine: 0xe8cfa6,
  floorA: 0xc98b52,
  floorB: 0xb97a44,
  wood: 0x8b5a2b,
  woodDark: 0x6b4220,
  woodLight: 0xa86f3a,
  panel: 0xfff6e6,
  panelEdge: 0xe0c9a0,
  slot: 0xfdf3df,
  slotEdge: 0xd9bf94,
  red: 0xd84a3a,
  redDark: 0xa83226,
  green: 0x3aa35b,
  greenDark: 0x2a7a43,
  yellow: 0xf2b632,
  blue: 0x3b82c4,
  grey: 0x9e9e9e,
  ink: 0x3b2a1f,
  white: 0xffffff,
  cardBg: 0xfffcf7,
  cardBorder: 0xe5d2b7,
  stepperBg: 0xf3e8d5,
  badgeRed: 0xdd3827,
  accentGreen: 0x2e8b57,
};

export const HEX = {
  ink: '#3b2a1f',
  cream: '#f6e3c4',
  white: '#ffffff',
  red: '#d84a3a',
  green: '#2a7a43',
  yellow: '#f2b632',
  grey: '#8a7a6a',
  muted: '#7a6552',
  badgeRed: '#dd3827',
  accentGreen: '#2e8b57',
};

export const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Phaser text textures need enough pixels for their actual on-screen size, not the device DPR alone.
// On high-DPI phones, cap at 2x to reduce GPU texture memory and sampling cost across hundreds of labels.
const textResolutionOverride = (() => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('text-res');
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
})();

/** Đặt camera để hệ tọa độ luôn là 360x640 dù canvas thật lớn gấp đôi. */
export function setupCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(ZOOM).centerOn(W / 2, H / 2).setBackgroundColor(C.bg);
  setEdgeColors('#2b1d14');
}

/**
 * Màu nền đặc của hai dải tai thỏ / thanh Home (index.html) theo màn hiện tại.
 * Phải là màu đặc (không gradient): iOS 26 đọc màu này để tô thanh hệ thống thay vì làm mờ game.
 */
export function setEdgeColors(top: string, bottom = top): void {
  if (typeof document === 'undefined') return;
  const style = document.body.style;
  style.setProperty('--thdh-bg', top === bottom ? top : `linear-gradient(to bottom, ${top} 0%, ${top} 50%, ${bottom} 50%, ${bottom} 100%)`);
  style.setProperty('--thdh-edge-top', top);
  style.setProperty('--thdh-edge-bottom', bottom);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', top);
}

export interface TextOpts {
  size?: number;
  color?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
  origin?: [number, number];
  stroke?: string;
  emoji?: boolean;
}

/** Tạo chữ ở độ phân giải gần với kích thước hiển thị thực tế để tránh texture quá khổ. */
export function txt(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const canvas = scene.sys.game.canvas;
  const cssScale = canvas.clientWidth > 0 && canvas.width > 0 ? canvas.clientWidth / canvas.width : 1;
  const pixelRatio = window.devicePixelRatio || 1;
  const mobileViewport = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600;
  const maxResolution = mobileViewport && pixelRatio >= 2 ? 2 : 4;
  const resolution = textResolutionOverride ?? Phaser.Math.Clamp(Math.round(ZOOM * cssScale * pixelRatio), 1, maxResolution);
  const t = scene.add.text(x, y, text, {
    fontFamily: o.emoji ? EMOJI_FONT : FONT,
    fontSize: `${o.size ?? 14}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: o.color ?? HEX.ink,
    align: o.align ?? 'left',
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
    stroke: o.stroke,
    strokeThickness: o.stroke ? 3 : 0,
    resolution,
    padding: { top: 2, bottom: 2 },
  });
  const [ox, oy] = o.origin ?? [0, 0];
  t.setOrigin(ox, oy);
  return t;
}

export function emoji(scene: Phaser.Scene, x: number, y: number, ch: string, size: number): Phaser.GameObjects.Text {
  return txt(scene, x, y, ch, { size, emoji: true, origin: [0.5, 0.5] });
}
