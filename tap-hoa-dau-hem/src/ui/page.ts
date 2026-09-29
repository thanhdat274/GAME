import Phaser from 'phaser';
import { Culler, KineticScroll, snap } from './scroll';
import { Button } from './widgets';
import { C, H, HEX, W, txt } from './theme';
import { currentLayout } from './layout';
import { persist } from '../game';

export const PAGE_TOP = 58;

const LANDSCAPE_PAGES = [
  { tab: 'Tiệm', items: [['Sáng', 'Morning'], ['Sơ đồ', 'StoreMap'], ['Kho', 'Warehouse'], ['Bố trí', 'Build'], ['Trang trí', 'Decor'], ['Bếp', 'Kitchen']] },
  { tab: 'Quản lý', items: [['Nhân sự', 'Staff'], ['Xếp ca', 'Schedule'], ['Quy tắc', 'Rules'], ['Nhiệm vụ', 'Quests'], ['Đánh giá', 'Reviews']] },
  { tab: 'Sổ sách', items: [['Phân tích', 'Analytics'], ['Lịch', 'Calendar'], ['Giá', 'Prices'], ['Sổ nợ', 'Ledger'], ['Thuế', 'Tax'], ['Hàng nhà', 'Internal']] },
  { tab: 'Mở rộng', items: [['Bản đồ phố', 'City'], ['Chi nhánh', 'Branches'], ['Hành trình', 'Story'], ['Danh hiệu', 'Prestige'], ['Cách chơi', 'HowTo']] },
] as const;

export function landscapePageNavigation(scene: Phaser.Scene): void {
  const shop = scene.scene.get('Shop');
  // Overlay scenes opened during a shift must not navigate away and discard the live DaySession.
  if (shop.sys.isActive() || shop.sys.isPaused() || shop.sys.isSleeping()) return;

  const trigger = new Button(scene, W - 34, 25, { w: 48, h: 32, radius: 5, label: '☰', color: C.wood, size: 18, onTap: toggle });
  trigger.setDepth(20);
  let drawer: Phaser.GameObjects.Container | null = null;

  function toggle(): void {
    if (drawer) {
      drawer.destroy(true);
      drawer = null;
      return;
    }
    drawer = scene.add.container(0, 0).setDepth(500);
    const width = Math.min(232, W - 16);
    const x = W - width - 8;
    const height = Math.min(H - 16, 252);
    drawer.add(scene.add.rectangle(W / 2, H / 2, W, H, 0x130d09, 0.34).setInteractive());
    drawer.add(scene.add.graphics().fillStyle(C.panel, 1).fillRoundedRect(x, 8, width, height, 8)
      .lineStyle(2, C.wood, 1).strokeRoundedRect(x, 8, width, height, 8));
    drawer.add(txt(scene, x + 12, 20, 'Đi tới màn', { size: 14, bold: true, color: HEX.ink }));
    const close = new Button(scene, x + width - 26, 25, { w: 34, h: 28, label: '×', color: C.grey, size: 17, onTap: () => { drawer?.destroy(true); drawer = null; } });
    close.setDepth(501);
    drawer.add(close);

    const tabY = 52;
    const tabGap = 4;
    const tabW = (width - 16 - tabGap * 3) / 4;
    const links = scene.add.container(0, 0);
    drawer.add(links);
    const renderTab = (selected: number) => {
      links.removeAll(true);
      LANDSCAPE_PAGES.forEach((group, index) => {
        const tab = new Button(scene, x + 8 + tabW / 2 + index * (tabW + tabGap), tabY, {
          w: tabW, h: 28, label: group.tab, size: 9, color: index === selected ? C.blue : C.wood,
          onTap: () => renderTab(index),
        });
        links.add(tab);
      });
      const group = LANDSCAPE_PAGES[selected];
      const columns = 2;
      const gap = 6;
      const itemW = (width - 24 - gap) / columns;
      group.items.forEach(([label, key], index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const target = new Button(scene, x + 12 + itemW / 2 + col * (itemW + gap), 88 + row * 44, {
          w: itemW, h: 38, label, size: 11, color: C.wood,
          onTap: () => {
            persist();
            const data = ['StoreMap', 'Quests', 'Reviews', 'Internal'].includes(key) ? { back: 'Morning' } : undefined;
            drawer?.destroy(true);
            drawer = null;
            scene.scene.start(key, data);
          },
        });
        links.add(target);
      });
    };
    renderTab(0);
    scene.input.once('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!drawer) return;
      const px = pointer.worldX;
      const py = pointer.worldY;
      if (px < x || py < 8 || py > 8 + height) { drawer.destroy(true); drawer = null; }
    });
  }

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => drawer?.destroy(true));
}

/** Nền + thanh tiêu đề có nút quay lại cho các màn quản lý (Kho, Giá, Sổ nợ...). */
export function pageFrame(scene: Phaser.Scene, title: string, onBack: () => void, subtitle?: string, backgroundAlpha = 1): void {
  const g = scene.add.graphics();
  g.fillStyle(C.wall, backgroundAlpha).fillRect(0, 0, W, H);
  g.fillStyle(C.hud, 1).fillRect(0, 0, W, 50);
  // Nẹp gỗ trang trí viền tiêu đề đậm chất tạp hóa xưa
  g.fillStyle(C.woodLight, 1).fillRect(0, 48, W, 2);
  g.fillStyle(0x1a120b, 0.5).fillRect(0, 50, W, 2);

  // Nút quay lại dạng phím cơ gỗ retro
  new Button(scene, 42, 25, { w: 62, h: 32, radius: 5, label: '‹ Về', color: C.wood, size: 14, onTap: onBack }).setDepth(10);
  const landscape = currentLayout().profile !== 'portrait';
  txt(scene, landscape ? W / 2 + 10 : W / 2 + 18, subtitle ? 16 : 25, title, { size: landscape ? 15 : 17, bold: true, color: HEX.cream, origin: [0.5, 0.5], wrap: landscape ? W - 156 : undefined });
  if (subtitle) txt(scene, W / 2 + 18, 36, subtitle, { size: 11, color: '#f7dcc0', origin: [0.5, 0.5] });
  landscapePageNavigation(scene);
}

/** Vùng nội dung cuộn dọc có mặt nạ; kéo quá 8px mới tính là cuộn để không nhầm với chạm. */
export class ScrollArea {
  readonly content: Phaser.GameObjects.Container;
  private height = 0;
  private scroll = 0;
  private bounds?: { x?: number; width?: number };

  private kinetic: KineticScroll;
  private culler: Culler;

  constructor(private scene: Phaser.Scene, readonly top: number, readonly bottom: number, private onScroll?: () => void, bounds?: { x?: number; width?: number }) {
    const x = bounds?.x ?? 0;
    const w = bounds?.width ?? W;
    this.bounds = bounds;
    this.content = scene.add.container(x, top);
    const maskG = scene.make.graphics({}, false).fillRect(x, top, w, bottom - top);
    this.content.setMask(maskG.createGeometryMask());
    this.culler = new Culler(scene.cameras.main);
    this.kinetic = new KineticScroll(scene, {
      inView: (y, xCoord) => this.inView(y, xCoord),
      get: () => this.scroll,
      set: (v) => this.setScroll(v),
      max: () => this.maxScroll(),
    });
  }

  inView(worldY: number, worldX?: number): boolean {
    if (worldY < this.top || worldY > this.bottom) return false;
    if (this.bounds?.x !== undefined && worldX !== undefined) {
      const minX = this.bounds.x;
      const maxX = minX + (this.bounds.width ?? W);
      return worldX >= minX && worldX <= maxX;
    }
    return true;
  }

  /** Bọc hành động chạm: bỏ qua nếu điểm chạm nằm ngoài vùng hiển thị (nút bị cuộn khuất) hoặc là thao tác cuộn. */
  guard(fn: () => void): () => void {
    return () => {
      if (this.kinetic.blockTap) return;
      const ptr = this.scene.input.activePointer;
      if (this.inView(ptr.worldY, ptr.worldX)) fn();
    };
  }

  setHeight(h: number): void {
    const boundsX = this.bounds?.x !== undefined ? { min: this.bounds.x, max: this.bounds.x + (this.bounds.width ?? W) } : undefined;
    clipInputToView(this.content, this.top, this.bottom, boundsX);
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
    const boundsX = this.bounds?.x !== undefined ? { min: this.bounds.x, max: this.bounds.x + (this.bounds.width ?? W) } : undefined;
    for (const item of Array.isArray(items) ? items : [items]) clipInputToView(item, this.top, this.bottom, boundsX);
  }
}

const clipped = new WeakSet<object>();

/**
 * Mặt nạ chỉ che phần hình, không che vùng chạm: ô bị cuộn khuất dưới footer vẫn "nuốt" cú chạm
 * của nút nằm dưới nó (vd. "Tự bày"). Bọc hit-test để đối tượng trong vùng cuộn chỉ nhận chạm
 * khi điểm chạm nằm trong khung nhìn [top, bottom] (tọa độ thế giới).
 */
export function clipInputToView(obj: Phaser.GameObjects.GameObject, top: number, bottom: number, boundsX?: { min: number; max: number }): void {
  const input = obj.input;
  if (input && !clipped.has(input)) {
    clipped.add(input);
    const inner = input.hitAreaCallback;
    const go = obj as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & { displayOriginX?: number; displayOriginY?: number };
    input.hitAreaCallback = (area: unknown, x: number, y: number, target: Phaser.GameObjects.GameObject) => {
      if (!inner(area, x, y, target)) return false;
      if (!go.getWorldTransformMatrix) return true;
      const world = go.getWorldTransformMatrix().transformPoint(x - (go.displayOriginX ?? 0), y - (go.displayOriginY ?? 0));
      const inY = world.y >= top && world.y <= bottom;
      if (!inY) return false;
      if (boundsX) return world.x >= boundsX.min && world.x <= boundsX.max;
      return true;
    };
  }
  if (obj instanceof Phaser.GameObjects.Container) for (const child of obj.list) clipInputToView(child, top, bottom, boundsX);
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
