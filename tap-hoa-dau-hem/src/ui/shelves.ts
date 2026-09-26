import Phaser from 'phaser';
import { product, type Category } from '../core/data';
import { counterFixture, walkTiles } from '../core/layout';
import { MAX_SHELVES, fixtureOfShelf, shelfKind, shelfUsable, shelfCount, type GameState } from '../core/state';
import { canRefill, slotFreshness, zoneFill, zoneOf } from '../core/stock';
import { productIcon } from './art';
import { C, HEX, txt } from './theme';

export const SLOT_W = 52;
export const SLOT_H = 54;
const GAP = 4;
const X0 = 14;
export const ROW_PITCH = 64;

export const ZONE_NAMES: Record<Exclude<Category, 'counter'>, string> = {
  dry: 'ĐỒ KHÔ',
  snack: 'ĂN VẶT',
  household: 'ĐỒ DÙNG',
  drink: 'ĐỒ UỐNG',
  fresh: 'ĐỒ TƯƠI',
  frozen: 'ĐÔNG LẠNH',
  food: 'ĐỒ ĂN',
  beverage: 'ĐỒ UỐNG PHA CHẾ',
};

export interface ShelfCallbacks {
  onSlotTap: (shelf: number, slot: number) => void;
  onRefill?: (shelf: number, slot: number) => void;
  onRemove?: (shelf: number, slot: number) => void;
  /** Gọi khi khung nhìn cuộn; `atCounter` = đang nhìn các kệ sát quầy. */
  onScroll?: (atCounter: boolean) => void;
}

export interface ShelfRenderOpts {
  mode: 'arrange' | 'sell';
  /** Món khách đang cần (để nhấp nháy gợi ý). */
  highlight?: Set<string>;
  refilling?: (shelf: number, slot: number) => number | null;
  /** Ẩn nút + nạp nhanh (bày kệ lúc tạm dừng giữa giờ bán). */
  noRefill?: boolean;
}

interface SlotView {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Container | null;
  iconId: string | null;
  qty: Phaser.GameObjects.Text;
  out: Phaser.GameObjects.Text;
  fresh: Phaser.GameObjects.Text;
  refillBtn: Phaser.GameObjects.Container;
  removeBtn: Phaser.GameObjects.Container;
  progress: Phaser.GameObjects.Graphics;
  glow: Phaser.GameObjects.Graphics;
  /** Khóa trạng thái nền / nhãn hạn đã vẽ, để render() chỉ vẽ lại khi thay đổi. */
  bgKey: string;
  freshKey: string;
}

interface RowView {
  shelf: number;
  slots: SlotView[];
  lock: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  tween: Phaser.Tweens.Tween | null;
  /** Nội dung nhãn khu đang hiển thị (tránh vẽ lại chữ khi không đổi). */
  labelKey: string;
}

/**
 * Kệ hiển thị theo không gian tiệm, từ trên xuống: kệ/tủ mua thêm (xa quầy nhất ở trên cùng),
 * rồi 3 kệ gốc sát quầy (giữ đúng thứ tự giai đoạn 1). Khung nhìn mặc định ở phía quầy.
 */
export function displayShelves(state: GameState): number[] {
  const base: number[] = [];
  const extra: number[] = [];
  for (let i = 0; i < state.shelves.length; i++) {
    if (i < MAX_SHELVES) { if (fixtureOfShelf(state, i)) base.push(i); }
    else if (shelfUsable(state, i)) extra.push(i);
  }
  const counter = counterFixture(state) ?? null;
  const dist = new Map(extra.map((i) => {
    let tiles = 0;
    try { tiles = walkTiles(state, counter, fixtureOfShelf(state, i) ?? null); } catch { tiles = 0; }
    return [i, tiles] as const;
  }));
  extra.sort((a, b) => dist.get(b)! - dist.get(a)! || a - b);
  return [...extra, ...base];
}

/**
 * Các kệ hàng: dùng chung cho buổi sáng (bày kệ) và lúc bán hàng.
 * Khi tiệm có nhiều kệ hơn số hàng hiển thị, kéo dọc một ngón (ngưỡng 8px) để cuộn.
 */
export class ShelfView extends Phaser.GameObjects.Container {
  private rows: RowView[] = [];
  private byShelf = new Map<number, RowView>();
  private glowTween: Phaser.Tweens.Tween | null = null;
  private content: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private readonly viewH: number;
  private moreUp: Phaser.GameObjects.Text | null = null;
  private moreDown: Phaser.GameObjects.Text | null = null;
  private scrollTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, readonly top: number, private cb: ShelfCallbacks, state: GameState, viewRows = MAX_SHELVES) {
    super(scene, 0, 0);
    this.viewH = viewRows * ROW_PITCH;
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    const planks = scene.add.graphics();
    this.content.add(planks);
    displayShelves(state).forEach((shelf, index) => {
      const y = top + index * ROW_PITCH;
      const kind = shelfKind(state, shelf);
      const width = state.shelves[shelf].length * (SLOT_W + GAP) + 12;
      if (kind === 'shelf') {
        planks.fillStyle(C.woodDark, 1).fillRect(6, y + SLOT_H + 1, width, 6);
        planks.fillStyle(C.woodLight, 1).fillRect(6, y + SLOT_H, width, 2);
      } else {
        // Tủ lạnh / tủ đông: khung kim loại màu lạnh.
        planks.fillStyle(kind === 'fridge' ? 0xcfe8f7 : 0xb9d7f0, 1).fillRoundedRect(6, y - 3, width, SLOT_H + 9, 8);
        planks.lineStyle(2, 0x7fa9c9, 1).strokeRoundedRect(6, y - 3, width, SLOT_H + 9, 8);
      }
      const slots: SlotView[] = [];
      for (let c = 0; c < state.shelves[shelf].length; c++) slots.push(this.makeSlot(shelf, index, c));
      const lock = scene.add.container(180, y + SLOT_H / 2, [
        scene.add.rectangle(0, 0, 340, SLOT_H + 4, 0x3b2618, 0.75),
        txt(scene, 0, 0, '🔒 Kệ mở ở level 3', { size: 14, bold: true, color: HEX.cream, origin: [0.5, 0.5] }),
      ]);
      this.content.add(lock);
      const label = txt(scene, 12, y - 8, '', { size: 9, bold: true, color: HEX.ink });
      label.setBackgroundColor(kind === 'shelf' ? '#f3dfbd' : '#d9eefb').setPadding(3, 1, 3, 1);
      this.content.add(label);
      const row: RowView = { shelf, slots, lock, label, tween: null, labelKey: '' };
      this.rows.push(row);
      this.byShelf.set(shelf, row);
    });
    this.maxScroll = Math.max(0, this.rows.length * ROW_PITCH - this.viewH);
    if (this.maxScroll > 0) {
      this.enableScroll();
      // Chỉ báo còn kệ phía trên / dưới khung nhìn.
      this.moreUp = txt(scene, 352, this.top - 6, '▲ kệ khác', { size: 9, bold: true, color: HEX.white, origin: [1, 0.5] });
      this.moreDown = txt(scene, 352, this.top + this.viewH - 6, '▼ phía quầy', { size: 9, bold: true, color: HEX.white, origin: [1, 0.5] });
      for (const t of [this.moreUp, this.moreDown]) t.setBackgroundColor('#3b2618cc').setPadding(4, 1, 4, 1);
      this.add([this.moreUp, this.moreDown]);
    }
    scene.add.existing(this);
    this.setScroll(this.maxScroll);
  }

  /** Số kệ vượt quá khung nhìn (để scene hiện gợi ý "kéo để xem thêm"). */
  get scrollable(): boolean {
    return this.maxScroll > 0;
  }

  private inView(worldY: number): boolean {
    return worldY >= this.top - 12 && worldY <= this.top + this.viewH;
  }

  private enableScroll(): void {
    const s = this.scene;
    // Khung nhìn kết thúc trước nhãn của hàng kế tiếp để nhãn không lòi ra dưới khung.
    const maskG = s.make.graphics({}, false).fillRect(0, this.top - 14, 360, this.viewH + 4);
    this.content.setMask(maskG.createGeometryMask());
    let startY = 0;
    let startScroll = 0;
    let active = false;
    let dragging = false;
    s.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      active = this.visible && this.inView(p.worldY);
      dragging = false;
      startY = p.worldY;
      startScroll = this.scrollY;
    });
    s.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!active || !p.isDown) return;
      if (!dragging && Math.abs(p.worldY - startY) < 8) return;
      dragging = true;
      this.scrollTween?.remove();
      this.setScroll(startScroll - (p.worldY - startY));
    });
    s.input.on('pointerup', () => { active = false; });
    s.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.visible || !this.inView(p.worldY)) return;
      this.setScroll(this.scrollY + dy * 0.5);
    });
  }

  setScroll(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
    this.moreUp?.setVisible(this.scrollY > 4);
    this.moreDown?.setVisible(this.scrollY < this.maxScroll - 4);
    this.cb.onScroll?.(this.atCounter);
  }

  /** Đang nhìn các kệ sát quầy (vị trí mặc định). */
  get atCounter(): boolean {
    return this.scrollY >= this.maxScroll - 4;
  }

  private animateTo(y: number): void {
    const target = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.scrollTween?.remove();
    const from = { v: this.scrollY };
    this.scrollTween = this.scene.tweens.add({ targets: from, v: target, duration: 260, ease: 'Sine.easeOut', onUpdate: () => this.setScroll(from.v) });
  }

  /** Nút "Về quầy": cuộn về các kệ sát quầy. */
  scrollToCounter(): void {
    this.animateTo(this.maxScroll);
  }



  private slotPos(index: number, c: number): { x: number; y: number } {
    return { x: X0 + c * (SLOT_W + GAP) + SLOT_W / 2, y: this.top + index * ROW_PITCH + SLOT_H / 2 };
  }

  /** Tọa độ màn hình của ô (đã tính cuộn). */
  slotCenter(shelf: number, slot: number): { x: number; y: number } {
    const index = this.rows.findIndex((r) => r.shelf === shelf);
    const p = this.slotPos(Math.max(0, index), slot);
    return { x: p.x, y: p.y - this.scrollY };
  }

  private makeSlot(r: number, index: number, c: number): SlotView {
    const s = this.scene;
    const { x, y } = this.slotPos(index, c);
    const bg = s.add.graphics();
    const glow = s.add.graphics();
    glow.lineStyle(3, C.yellow, 1).strokeRoundedRect(-SLOT_W / 2 - 1, -SLOT_H / 2 - 1, SLOT_W + 2, SLOT_H + 2, 8);
    glow.setVisible(false);
    const qty = txt(s, SLOT_W / 2 - 4, SLOT_H / 2 - 3, '', { size: 11, bold: true, color: HEX.ink, origin: [1, 1] });
    const out = txt(s, 0, SLOT_H / 2 - 9, 'Hết', { size: 10, bold: true, color: HEX.white, origin: [0.5, 0.5] });
    out.setBackgroundColor(HEX.red).setPadding(3, 1, 3, 1);
    const fresh = txt(s, -SLOT_W / 2 + 2, SLOT_H / 2 - 2, '', { size: 8, bold: true, color: HEX.white, origin: [0, 1] });
    fresh.setPadding(2, 0, 2, 0);
    const progress = s.add.graphics();

    const refillBtn = s.add.container(SLOT_W / 2 - 8, -SLOT_H / 2 + 8, [
      s.add.circle(0, 0, 9, C.green).setStrokeStyle(2, 0xffffff),
      txt(s, 0, 0, '+', { size: 13, bold: true, color: HEX.white, origin: [0.5, 0.5] }),
    ]);
    // Vùng chạm lớn hơn hình để dễ bấm trên điện thoại.
    refillBtn.setSize(26, 26).setInteractive({ useHandCursor: true });
    refillBtn.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (p.getDistance() < 10 && this.inView(p.worldY)) this.cb.onRefill?.(r, c);
    });

    const removeBtn = s.add.container(-SLOT_W / 2 + 8, -SLOT_H / 2 + 8, [
      s.add.circle(0, 0, 8, C.red).setStrokeStyle(2, 0xffffff),
      txt(s, 0, 0, '×', { size: 12, bold: true, color: HEX.white, origin: [0.5, 0.5] }),
    ]);
    removeBtn.setSize(24, 24).setInteractive({ useHandCursor: true });
    removeBtn.on('pointerup', (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      if (p.getDistance() < 10 && this.inView(p.worldY)) this.cb.onRemove?.(r, c);
    });

    const root = s.add.container(x, y, [bg, glow, qty, out, fresh, progress, refillBtn, removeBtn]);
    root.setSize(SLOT_W, SLOT_H).setInteractive({ useHandCursor: true });
    root.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.getDistance() < 12 && this.inView(p.worldY)) this.cb.onSlotTap(r, c);
    });
    this.content.add(root);
    return { root, bg, icon: null, iconId: null, qty, out, fresh, refillBtn, removeBtn, progress, glow, bgKey: '', freshKey: '' };
  }

  /** Ô kệ tại tọa độ (dùng khi thả hàng kéo từ kho). */
  slotAt(x: number, y: number): { shelf: number; slot: number } | null {
    if (!this.inView(y)) return null;
    for (let index = 0; index < this.rows.length; index++) {
      const row = this.rows[index];
      for (let c = 0; c < row.slots.length; c++) {
        const { x: cx, y: cy } = this.slotPos(index, c);
        if (Math.abs(x - cx) <= SLOT_W / 2 + GAP / 2 && Math.abs(y + this.scrollY - cy) <= SLOT_H / 2 + 4) return { shelf: row.shelf, slot: c };
      }
    }
    return null;
  }

  render(state: GameState, o: ShelfRenderOpts): void {
    const baseRows = shelfCount(state.level);
    let anyGlow = false;
    for (const row of this.rows) {
      const r = row.shelf;
      const locked = r < MAX_SHELVES && r >= baseRows;
      row.lock.setVisible(locked);
      const zone = zoneOf(state, r);
      const kind = shelfKind(state, r);
      const zoneLabel = row.label;
      const prefix = kind === 'fridge' ? '🧊 TỦ LẠNH' : kind === 'freezer' ? '❄️ TỦ ĐÔNG' : '';
      zoneLabel.setVisible(!locked && (!!zone || !!prefix));
      if (!locked && zone) {
        const fill = zoneFill(state, zone);
        const text = `${prefix ? `${prefix} · ` : ''}${ZONE_NAMES[zone]} · ${Math.round(fill.fill * 100)}%`;
        const color = fill.alert === 'critical' ? HEX.red : fill.alert === 'low' ? '#9a6200' : HEX.ink;
        if (row.labelKey !== text + color) {
          row.labelKey = text + color;
          zoneLabel.setText(text).setColor(color);
        }
        const alerting = fill.alert !== 'ok';
        if (alerting && !row.tween) {
          row.tween = this.scene.tweens.add({ targets: zoneLabel, alpha: 0.35, yoyo: true, repeat: -1, duration: fill.alert === 'critical' ? 260 : 520 });
        } else if (!alerting && row.tween) {
          row.tween.remove();
          row.tween = null;
          zoneLabel.setAlpha(1);
        }
      } else {
        if (prefix && row.labelKey !== prefix) {
          row.labelKey = prefix;
          zoneLabel.setText(prefix).setColor(HEX.ink);
        }
        if (row.tween) {
          row.tween.remove();
          row.tween = null;
          zoneLabel.setAlpha(1);
        }
      }
      row.slots.forEach((v, c) => {
        const slot = state.shelves[r][c];
        const empty = !slot.productId || slot.qty === 0;
        const bgKey = `${kind}|${locked}`;
        if (v.bgKey !== bgKey) {
          v.bgKey = bgKey;
          v.bg.clear();
          v.bg.fillStyle(kind === 'shelf' ? C.slot : 0xeef7fd, locked ? 0.4 : 1).fillRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 7);
          v.bg.lineStyle(2, kind === 'shelf' ? C.slotEdge : 0x9cc3de, 1).strokeRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 7);
        }
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
        const whHas = slot.productId ? state.warehouse.some((lot) => lot.productId === slot.productId && lot.qty > 0) : false;
        v.out.setVisible(!locked && !!slot.productId && slot.qty === 0 && !whHas);
        // Nhãn hạn dùng: đỏ = hết hạn hôm nay, vàng = hết hạn ngày mai; bán xả hiện phần trăm giảm.
        const freshness = !empty ? slotFreshness(slot, state.day) : null;
        const freshKey = slot.clearance && !empty ? `c${slot.clearance}` : freshness ?? '';
        if (v.freshKey !== freshKey) {
          v.freshKey = freshKey;
          if (slot.clearance && !empty) v.fresh.setText(`-${slot.clearance}%`).setBackgroundColor(HEX.red).setVisible(true);
          else if (freshness) v.fresh.setText(freshness === 'today' ? 'HẠN' : 'MAI').setBackgroundColor(freshness === 'today' ? HEX.red : '#d49a00').setVisible(true);
          else v.fresh.setVisible(false);
        }
        const prog = o.refilling?.(r, c) ?? null;
        if (prog !== null || v.progress.commandBuffer.length) v.progress.clear();
        if (prog !== null) {
          v.progress.fillStyle(0x000000, 0.35).fillRoundedRect(-SLOT_W / 2 + 4, SLOT_H / 2 - 9, SLOT_W - 8, 6, 3);
          v.progress.fillStyle(C.green, 1).fillRoundedRect(-SLOT_W / 2 + 4, SLOT_H / 2 - 9, (SLOT_W - 8) * prog, 6, 3);
        }
        v.refillBtn.setVisible(!o.noRefill && !locked && prog === null && canRefill(state, r, c));
        v.removeBtn.setVisible(o.mode === 'arrange' && !locked && !!slot.productId);
        const glow = !locked && !empty && !!slot.productId && !!o.highlight?.has(slot.productId);
        v.glow.setVisible(glow);
        anyGlow ||= glow;
        v.root.setAlpha(locked ? 0.5 : 1);
      });
    }
    if (anyGlow && !this.glowTween) {
      const glows = this.rows.flatMap((row) => row.slots.map((v) => v.glow));
      this.glowTween = this.scene.tweens.add({ targets: glows, alpha: 0.25, yoyo: true, repeat: -1, duration: 420 });
    } else if (!anyGlow && this.glowTween) {
      this.glowTween.remove();
      this.glowTween = null;
      this.rows.forEach((row) => row.slots.forEach((v) => v.glow.setAlpha(1)));
    }
  }

  /** Rung ô kệ khi lấy sai. */
  shake(shelf: number, slot: number): void {
    const v = this.byShelf.get(shelf)?.slots[slot];
    if (!v) return;
    const x = v.root.x;
    this.scene.tweens.add({ targets: v.root, x: x + 4, yoyo: true, repeat: 3, duration: 40, onComplete: () => v.root.setX(x) });
  }

  pop(shelf: number, slot: number): void {
    const v = this.byShelf.get(shelf)?.slots[slot];
    if (!v) return;
    this.scene.tweens.add({ targets: v.root, scale: 1.1, yoyo: true, duration: 90 });
  }
}

/** Tên có dấu cho thông báo "cần tủ…". */
export function placeErrorText(error: string): string {
  switch (error) {
    case 'wrong-zone': return 'Sai khu hàng! Hãy chọn đúng kệ cùng nhóm.';
    case 'needs-fridge': return 'Cần tủ lạnh';
    case 'needs-freezer': return 'Cần tủ đông';
    case 'cold-only': return 'Tủ này chỉ để đồ lạnh phù hợp';
    case 'counter-only': return 'Hàng sau quầy: đặt vào ô quầy';
    default: return 'Không bày được ở đây';
  }
}
