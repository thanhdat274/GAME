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
  private geom!: FloorGeom;
  private detailWidth = W;

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

    const landscape = W > H;
    if (landscape) {
      const cell = Math.min(27, Math.floor((H - 80) / DATA.land.rows));
      const gx = 16;
      const gy = 56;
      this.geom = { gx, gy, cell };
      const detailX = gx + DATA.land.cols * cell + 14;
      this.detailWidth = W - detailX - 10;
      const hasMultiStore = G.state.stores.length > 1;
      const detailTop = hasMultiStore ? 84 : 56;
      const detailBottom = H - 12;

      this.storeTabs(true, detailX, this.detailWidth);
      this.drawFloor();
      this.fixtureLayer = this.add.container(0, 0);
      this.detail = new ScrollArea(this, detailTop, detailBottom, undefined, { x: detailX, width: this.detailWidth });

      new Button(this, gx + (DATA.land.cols * cell) / 2 - 40, H - 16, {
        w: 120,
        h: 26,
        label: '📦 Xem nhà kho',
        size: 11,
        color: C.wood,
        onTap: () => this.select({ kind: 'warehouse' }),
      });
      txt(this, gx + (DATA.land.cols * cell) / 2 + 28, H - 16, '🟢 đủ  🟡 vơi  🔴 trống', { size: 9, color: HEX.cream, origin: [0, 0.5] });
    } else {
      const cell = Math.floor((W - 16) / DATA.land.cols);
      const gx = (W - DATA.land.cols * cell) / 2;
      const gy = 94;
      this.geom = { gx, gy, cell };
      this.detailWidth = W;
      const detailTop = gy + DATA.land.rows * cell + 8;
      const detailBottom = H - 56;

      this.storeTabs(false);
      this.drawFloor();
      this.fixtureLayer = this.add.container(0, 0);
      this.detail = new ScrollArea(this, detailTop, detailBottom);

      const foot = this.add.graphics();
      foot.fillStyle(C.hud, 1).fillRect(0, detailBottom, W, H - detailBottom);
      new Button(this, 92, H - 28, { w: 164, h: 36, label: '📦 Xem nhà kho', size: 13, color: C.wood, onTap: () => this.select({ kind: 'warehouse' }) });
      txt(this, 186, H - 28, '🟢 đủ  🟡 có ô hết  🔴 trống', { size: 10, color: HEX.cream, origin: [0, 0.5] });
    }

    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || p.getDistance() > 10) return;
      const f = this.fixtureAt(p.worldX, p.worldY);
      if (f) this.select({ kind: 'fixture', uid: f.uid });
    });

    this.redraw();
  }

  /** Nút chọn tiệm khi chuỗi có nhiều tiệm (hỗ trợ tối đa 11 tiệm mà không tràn viền). */
  private storeTabs(landscape = false, detailX = 0, detailWidth = W): void {
    const stores = G.state.stores;
    if (stores.length <= 1) {
      if (!landscape) {
        txt(this, W / 2, 72, 'Chạm vào kệ, tủ, quầy để xem hàng và giá', { size: 11, color: HEX.muted, origin: [0.5, 0.5] });
      }
      return;
    }

    if (stores.length <= 3) {
      if (landscape) {
        const w = Math.floor((detailWidth - 8) / stores.length) - 4;
        stores.forEach((store, i) => {
          const current = store.id === this.storeId;
          new Button(this, detailX + 4 + w / 2 + i * (w + 4), 66, {
            w, h: 26, size: 9.5, label: `${store.id === G.state.activeStoreId ? '📍' : ''}${shortName(store.name)}`,
            color: current ? C.red : C.wood,
            onTap: () => { if (!current) this.scene.restart({ storeId: store.id, back: this.back }); },
          });
        });
        return;
      }
      const w = Math.floor((W - 16) / stores.length) - 4;
      stores.forEach((store, i) => {
        const current = store.id === this.storeId;
        new Button(this, 8 + w / 2 + i * (w + 4), 72, {
          w, h: 28, size: 10, label: `${store.id === G.state.activeStoreId ? '📍' : ''}${shortName(store.name)}`,
          color: current ? C.red : C.wood,
          onTap: () => { if (!current) this.scene.restart({ storeId: store.id, back: this.back }); },
        });
      });
      return;
    }

    // Khi có nhiều hơn 3 tiệm (tối đa 11 tiệm): Hiển thị thanh carousel [◀] [📍 Tiệm (i/N) ▾] [▶]
    const curIdx = Math.max(0, stores.findIndex((s) => s.id === this.storeId));
    const currentStore = stores[curIdx];
    const prevIdx = (curIdx - 1 + stores.length) % stores.length;
    const nextIdx = (curIdx + 1) % stores.length;

    const arrowW = 28;
    const gap = 4;
    const totalW = landscape ? detailWidth - 12 : W - 20;
    const startX = landscape ? detailX + 6 : 10;
    const midW = totalW - (arrowW * 2 + gap * 2);
    const posY = landscape ? 66 : 72;
    const btnH = landscape ? 26 : 28;

    // Nút lùi tiệm
    new Button(this, startX + arrowW / 2, posY, {
      w: arrowW, h: btnH, size: 12, label: '◀', color: C.wood,
      onTap: () => this.scene.restart({ storeId: stores[prevIdx].id, back: this.back }),
    });

    // Nút mở bảng chọn tiệm
    const activeIcon = currentStore.id === G.state.activeStoreId ? '📍 ' : '';
    new Button(this, startX + arrowW + gap + midW / 2, posY, {
      w: midW, h: btnH, size: 9.5,
      label: `${activeIcon}${shortName(currentStore.name)} (${curIdx + 1}/${stores.length}) ▾`,
      color: C.red,
      onTap: () => this.openStoreSelector(stores, curIdx),
    });

    // Nút tiến tiệm
    new Button(this, startX + arrowW + gap + midW + gap + arrowW / 2, posY, {
      w: arrowW, h: btnH, size: 12, label: '▶', color: C.wood,
      onTap: () => this.scene.restart({ storeId: stores[nextIdx].id, back: this.back }),
    });
  }

  private openStoreSelector(stores: typeof G.state.stores, currentIdx: number): void {
    const landscape = W > H;
    const overlay = this.add.container(0, 0).setDepth(2000);
    const panelW = landscape ? Math.min(380, W - 40) : W - 32;
    const panelH = landscape ? H - 24 : Math.min(420, H - 80);
    const panelX = Math.round((W - panelW) / 2);
    const panelTop = Math.round((H - panelH) / 2);

    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().on('pointerup', () => overlay.destroy()));
    overlay.add(card(this, panelX, panelTop, panelW, panelH, C.panel));
    overlay.add(txt(this, panelX + 16, panelTop + 14, `🏪 Chọn tiệm trong chuỗi (${stores.length}/11)`, { size: 13, bold: true }));
    overlay.add(new Button(this, panelX + panelW - 20, panelTop + 14, {
      w: 28, h: 26, label: '✕', size: 12, color: C.grey, onTap: () => overlay.destroy(),
    }));

    const listTop = panelTop + 36;
    const listBottom = panelTop + panelH - 8;
    const scroll = new ScrollArea(this, listTop, listBottom, undefined, { x: panelX + 8, width: panelW - 16 });
    overlay.add(scroll.content);

    let y = 4;
    const rowH = 44;
    stores.forEach((store, i) => {
      const isSelected = i === currentIdx;
      const isStanding = store.id === G.state.activeStoreId;
      scroll.add(card(this, panelX + 10, y, panelW - 20, rowH - 4, isSelected ? 0xfff0d0 : C.panel));
      scroll.add(txt(this, panelX + 20, y + 6, `${isStanding ? '📍 ' : ''}${store.name}`, { size: 12, bold: true }));
      scroll.add(txt(this, panelX + 20, y + 24, isStanding ? 'Bạn đang đứng ở tiệm này' : 'Chế độ xem sơ đồ & kệ', { size: 9.5, color: isStanding ? HEX.green : HEX.muted }));

      scroll.add(new Button(this, panelX + panelW - 52, y + (rowH - 4) / 2, {
        w: 64, h: 26, label: isSelected ? 'Đang xem' : 'Xem', size: 10, color: isSelected ? C.grey : C.blue,
        onTap: () => {
          overlay.destroy();
          if (!isSelected) this.scene.restart({ storeId: store.id, back: this.back });
        },
      }).setEnabled(!isSelected));
      y += rowH;
    });
    scroll.setHeight(y + 8);
  }

  private drawFloor(): void {
    drawFloor(this, this.geom, this.view.land);
  }

  private fixtureAt(worldX: number, worldY: number): Fixture | undefined {
    const cell = cellAt(this.geom, worldX, worldY);
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
    const c = drawFixture(this, this.geom, f, { selected: sel, stock });
    if (sel) this.tweens.add({ targets: c, alpha: 0.6, yoyo: true, repeat: 1, duration: 140 });
    return c;
  }

  // ---------- Bảng chi tiết ----------

  private renderDetail(): void {
    const L = this.detail;
    const dw = this.detailWidth;
    L.clear();
    const sel = this.selected;
    if (!sel) {
      L.add(card(this, 8, 4, dw - 16, 78));
      L.add(txt(this, dw / 2, 43, this.view.fixtures.length
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
      L.add(new Button(this, dw / 2, y + 18, { w: Math.min(180, dw - 24), h: 32, label: '📦 Xem nhà kho', size: 12, color: C.wood, onTap: L.guard(() => this.select({ kind: 'warehouse' })) }));
      y += 44;
    }
    if (!info.lines.length && sellsGoods(info.kind) && info.kind !== 'food' && info.kind !== 'drink') {
      L.add(txt(this, dw / 2, y + 20, 'Chưa bày món nào', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      y += 44;
    }
    for (const line of info.lines) y = this.lineRow(line, y, info.kind === 'food' || info.kind === 'drink' ? 'sẵn' : 'kệ');
    L.setHeight(y + 10);
  }

  private detailHeader(y: number, info: FixtureInfo): number {
    const L = this.detail;
    const dw = this.detailWidth;
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
    const t = txt(this, 12, y + 20, sub, { size: 10, color: HEX.muted, wrap: dw - 24 });
    L.add(t);
    return y + 24 + t.height;
  }

  private renderWarehouse(): void {
    const L = this.detail;
    const v = this.view;
    const dw = this.detailWidth;
    const { used, capacity } = warehouseUsage(v);
    let y = 2;
    L.add(txt(this, 12, y, '📦 Nhà kho', { size: 14, bold: true }));
    L.add(txt(this, dw - 12, y + 2, `${used}/${capacity} ô`, { size: 12, bold: true, color: used >= capacity ? HEX.red : HEX.ink, origin: [1, 0] }));
    y += 22;
    const held = v.holding.reduce((n, l) => n + l.qty, 0);
    if (held) {
      L.add(txt(this, 12, y, `🚚 ${held} món hàng chờ chưa vào kho`, { size: 11, bold: true, color: HEX.red }));
      y += 18;
    }
    if (v.active) {
      L.add(new Button(this, dw - 70, y + 14, { w: 124, h: 28, label: 'Quản lý kho ›', size: 11, color: C.blue, onTap: L.guard(() => this.scene.start('Warehouse')) }));
      L.add(txt(this, 12, y + 14, 'Giá = giá bán khi lên kệ', { size: 10, color: HEX.muted, origin: [0, 0.5] }));
      y += 34;
    } else y += 4;
    const lines = warehouseLines(v);
    if (!lines.length) {
      L.add(txt(this, dw / 2, y + 20, 'Kho trống', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
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
    const dw = this.detailWidth;
    const h = 50;
    const empty = line.qty <= 0;
    L.add(card(this, 8, y, dw - 16, h - 4, empty ? 0xf3e0dc : C.panel));
    const icon = productIcon(this, 32, y + h / 2 - 2, product(line.productId), 32);
    if (empty) icon.setAlpha(0.4);
    L.add(icon);
    L.add(txt(this, 56, y + 6, line.name, { size: 13, bold: true, wrap: Math.max(110, dw - 130) }));
    const qty = where === 'sẵn'
      ? empty ? 'Chưa làm sẵn' : `Đã làm sẵn ${line.qty}`
      : empty ? 'HẾT HÀNG' : `Còn ${line.qty}${where === 'kệ' && line.slots && line.slots > 1 ? ` · ${line.slots} ô` : ''}${where === 'chờ' ? ' · hàng chờ' : ''}`;
    L.add(txt(this, 56, y + 26, qty, { size: 11, bold: empty, color: empty ? HEX.red : HEX.muted }));
    const exp = !empty ? this.expText(line.exp) : null;
    if (exp) L.add(txt(this, 150, y + 26, exp.text, { size: 10, color: exp.color }));
    L.add(txt(this, dw - 18, y + 8, formatMoney(line.price), { size: 14, bold: true, color: line.clearance ? HEX.red : HEX.ink, origin: [1, 0] }));
    let note = '';
    if (line.clearance) note = `Xả -${line.clearance}%`;
    else if (line.price > line.refPrice) note = `▲ gợi ý ${formatMoney(line.refPrice)}`;
    else if (line.price < line.refPrice) note = `▼ gợi ý ${formatMoney(line.refPrice)}`;
    if (note) L.add(txt(this, dw - 18, y + 28, note, { size: 9, color: line.clearance ? HEX.red : HEX.muted, origin: [1, 0] }));
    return y + h;
  }
}
