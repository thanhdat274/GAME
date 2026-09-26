import Phaser from 'phaser';
import { play } from './sound';
import { C, H, HEX, W, txt } from './theme';

export interface ButtonOpts {
  w: number;
  h: number;
  label: string;
  color?: number;
  textColor?: string;
  size?: number;
  radius?: number;
  sound?: boolean;
  stroke?: number;
  strokeAlpha?: number;
  onTap: () => void;
}

/** Nút bấm bo góc; chỉ kích hoạt khi nhả tay mà không kéo (để không xung đột với cuộn). */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private color: number;
  private strokeColor?: number;
  private strokeAlpha?: number;

  constructor(scene: Phaser.Scene, x: number, y: number, private o: ButtonOpts) {
    super(scene, x, y);
    this.color = o.color ?? C.green;
    this.strokeColor = o.stroke;
    this.strokeAlpha = o.strokeAlpha;
    this.bg = scene.add.graphics();
    this.label = txt(scene, 0, 0, o.label, {
      size: o.size ?? 15,
      bold: true,
      color: o.textColor ?? HEX.white,
      origin: [0.5, 0.5],
      align: 'center',
    });
    this.add([this.bg, this.label]);
    this.setSize(o.w, o.h);
    this.draw();
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (this.enabled) this.setScale(0.95);
    });
    this.on('pointerout', () => this.setScale(1));
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.setScale(1);
      if (!this.enabled || p.getDistance() > 10) return;
      if (o.sound !== false) play('tap');
      o.onTap();
    });
    scene.add.existing(this);
  }

  private draw(): void {
    const { w, h } = this.o;
    const r = this.o.radius ?? 10;
    const g = this.bg;
    g.clear();
    const base = this.enabled ? this.color : C.grey;
    g.fillStyle(0x000000, 0.28).fillRoundedRect(-w / 2, -h / 2 + 3.5, w, h, r);
    g.fillStyle(base, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, Math.floor(h / 2) - 2, { tl: r - 2, tr: r - 2, bl: 0, br: 0 });
    if (this.strokeColor !== undefined) {
      g.lineStyle(1.5, this.strokeColor, this.strokeAlpha ?? 0.6).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    } else {
      g.lineStyle(1, 0xffffff, 0.15).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    }
  }

  setEnabled(on: boolean): this {
    if (this.enabled !== on) {
      this.enabled = on;
      this.draw();
      this.label.setAlpha(on ? 1 : 0.8);
    }
    return this;
  }

  setColor(color: number): this {
    this.color = color;
    this.draw();
    return this;
  }

  setStyle(color: number, stroke?: number, strokeAlpha?: number): this {
    this.color = color;
    if (stroke !== undefined) this.strokeColor = stroke;
    if (strokeAlpha !== undefined) this.strokeAlpha = strokeAlpha;
    this.draw();
    return this;
  }

  setText(s: string): this {
    this.label.setText(s);
    return this;
  }
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number = C.panel): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.2).fillRoundedRect(x, y + 3, w, h, 12);
  g.fillStyle(color, 1).fillRoundedRect(x, y, w, h, 12);
  g.lineStyle(2, C.panelEdge, 1).strokeRoundedRect(x, y, w, h, 12);
  return g;
}

/** Thông báo ngắn nổi ở giữa màn hình. */
export function toast(scene: Phaser.Scene, message: string, y = H * 0.42, color = C.ink): void {
  const t = txt(scene, W / 2, y, message, { size: 15, bold: true, color: HEX.white, origin: [0.5, 0.5], align: 'center', wrap: 300 });
  const pad = 10;
  const bg = scene.add.graphics();
  bg.fillStyle(color, 0.92).fillRoundedRect(W / 2 - t.width / 2 - pad, y - t.height / 2 - pad / 2, t.width + pad * 2, t.height + pad, 10);
  const c = scene.add.container(0, 0, [bg, t]).setDepth(1000);
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, y: -6, duration: 180 });
  scene.tweens.add({ targets: c, alpha: 0, delay: 1700, duration: 300, onComplete: () => c.destroy() });
}

/** Chữ nổi bay lên (ví dụ +15.000đ). */
export function floatText(scene: Phaser.Scene, x: number, y: number, s: string, color = HEX.green, size = 16): void {
  const t = txt(scene, x, y, s, { size, bold: true, color, origin: [0.5, 0.5], stroke: '#ffffff' }).setDepth(900);
  scene.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
}

export interface DialogButton {
  label: string;
  color?: number;
  onTap?: () => void;
}

/** Hộp thoại chặn thao tác bên dưới. Trả về container để có thể đóng thủ công. */
export function dialog(
  scene: Phaser.Scene,
  o: { title?: string; body: string; icon?: string; buttons: DialogButton[]; width?: number; illustration?: 'open-browser'; portraitKey?: string },
): Phaser.GameObjects.Container {
  const w = o.width ?? 300;
  const layer = scene.add.container(0, 0).setDepth(2000);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive();
  layer.add(shade);
  const items: Phaser.GameObjects.GameObject[] = [];
  let y = 0;
  if (o.icon) {
    items.push(txt(scene, W / 2, y + 26, o.icon, { size: 40, emoji: true, origin: [0.5, 0.5] }));
    y += 56;
  }
  if (o.portraitKey && scene.textures.exists(o.portraitKey)) {
    const portrait = scene.add.image(W / 2, y + 20, o.portraitKey).setDisplaySize(40, 40);
    items.push(portrait);
    y += 48;
  }
  if (o.illustration === 'open-browser') {
    const illustrationY = y + 31;
    const g = scene.add.graphics();
    g.fillStyle(0xf5ead7, 1).fillRoundedRect(W / 2 - 119, y, 238, 62, 12);
    g.lineStyle(1, 0xe5d4b9, 1).strokeRoundedRect(W / 2 - 119, y, 238, 62, 12);
    g.fillStyle(0x168de2, 1).fillCircle(W / 2 - 78, illustrationY - 4, 14);
    g.fillStyle(0xffffff, 1).fillRoundedRect(W / 2 - 87, illustrationY - 10, 18, 12, 5);
    g.fillTriangle(W / 2 - 77, illustrationY, W / 2 - 72, illustrationY + 6, W / 2 - 69, illustrationY);
    g.fillStyle(0xc4a77c, 1).fillRoundedRect(W / 2 - 101, illustrationY + 15, 46, 3, 2);
    g.fillStyle(0x9a633a, 1).fillRoundedRect(W / 2 - 97, illustrationY + 21, 38, 3, 2);
    g.lineStyle(3, 0x9a633a, 1).lineBetween(W / 2 - 35, illustrationY - 4, W / 2 + 13, illustrationY - 4);
    g.fillStyle(0x9a633a, 1).fillTriangle(W / 2 + 14, illustrationY - 4, W / 2 + 5, illustrationY - 10, W / 2 + 5, illustrationY + 2);
    g.fillStyle(0xfdfbf6, 1).fillRoundedRect(W / 2 + 27, illustrationY - 19, 74, 42, 7);
    g.lineStyle(1.5, 0x9a633a, 1).strokeRoundedRect(W / 2 + 27, illustrationY - 19, 74, 42, 7);
    g.fillStyle(0x9a633a, 1).fillRoundedRect(W / 2 + 27, illustrationY - 19, 74, 9, 6);
    g.fillStyle(0xf1c85b, 1).fillCircle(W / 2 + 34, illustrationY - 14, 1.5);
    g.fillStyle(0xf1c85b, 1).fillCircle(W / 2 + 40, illustrationY - 14, 1.5);
    g.fillStyle(0x4b9d69, 1).fillCircle(W / 2 + 64, illustrationY + 2, 10);
    g.fillStyle(0xfdfbf6, 1).fillCircle(W / 2 + 64, illustrationY + 2, 4);
    items.push(g);
    items.push(txt(scene, W / 2 - 78, illustrationY + 11, 'Ứng dụng', { size: 8, bold: true, color: HEX.ink, origin: [0.5, 0.5] }));
    items.push(txt(scene, W / 2 + 64, illustrationY + 11, 'Chrome / Safari', { size: 7, bold: true, color: HEX.ink, origin: [0.5, 0.5] }));
    y += 72;
  }
  if (o.title) {
    const t = txt(scene, W / 2, y + 12, o.title, { size: 19, bold: true, origin: [0.5, 0], align: 'center', wrap: w - 30 });
    items.push(t);
    y += t.height + 20;
  }
  const body = txt(scene, W / 2, y + 6, o.body, { size: 15, origin: [0.5, 0], align: 'center', wrap: w - 36, color: HEX.ink });
  items.push(body);
  y += body.height + 22;
  const btnH = 46;
  const gap = 10;
  const n = o.buttons.length;
  const stack = n > 2;
  const btnW = stack ? w - 40 : (w - 40 - gap * (n - 1)) / n;
  const close = () => {
    scene.tweens.add({ targets: layer, alpha: 0, duration: 120, onComplete: () => layer.destroy() });
  };
  o.buttons.forEach((b, i) => {
    const bx = stack ? W / 2 : W / 2 - (w - 40) / 2 + btnW / 2 + i * (btnW + gap);
    const by = y + btnH / 2 + (stack ? i * (btnH + gap) : 0);
    items.push(
      new Button(scene, bx, by, {
        w: btnW,
        h: btnH,
        label: b.label,
        color: b.color ?? C.green,
        onTap: () => {
          close();
          b.onTap?.();
        },
      }),
    );
  });
  y += stack ? n * (btnH + gap) : btnH + gap;
  const h = y + 14;
  const top = H / 2 - h / 2;
  const bg = panel(scene, W / 2 - w / 2, top, w, h);
  layer.add(bg);
  for (const it of items) {
    (it as unknown as { y: number }).y += top;
    layer.add(it);
  }
  layer.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 150 });
  return layer;
}

/** Thanh tiến trình đơn giản. */
export class Bar extends Phaser.GameObjects.Graphics {
  constructor(scene: Phaser.Scene, private bx: number, private by: number, private bw: number, private bh: number, private fg = C.green, private back = 0x000000) {
    super(scene);
    scene.add.existing(this);
  }

  set(ratio: number, color?: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    this.clear();
    this.fillStyle(this.back, 0.35).fillRoundedRect(this.bx, this.by, this.bw, this.bh, this.bh / 2);
    if (r > 0) this.fillStyle(color ?? this.fg, 1).fillRoundedRect(this.bx, this.by, Math.max(this.bh, this.bw * r), this.bh, this.bh / 2);
  }
}
