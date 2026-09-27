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
  // Nẹp gỗ trang trí viền tiêu đề đậm chất tạp hóa xưa
  g.fillStyle(C.woodLight, 1).fillRect(0, 48, W, 2);
  g.fillStyle(0x1a120b, 0.5).fillRect(0, 50, W, 2);

  // Nút quay lại dạng phím cơ gỗ retro
  new Button(scene, 42, 25, { w: 62, h: 32, radius: 5, label: '‹ Về', color: C.wood, size: 14, onTap: onBack }).setDepth(10);
  txt(scene, W / 2 + 18, subtitle ? 16 : 25, title, { size: 17, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
  if (subtitle) txt(scene, W / 2 + 18, 36, subtitle, { size: 11, color: '#f7dcc0', origin: [0.5, 0.5] });
}

/** Vùng nội dung cuộn dọc có mặt nạ; kéo quá 8px mới tính là cuộn để không nhầm với chạm. */
export class ScrollArea {
  readonly content: Phaser.GameObjects.Container;
  private height = 0;
  private scroll = 0;

  private kinetic: KineticScroll;
  private culler: Culler;

  constructor(private scene: Phaser.Scene, readonly top: number, readonly bottom: number, private onScroll?: () => void) {
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
    clipInputToView(this.content, this.top, this.bottom);
    this.height = h;
    this.culler.reset();
    this.setScroll(this.scroll);
  }

  private maxScroll(): number {
    return Math.max(0, this.height - (this.bottom - this.top));
  }

  setScroll(y: number): void {
    const previous = this.scroll;
    this.scroll = Phaser.Math.Clamp(y, 0, this.maxScroll());
    this.content.y = snap(this.top - this.scroll);
    this.culler.cull(this.content, this.top, this.bottom);
    if (this.scroll !== previous) this.onScroll?.();
  }

  get scrollOffset(): number { return this.scroll; }

  clear(): void {
    this.content.removeAll(true);
  }

  add(items: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): void {
    this.content.add(items);
    for (const item of Array.isArray(items) ? items : [items]) clipInputToView(item, this.top, this.bottom);
  }
}

const clipped = new WeakSet<object>();

/**
 * Mặt nạ chỉ che phần hình, không che vùng chạm: ô bị cuộn khuất dưới footer vẫn "nuốt" cú chạm
 * của nút nằm dưới nó (vd. "Tự bày"). Bọc hit-test để đối tượng trong vùng cuộn chỉ nhận chạm
 * khi điểm chạm nằm trong khung nhìn [top, bottom] (tọa độ thế giới).
 */
export function clipInputToView(obj: Phaser.GameObjects.GameObject, top: number, bottom: number): void {
  const input = obj.input;
  if (input && !clipped.has(input)) {
    clipped.add(input);
    const inner = input.hitAreaCallback;
    const go = obj as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & { displayOriginX?: number; displayOriginY?: number };
    input.hitAreaCallback = (area: unknown, x: number, y: number, target: Phaser.GameObjects.GameObject) => {
      if (!inner(area, x, y, target)) return false;
      if (!go.getWorldTransformMatrix) return true;
      const world = go.getWorldTransformMatrix().transformPoint(x - (go.displayOriginX ?? 0), y - (go.displayOriginY ?? 0));
      return world.y >= top && world.y <= bottom;
    };
  }
  if (obj instanceof Phaser.GameObjects.Container) for (const child of obj.list) clipInputToView(child, top, bottom);
}

/** Thẻ nền phong cách nhãn hàng tiệm tạp hóa cổ điển, có gờ nổi nhẹ. */
export function card(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number = C.panel, radius = 6): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x1a120b, 0.18).fillRoundedRect(x, y + 2, w, h, radius);
  g.fillStyle(color, 1).fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, radius);
  g.lineStyle(1.5, C.panelEdge, 0.95).strokeRoundedRect(x, y, w, h, radius);
  return g;
}
