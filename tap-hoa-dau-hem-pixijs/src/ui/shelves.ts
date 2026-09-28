import * as Engine from '../engine';
import { product, type Category } from '../core/data';
import { counterFixture, walkTiles } from '../core/layout';
import { MAX_SHELVES, fixtureOfShelf, shelfKind, shelfUsable, shelfCount, type GameState } from '../core/state';
import { canRefill, slotFreshness, zoneFill, zoneOf } from '../core/stock';
import { productIcon, productName } from './art';
import { KineticScroll, clipInteractive, snap } from './scroll';
import { C, H, HEX, ZOOM, txt } from './theme';

export const SLOT_W = 52;
export const SLOT_H = 54;
const GAP = 4;
const X0 = 14;
export const ROW_PITCH = 64;
/** Số hàng kệ hiện cùng lúc (bán hàng, buổi sáng, nhập hàng): màn hình đủ cao (≥ 640 + 1 hàng) thì thêm 1 hàng. */
export const SHELF_VIEW_ROWS = H >= 640 + ROW_PITCH ? MAX_SHELVES + 1 : MAX_SHELVES;
/** Số ô trên một tầng hiển thị; kệ nhiều ô hơn xuống tầng dưới. */
const SLOTS_PER_LINE = 6;

function ensureShelfButtonTextures(scene: Engine.Scene): void {
  for (const [key, color, symbol] of [
    ['shelf_refill_button', C.green, '+'],
    ['shelf_remove_button', C.red, 'x'],
  ] as const) {
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({}, false);
    g.fillStyle(color, 1).fillCircle(9, 9, 9);
    g.lineStyle(2, C.white, 1).strokeCircle(9, 9, 8);
    g.lineStyle(2, C.white, 1);
    if (symbol === '+') {
      g.lineBetween(5, 9, 13, 9);
      g.lineBetween(9, 5, 9, 13);
    } else {
      g.lineBetween(6, 6, 12, 12);
      g.lineBetween(12, 6, 6, 12);
    }
    g.generateTexture(key, 18, 18);
    g.destroy();
  }
}

function lineCount(slots: number): number {
  return Math.max(1, Math.ceil(slots / SLOTS_PER_LINE));
}

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
  root: Engine.GameObjects.Container;
  icon: Engine.GameObjects.Container | Engine.GameObjects.Image | null;
  name: Engine.GameObjects.Text | null;
  iconId: string | null;
  qty: Engine.GameObjects.Text | null;
  out: Engine.GameObjects.Text | null;
  fresh: Engine.GameObjects.Text | null;
  refillBtn: Engine.GameObjects.Container;
  removeBtn: Engine.GameObjects.Container | null;
  /** Khóa trạng thái nền / nhãn hạn đã vẽ, để render() chỉ vẽ lại khi thay đổi. */
  bgKey: string;
  freshKey: string;
}

interface RowView {
  shelf: number;
  /** Tọa độ y (trong nội dung cuộn) của tầng đầu tiên. */
  top: number;
  height: number;
  slots: SlotView[];
  lock: Engine.GameObjects.Container;
  label: Engine.GameObjects.Text;
  viewportVisible: boolean;
  locked: boolean;
  labelVisible: boolean;
  tween: Engine.Tweens.Tween | null;
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
export class ShelfView extends Engine.GameObjects.Container {
  private rows: RowView[] = [];
  private byShelf = new Map<number, RowView>();
  private glowTween: Engine.Tweens.Tween | null = null;
  /** Graphics ngoài màn hình, chỉ dùng để vẽ nền ô rồi in vào slotBgBake. */
  private slotBgLayer: Engine.GameObjects.Graphics;
  /** Ván gỗ / khung tủ: tĩnh, in chung vào slotBgBake. */
  private planksLayer: Engine.GameObjects.Graphics;
  /** Nền ô kệ đã in sẵn: vài nghìn lệnh bo góc thành một quad, chỉ in lại khi nền ô đổi. */
  private slotBgBake: Engine.GameObjects.RenderTexture | null = null;
  private glowLayer: Engine.GameObjects.Graphics;
  private progressLayer: Engine.GameObjects.Graphics;
  private glowKey = '';
  private progressKey = '';
  private bgDirty = true;
  private content: Engine.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private readonly viewH: number;
  private moreUp: Engine.GameObjects.Text | null = null;
  private moreDown: Engine.GameObjects.Text | null = null;
  private scrollTween: Engine.Tweens.Tween | null = null;
  private kinetic: KineticScroll | null = null;

  constructor(scene: Engine.Scene, readonly top: number, private cb: ShelfCallbacks, state: GameState, viewRows = MAX_SHELVES) {
    super(scene, 0, 0);
    ensureShelfButtonTextures(scene);
    this.viewH = viewRows * ROW_PITCH;
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    const planks = scene.make.graphics({}, false);
    this.planksLayer = planks;
    this.slotBgLayer = scene.make.graphics({}, false);
    this.once(Engine.GameObjects.Events.DESTROY, () => { this.slotBgLayer.destroy(); this.planksLayer.destroy(); });
    // Giữ chỗ trong content (dưới ô kệ, trên ván gỗ); texture được tạo ở lần render đầu tiên.
    const bgSlot = scene.add.zone(0, 0, 1, 1).setName('slot-bg-slot');
    this.content.add(bgSlot);
    this.glowLayer = scene.add.graphics();
    this.content.add(this.glowLayer);
    let y = top;
    displayShelves(state).forEach((shelf) => {
      const kind = shelfKind(state, shelf);
      const count = state.shelves[shelf].length;
      const lines = lineCount(count);
      const width = Math.min(count, SLOTS_PER_LINE) * (SLOT_W + GAP) + 12;
      const bodyH = (lines - 1) * ROW_PITCH + SLOT_H;
      if (kind === 'shelf') {
        for (let l = 0; l < lines; l++) {
          const ly = y + l * ROW_PITCH;
          planks.fillStyle(C.woodDark, 1).fillRect(6, ly + SLOT_H + 1, width, 6);
          planks.fillStyle(C.woodLight, 1).fillRect(6, ly + SLOT_H, width, 2);
        }
      } else {
        // Tủ lạnh / tủ đông: khung kim loại màu lạnh.
        planks.fillStyle(kind === 'fridge' ? 0xcfe8f7 : 0xb9d7f0, 1).fillRoundedRect(6, y - 3, width, bodyH + 9, 8);
        planks.lineStyle(2, 0x7fa9c9, 1).strokeRoundedRect(6, y - 3, width, bodyH + 9, 8);
      }
      const rowTop = y;
      const slots: SlotView[] = [];
      for (let c = 0; c < count; c++) slots.push(this.makeSlot(shelf, rowTop, c));
      const lock = scene.add.container(180, y + bodyH / 2, [
        scene.add.rectangle(0, 0, 340, bodyH + 4, 0x3b2618, 0.75),
        txt(scene, 0, 0, '🔒 Kệ mở ở level 3', { size: 14, bold: true, color: HEX.cream, origin: [0.5, 0.5] }),
      ]);
      this.content.add(lock);
      const label = txt(scene, 12, y - 8, '', { size: 9, bold: true, color: HEX.ink });
      label.setBackgroundColor(kind === 'shelf' ? '#f3dfbd' : '#d9eefb').setPadding(3, 1, 3, 1);
      this.content.add(label);
      const row: RowView = {
        shelf, top: rowTop, height: bodyH, slots, lock, label,
        viewportVisible: true, locked: false, labelVisible: false,
        tween: null, labelKey: '',
      };
      this.rows.push(row);
      this.byShelf.set(shelf, row);
      y += lines * ROW_PITCH;
    });
    this.maxScroll = Math.max(0, y - top - this.viewH);
    // Các hiệu ứng ít xuất hiện dùng chung một Graphics thay vì tạo nhiều Graphics cho từng ô.
    this.progressLayer = scene.add.graphics();
    this.content.add(this.progressLayer);
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
    this.kinetic = new KineticScroll(s, {
      inView: (y) => this.inView(y),
      enabled: () => this.visible,
      get: () => this.scrollY,
      set: (v) => { this.scrollTween?.remove(); this.setScroll(v); },
      max: () => this.maxScroll,
      threshold: 8,
    });
  }

  /** Chỉ nhận chạm trong khung nhìn kệ (ô đã cuộn ra ngoài không che nút phía trên / kho phía dưới). */
  private clipInput(obj: Engine.GameObjects.Container): void {
    clipInteractive(obj, (y) => y >= this.top - 6 && y <= this.top + this.viewH);
  }

  /** Chạm hiện tại là để cuộn / dừng trôi, không phải bấm ô. */
  private get scrollTap(): boolean {
    return !!this.kinetic?.blockTap;
  }

  setScroll(y: number): void {
    this.scrollY = Engine.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = snap(-this.scrollY);
    this.updateViewportVisibility();
    this.moreUp?.setVisible(this.scrollY > 4);
    this.moreDown?.setVisible(this.scrollY < this.maxScroll - 4);
    this.cb.onScroll?.(this.atCounter);
  }

  /** Ẩn nội dung kệ nằm hoàn toàn ngoài khung cuộn để Phaser bỏ qua khi vẽ. */
  private updateViewportVisibility(): void {
    const contentY = this.content.y;
    const viewTop = this.top - 14;
    const viewBottom = this.top + this.viewH + 4;
    for (const row of this.rows) {
      const rowTop = row.top + contentY;
      row.viewportVisible = rowTop + row.height >= viewTop && rowTop <= viewBottom;
      row.lock.setVisible(row.locked && row.viewportVisible);
      row.label.setVisible(row.labelVisible && row.viewportVisible);
      for (const slot of row.slots) {
        const slotY = slot.root.y + contentY;
        slot.root.setVisible(row.viewportVisible && slotY + SLOT_H / 2 >= viewTop && slotY - SLOT_H / 2 <= viewBottom);
      }
    }
  }

  /** Đang nhìn các kệ sát quầy (vị trí mặc định). */
  get atCounter(): boolean {
    return this.scrollY >= this.maxScroll - 4;
  }

  private animateTo(y: number): void {
    this.kinetic?.stop();
    const target = Engine.Math.Clamp(y, 0, this.maxScroll);
    this.scrollTween?.remove();
    const from = { v: this.scrollY };
    this.scrollTween = this.scene.tweens.add({ targets: from, v: target, duration: 260, ease: 'Sine.easeOut', onUpdate: () => this.setScroll(from.v) });
  }

  /** Nút "Về quầy": cuộn về các kệ sát quầy. */
  scrollToCounter(): void {
    this.animateTo(this.maxScroll);
  }



  private slotPos(rowTop: number, c: number): { x: number; y: number } {
    return { x: X0 + (c % SLOTS_PER_LINE) * (SLOT_W + GAP) + SLOT_W / 2, y: rowTop + Math.floor(c / SLOTS_PER_LINE) * ROW_PITCH + SLOT_H / 2 };
  }

  /** Tọa độ màn hình của ô (đã tính cuộn). */
  slotCenter(shelf: number, slot: number): { x: number; y: number } {
    const row = this.byShelf.get(shelf) ?? this.rows[0];
    const p = this.slotPos(row?.top ?? this.top, slot);
    return { x: p.x, y: p.y - this.scrollY };
  }

  private makeSlot(r: number, rowTop: number, c: number): SlotView {
    const s = this.scene;
    const { x, y } = this.slotPos(rowTop, c);
    const refillBtn = s.add.container(SLOT_W / 2 - 8, -SLOT_H / 2 + 8, [s.add.image(0, 0, 'shelf_refill_button')]);
    // Vùng chạm lớn hơn hình để dễ bấm trên điện thoại.
    this.clipInput(refillBtn.setSize(26, 26));
    refillBtn.on('pointerup', (p: Engine.Input.Pointer, _x: number, _y: number, ev: Engine.Types.Input.EventData) => {
      ev.stopPropagation();
      if (p.getDistance() < 10 && !this.scrollTap && this.inView(p.worldY)) this.cb.onRefill?.(r, c);
    });

    // Shop never supports removing shelf stock. Avoid allocating a hidden button and image
    // for every slot there; arrange/restock scenes pass onRemove and retain the same control.
    const removeBtn = this.cb.onRemove
      ? s.add.container(-SLOT_W / 2 + 8, -SLOT_H / 2 + 8, [s.add.image(0, 0, 'shelf_remove_button')])
      : null;
    if (removeBtn) {
      this.clipInput(removeBtn.setSize(24, 24));
      removeBtn.on('pointerup', (p: Engine.Input.Pointer, _x: number, _y: number, ev: Engine.Types.Input.EventData) => {
        ev.stopPropagation();
        if (p.getDistance() < 10 && !this.scrollTap && this.inView(p.worldY)) this.cb.onRemove?.(r, c);
      });
    }

    const slotChildren: Engine.GameObjects.GameObject[] = [refillBtn];
    if (removeBtn) slotChildren.push(removeBtn);
    const root = s.add.container(x, y, slotChildren);
    this.clipInput(root.setSize(SLOT_W, SLOT_H));
    root.on('pointerup', (p: Engine.Input.Pointer) => {
      if (p.getDistance() < 12 && !this.scrollTap && this.inView(p.worldY)) this.cb.onSlotTap(r, c);
    });
    this.content.add(root);
    return { root, icon: null, name: null, iconId: null, qty: null, out: null, fresh: null, refillBtn, removeBtn, bgKey: '', freshKey: '' };
  }

  /** Ô kệ tại tọa độ (dùng khi thả hàng kéo từ kho). */
  slotAt(x: number, y: number): { shelf: number; slot: number } | null {
    if (!this.inView(y)) return null;
    for (const row of this.rows) {
      for (let c = 0; c < row.slots.length; c++) {
        const { x: cx, y: cy } = this.slotPos(row.top, c);
        if (Math.abs(x - cx) <= SLOT_W / 2 + GAP / 2 && Math.abs(y + this.scrollY - cy) <= SLOT_H / 2 + 4) return { shelf: row.shelf, slot: c };
      }
    }
    return null;
  }

  render(state: GameState, o: ShelfRenderOpts): void {
    const baseRows = shelfCount(state.level);
    const glowRects: { x: number; y: number }[] = [];
    const progressRects: { x: number; y: number; ratio: number }[] = [];
    for (const row of this.rows) {
      const r = row.shelf;
      const locked = r < MAX_SHELVES && r >= baseRows;
      row.locked = locked;
      row.lock.setVisible(locked && row.viewportVisible);
      const zone = zoneOf(state, r);
      const kind = shelfKind(state, r);
      const zoneLabel = row.label;
      const prefix = kind === 'fridge' ? '🧊 TỦ LẠNH' : kind === 'freezer' ? '❄️ TỦ ĐÔNG' : '';
      row.labelVisible = !locked && (!!zone || !!prefix);
      zoneLabel.setVisible(row.labelVisible && row.viewportVisible);
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
        if (v.bgKey !== bgKey) { v.bgKey = bgKey; this.bgDirty = true; }
        // Empty cells do not need three Canvas Text objects in the display list.
        if (slot.productId) {
          if (!v.qty) {
            v.qty = txt(this.scene, 0, -SLOT_H / 2 - 1, '', { size: 10, bold: true, color: HEX.ink, origin: [0.5, 0] });
            v.root.addAt(v.qty, 0);
          }
          v.qty.setText(`x${slot.qty}`);
        } else if (v.qty) {
          v.qty.destroy();
          v.qty = null;
        }
        const whHas = slot.productId ? state.warehouse.some((lot) => lot.productId === slot.productId && lot.qty > 0) : false;
        const showOut = !locked && !!slot.productId && slot.qty === 0 && !whHas;
        if (showOut && !v.out) {
          v.out = txt(this.scene, 0, -6, 'Hết', { size: 10, bold: true, color: HEX.white, origin: [0.5, 0.5] });
          v.out.setBackgroundColor(HEX.red).setPadding(3, 1, 3, 1);
          v.root.addAt(v.out, Math.min(1, v.root.list.length));
        } else if (!showOut && v.out) {
          v.out.destroy();
          v.out = null;
        }
        if (v.iconId !== slot.productId) {
          v.icon?.destroy();
          v.name?.destroy();
          v.icon = null;
          v.name = null;
          v.iconId = slot.productId;
          if (slot.productId) {
            const p = product(slot.productId);
            v.icon = productIcon(this.scene, 0, -7, p, 24);
            v.name = productName(this.scene, 0, SLOT_H / 2 + 1, p, SLOT_W - 4, { origin: [0.5, 1] });
            const buttonIndex = v.root.list.indexOf(v.refillBtn);
            const itemIndex = buttonIndex < 0 ? v.root.list.length : buttonIndex;
            v.root.addAt(v.name, itemIndex);
            v.root.addAt(v.icon, itemIndex);
          }
        }
        v.icon?.setAlpha(empty ? 0.3 : 1);
        v.name?.setAlpha(empty ? 0.5 : 1);
        // Nhãn hạn dùng: đỏ = hết hạn hôm nay, vàng = hết hạn ngày mai; bán xả hiện phần trăm giảm.
        const freshness = !empty ? slotFreshness(slot, state.day) : null;
        const freshKey = slot.clearance && !empty ? `c${slot.clearance}` : freshness ?? '';
        if (v.freshKey !== freshKey) {
          v.freshKey = freshKey;
          if (slot.clearance && !empty || freshness) {
            if (!v.fresh) {
              v.fresh = txt(this.scene, -SLOT_W / 2 + 1, 4, '', { size: 8, bold: true, color: HEX.white, origin: [0, 1] });
              v.fresh.setPadding(2, 0, 2, 0);
              const buttonIndex = v.root.list.indexOf(v.refillBtn);
              v.root.addAt(v.fresh, buttonIndex < 0 ? v.root.list.length : buttonIndex);
            }
            if (slot.clearance && !empty) v.fresh.setText(`-${slot.clearance}%`).setBackgroundColor(HEX.red);
            else if (freshness) v.fresh.setText(freshness === 'today' ? 'HẠN' : 'MAI').setBackgroundColor(freshness === 'today' ? HEX.red : '#d49a00');
          } else if (v.fresh) {
            v.fresh.destroy();
            v.fresh = null;
          }
        }
        const prog = o.refilling?.(r, c) ?? null;
        if (prog !== null) progressRects.push({ x: v.root.x, y: v.root.y, ratio: prog });
        v.refillBtn.setVisible(!o.noRefill && !locked && prog === null && canRefill(state, r, c));
        v.removeBtn?.setVisible(o.mode === 'arrange' && !locked && !!slot.productId);
        const glow = !locked && !empty && !!slot.productId && !!o.highlight?.has(slot.productId);
        if (glow) glowRects.push({ x: v.root.x, y: v.root.y });
        v.root.setAlpha(locked ? 0.5 : 1);
      });
    }
    if (this.bgDirty) {
      this.bgDirty = false;
      this.bakeSlotBackgrounds(state, baseRows);
    }
    const nextGlowKey = glowRects.map(({ x, y }) => `${x},${y}`).join(';');
    if (nextGlowKey !== this.glowKey) {
      this.glowKey = nextGlowKey;
      this.glowLayer.clear();
      for (const { x, y } of glowRects) {
        this.glowLayer.lineStyle(3, C.yellow, 1).strokeRoundedRect(x - SLOT_W / 2 - 1, y - SLOT_H / 2 - 1, SLOT_W + 2, SLOT_H + 2, 8);
      }
    }
    if (glowRects.length && !this.glowTween) {
      this.glowLayer.setAlpha(1);
      this.glowTween = this.scene.tweens.add({ targets: this.glowLayer, alpha: 0.25, yoyo: true, repeat: -1, duration: 420 });
    } else if (!glowRects.length && this.glowTween) {
      this.glowTween.remove();
      this.glowTween = null;
      this.glowLayer.setAlpha(1);
    }
    const nextProgressKey = progressRects.map(({ x, y, ratio }) => `${x},${y},${Math.round(ratio * 100)}`).join(';');
    if (nextProgressKey !== this.progressKey) {
      this.progressKey = nextProgressKey;
      this.progressLayer.clear();
      for (const { x, y, ratio } of progressRects) {
        this.progressLayer.fillStyle(0x000000, 0.35).fillRoundedRect(x - SLOT_W / 2 + 4, y + 3, SLOT_W - 8, 5, 2);
        this.progressLayer.fillStyle(C.green, 1).fillRoundedRect(x - SLOT_W / 2 + 4, y + 3, (SLOT_W - 8) * ratio, 5, 2);
      }
    }
  }

  private bakeSlotBackgrounds(state: GameState, baseRows: number): void {
    const g = this.slotBgLayer;
    g.clear();
    let minY = Infinity;
    let maxY = -Infinity;
    for (const row of this.rows) {
      const kind = shelfKind(state, row.shelf);
      const locked = row.shelf < MAX_SHELVES && row.shelf >= baseRows;
      for (const v of row.slots) {
        const { x, y } = v.root;
        minY = Math.min(minY, y - SLOT_H / 2);
        maxY = Math.max(maxY, y + SLOT_H / 2);
        g.fillStyle(kind === 'shelf' ? C.slot : 0xeef7fd, locked ? 0.2 : 1).fillRoundedRect(x - SLOT_W / 2, y - SLOT_H / 2, SLOT_W, SLOT_H, 7);
        g.lineStyle(2, kind === 'shelf' ? C.slotEdge : 0x9cc3de, locked ? 0.5 : 1).strokeRoundedRect(x - SLOT_W / 2, y - SLOT_H / 2, SLOT_W, SLOT_H, 7);
      }
    }
    if (minY === Infinity) {
      this.slotBgBake?.setVisible(false);
      return;
    }
    // Chừa chỗ cho viền ô, khung tủ (-3px) và ván gỗ dưới ô (+7px); in ở độ phân giải ZOOM để nét vẫn sắc.
    const top = Math.floor(minY) - 6;
    const width = 360;
    const height = Math.ceil(maxY) + 10 - top;
    // Kệ cấp cao rất dài: giữ texture trong 4096px (giới hạn của nhiều máy Android cũ), chấp nhận nét mềm hơn chút.
    const renderer = this.scene.sys.game.renderer as Engine.Renderer.WebGL.WebGLRenderer;
    const maxTexture = Math.min(4096, renderer.getMaxTextureSize?.() ?? 4096);
    const scale = Math.min(ZOOM, Math.floor((maxTexture / height) * 100) / 100);
    const texH = Math.ceil(height * scale);
    if (!this.slotBgBake || this.slotBgBake.height !== texH) {
      const index = this.slotBgBake ? this.content.getIndex(this.slotBgBake) : this.content.getIndex(this.content.getByName('slot-bg-slot')!);
      this.slotBgBake?.destroy();
      this.content.getByName('slot-bg-slot')?.destroy();
      this.slotBgBake = this.scene.add.renderTexture(0, top, Math.ceil(width * scale), texH).setOrigin(0, 0).setScale(1 / scale);
      this.content.addAt(this.slotBgBake, Math.max(0, index));
    }
    this.slotBgBake.setY(top).setVisible(true).clear();
    this.planksLayer.setScale(scale);
    g.setScale(scale);
    this.slotBgBake.draw([this.planksLayer, g], 0, -top * scale);
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
