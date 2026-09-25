import Phaser from 'phaser';
import { DATA, product } from '../core/data';
import { MAX_SHELVES, shelfCount, type GameState } from '../core/state';
import { canRefill } from '../core/stock';
import { productIcon } from './art';
import { C, HEX, txt } from './theme';

export const SLOT_W = 52;
export const SLOT_H = 54;
const GAP = 4;
const X0 = 14;
export const ROW_PITCH = 64;

export interface ShelfCallbacks {
  onSlotTap: (shelf: number, slot: number) => void;
  onRefill?: (shelf: number, slot: number) => void;
  onRemove?: (shelf: number, slot: number) => void;
}

export interface ShelfRenderOpts {
  mode: 'arrange' | 'sell';
  /** Món khách đang cần (để nhấp nháy gợi ý). */
  highlight?: Set<string>;
  refilling?: (shelf: number, slot: number) => number | null;
}

interface SlotView {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Container | null;
  iconId: string | null;
  qty: Phaser.GameObjects.Text;
  out: Phaser.GameObjects.Text;
  refillBtn: Phaser.GameObjects.Container;
  removeBtn: Phaser.GameObjects.Container;
  progress: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Graphics;
}

export function slotCenter(top: number, shelf: number, slot: number): { x: number; y: number } {
  return { x: X0 + slot * (SLOT_W + GAP) + SLOT_W / 2, y: top + shelf * ROW_PITCH + SLOT_H / 2 };
}

/** Các kệ hàng: dùng chung cho buổi sáng (bày kệ) và lúc bán hàng. */
export class ShelfView extends Phaser.GameObjects.Container {
  private slots: SlotView[][] = [];
  private lockLabels: Phaser.GameObjects.Container[] = [];
  private glowTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, readonly top: number, private cb: ShelfCallbacks) {
    super(scene, 0, 0);
    const planks = scene.add.graphics();
    this.add(planks);
    for (let r = 0; r < MAX_SHELVES; r++) {
      const y = top + r * ROW_PITCH;
      planks.fillStyle(C.woodDark, 1).fillRect(6, y + SLOT_H + 1, 348, 6);
      planks.fillStyle(C.woodLight, 1).fillRect(6, y + SLOT_H, 348, 2);
      const row: SlotView[] = [];
      for (let c = 0; c < DATA.balance.slotsPerShelf; c++) row.push(this.makeSlot(r, c));
      this.slots.push(row);
      const lock = scene.add.container(180, y + SLOT_H / 2, [
        scene.add.rectangle(0, 0, 340, SLOT_H + 4, 0x3b2618, 0.75),
        txt(scene, 0, 0, '🔒 Kệ mở ở level 3', { size: 14, bold: true, color: HEX.cream, origin: [0.5, 0.5] }),
      ]);
      this.lockLabels.push(lock);
      this.add(lock);
    }
    scene.add.existing(this);
  }

  private makeSlot(r: number, c: number): SlotView {
    const s = this.scene;
    const { x, y } = slotCenter(this.top, r, c);
    const bg = s.add.graphics();
    const glow = s.add.graphics();
    glow.lineStyle(3, C.yellow, 1).strokeRoundedRect(-SLOT_W / 2 - 1, -SLOT_H / 2 - 1, SLOT_W + 2, SLOT_H + 2, 8);
    glow.setVisible(false);
    const qty = txt(s, SLOT_W / 2 - 4, SLOT_H / 2 - 3, '', { size: 11, bold: true, color: HEX.ink, origin: [1, 1] });
    const out = txt(s, 0, SLOT_H / 2 - 9, 'Hết', { size: 10, bold: true, color: HEX.white, origin: [0.5, 0.5] });
    out.setBackgroundColor(HEX.red).setPadding(3, 1, 3, 1);
    const progress = s.add.graphics();

    const refillBtn = s.add.container(SLOT_W / 2 - 8, -SLOT_H / 2 + 8, [
      s.add.circle(0, 0, 9, C.green).setStrokeStyle(2, 0xffffff),
      txt(s, 0, 0, '+', { size: 13, bold: true, color: HEX.white, origin: [0.5, 0.5] }),
    ]);
    // Vùng chạm lớn hơn hình để dễ bấm trên điện thoại.
    refillBtn.setSize(26, 26).setInteractive({ useHandCursor: true });
    refillBtn.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (p.getDistance() < 10) this.cb.onRefill?.(r, c);
    });

    const removeBtn = s.add.container(-SLOT_W / 2 + 8, -SLOT_H / 2 + 8, [
      s.add.circle(0, 0, 8, C.red).setStrokeStyle(2, 0xffffff),
      txt(s, 0, 0, '×', { size: 12, bold: true, color: HEX.white, origin: [0.5, 0.5] }),
    ]);
    removeBtn.setSize(24, 24).setInteractive({ useHandCursor: true });
    removeBtn.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (p.getDistance() < 10) this.cb.onRemove?.(r, c);
    });

    const root = s.add.container(x, y, [bg, glow, qty, out, progress, refillBtn, removeBtn]);
    root.setSize(SLOT_W, SLOT_H).setInteractive({ useHandCursor: true });
    root.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 12) this.cb.onSlotTap(r, c);
    });
    this.add(root);
    return { root, bg, icon: null, iconId: null, qty, out, refillBtn, removeBtn, progress, glow };
  }

  /** Ô kệ tại tọa độ (dùng khi thả hàng kéo từ kho). */
  slotAt(x: number, y: number): { shelf: number; slot: number } | null {
    for (let r = 0; r < this.slots.length; r++) {
      for (let c = 0; c < this.slots[r].length; c++) {
        const { x: cx, y: cy } = slotCenter(this.top, r, c);
        if (Math.abs(x - cx) <= SLOT_W / 2 + GAP / 2 && Math.abs(y - cy) <= SLOT_H / 2 + 4) return { shelf: r, slot: c };
      }
    }
    return null;
  }

  render(state: GameState, o: ShelfRenderOpts): void {
    const rows = shelfCount(state.level);
    let anyGlow = false;
    this.slots.forEach((row, r) => {
      const locked = r >= rows;
      this.lockLabels[r].setVisible(locked);
      row.forEach((v, c) => {
        const slot = state.shelves[r][c];
        const empty = !slot.productId || slot.qty === 0;
        v.bg.clear();
        v.bg.fillStyle(C.slot, locked ? 0.4 : 1).fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 7);
        v.bg.lineStyle(2, C.slotEdge, 1).strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 7);
        if (v.iconId !== slot.productId) {
          v.icon?.destroy();
          v.icon = null;
          v.iconId = slot.productId;
          if (slot.productId) {
            v.icon = productIcon(this.scene, 0, -4, product(slot.productId), 34);
            v.root.addAt(v.icon, 2);
          }
        }
        v.icon?.setAlpha(empty ? 0.3 : 1);
        v.qty.setText(slot.productId ? `x${slot.qty}` : '');
        const whHas = slot.productId ? (state.warehouse[slot.productId] ?? 0) > 0 : false;
        v.out.setVisible(!locked && !!slot.productId && slot.qty === 0 && !whHas);
        const prog = o.refilling?.(r, c) ?? null;
        v.progress.clear();
        if (prog !== null) {
          v.progress.fillStyle(0x000000, 0.35).fillRoundedRect(-SLOT_W / 2 + 4, SLOT_H / 2 - 9, SLOT_W - 8, 6, 3);
          v.progress.fillStyle(C.green, 1).fillRoundedRect(-SLOT_W / 2 + 4, SLOT_H / 2 - 9, (SLOT_W - 8) * prog, 6, 3);
        }
        v.refillBtn.setVisible(!locked && prog === null && canRefill(state, r, c));
        v.removeBtn.setVisible(o.mode === 'arrange' && !locked && !!slot.productId);
        const glow = !locked && !empty && !!slot.productId && !!o.highlight?.has(slot.productId);
        v.glow.setVisible(glow);
        anyGlow ||= glow;
        v.root.setAlpha(locked ? 0.5 : 1);
      });
    });
    if (anyGlow && !this.glowTween) {
      const glows = this.slots.flat().map((v) => v.glow);
      this.glowTween = this.scene.tweens.add({ targets: glows, alpha: 0.25, yoyo: true, repeat: -1, duration: 420 });
    } else if (!anyGlow && this.glowTween) {
      this.glowTween.remove();
      this.glowTween = null;
      this.slots.flat().forEach((v) => v.glow.setAlpha(1));
    }
  }

  /** Rung ô kệ khi lấy sai. */
  shake(shelf: number, slot: number): void {
    const v = this.slots[shelf][slot];
    const x = v.root.x;
    this.scene.tweens.add({ targets: v.root, x: x + 4, yoyo: true, repeat: 3, duration: 40, onComplete: () => v.root.setX(x) });
  }

  pop(shelf: number, slot: number): void {
    const v = this.slots[shelf][slot];
    this.scene.tweens.add({ targets: v.root, scale: 1.1, yoyo: true, duration: 90 });
  }
}
