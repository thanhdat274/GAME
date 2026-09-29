import Phaser from 'phaser';

/** Khóa texture tileset phố; khớp `tilesets[0].name` trong cityMap.json ("city"). */
export const CITY_TILESET_KEY = 'city-tiles';
const T = 16;

type Ctx = CanvasRenderingContext2D;
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Tô một ô 16×16 từ mảng màu kèm rải điểm đốm theo vị trí (tất định, không dùng Math.random). */
function speckle(ctx: Ctx, ox: number, base: number, dots: number[], seed: number, count: number): void {
  ctx.fillStyle = hex(base);
  ctx.fillRect(ox, 0, T, T);
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    ctx.fillStyle = hex(dots[s % dots.length]);
    ctx.fillRect(ox + ((s >>> 8) % T), (s >>> 16) % T, 1, 1);
  }
}

const DRAW: Record<number, (ctx: Ctx, ox: number) => void> = {
  // 0 cỏ
  0: (c, o) => speckle(c, o, 0x6fbf4a, [0x5fae3d, 0x82cc5a, 0x58a038], 11, 14),
  // 1 cỏ 2 (đậm hơn, có cụm cỏ)
  1: (c, o) => {
    speckle(c, o, 0x65b344, [0x559f38, 0x78c452], 23, 10);
    c.fillStyle = hex(0x4d9632);
    for (const [x, y] of [[3, 10], [4, 9], [4, 11], [11, 4], [12, 3], [12, 5]]) c.fillRect(o + x, y, 1, 2);
  },
  // 2 hoa
  2: (c, o) => {
    speckle(c, o, 0x6fbf4a, [0x5fae3d, 0x82cc5a], 37, 8);
    for (const [x, y, col] of [[3, 4, 0xf7e15a], [10, 9, 0xf28ab0], [6, 12, 0xffffff]] as const) {
      c.fillStyle = hex(col); c.fillRect(o + x, y, 2, 2);
      c.fillStyle = hex(0xd9832a); c.fillRect(o + x, y, 1, 1);
    }
  },
  // 3 vỉa hè lát gạch
  3: (c, o) => {
    c.fillStyle = hex(0xd8c9a8); c.fillRect(o, 0, T, T);
    c.fillStyle = hex(0xc4b38f);
    c.fillRect(o, 7, T, 1); c.fillRect(o, 15, T, 1);
    c.fillRect(o + 3, 0, 1, 8); c.fillRect(o + 11, 8, 1, 8);
    c.fillStyle = hex(0xe6dabc); c.fillRect(o, 0, T, 1);
  },
  // 4 mặt đường
  4: (c, o) => {
    speckle(c, o, 0x6b6f76, [0x60646b, 0x777b82], 41, 16);
  },
  // 5 vạch đường
  5: (c, o) => {
    speckle(c, o, 0x6b6f76, [0x60646b, 0x777b82], 43, 16);
    c.fillStyle = hex(0xf2d060); c.fillRect(o, 0, T, 2);
  },
  // 6 nước
  6: (c, o) => {
    c.fillStyle = hex(0x4a90c8); c.fillRect(o, 0, T, T);
    c.fillStyle = hex(0x6fb0de);
    c.fillRect(o + 2, 4, 5, 1); c.fillRect(o + 9, 11, 5, 1);
    c.fillStyle = hex(0x3a78ac); c.fillRect(o + 8, 3, 4, 1); c.fillRect(o + 1, 12, 4, 1);
  },
  // 7 cây
  7: (c, o) => {
    c.fillStyle = hex(0x5a3a1e); c.fillRect(o + 7, 10, 3, 6);
    c.fillStyle = hex(0x2f7a32); c.fillRect(o + 2, 2, 12, 9); c.fillRect(o + 4, 0, 8, 2);
    c.fillStyle = hex(0x3f9a42); c.fillRect(o + 4, 3, 5, 4); c.fillRect(o + 8, 1, 4, 3);
    c.fillStyle = hex(0x246028); c.fillRect(o + 3, 9, 10, 2);
  },
  // 8 bụi
  8: (c, o) => {
    c.fillStyle = hex(0x2f8a3a); c.fillRect(o + 2, 6, 12, 8); c.fillRect(o + 4, 4, 8, 2);
    c.fillStyle = hex(0x45a852); c.fillRect(o + 4, 6, 5, 4);
    c.fillStyle = hex(0xe85a5a); c.fillRect(o + 10, 8, 2, 2); c.fillRect(o + 5, 11, 2, 2);
  },
  // 9 đèn đường
  9: (c, o) => {
    c.fillStyle = hex(0x3b3b44); c.fillRect(o + 7, 5, 2, 11);
    c.fillStyle = hex(0x2a2a30); c.fillRect(o + 5, 14, 6, 2);
    c.fillStyle = hex(0xf6e08a); c.fillRect(o + 5, 1, 6, 5);
    c.fillStyle = hex(0xfff6c8); c.fillRect(o + 6, 2, 3, 2);
    c.fillStyle = hex(0x3b3b44); c.fillRect(o + 4, 0, 8, 1);
  },
  // 10 lối đất
  10: (c, o) => {
    speckle(c, o, 0xb98d5a, [0xa77c4c, 0xc89e69, 0x9c7345], 53, 18);
  },
};

/** Tạo (một lần) dải tileset 11 ô 16×16 cho bản đồ phố; gid = chỉ số + 1. */
export function ensureCityTileset(scene: Phaser.Scene): string {
  if (scene.textures.exists(CITY_TILESET_KEY)) return CITY_TILESET_KEY;
  const tex = scene.textures.createCanvas(CITY_TILESET_KEY, T * 11, T);
  if (!tex) return CITY_TILESET_KEY;
  const ctx = tex.getContext();
  for (let i = 0; i < 11; i++) DRAW[i](ctx, i * T);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return CITY_TILESET_KEY;
}

/** Kiểu tòa nhà = `kind` của chi nhánh (hoặc `main`/`vacant`); kiểu lạ dùng bảng màu mặc định. */
export type BuildingKind = string;

/** Cửa sổ của một tòa nhà (px trong texture, góc trên-trái); dùng chung để vẽ tòa nhà và để ánh sáng ban đêm khớp vị trí. */
export function buildingWindows(wTiles: number, hTiles: number, doorCol: number): { x: number; y: number; w: number; h: number }[] {
  const w = wTiles * T;
  const roofH = Math.round(hTiles * T * 0.42);
  const dx = doorCol * T;
  const xs: number[] = [];
  const add = (x: number): void => { if (!(x < 6 || x + 10 > w - 6)) xs.push(x); };
  for (let x = dx - 20; x > 4; x -= 22) add(x);
  for (let x = dx + T + 10; x < w - 12; x += 22) add(x);
  return xs.map((x) => ({ x, y: roofH + 7, w: 10, h: 9 }));
}

/** Cửa ra vào (px trong texture) để đặt ánh sáng cửa. */
export function buildingDoor(hTiles: number, doorCol: number): { x: number; y: number; w: number; h: number } {
  const roofH = Math.round(hTiles * T * 0.42);
  return { x: doorCol * T + 2, y: roofH + 8, w: T - 4, h: hTiles * T - roofH - 10 };
}

/** Khóa texture hạt mưa (lát được, các vệt chéo xuống trái). */
export const RAIN_KEY = 'city-rain';

export function ensureRainTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(RAIN_KEY)) return RAIN_KEY;
  const size = 64;
  const tex = scene.textures.createCanvas(RAIN_KEY, size, size);
  if (!tex) return RAIN_KEY;
  const ctx = tex.getContext();
  let s = 97;
  const next = (): number => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; };
  for (let i = 0; i < 14; i++) {
    const x = 6 + Math.floor(next() * (size - 12));
    const y = Math.floor(next() * (size - 14));
    const len = 8 + Math.floor(next() * 5);
    ctx.fillStyle = 'rgba(205,220,245,0.85)';
    // Vệt "/" : cứ 3 hàng dịch sang trái một điểm ảnh.
    for (let k = 0; k < len; k++) ctx.fillRect(x - Math.floor(k / 3), y + k, 1, 1);
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return RAIN_KEY;
}

/** Khóa texture quầng sáng tròn (gradient trắng mờ dần) dùng với blend ADD. */
export const GLOW_KEY = 'city-glow';

export function ensureGlowTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(GLOW_KEY)) return GLOW_KEY;
  const size = 64;
  const tex = scene.textures.createCanvas(GLOW_KEY, size, size);
  if (!tex) return GLOW_KEY;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return GLOW_KEY;
}

interface Look { roof: number; roofDark: number; wall: number; trim: number; awning: number }

const LOOKS: Record<string, Look> = {
  main: { roof: 0xc0503a, roofDark: 0x9a3e2c, wall: 0xf3e2bf, trim: 0x8b5a2b, awning: 0xd84a3a },
  xoi: { roof: 0xd98a2b, roofDark: 0xb06c1a, wall: 0xfbeccc, trim: 0x8b5a2b, awning: 0xf2b632 },
  market: { roof: 0x3f9a5a, roofDark: 0x2f7a45, wall: 0xf1ead2, trim: 0x6b4220, awning: 0x3aa35b },
  school: { roof: 0x3b82c4, roofDark: 0x2c66a0, wall: 0xf6efe0, trim: 0x54607a, awning: 0x3b82c4 },
  industrial: { roof: 0x7d8590, roofDark: 0x5f666f, wall: 0xd9d6cf, trim: 0x4a4f57, awning: 0xe08a2e },
  veg: { roof: 0x8cb83a, roofDark: 0x6d9a2a, wall: 0xf6f0d4, trim: 0x5a4a20, awning: 0x8cb83a },
  drink: { roof: 0x2fa6a0, roofDark: 0x1f8580, wall: 0xf2f7f2, trim: 0x2a5a6a, awning: 0xf28ab0 },
  home: { roof: 0x8a5aa8, roofDark: 0x6e4488, wall: 0xf3ecf4, trim: 0x4a3060, awning: 0xe8b04a },
  vacant: { roof: 0x000000, roofDark: 0x000000, wall: 0x000000, trim: 0x8b5a2b, awning: 0x000000 },
};

/**
 * Texture tòa nhà kiểu làng quê: mái ngói, tường, cửa sổ sáng đèn, cửa có mái hiên. Kích thước theo ô (1 ô = 16px).
 * `doorCol` là cột ô của cửa trong tòa nhà. Đất trống vẽ hàng rào và biển "cần bán". Cache theo tham số.
 */
export function buildingTexture(scene: Phaser.Scene, kind: BuildingKind, wTiles: number, hTiles: number, doorCol: number): string {
  const key = `bld_${kind}_${wTiles}x${hTiles}_${doorCol}`;
  if (scene.textures.exists(key)) return key;
  const w = wTiles * T;
  const h = hTiles * T;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  const L = LOOKS[kind] ?? LOOKS.main;
  if (kind === 'vacant') {
    ctx.fillStyle = hex(0xa8d68a); ctx.globalAlpha = 0.35; ctx.fillRect(2, 2, w - 4, h - 4); ctx.globalAlpha = 1;
    ctx.fillStyle = hex(L.trim);
    for (let x = 0; x < w; x += 8) { ctx.fillRect(x, 0, 2, 7); ctx.fillRect(x, h - 7, 2, 7); }
    for (let y = 0; y < h; y += 8) { ctx.fillRect(0, y, 2, 7); ctx.fillRect(w - 2, y, 2, 7); }
    ctx.fillRect(0, 2, w, 1); ctx.fillRect(0, h - 5, w, 1);
    ctx.fillStyle = hex(0xf6e3c4); ctx.fillRect(w / 2 - 12, h / 2 - 7, 24, 14);
    ctx.fillStyle = hex(L.trim); ctx.fillRect(w / 2 - 12, h / 2 - 7, 24, 1); ctx.fillRect(w / 2 - 12, h / 2 + 6, 24, 1); ctx.fillRect(w / 2 - 12, h / 2 - 7, 1, 14); ctx.fillRect(w / 2 + 11, h / 2 - 7, 1, 14);
  } else {
    const roofH = Math.round(h * 0.42);
    // Tường.
    ctx.fillStyle = hex(L.wall); ctx.fillRect(2, roofH - 4, w - 4, h - roofH + 4);
    ctx.fillStyle = hex(L.trim); ctx.fillRect(2, h - 2, w - 4, 2); ctx.fillRect(2, roofH - 4, 2, h - roofH + 2); ctx.fillRect(w - 4, roofH - 4, 2, h - roofH + 2);
    // Mái: ngói theo hàng so le.
    ctx.fillStyle = hex(L.roof); ctx.fillRect(0, 2, w, roofH - 2);
    ctx.fillStyle = hex(L.roofDark);
    for (let y = 4, row = 0; y < roofH; y += 4, row++) {
      ctx.fillRect(0, y, w, 1);
      for (let x = (row % 2) * 4; x < w; x += 8) ctx.fillRect(x, y - 4 < 2 ? 2 : y - 3, 1, 3);
    }
    ctx.fillStyle = hex(L.trim); ctx.fillRect(0, 0, w, 2); ctx.fillRect(0, roofH - 2, w, 2);
    // Cửa: mái hiên + cánh cửa.
    const dx = doorCol * T;
    ctx.fillStyle = hex(L.awning); ctx.fillRect(dx - 3, roofH + 2, T + 6, 5);
    ctx.fillStyle = hex(0xffffff); for (let x = dx - 3; x < dx + T + 3; x += 6) ctx.fillRect(x, roofH + 2, 3, 5);
    ctx.fillStyle = hex(0x5a3a1e); ctx.fillRect(dx + 2, roofH + 8, T - 4, h - roofH - 10);
    ctx.fillStyle = hex(0x3f2814); ctx.fillRect(dx + 2, roofH + 8, T - 4, 1);
    ctx.fillStyle = hex(0xf2c94c); ctx.fillRect(dx + T - 5, roofH + 12, 2, 2);
    // Cửa sổ sáng đèn hai bên cửa.
    for (const win of buildingWindows(wTiles, hTiles, doorCol)) {
      const { x, y } = win;
      ctx.fillStyle = hex(L.trim); ctx.fillRect(x - 1, y - 1, 12, 11);
      ctx.fillStyle = hex(0xffe9a3); ctx.fillRect(x, y, 10, 9);
      ctx.fillStyle = hex(0xfff6d0); ctx.fillRect(x + 1, y + 1, 3, 3);
      ctx.fillStyle = hex(L.trim); ctx.fillRect(x + 4, y, 1, 9);
    }
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}
