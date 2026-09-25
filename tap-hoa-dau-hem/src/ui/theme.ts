import Phaser from 'phaser';

/** Kích thước logic của game; canvas thật gấp ZOOM lần để chữ sắc nét. */
export const W = 360;
export const H = 640;
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
};

export const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Đặt camera để hệ tọa độ luôn là 360x640 dù canvas thật lớn gấp đôi. */
export function setupCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(ZOOM).centerOn(W / 2, H / 2).setBackgroundColor(C.bg);
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

/** Tạo chữ với độ phân giải khớp camera zoom để không bị mờ. */
export function txt(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, {
    fontFamily: o.emoji ? EMOJI_FONT : FONT,
    fontSize: `${o.size ?? 14}px`,
    fontStyle: o.bold ? 'bold' : 'normal',
    color: o.color ?? HEX.ink,
    align: o.align ?? 'left',
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
    stroke: o.stroke,
    strokeThickness: o.stroke ? 3 : 0,
    resolution: ZOOM * Math.min(2, window.devicePixelRatio || 1),
    padding: { top: 2, bottom: 2 },
  });
  const [ox, oy] = o.origin ?? [0, 0];
  t.setOrigin(ox, oy);
  return t;
}

export function emoji(scene: Phaser.Scene, x: number, y: number, ch: string, size: number): Phaser.GameObjects.Text {
  return txt(scene, x, y, ch, { size, emoji: true, origin: [0.5, 0.5] });
}
