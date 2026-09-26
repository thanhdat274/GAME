import Phaser from 'phaser';
import { DATA, furniture, product } from '../core/data';
import { fixtureCells } from '../core/layout';
import { formatMoney, type Fixture } from '../core/state';
import {
  fixtureInfo, fixtureStockLevel, sellsGoods, storeView, warehouseLines, warehouseUsage,
  type FixtureInfo, type ItemLine, type StoreView,
} from '../core/storeMap';
import { G } from '../game';
import { productIcon } from '../ui/art';
import { cellAt, drawFixture, drawFloor, type FloorGeom } from '../ui/floorPlan';
import { ScrollArea, card, pageFrame } from '../ui/page';
import { ZONE_NAMES } from '../ui/shelves';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const CELL = 40;
const GX = (W - DATA.land.cols * CELL) / 2;
const GY = 94;
const DETAIL_TOP = GY + DATA.land.rows * CELL + 8;
const DETAIL_BOTTOM = H - 50;

const GEOM: FloorGeom = { gx: GX, gy: GY, cell: CELL };

/** Tên tiệm rút gọn cho nút chọn tiệm ("Chi nhánh Khu công nghiệp" → "Khu công ng…"). */
function shortName(name: string): string {
  const short = name.replace(/^Chi nhánh /, '');
  return short.length > 11 ? `${short.slice(0, 10)}…` : short;
}

type Selection = { kind: 'fixture'; uid: number } | { kind: 'warehouse' } | null;

/**
 * Sơ đồ tiệm (chỉ xem): mặt bằng từ trên xuống, chạm từng kệ / tủ / quầy để biết đang bày món gì, còn bao nhiêu,
 * giá bán; nút Nhà kho xem tồn kho. Dùng cho mọi tiệm trong chuỗi, kể cả tiệm không đang đứng.
 */
export class StoreMapScene extends Phaser.Scene {
  private storeId = '';
  private back = 'Morning';
  private view!: StoreView;
  private selected: Selection = null;
  private fixtureLayer!: Phaser.GameObjects.Container;
  private detail!: ScrollArea;

  constructor() {
    super('StoreMap');
  }

  create(data: { storeId?: string; back?: string }): void {
    setupCamera(this);
    const s = G.state;
    this.storeId = data?.storeId && s.stores.some((st) => st.id === data.storeId) ? data.storeId : s.activeStoreId;
    this.back = data?.back ?? 'Morning';
    this.view = storeView(s, this.storeId)!;
    this.selected = null;
    pageFrame(this, '🗺️ Sơ đồ tiệm', () => this.scene.start(this.back), this.view.active ? `${this.view.name} · đang đứng` : `${this.view.name} · chỉ xem`);

    this.storeTabs();
    this.drawFloor();
    this.fixtureLayer = this.add.container(0, 0);
    this.detail = new ScrollArea(this, DETAIL_TOP, DETAIL_BOTTOM);

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, DETAIL_BOTTOM, W, H - DETAIL_BOTTOM);
    new Button(this, 92, H - 25, { w: 164, h: 36, label: '📦 Xem nhà kho', size: 13, color: C.wood, onTap: () => this.select({ kind: 'warehouse' }) });
    txt(this, 186, H - 25, '🟢 đủ  🟡 có ô hết  🔴 trống', { size: 10, color: HEX.cream, origin: [0, 0.5] });

    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || p.getDistance() > 10) return;
      const f = this.fixtureAt(p.worldX, p.worldY);
      if (f) this.select({ kind: 'fixture', uid: f.uid });
    });

    this.redraw();
  }

  /** Nút chọn tiệm khi chuỗi có nhiều tiệm. */
  private storeTabs(): void {
    const stores = G.state.stores;
    if (stores.length <= 1) {
      txt(this, W / 2, 72, 'Chạm vào kệ, tủ, quầy để xem hàng và giá', { size: 11, color: HEX.muted, origin: [0.5, 0.5] });
      return;
    }
    const w = Math.min(110, (W - 16) / stores.length - 4);
    stores.forEach((store, i) => {
      const current = store.id === this.storeId;
      new Button(this, 8 + w / 2 + i * (w + 4), 72, {
        w, h: 28, size: 10, label: `${store.id === G.state.activeStoreId ? '📍' : ''}${shortName(store.name)}`,
        color: current ? C.red : C.wood,
        onTap: () => { if (!current) this.scene.restart({ storeId: store.id, back: this.back }); },
      });
    });
  }

  private drawFloor(): void {
    drawFloor(this, GEOM, this.view.land);
  }

  private fixtureAt(worldX: number, worldY: number): Fixture | undefined {
    const cell = cellAt(GEOM, worldX, worldY);
    return cell ? this.view.fixtures.find((f) => fixtureCells(f).some((c) => c.x === cell.x && c.y === cell.y)) : undefined;
  }

  private select(sel: Selection): void {
    this.selected = sel;
    this.detail.setScroll(0);
    this.redraw();
  }

  private redraw(): void {
    this.fixtureLayer.removeAll(true);
    for (const f of this.view.fixtures) this.fixtureLayer.add(this.fixtureView(f));
    this.renderDetail();
  }

  private fixtureView(f: Fixture): Phaser.GameObjects.Container {
    const sel = this.selected?.kind === 'fixture' && this.selected.uid === f.uid;
    const stock = sellsGoods(furniture(f.type).kind) ? fixtureStockLevel(fixtureInfo(this.view, f)) : null;
    const c = drawFixture(this, GEOM, f, { selected: sel, stock });
    if (sel) this.tweens.add({ targets: c, alpha: 0.6, yoyo: true, repeat: 1, duration: 140 });
    return c;
  }

  // ---------- Bảng chi tiết ----------

  private renderDetail(): void {
    const L = this.detail;
    L.clear();
    const sel = this.selected;
    if (!sel) {
      L.add(card(this, 8, 4, W - 16, 78));
      L.add(txt(this, W / 2, 43, this.view.fixtures.length
        ? '👆 Chạm một kệ, tủ lạnh, tủ đông, quầy hay\ntrạm bếp trên sơ đồ để xem đang bán gì, giá bao nhiêu.'
        : 'Tiệm chưa có nội thất.', { size: 12, color: HEX.muted, origin: [0.5, 0.5], align: 'center' }));
      L.setHeight(90);
      return;
    }
    if (sel.kind === 'warehouse') { this.renderWarehouse(); return; }
    const f = this.view.fixtures.find((item) => item.uid === sel.uid);
    if (!f) { this.select(null); return; }
    const info = fixtureInfo(this.view, f);
    let y = 2;
    y = this.detailHeader(y, info);
    if (info.kind === 'storage') {
      L.add(new Button(this, W / 2, y + 18, { w: 180, h: 32, label: '📦 Xem nhà kho', size: 12, color: C.wood, onTap: L.guard(() => this.select({ kind: 'warehouse' })) }));
      y += 44;
    }
    if (!info.lines.length && sellsGoods(info.kind) && info.kind !== 'food' && info.kind !== 'drink') {
      L.add(txt(this, W / 2, y + 20, 'Chưa bày món nào', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      y += 44;
    }
    for (const line of info.lines) y = this.lineRow(line, y, info.kind === 'food' || info.kind === 'drink' ? 'sẵn' : 'kệ');
    L.setHeight(y + 10);
  }

  private detailHeader(y: number, info: FixtureInfo): number {
    const L = this.detail;
    const title = info.shelf !== undefined ? `${info.icon} ${info.kind === 'shelf' ? 'Kệ' : info.name} ${info.shelf + 1}` : `${info.icon} ${info.name}`;
    const zone = info.zone ? ` · ${ZONE_NAMES[info.zone]}` : '';
    L.add(txt(this, 12, y, `${title}${zone}`, { size: 14, bold: true }));
    const parts: string[] = [];
    if (info.totalSlots) {
      parts.push(`${info.totalSlots - info.emptySlots}/${info.totalSlots} ô có hàng`);
      if (info.outSlots) parts.push(`${info.outSlots} ô hết`);
      const units = info.lines.reduce((n, l) => n + l.qty, 0);
      parts.push(`tổng ${units} món`);
    }
    const sub = [parts.join(' · '), info.note ?? ''].filter(Boolean).join('\n');
    const t = txt(this, 12, y + 20, sub, { size: 10, color: HEX.muted, wrap: W - 24 });
    L.add(t);
    return y + 24 + t.height;
  }

  private renderWarehouse(): void {
    const L = this.detail;
    const v = this.view;
    const { used, capacity } = warehouseUsage(v);
    let y = 2;
    L.add(txt(this, 12, y, '📦 Nhà kho', { size: 14, bold: true }));
    L.add(txt(this, W - 12, y + 2, `${used}/${capacity} ô`, { size: 12, bold: true, color: used >= capacity ? HEX.red : HEX.ink, origin: [1, 0] }));
    y += 22;
    const held = v.holding.reduce((n, l) => n + l.qty, 0);
    if (held) {
      L.add(txt(this, 12, y, `🚚 ${held} món hàng chờ chưa vào kho`, { size: 11, bold: true, color: HEX.red }));
      y += 18;
    }
    if (v.active) {
      L.add(new Button(this, W - 70, y + 14, { w: 124, h: 28, label: 'Quản lý kho ›', size: 11, color: C.blue, onTap: L.guard(() => this.scene.start('Warehouse')) }));
      L.add(txt(this, 12, y + 14, 'Giá = giá bán khi lên kệ', { size: 10, color: HEX.muted, origin: [0, 0.5] }));
      y += 34;
    } else y += 4;
    const lines = warehouseLines(v);
    if (!lines.length) {
      L.add(txt(this, W / 2, y + 20, 'Kho trống', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      y += 44;
    }
    for (const line of lines) y = this.lineRow(line, y, 'kho');
    for (const line of warehouseLines(v, v.holding)) y = this.lineRow(line, y, 'chờ');
    L.setHeight(y + 10);
  }

  private expText(exp: number | null): { text: string; color: string } | null {
    if (exp === null) return null;
    const left = exp - G.state.day;
    if (left < 0) return { text: 'Quá hạn', color: HEX.red };
    if (left === 0) return { text: 'Hết hạn hôm nay', color: HEX.red };
    if (left === 1) return { text: 'Hết hạn mai', color: '#9a6200' };
    return { text: `HSD còn ${left} ngày`, color: HEX.green };
  }

  private lineRow(line: ItemLine, y: number, where: 'kệ' | 'kho' | 'sẵn' | 'chờ'): number {
    const L = this.detail;
    const h = 50;
    const empty = line.qty <= 0;
    L.add(card(this, 8, y, W - 16, h - 4, empty ? 0xf3e0dc : C.panel));
    const icon = productIcon(this, 32, y + h / 2 - 2, product(line.productId), 32);
    if (empty) icon.setAlpha(0.4);
    L.add(icon);
    L.add(txt(this, 56, y + 6, line.name, { size: 13, bold: true, wrap: 190 }));
    const qty = where === 'sẵn'
      ? empty ? 'Chưa làm sẵn' : `Đã làm sẵn ${line.qty}`
      : empty ? 'HẾT HÀNG' : `Còn ${line.qty}${where === 'kệ' && line.slots && line.slots > 1 ? ` · ${line.slots} ô` : ''}${where === 'chờ' ? ' · hàng chờ' : ''}`;
    L.add(txt(this, 56, y + 26, qty, { size: 11, bold: empty, color: empty ? HEX.red : HEX.muted }));
    const exp = !empty ? this.expText(line.exp) : null;
    if (exp) L.add(txt(this, 150, y + 26, exp.text, { size: 10, color: exp.color }));
    L.add(txt(this, W - 18, y + 8, formatMoney(line.price), { size: 14, bold: true, color: line.clearance ? HEX.red : HEX.ink, origin: [1, 0] }));
    let note = '';
    if (line.clearance) note = `Xả -${line.clearance}%`;
    else if (line.price > line.refPrice) note = `▲ gợi ý ${formatMoney(line.refPrice)}`;
    else if (line.price < line.refPrice) note = `▼ gợi ý ${formatMoney(line.refPrice)}`;
    if (note) L.add(txt(this, W - 18, y + 28, note, { size: 9, color: line.clearance ? HEX.red : HEX.muted, origin: [1, 0] }));
    return y + h;
  }
}
