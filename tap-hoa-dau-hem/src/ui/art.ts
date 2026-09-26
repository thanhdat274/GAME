import Phaser from 'phaser';
import type { CustomerType, Look, Product } from '../core/data';
import { FURNITURE_SPRITES, PALETTE, PRODUCT_SPRITES, type Sprite } from './pixelart';
import { C, H, HEX, W, emoji, txt, ZOOM } from './theme';
import { play } from './sound';

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

/** Loại "khách" ảo cho nhân viên để dùng lại bộ vẽ nhân vật pixel (mỗi người một ngoại hình). */
export function staffType(p: { id: string; name: string; look: Look }): CustomerType {
  return {
    id: `staff_${p.id}`, name: p.name, prefs: {}, patience: 0, maxItems: 0, tipMul: 0, counterRequestChance: 0, weight: 0,
    shirt: p.look.shirt, pants: p.look.pants, hair: p.look.hair, skin: p.look.skin,
  };
}

export function staffSprite(scene: Phaser.Scene, x: number, y: number, p: { id: string; name: string; look: Look }): Phaser.GameObjects.Image {
  return customerSprite(scene, x, y, staffType(p));
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

/**
 * Ảnh nội thất pixel art vừa khung w×h (tọa độ logic), phóng theo số nguyên điểm ảnh canvas để không nhòe.
 * `rot` = 1 thì xoay 90° (footprint đổi chiều).
 */
export function furnitureImage(scene: Phaser.Scene, id: string, x: number, y: number, w: number, h: number, rot: 0 | 1 = 0): Phaser.GameObjects.Image | null {
  const rows = FURNITURE_SPRITES[id];
  if (!rows) return null;
  const key = spriteTexture(scene, `furn_${id}`, rows);
  const sw = rows[0].length;
  const sh = rows.length;
  // Khi xoay, chiều rộng ảnh nằm theo trục dọc của khung.
  const fw = rot ? h : w;
  const fh = rot ? w : h;
  const k = Math.max(1, Math.floor(Math.min((fw * ZOOM) / sw, (fh * ZOOM) / sh)));
  return scene.add.image(x, y, key).setScale(k / ZOOM).setAngle(rot ? 90 : 0);
}

/**
 * Gộp các Graphics tĩnh vào một RenderTexture (độ phân giải thật = logic × ZOOM) rồi hủy Graphics,
 * để mỗi khung hình không phải vẽ lại hàng trăm hình chữ nhật.
 */
export function bakeStatic(scene: Phaser.Scene, parts: Phaser.GameObjects.Graphics[], depth = 0): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(0, 0, W * ZOOM, H * ZOOM).setOrigin(0, 0).setScale(1 / ZOOM).setDepth(depth);
  for (const g of parts) {
    g.setScale(ZOOM);
    rt.draw(g, 0, 0);
    g.destroy();
  }
  return rt;
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
    counterRequestChance: 0,
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
export function drawShopInterior(scene: Phaser.Scene, top: number, floorY: number, bottom: number): Phaser.GameObjects.Graphics {
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
  return g;
}

/** Mặt tiền tiệm cho màn tiêu đề: phong cách hoài niệm Sài Gòn/Việt Nam xưa. */
export function drawStorefront(scene: Phaser.Scene, cx = W / 2, baseY = 352, miniMart = false): void {
  // 1. Bầu trời hoàng hôn & ánh nắng ấm áp
  const sky = scene.add.graphics();
  sky.fillGradientStyle(0xeb6434, 0xeb6434, 0xfcb758, 0xfce18b, 1).fillRect(0, 0, W, baseY);

  // Mặt trời hoàng hôn ấm áp
  const sunGlow = scene.add.graphics();
  sunGlow.fillStyle(0xffd56b, 0.28).fillCircle(56, 72, 34);
  sunGlow.fillStyle(0xfff0a8, 0.95).fillCircle(56, 72, 22);
  scene.tweens.add({
    targets: sunGlow,
    y: 4,
    duration: 3000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // Mây pixel hoàng hôn trôi lơ lửng
  const createCloud = (x: number, y: number, scale: number, duration: number) => {
    const c = scene.add.graphics({ x, y });
    c.fillStyle(0xfff6eb, 0.75);
    c.fillRoundedRect(0, 0, 46 * scale, 14 * scale, 7 * scale);
    c.fillCircle(16 * scale, 3 * scale, 10 * scale);
    c.fillCircle(28 * scale, 2 * scale, 12 * scale);
    scene.tweens.add({
      targets: c,
      x: W + 60,
      duration,
      repeat: -1,
      onRepeat: () => {
        c.x = -80 * scale;
      },
      ease: 'Linear',
    });
  };
  createCloud(20, 42, 1.1, 45000);
  createCloud(140, 78, 0.8, 55000);
  createCloud(260, 32, 0.9, 38000);

  // Đàn chim én bay lượn ở góc trời xa
  const birds = scene.add.graphics();
  birds.lineStyle(1.5, 0x8a3818, 0.7);
  birds.beginPath().arc(290, 48, 6, Math.PI, 0, false).strokePath();
  birds.beginPath().arc(302, 48, 6, Math.PI, 0, false).strokePath();
  birds.beginPath().arc(314, 40, 4, Math.PI, 0, false).strokePath();
  birds.beginPath().arc(322, 40, 4, Math.PI, 0, false).strokePath();

  // 2. Kiến trúc tiệm tạp hóa cổ
  const g = scene.add.graphics();
  const w = 316;
  const x0 = cx - w / 2;
  const wallTop = 132;
  const wallH = baseY - wallTop;

  // Tường vàng vôi cổ truyền
  g.fillStyle(0xedbe55, 1).fillRect(x0, wallTop, w, wallH);
  // Các vạch chỉ gạch rêu phong nhẹ
  g.fillStyle(0xd9a83d, 0.5);
  for (let ly = wallTop + 16; ly < baseY - 10; ly += 24) {
    g.fillRect(x0, ly, w, 1);
  }
  // Mảng rêu phong chân tường
  g.fillStyle(0xbda24e, 0.4).fillRect(x0, baseY - 24, w, 24);

  // Mái ngói nâu đỏ cổ kính
  g.fillStyle(0x8f3822, 1).fillRect(x0 - 4, wallTop - 12, w + 8, 12);
  g.fillStyle(0xaa452c, 1).fillRect(x0 - 2, wallTop - 12, w + 4, 3);
  for (let rx = x0; rx < x0 + w; rx += 14) {
    g.fillStyle(0x6e2513, 0.6).fillRect(rx, wallTop - 12, 2, 12);
  }
  // Dải phào chỉ trắng ngà cổ điển kiểu Pháp
  g.fillStyle(0xf8f1e0, 1).fillRect(x0 - 2, wallTop, w + 4, 6);
  g.fillStyle(0xd9cdb4, 1).fillRect(x0 - 2, wallTop + 5, w + 4, 2);

  // 3. Khung cửa tiệm & Kệ hàng tạp hóa bên trong
  const doorW = 276;
  const doorX = cx - doorW / 2;
  const doorTop = 168;
  const doorH = baseY - doorTop - 12;

  // Khung gỗ cửa
  g.fillStyle(0x56301b, 1).fillRect(doorX - 5, doorTop - 5, doorW + 10, doorH + 5);
  // Nền tối bên trong gian tiệm
  g.fillStyle(0x2d170c, 1).fillRect(doorX, doorTop, doorW, doorH);
  // Ánh sáng ấm hắt từ bên trong tiệm
  g.fillStyle(0xffe89e, 0.08).fillRect(doorX, doorTop, doorW, doorH);

  // 3 tầng kệ gỗ nâu
  const shelfY1 = doorTop + 42;
  const shelfY2 = doorTop + 90;
  const shelfY3 = doorTop + 138;

  [shelfY1, shelfY2, shelfY3].forEach(sy => {
    g.fillStyle(0x8d5c32, 1).fillRect(doorX + 8, sy, doorW - 16, 5);
    g.fillStyle(0xb47942, 1).fillRect(doorX + 8, sy, doorW - 16, 2);
  });

  // Tầng 1: Các hũ kẹo thủy tinh nắp đỏ/vàng & bánh hộp tuổi thơ
  for (let i = 0; i < 7; i++) {
    const kx = doorX + 22 + i * 36;
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(kx, shelfY1 - 28, 24, 28, 4);
    g.lineStyle(1.5, 0xffffff, 0.5).strokeRoundedRect(kx, shelfY1 - 28, 24, 28, 4);
    const candyColors = [0xf44336, 0xffeb3b, 0x4caf50, 0xff9800, 0xe91e63, 0x00bcd4, 0x9c27b0];
    g.fillStyle(candyColors[i], 0.9).fillCircle(kx + 7, shelfY1 - 10, 4);
    g.fillStyle(candyColors[(i + 2) % 7], 0.9).fillCircle(kx + 16, shelfY1 - 10, 4);
    g.fillStyle(candyColors[(i + 4) % 7], 0.9).fillCircle(kx + 11, shelfY1 - 18, 4);
    g.fillStyle(i % 2 === 0 ? 0xd32f2f : 0xfbc02d, 1).fillRect(kx + 2, shelfY1 - 32, 20, 5);
  }

  // Tầng 2: Chai nước ngọt thủy tinh (xá xị, cam, chanh)
  for (let i = 0; i < 9; i++) {
    const bx = doorX + 18 + i * 28;
    const bottleColors = [0x542313, 0xf57c00, 0x388e3c, 0xd32f2f, 0x1976d2, 0x542313, 0xf57c00, 0x388e3c, 0xd32f2f];
    g.fillStyle(bottleColors[i], 0.85).fillRoundedRect(bx + 4, shelfY2 - 32, 12, 32, 2);
    g.fillStyle(bottleColors[i], 0.85).fillRect(bx + 7, shelfY2 - 38, 6, 8);
    g.fillStyle(0xffffff, 0.8).fillRect(bx + 4, shelfY2 - 22, 12, 8);
    g.fillStyle(0xfbc02d, 1).fillRect(bx + 6, shelfY2 - 40, 8, 3);
  }

  // Tầng 3: Gói mì tôm Miliket hai con tôm & bim bim
  for (let i = 0; i < 8; i++) {
    const mx = doorX + 16 + i * 32;
    g.fillStyle(0xf6d48b, 1).fillRoundedRect(mx, shelfY3 - 26, 26, 26, 3);
    g.lineStyle(1, 0xd32f2f, 0.8).strokeRect(mx + 2, shelfY3 - 24, 22, 22);
    g.fillStyle(0xd32f2f, 1).fillRect(mx + 6, shelfY3 - 16, 14, 5);
  }

  // Quầy tính tiền gỗ trước mặt
  const counterH = 34;
  const counterY = doorTop + doorH - counterH;
  g.fillStyle(0x714421, 1).fillRect(doorX + 12, counterY, doorW - 24, counterH);
  g.fillStyle(0x8a542b, 1).fillRect(doorX + 12, counterY, doorW - 24, 4);

  // Biển phấn nhỏ trên quầy: "BÁN TIỀN MẶT - VUI LÒNG KHÔNG NỢ"
  const signW = 140;
  const signH = 20;
  const signX = cx - signW / 2;
  const signY = counterY + 7;
  g.fillStyle(0x1e3323, 1).fillRoundedRect(signX, signY, signW, signH, 3);
  g.lineStyle(1.5, 0x8d5c32, 1).strokeRoundedRect(signX, signY, signW, signH, 3);
  txt(scene, cx, signY + signH / 2, '★ Vui Lòng Không NỢ ★', {
    size: 10,
    bold: true,
    color: '#e8f5e9',
    origin: [0.5, 0.5],
  });

  // Bao tải gai gạo "GẠO" bên góc trái
  const sackX = doorX + 16;
  const sackY = counterY - 2;
  g.fillStyle(0xc8ad7f, 1).fillRoundedRect(sackX, sackY, 34, 38, 8);
  g.lineStyle(1.5, 0x9e855c, 1).strokeRoundedRect(sackX, sackY, 34, 38, 8);
  g.fillStyle(0xa63826, 1).fillRect(sackX + 5, sackY + 14, 24, 11);
  txt(scene, sackX + 17, sackY + 19, 'GẠO', { size: 8, bold: true, color: '#ffffff', origin: [0.5, 0.5] });

  // 4. Mái bạt di động sọc đỏ trắng (Scalloped Awning)
  const awningY = 138;
  const awningH = 32;
  const stripes = 12;
  const stripeW = w / stripes;

  // Bóng đổ dưới mái bạt
  g.fillStyle(0x000000, 0.28).fillRect(x0, awningY + awningH, w, 8);

  for (let i = 0; i < stripes; i++) {
    const sx = x0 + i * stripeW;
    const isRed = i % 2 === 0;
    const c1 = isRed ? 0xcc291d : 0xfffaea;
    const c2 = isRed ? 0xaa1e14 : 0xede4d0;

    g.fillStyle(c1, 1).fillRect(sx, awningY, stripeW, awningH);
    g.fillStyle(c2, 0.35).fillRect(sx + stripeW - 2, awningY, 2, awningH);

    g.fillStyle(c1, 1).fillTriangle(
      sx,
      awningY + awningH,
      sx + stripeW,
      awningY + awningH,
      sx + stripeW / 2,
      awningY + awningH + 9,
    );
  }

  // 5. Dây đèn tròn vàng ấm áp (Glowing fairy lights)
  const lightGlow = scene.add.graphics();
  const wire = scene.add.graphics();
  wire.lineStyle(1.5, 0x2b1d14, 0.7);

  const bulbPositions = [
    { x: x0 + 34, y: awningY + awningH + 10 },
    { x: x0 + 94, y: awningY + awningH + 13 },
    { x: x0 + 158, y: awningY + awningH + 14 },
    { x: x0 + 222, y: awningY + awningH + 13 },
    { x: x0 + 282, y: awningY + awningH + 10 },
  ];

  for (let i = 0; i < bulbPositions.length - 1; i++) {
    const p1 = bulbPositions[i];
    const p2 = bulbPositions[i + 1];
    const midX = (p1.x + p2.x) / 2;
    const midY = Math.max(p1.y, p2.y) + 3;
    wire.beginPath();
    wire.moveTo(p1.x, p1.y - 4);
    wire.lineTo(midX, midY);
    wire.lineTo(p2.x, p2.y - 4);
    wire.strokePath();
  }

  bulbPositions.forEach(b => {
    g.fillStyle(0x3a3a3a, 1).fillRect(b.x - 2, b.y - 5, 4, 3);
    lightGlow.fillStyle(0xffe873, 0.35).fillCircle(b.x, b.y, 11);
    lightGlow.fillStyle(0xfff7c2, 0.9).fillCircle(b.x, b.y, 4.5);
  });

  scene.tweens.add({
    targets: lightGlow,
    alpha: { from: 0.55, to: 1 },
    duration: 1600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // 6. Bảng hiệu chính "TẠP HÓA ĐẦU HẺM" (Retro Hand-painted Signboard)
  const signBoxW = 294;
  const signBoxH = 62;
  const signBoxX = cx - signBoxW / 2;
  const signBoxY = 70;

  // Dây sắt treo bảng hiệu
  g.fillStyle(0x332218, 1).fillRect(signBoxX + 24, signBoxY - 14, 3, 14);
  g.fillStyle(0x332218, 1).fillRect(signBoxX + signBoxW - 27, signBoxY - 14, 3, 14);

  // Khung bảng hiệu bóng đổ + gỗ tếch sẫm
  g.fillStyle(0x000000, 0.35).fillRoundedRect(signBoxX, signBoxY + 3, signBoxW, signBoxH, 8);
  g.fillStyle(0x3a190b, 1).fillRoundedRect(signBoxX, signBoxY, signBoxW, signBoxH, 8);
  // Nền đỏ đô sơn mài cổ điển
  g.fillStyle(0x941e16, 1).fillRoundedRect(signBoxX + 4, signBoxY + 4, signBoxW - 8, signBoxH - 8, 6);
  // Viền vàng kim nghệ thuật
  g.lineStyle(2, 0xf5c345, 1).strokeRoundedRect(signBoxX + 7, signBoxY + 7, signBoxW - 14, signBoxH - 14, 5);

  // 4 đinh tán đồng ở 4 góc
  [
    [signBoxX + 11, signBoxY + 11],
    [signBoxX + signBoxW - 11, signBoxY + 11],
    [signBoxX + 11, signBoxY + signBoxH - 11],
    [signBoxX + signBoxW - 11, signBoxY + signBoxH - 11],
  ].forEach(([px, py]) => {
    g.fillStyle(0xf5c345, 1).fillCircle(px, py, 2.5);
  });

  // Chữ trên bảng hiệu
  txt(scene, cx, signBoxY + 14, '★  TIỆM BÀ TƯ · TỪ NĂM 1990  ★', {
    size: 9,
    bold: true,
    color: '#f5c345',
    origin: [0.5, 0.5],
  });

  txt(scene, cx, signBoxY + 33, miniMart ? 'MINI MART ĐẦU HẺM' : 'TẠP HÓA ĐẦU HẺM', {
    size: miniMart ? 22 : 24,
    bold: true,
    color: '#fff4ba',
    stroke: '#480b06',
    origin: [0.5, 0.5],
  });

  txt(scene, cx, signBoxY + 49, miniMart ? 'Mua sắm tiện lợi · Giao hàng tận nhà' : 'Nhập hàng · Bày kệ · Bán hàng · Thối tiền', {
    size: miniMart ? 9 : 10,
    color: '#ffebcc',
    origin: [0.5, 0.5],
  });

  // 7. Bậc thềm gạch bông & Vỉa hè hoài niệm
  const porchY = baseY - 14;
  g.fillStyle(0xdfd3be, 1).fillRect(0, porchY, W, 14);
  g.fillStyle(0x406e7a, 0.75);
  for (let tx = 4; tx < W; tx += 16) {
    g.fillCircle(tx + 8, porchY + 7, 3);
    g.strokeRect(tx, porchY, 16, 14);
  }
  g.fillStyle(0x2a1a12, 0.3).fillRect(0, porchY + 12, W, 2);

  // Vỉa hè & Mặt đường hẻm ấm áp
  g.fillStyle(0x473b35, 1).fillRect(0, baseY, W, H - baseY);
  for (let y = baseY; y < H; y += 22) {
    const isOdd = ((y / 22) | 0) % 2 === 1;
    g.fillStyle(0x564740, 0.6).fillRect(0, y, W, 1.5);
    for (let x = isOdd ? 18 : 0; x < W; x += 36) {
      g.fillStyle(0x564740, 0.6).fillRect(x, y, 1.5, 22);
    }
  }

  // Vệt sáng hắt từ tiệm xuống mặt đường
  const streetLight = scene.add.graphics();
  streetLight.fillGradientStyle(0xffe599, 0xffe599, 0x473b35, 0x473b35, 0.12).fillRect(doorX - 20, baseY, doorW + 40, 90);

  // 8. Chậu cây kiểng trầu bà xanh mát bên góc trái
  const plantX = 46;
  const plantY = porchY - 6;
  g.fillStyle(0xc2623e, 1).fillTriangle(plantX - 10, plantY, plantX + 10, plantY, plantX, plantY + 18);
  g.fillStyle(0xd97550, 1).fillRoundedRect(plantX - 12, plantY - 4, 24, 5, 2);

  const plantLeaves = scene.add.graphics({ x: plantX, y: plantY });
  plantLeaves.fillStyle(0x388e3c, 1).fillCircle(-6, -8, 7);
  plantLeaves.fillStyle(0x4caf50, 1).fillCircle(6, -10, 8);
  plantLeaves.fillStyle(0x81c784, 1).fillCircle(0, -15, 8);
  plantLeaves.fillStyle(0x2e7d32, 1).fillCircle(-8, -14, 5);

  scene.tweens.add({
    targets: plantLeaves,
    angle: { from: -3, to: 3 },
    duration: 2400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  // 9. Chú mèo tam thể ngủ trước thềm (Interactive Sleeping Calico Cat)
  const catX = 302;
  const catY = porchY - 2;

  g.fillStyle(0xccbb90, 1).fillRoundedRect(catX - 22, catY - 4, 44, 20, 6);
  g.lineStyle(1.5, 0xaa9568, 1).strokeRoundedRect(catX - 22, catY - 4, 44, 20, 6);

  const catContainer = scene.add.container(catX, catY + 5);
  const catG = scene.add.graphics();

  catG.fillStyle(0xf59e38, 1).fillCircle(0, 0, 12);
  catG.fillStyle(0xffffff, 1).fillCircle(-2, 3, 6);
  catG.fillStyle(0x3e2723, 1).fillCircle(4, -5, 5);
  catG.fillStyle(0xf59e38, 1).fillCircle(-9, -2, 7);
  catG.fillStyle(0xf59e38, 1).fillTriangle(-14, -6, -9, -12, -7, -6);
  catG.fillStyle(0x3e2723, 1).fillTriangle(-7, -6, -3, -11, -2, -5);
  catG.fillStyle(0xff8a80, 1).fillTriangle(-12, -6, -9, -10, -8, -6);
  catG.lineStyle(1.5, 0x3e2723, 1);
  catG.beginPath().arc(-11, -1, 3, 0.2, Math.PI - 0.2, false).strokePath();

  const tail = scene.add.graphics();
  tail.fillStyle(0x3e2723, 1).fillRoundedRect(7, -2, 12, 5, 2.5);
  catContainer.add([tail, catG]);

  scene.tweens.add({
    targets: tail,
    angle: { from: -10, to: 15 },
    duration: 1400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  scene.tweens.add({
    targets: catContainer,
    scaleY: { from: 1, to: 1.07 },
    duration: 1600,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  scene.time.addEvent({
    delay: 2500,
    loop: true,
    callback: () => {
      const z = txt(scene, catX - 10, catY - 14, 'z', {
        size: 11,
        bold: true,
        color: '#ffeedd',
      }).setAlpha(0.9);
      scene.tweens.add({
        targets: z,
        x: catX - 18,
        y: catY - 38,
        alpha: 0,
        scale: 1.5,
        duration: 1800,
        ease: 'Cubic.easeOut',
        onComplete: () => z.destroy(),
      });
    },
  });

  const catZone = scene.add.zone(catX, catY, 48, 36).setInteractive({ useHandCursor: true });
  catZone.on('pointerdown', () => {
    play('pick');
    scene.tweens.add({
      targets: catContainer,
      scaleX: 1.25,
      scaleY: 0.85,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut',
    });
    const heart = txt(scene, catX, catY - 18, 'Meo~ ❤️', {
      size: 14,
      bold: true,
      color: '#ff4d6d',
      stroke: '#ffffff',
    }).setOrigin(0.5, 0.5);
    scene.tweens.add({
      targets: heart,
      y: catY - 52,
      alpha: 0,
      scale: 1.3,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => heart.destroy(),
    });
  });
}
