import Phaser from 'phaser';
import { Culler, KineticScroll, snap } from './scroll';
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

  private kinetic: KineticScroll;
  private culler: Culler;

  constructor(private scene: Phaser.Scene, readonly top: number, readonly bottom: number) {
    this.content = scene.add.container(0, top);
    const maskG = scene.make.graphics({}, false).fillRect(0, top, W, bottom - top);
    this.content.setMask(maskG.createGeometryMask());
    this.culler = new Culler(scene.cameras.main);
    this.kinetic = new KineticScroll(scene, {
      inView: (y) => this.inView(y),
      get: () => this.scroll,
      set: (v) => this.setScroll(v),
      max: () => this.maxScroll(),
    });
  }

  inView(worldY: number): boolean {
    return worldY >= this.top && worldY <= this.bottom;
  }

  /** Bọc hành động chạm: bỏ qua nếu điểm chạm nằm ngoài vùng hiển thị (nút bị cuộn khuất) hoặc là thao tác cuộn. */
  guard(fn: () => void): () => void {
    return () => {
      if (this.kinetic.blockTap) return;
      if (this.inView(this.scene.input.activePointer.worldY)) fn();
    };
  }

  setHeight(h: number): void {
    this.height = h;
    this.culler.reset();
    this.setScroll(this.scroll);
  }

  private maxScroll(): number {
    return Math.max(0, this.height - (this.bottom - this.top));
  }

  setScroll(y: number): void {
    this.scroll = Phaser.Math.Clamp(y, 0, this.maxScroll());
    this.content.y = snap(this.top - this.scroll);
    this.culler.cull(this.content, this.top, this.bottom);
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
