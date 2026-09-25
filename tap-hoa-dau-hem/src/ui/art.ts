import Phaser from 'phaser';
import type { CustomerType, Product } from '../core/data';
import { PALETTE, PRODUCT_SPRITES, type Sprite } from './pixelart';
import { C, H, HEX, W, emoji, txt, ZOOM } from './theme';

/** Kích thước một "điểm ảnh" pixel art trong tọa độ logic. */
const PX = 2;

function color(hex: string): number {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

/**
 * Vẽ nhân vật pixel art 12x20 điểm ảnh bằng Graphics rồi lưu thành texture (nét, không nhòe).
 * Asset tạm thời cho tới khi có sprite vẽ tay.
 */
export function customerTexture(scene: Phaser.Scene, t: CustomerType, frame: 0 | 1 = 0): string {
  const key = frame === 0 ? `cust_${t.id}` : `cust_${t.id}_${frame}`;
  if (scene.textures.exists(key)) return key;
  const u = PX * ZOOM;
  const g = scene.make.graphics({}, false);
  const px = (x: number, y: number, w: number, h: number, c: number) => g.fillStyle(c, 1).fillRect(x * u, y * u, w * u, h * u);
  const skin = color(t.skin);
  const hair = color(t.hair);
  const shirt = color(t.shirt);
  const pants = color(t.pants);
  const dark = 0x2b1d14;
  // Tóc + đầu
  px(3, 0, 6, 2, hair);
  px(2, 1, 8, 2, hair);
  px(3, 2, 6, 5, skin);
  if (t.id === 'noi_tro' || t.id === 'van_phong') {
    px(2, 2, 1, 6, hair);
    px(9, 2, 1, 6, hair);
  }
  if (t.id === 'xe_om') px(1, 1, 10, 1, 0x3b3b3b); // mũ
  px(4, 4, 1, 1, dark);
  px(7, 4, 1, 1, dark);
  px(5, 6, 2, 1, 0xc0605a);
  // Thân
  px(2, 7, 8, 7, shirt);
  px(1, 8, 1, 5, shirt);
  px(10, 8, 1, 5, shirt);
  px(1, 13, 1, 1, skin);
  px(10, 13, 1, 1, skin);
  if (t.id === 'hoc_sinh') px(5, 7, 2, 3, 0xd32f2f); // khăn quàng đỏ
  if (t.id === 'van_phong') px(5, 7, 2, 1, 0xffffff);
  // Quần + giày (khung 1: bước chân, một chân đưa lên trước)
  if (frame === 0) {
    px(3, 14, 6, 4, pants);
    px(5, 16, 2, 2, C.bg);
    px(3, 18, 2, 2, dark);
    px(7, 18, 2, 2, dark);
  } else {
    px(3, 14, 6, 3, pants);
    px(2, 17, 3, 1, pants);
    px(7, 17, 2, 2, pants);
    px(1, 18, 2, 2, dark);
    px(7, 19, 3, 1, dark);
  }
  g.generateTexture(key, 12 * u, 20 * u);
  g.destroy();
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export function customerSprite(scene: Phaser.Scene, x: number, y: number, t: CustomerType): Phaser.GameObjects.Image {
  customerTexture(scene, t, 1);
  return scene.add.image(x, y, customerTexture(scene, t)).setOrigin(0.5, 1).setScale(1 / ZOOM);
}

/** Đổi khung hình đi bộ của khách (gọi theo nhịp khi đang di chuyển). */
export function setWalkFrame(img: Phaser.GameObjects.Image, t: CustomerType, frame: 0 | 1): void {
  img.setTexture(frame === 0 ? `cust_${t.id}` : `cust_${t.id}_${frame}`);
}

/** Tạo texture từ sprite ma trận ký tự, 1 điểm ảnh = 1 pixel canvas (phóng bằng setScale số nguyên). */
export function spriteTexture(scene: Phaser.Scene, key: string, rows: Sprite): string {
  if (scene.textures.exists(key)) return key;
  const h = rows.length;
  const w = rows[0].length;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PALETTE[row[x]];
      if (c === undefined) continue;
      ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export function productTexture(scene: Phaser.Scene, id: string): string | null {
  const rows = PRODUCT_SPRITES[id];
  return rows ? spriteTexture(scene, `icon_${id}`, rows) : null;
}

/** Người chơi (chủ tiệm) nhìn từ sau quầy. */
export function ownerTexture(scene: Phaser.Scene): string {
  return customerTexture(scene, {
    id: 'owner',
    name: 'Chủ tiệm',
    prefs: { dry: 0, snack: 0, household: 0 },
    patience: 0,
    maxItems: 0,
    tipMul: 0,
    weight: 0,
    shirt: '#e57373',
    pants: '#3e2723',
    hair: '#1b1b1b',
    skin: '#f2c9a0',
  });
}

/** Biểu tượng mặt hàng: hình tròn màu + emoji. */
export function productIcon(scene: Phaser.Scene, x: number, y: number, p: Product, size = 36): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const base = Phaser.Display.Color.IntegerToColor(color(p.color));
  const light = Phaser.Display.Color.Interpolate.ColorWithColor(base, Phaser.Display.Color.IntegerToColor(0xffffff), 100, 55);
  g.fillStyle(0x000000, 0.12).fillCircle(0, 2, size / 2);
  g.fillStyle(Phaser.Display.Color.GetColor(light.r, light.g, light.b), 1).fillCircle(0, 0, size / 2);
  g.lineStyle(2, color(p.color), 0.9).strokeCircle(0, 0, size / 2 - 1);
  const key = productTexture(scene, p.id);
  if (!key) return scene.add.container(x, y, [g, emoji(scene, 0, 1, p.icon, Math.round(size * 0.58))]);
  // Số pixel canvas cho mỗi điểm ảnh: số nguyên để hình không bị nhòe/méo.
  const k = Math.max(1, Math.floor((size * 0.88 * ZOOM) / 16));
  const img = scene.add.image(0, 0, key).setScale(k / ZOOM);
  return scene.add.container(x, y, [g, img]);
}

const BILL_COLORS: Record<number, number> = {
  1000: 0xb8a07a,
  2000: 0x9c7a5b,
  5000: 0x7b8fbf,
  10000: 0xc9a94a,
  20000: 0x4f86c6,
  50000: 0xd97aa6,
  100000: 0x6fae6a,
  200000: 0xc46a4a,
  500000: 0x4bb3c9,
};

export function billLabel(v: number): string {
  return v >= 1000 ? `${v / 1000}K` : String(v);
}

/** Tờ tiền Việt Nam giản lược: nền màu theo mệnh giá + số lớn. */
export function bill(scene: Phaser.Scene, x: number, y: number, v: number, w = 76, h = 38): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  const c = BILL_COLORS[v] ?? C.grey;
  g.fillStyle(0x000000, 0.2).fillRoundedRect(-w / 2, -h / 2 + 2, w, h, 5);
  g.fillStyle(c, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 5);
  g.lineStyle(2, 0xffffff, 0.55).strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 3);
  g.fillStyle(0xffffff, 0.35).fillCircle(-w / 2 + 14, 0, h / 4);
  const t = txt(scene, 6, 0, billLabel(v), { size: Math.round(h * 0.42), bold: true, color: HEX.white, origin: [0.5, 0.5], stroke: '#00000055' });
  return scene.add.container(x, y, [g, t]).setSize(w, h);
}

/** Tường, sàn, cửa ra vào của tiệm (bên trong). */
export function drawShopInterior(scene: Phaser.Scene, top: number, floorY: number, bottom: number): void {
  const g = scene.add.graphics();
  g.fillStyle(C.wall, 1).fillRect(0, top, W, floorY - top);
  for (let x = 0; x < W; x += 24) g.fillStyle(C.wallLine, 1).fillRect(x, top, 2, floorY - top);
  // Dây đèn trang trí
  for (let x = 10; x < W; x += 30) {
    g.fillStyle([C.red, C.yellow, C.green, C.blue][(x / 30) % 4 | 0], 1).fillCircle(x, top + 6, 3);
  }
  g.lineStyle(1, C.woodDark, 0.6).lineBetween(0, top + 4, W, top + 4);
  // Sàn gạch bông
  const tile = 20;
  for (let y = floorY; y < bottom; y += tile) {
    for (let x = 0; x < W; x += tile) {
      g.fillStyle(((x + y) / tile) % 2 === 0 ? C.floorA : C.floorB, 1).fillRect(x, y, tile, tile);
    }
  }
  g.fillStyle(C.woodDark, 1).fillRect(0, floorY - 4, W, 4);
  // Lối vào bên phải: thảm chùi chân (khách đi vào từ mép phải).
  g.fillStyle(C.red, 1).fillRoundedRect(W - 50, floorY + 44, 46, 26, 4);
  g.lineStyle(2, C.yellow, 1).strokeRoundedRect(W - 47, floorY + 47, 40, 20, 3);
  g.fillStyle(0x000000, 0.12).fillRect(W - 6, floorY, 6, bottom - floorY);
}

/** Mặt tiền tiệm cho màn tiêu đề. */
export function drawStorefront(scene: Phaser.Scene, cx: number, baseY: number): void {
  const g = scene.add.graphics();
  const w = 300;
  const x0 = cx - w / 2;
  // Tường nhà
  g.fillStyle(0xe9c98f, 1).fillRect(x0, baseY - 190, w, 190);
  g.fillStyle(0xd9b377, 1).fillRect(x0, baseY - 190, w, 8);
  // Biển hiệu
  g.fillStyle(C.red, 1).fillRoundedRect(x0 + 16, baseY - 182, w - 32, 44, 6);
  g.lineStyle(3, C.yellow, 1).strokeRoundedRect(x0 + 16, baseY - 182, w - 32, 44, 6);
  // Mái hiên sọc
  for (let i = 0; i < 10; i++) {
    g.fillStyle(i % 2 === 0 ? C.red : 0xffffff, 1).fillRect(x0 + i * (w / 10), baseY - 132, w / 10, 26);
    g.fillStyle(i % 2 === 0 ? C.red : 0xffffff, 1).fillTriangle(
      x0 + i * (w / 10),
      baseY - 106,
      x0 + (i + 1) * (w / 10),
      baseY - 106,
      x0 + (i + 0.5) * (w / 10),
      baseY - 96,
    );
  }
  // Cửa cuốn mở + kệ hàng bên trong
  g.fillStyle(0x5a3a22, 1).fillRect(x0 + 20, baseY - 94, w - 40, 94);
  for (let r = 0; r < 3; r++) {
    g.fillStyle(C.woodLight, 1).fillRect(x0 + 28, baseY - 70 + r * 24, w - 56, 4);
    for (let i = 0; i < 12; i++) {
      const cs = [0xf4c542, 0xe53935, 0x81d4fa, 0x66bb6a, 0xffb74d, 0xf06292];
      g.fillStyle(cs[(i + r * 2) % cs.length], 1).fillRect(x0 + 32 + i * 20, baseY - 84 + r * 24, 14, 14);
    }
  }
  // Nền đường hẻm
  g.fillStyle(0x6d6d6d, 1).fillRect(0, baseY, W, H - baseY);
  g.fillStyle(0x7d7d7d, 1);
  for (let x = 0; x < W; x += 40) g.fillRect(x, baseY + 30, 22, 4);
}
