import Phaser from 'phaser';
import { product } from '../core/data';
import { productIcon, productName } from './art';
import { C, HEX, txt } from './theme';

export interface ChipItem {
  id: string;
  qty: number;
  selected?: boolean;
}

export interface ChipGridOptions {
  cols: number;
  chipW: number;
  chipH: number;
  /** Tâm ô đầu tiên (tọa độ trong container cha). */
  x0: number;
  y0: number;
  pitchX: number;
  pitchY: number;
  onTap: (id: string, pointer: Phaser.Input.Pointer) => void;
}

interface ChipView {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  qty: Phaser.GameObjects.Text;
  shownQty: number;
  shownSelected: boolean | null;
  index: number;
}

/**
 * Lưới ô món trong kho, cập nhật theo id món thay vì dựng lại toàn bộ mỗi lần chạm.
 * Chỉ tạo ô cho món mới xuất hiện, hủy ô của món đã hết, còn lại chỉ đổi vị trí / số lượng /
 * viền chọn. Tạo chữ trên canvas là thao tác đắt nhất, nên kho 100+ món vẫn chạm mượt.
 */
export class ChipGrid {
  private views = new Map<string, ChipView>();

  constructor(private scene: Phaser.Scene, private parent: { add(items: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): void }, private o: ChipGridOptions) {}

  /** Đồng bộ lưới với danh sách món; trả về chiều cao nội dung. */
  update(items: ChipItem[]): number {
    const alive = new Set(items.map((item) => item.id));
    for (const [id, view] of this.views) {
      if (!alive.has(id)) {
        view.root.destroy();
        this.views.delete(id);
      }
    }
    items.forEach((item, index) => {
      const view = this.views.get(item.id) ?? this.create(item.id);
      if (view.index !== index) {
        view.index = index;
        view.root.setPosition(this.o.x0 + (index % this.o.cols) * this.o.pitchX, this.o.y0 + Math.floor(index / this.o.cols) * this.o.pitchY);
      }
      if (view.shownQty !== item.qty) {
        view.shownQty = item.qty;
        view.qty.setText(`x${item.qty}`);
      }
      const selected = !!item.selected;
      if (view.shownSelected !== selected) {
        view.shownSelected = selected;
        this.drawBg(view.bg, selected);
      }
    });
    return items.length ? Math.ceil(items.length / this.o.cols) * this.o.pitchY : 0;
  }

  clear(): void {
    for (const view of this.views.values()) view.root.destroy();
    this.views.clear();
  }

  get size(): number {
    return this.views.size;
  }

  private create(id: string): ChipView {
    const { chipW: w, chipH: h } = this.o;
    const p = product(id);
    const bg = this.scene.add.graphics();
    const qty = txt(this.scene, w / 2 - 3, -h / 2 + 29, '', { size: 10, bold: true, color: HEX.white, origin: [1, 1] })
      .setBackgroundColor('#3b2618cc').setPadding(3, 0, 3, 0);
    const parts: Phaser.GameObjects.GameObject[] = [
      bg,
      productIcon(this.scene, 0, -h / 2 + 16, p, 26),
      productName(this.scene, 0, h / 2 - 1, p, w - 4, { origin: [0.5, 1] }),
      qty,
    ];
    if (p.behindCounter) parts.push(txt(this.scene, -w / 2 + 3, -h / 2 + 2, '🔐', { size: 10, emoji: true }));
    const root = this.scene.add.container(0, 0, parts).setSize(w, h).setInteractive({ useHandCursor: true });
    root.on('pointerup', (pointer: Phaser.Input.Pointer) => this.o.onTap(id, pointer));
    const view: ChipView = { root, bg, qty, shownQty: -1, shownSelected: null, index: -1 };
    this.views.set(id, view);
    this.parent.add(root);
    return view;
  }

  private drawBg(g: Phaser.GameObjects.Graphics, selected: boolean): void {
    const { chipW: w, chipH: h } = this.o;
    g.clear();
    g.fillStyle(selected ? C.yellow : C.slot, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    g.lineStyle(selected ? 3 : 2, selected ? C.red : C.slotEdge, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
  }
}
