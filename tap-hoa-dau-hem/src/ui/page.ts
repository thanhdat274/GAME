import Phaser from 'phaser';
import { Button } from './widgets';
import { C, H, HEX, W, txt } from './theme';

export const PAGE_TOP = 58;

/** Nền + thanh tiêu đề có nút quay lại cho các màn quản lý (Kho, Giá, Sổ nợ...). */
export function pageFrame(scene: Phaser.Scene, title: string, onBack: () => void, subtitle?: string): void {
  const g = scene.add.graphics();
  g.fillStyle(C.wall, 1).fillRect(0, 0, W, H);
  g.fillStyle(C.hud, 1).fillRect(0, 0, W, 50);
  g.fillStyle(0x000000, 0.25).fillRect(0, 50, W, 3);
  new Button(scene, 40, 25, { w: 64, h: 34, label: '‹ Về', color: C.wood, size: 14, onTap: onBack }).setDepth(10);
  txt(scene, W / 2 + 20, subtitle ? 15 : 25, title, { size: 17, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
  if (subtitle) txt(scene, W / 2 + 20, 36, subtitle, { size: 11, color: HEX.cream, origin: [0.5, 0.5] });
}

/** Vùng nội dung cuộn dọc có mặt nạ; kéo quá 8px mới tính là cuộn để không nhầm với chạm. */
export class ScrollArea {
  readonly content: Phaser.GameObjects.Container;
  private height = 0;
  private scroll = 0;

  constructor(private scene: Phaser.Scene, readonly top: number, readonly bottom: number) {
    this.content = scene.add.container(0, top);
    const maskG = scene.make.graphics({}, false).fillRect(0, top, W, bottom - top);
    this.content.setMask(maskG.createGeometryMask());
    let startY = 0;
    let startScroll = 0;
    let active = false;
    let dragging = false;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      active = this.inView(p.worldY);
      dragging = false;
      startY = p.worldY;
      startScroll = this.scroll;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!active || !p.isDown) return;
      if (!dragging && Math.abs(p.worldY - startY) < 8) return;
      dragging = true;
      this.setScroll(startScroll - (p.worldY - startY));
    });
    scene.input.on('pointerup', () => { active = false; });
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.inView(p.worldY)) this.setScroll(this.scroll + dy * 0.5);
    });
  }

  inView(worldY: number): boolean {
    return worldY >= this.top && worldY <= this.bottom;
  }

  /** Bọc hành động chạm: bỏ qua nếu điểm chạm nằm ngoài vùng hiển thị (nút bị cuộn khuất). */
  guard(fn: () => void): () => void {
    return () => {
      if (this.inView(this.scene.input.activePointer.worldY)) fn();
    };
  }

  setHeight(h: number): void {
    this.height = h;
    this.setScroll(this.scroll);
  }

  setScroll(y: number): void {
    const max = Math.max(0, this.height - (this.bottom - this.top));
    this.scroll = Phaser.Math.Clamp(y, 0, max);
    this.content.y = this.top - this.scroll;
  }

  clear(): void {
    this.content.removeAll(true);
  }

  add(items: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): void {
    this.content.add(items);
  }
}

/** Thẻ nền bo góc trong danh sách. */
export function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number = C.panel): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(color, 1).fillRoundedRect(x, y, w, h, 10);
  g.lineStyle(1, C.panelEdge, 1).strokeRoundedRect(x, y, w, h, 10);
  return g;
}
