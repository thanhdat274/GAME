import Phaser from 'phaser';
import { DATA, decor, furniture, hasFeature, type FurnitureKind } from '../core/data';
import { buyDecor } from '../core/decor';
import {
  buyFixture, checkPaths, fixtureCells, footprint, moveFixture, placementError, plot, plotAt, plotCells, plotStatus,
  retrieveFixture, sellValue, stowFixture, unlockPlot, type PlaceError,
} from '../core/layout';
import { formatMoney, type Fixture, type GameState } from '../core/state';
import { activeShopType } from '../core/shopTypes';
import { sellFixture } from '../core/stock';
import { G, persist } from '../game';
import { play } from '../ui/sound';
import { furnitureImage } from '../ui/art';
import { Button, dialog, toast } from '../ui/widgets';
import { KineticScroll } from '../ui/scroll';
import { C, H, HEX, W, emoji, setupCamera, txt } from '../ui/theme';

/** Dải thẻ "Mua thêm" (vuốt ngang). */
const CARD_W = 82;
const CARD_H = 106;
const CARD_GAP = 8;

const KIND_COLOR: Record<FurnitureKind, number> = {
  shelf: 0xa86f3a,
  fridge: 0xbfe3f7,
  freezer: 0x8ec5ea,
  storage: 0x9e9e9e,
  counter: 0x6b4220,
  decor: 0x7fbf7f,
  food: 0xc85a32,
  drink: 0x4e9db5,
  seating: 0x95603a,
  generator: 0x6b7680,
};

const PLACE_TEXT: Record<PlaceError, string> = {
  bounds: 'Ra ngoài mặt bằng',
  locked: 'Đất chưa mở',
  overlap: 'Chồng lên nội thất khác',
  door: 'Không chặn cửa ra vào',
  'storage-only': 'Chỉ đặt kệ kho trong khu KHO',
  'generator-only': 'Máy phát chỉ đặt ở ô kỹ thuật riêng',
};

/** Những gì có thể mua trong chế độ Sắp xếp (nội thất + đồ trang trí đặt sàn). */
function catalog(state: GameState): { id: string; name: string; icon: string; cost: number; level: number; decor: boolean }[] {
  const shop = activeShopType(state);
  const items = DATA.furniture.filter((f) => !f.fixed && shop.allowsFixture(f.id)).map((f) => ({ id: f.id, name: f.name, icon: f.icon, cost: f.cost, level: f.unlockLevel, decor: false }));
  const floor = DATA.decor.filter((d) => d.slot === 'floor' && !d.exclusive).map((d) => ({ id: d.id, name: d.name, icon: d.icon, cost: d.cost, level: Math.max(d.unlockLevel, 8), decor: true }));
  return [...items, ...(hasFeature(state.level, 'decor') || state.level >= 5 ? floor : [])];
}

/** Chế độ Sắp xếp (chỉ ở Buổi sáng): mở đất, đặt/di chuyển/xoay/bán nội thất theo lưới, kiểm tra lối đi. */
export class BuildScene extends Phaser.Scene {
  private snapshot!: string;
  private gridG!: Phaser.GameObjects.Graphics;
  private fixtureLayer!: Phaser.GameObjects.Container;
  private overlay!: Phaser.GameObjects.Graphics;
  private panelLayer!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private selected: number | null = null;
  private placing: string | null = null;
  private placingStoredUid: number | null = null;
  private placingRot: 0 | 1 = 0;
  private placementCell: { x: number; y: number } | null = null;
  private blocked = new Set<number>();
  private drag: { uid: number; startX: number; startY: number; moved: boolean; cell: { x: number; y: number } | null; offset: { x: number; y: number } } | null = null;
  private ghost: Phaser.GameObjects.Container | null = null;
  private shopRow: Phaser.GameObjects.Container | null = null;
  private shopMask!: Phaser.GameObjects.Graphics;
  private shopX = 0;
  private shopMax = 0;
  private cell = 32;
  private gx = 16;
  private gy = 60;
  private panelX = 0;
  private panelY = 380;
  private panelW = W;
  private panelH = 260;
  private shopTop = 422;
  private shopBottom = 536;
  private landscape = false;

  constructor() {
    super('Build');
  }

  create(data: { buy?: string }): void {
    setupCamera(this);
    const s = G.state;
    this.snapshot = JSON.stringify(s);
    this.selected = null;
    this.placing = data?.buy ?? null;
    this.placingStoredUid = null;
    this.placingRot = 0;
    this.placementCell = null;
    this.blocked.clear();
    this.drag = null;
    this.ghost = null;

    this.landscape = W > H;
    if (this.landscape) {
      this.cell = Math.min(27, Math.floor((H - 66) / DATA.land.rows));
      this.gx = 16;
      this.gy = 54;
      this.panelX = this.gx + DATA.land.cols * this.cell + 14;
      this.panelY = 50;
      this.panelW = W - this.panelX - 10;
      this.panelH = H - 54;
      this.shopTop = this.panelY + 42;
      this.shopBottom = this.shopTop + CARD_H + 8;
    } else {
      this.cell = Math.floor((W - 16) / DATA.land.cols);
      this.gx = (W - DATA.land.cols * this.cell) / 2;
      this.gy = 60;
      this.panelX = 0;
      this.panelY = this.gy + DATA.land.rows * this.cell + 6;
      this.panelW = W;
      this.panelH = H - this.panelY;
      this.shopTop = this.panelY + 42;
      this.shopBottom = this.shopTop + CARD_H + 8;
    }

    const bg = this.add.graphics();
    bg.fillStyle(C.bg, 1).fillRect(0, 0, W, H);
    bg.fillStyle(C.hud, 1).fillRect(0, 0, W, 50);
    txt(this, W / 2, 16, '🏗️ Sắp xếp tiệm', { size: 17, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    this.hint = txt(this, W / 2, 38, '', { size: 11, color: HEX.cream, origin: [0.5, 0.5], align: 'center' });

    this.gridG = this.add.graphics();
    this.fixtureLayer = this.add.container(0, 0);
    this.overlay = this.add.graphics().setDepth(50);
    this.panelLayer = this.add.container(0, 0).setDepth(60);
    this.shopRow = null;
    this.shopX = 0;
    this.shopMask = this.make.graphics({}, false).fillRect(this.panelX, this.shopTop - 4, this.panelW, this.shopBottom - this.shopTop + 4);
    new KineticScroll(this, {
      horizontal: true,
      inView: (y, x) => (y >= this.shopTop - 4 && y <= this.shopBottom) && (!this.landscape || x === undefined || x >= this.panelX),
      enabled: () => !!this.shopRow?.active,
      get: () => this.shopX,
      set: (v) => { this.shopX = v; this.shopRow?.setX((this.landscape ? this.panelX : 0) - v); },
      max: () => this.shopMax,
    });

    // Chạm lên nút / hộp thoại (đối tượng tương tác) thì không xử lý như chạm lưới.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => { if (!over.length) this.onDown(p); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length && !this.drag?.moved) { this.drag = null; return; }
      this.onUp(p);
    });

    this.redraw();
    if (this.placing) this.startPlacing(this.placing, this.placingStoredUid, this.placingRot);
  }

  // ---------- Vẽ ----------

  private cellAt(worldX: number, worldY: number): { x: number; y: number } | null {
    const x = Math.floor((worldX - this.gx) / this.cell);
    const y = Math.floor((worldY - this.gy) / this.cell);
    if (x < 0 || y < 0 || x >= DATA.land.cols || y >= DATA.land.rows) return null;
    return { x, y };
  }

  private redraw(): void {
    const s = G.state;
    const g = this.gridG;
    g.clear();
    const { cols, rows, door } = DATA.land;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const owner = plotAt(x, y);
      const open = owner === 'initial' || (owner !== null && s.land.includes(owner));
      const px = this.gx + x * this.cell;
      const py = this.gy + y * this.cell;
      if (!owner) {
        g.fillStyle(0x3a2a20, 1).fillRect(px, py, this.cell, this.cell);
        continue;
      }
      const storage = owner !== 'initial' && plot(owner).storageOnly;
      const technical = owner !== 'initial' && !!owner && plot(owner).generatorOnly;
      if (open) g.fillStyle(storage ? 0x9aa48a : technical ? 0x697780 : (x + y) % 2 ? C.floorA : C.floorB, 1).fillRect(px, py, this.cell, this.cell);
      else g.fillStyle(0x5c4632, 1).fillRect(px, py, this.cell, this.cell);
      g.lineStyle(1, 0x000000, 0.15).strokeRect(px, py, this.cell, this.cell);
    }
    // Cửa ra vào
    g.fillStyle(C.red, 1).fillRect(this.gx + door.x * this.cell + 4, this.gy + (door.y + 1) * this.cell - 6, this.cell - 8, 6);

    this.fixtureLayer.removeAll(true);
    this.fixtureLayer.add(emoji(this, this.gx + door.x * this.cell + this.cell / 2, this.gy + door.y * this.cell + this.cell / 2, '🚪', 20));
    for (const f of s.fixtures) this.fixtureLayer.add(this.fixtureView(f));
    // Đất khóa: đặt thông tin gọn trong chính mảnh đất để không tràn khỏi lưới.
    for (const p of DATA.land.plots) {
      if (s.land.includes(p.id)) continue;
      const cells = plotCells(p);
      const rawCx = this.gx + (cells.reduce((a, c) => a + c.x, 0) / cells.length) * this.cell + this.cell / 2;
      const cy = this.gy + (cells.reduce((a, c) => a + c.y, 0) / cells.length) * this.cell + this.cell / 2;
      const status = plotStatus(s, p.id);
      const shortName = p.generatorOnly ? 'Chỉ đặt máy phát' : p.id === 'G' ? 'Khu mở rộng' : p.name.replace(/^Đất [A-Z]\s*·\s*/, '');
      const costOrLevel = status === 'level' ? `Cần LV${p.level}` : p.cost === 0 ? 'Mở miễn phí' : formatMoney(p.cost);
      const label = `🔒 ${p.name}\n${shortName}\n${costOrLevel}`;
      const width = Math.max(58, Math.max(...p.rects.map((r) => r.w)) * this.cell - 8);
      const t = txt(this, rawCx, cy, label, { size: p.id === 'G' ? 8 : 9, bold: true, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: width });
      t.setLineSpacing(-3);
      t.setBackgroundColor(status === 'available' ? '#2a7a43cc' : '#00000088').setPadding(4, 2, 4, 2);
      this.fixtureLayer.add(t);
    }
    const techPlot = DATA.land.plots.find((p) => p.generatorOnly);
    if (techPlot && s.land.includes(techPlot.id) && !s.fixtures.some((f) => f.type === 'generator')) {
      const cells = plotCells(techPlot);
      const cx = this.gx + (cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length) * this.cell + this.cell / 2;
      const cy = this.gy + (cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length) * this.cell + this.cell / 2;
      this.fixtureLayer.add(txt(this, cx, cy, '⚡ Ô KỸ THUẬT', { size: 7, bold: true, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: this.cell * 2 - 4 }));
    }
    for (const warehousePlot of DATA.land.plots.filter((p) => p.storageOnly && s.land.includes(p.id))) {
      const cell = plotCells(warehousePlot)[0];
      this.fixtureLayer.add(txt(this, this.gx + cell.x * this.cell + 3, this.gy + cell.y * this.cell + 3, warehousePlot.id === 'C' ? '📦 KHO' : '📦 KHO +', { size: 8, bold: true, color: HEX.cream, origin: [0, 0] }));
    }
    this.renderPanel();
  }

  private fixtureView(f: Fixture): Phaser.GameObjects.Container {
    const def = furniture(f.type);
    const { w, h } = footprint(f.type, f.rot);
    const c = this.add.container(this.gx + f.x * this.cell, this.gy + f.y * this.cell);
    const g = this.add.graphics();
    const color = KIND_COLOR[def.kind];
    g.fillStyle(0x000000, 0.2).fillRoundedRect(3, 5, w * this.cell - 6, h * this.cell - 6, 6);
    g.fillStyle(color, 1).fillRoundedRect(3, 3, w * this.cell - 6, h * this.cell - 6, 6);
    const sel = this.selected === f.uid;
    const bad = this.blocked.has(f.uid);
    g.lineStyle(sel || bad ? 3 : 1.5, bad ? C.red : sel ? C.yellow : 0x000000, sel || bad ? 1 : 0.35).strokeRoundedRect(3, 3, w * this.cell - 6, h * this.cell - 6, 6);
    c.add(g);
    // Pixel art theo footprint gốc; nội thất xoay thì ảnh xoay 90°.
    const img = furnitureImage(this, f.type, (w * this.cell) / 2, (h * this.cell) / 2, w * this.cell - 8, h * this.cell - 8, f.rot);
    c.add(img ?? emoji(this, (w * this.cell) / 2, (h * this.cell) / 2, def.icon, 18));
    if (w * h > 1) {
      const label = f.shelf !== undefined ? `${def.kind === 'shelf' ? 'Kệ' : def.name} ${f.shelf + 1}` : def.name;
      const tag = txt(this, (w * this.cell) / 2, h * this.cell - 8, label, { size: 8, bold: true, color: HEX.white, origin: [0.5, 0.5] });
      c.add(tag.setBackgroundColor('#000000aa').setPadding(3, 0, 3, 0));
    }
    return c;
  }

  private renderPanel(): void {
    const s = G.state;
    const L = this.panelLayer;
    L.removeAll(true);
    const g = this.add.graphics();
    g.fillStyle(C.hud, 1).fillRect(this.panelX, this.panelY, this.panelW, this.panelH);
    L.add(g);
    const sel = this.selected !== null ? s.fixtures.find((f) => f.uid === this.selected) : undefined;
    if (this.placing) {
      const item = catalog(s).find((i) => i.id === this.placing);
      this.hint.setText(`Chạm ô trống để đặt ${item?.name ?? ''} · ${this.placingRot ? 'dọc' : 'ngang'}`);
    } else if (sel) this.hint.setText('Kéo để di chuyển · ô xanh hợp lệ, đỏ không hợp lệ');
    else this.hint.setText('Chạm nội thất để chọn · chạm đất khóa để mở');

    if (sel) {
      const def = furniture(sel.type);
      if (this.landscape) {
        L.add(txt(this, this.panelX + 12, this.panelY + 8, `${def.icon} ${def.name}${sel.shelf !== undefined ? ` (kệ ${sel.shelf + 1})` : ''}`, { size: 13, bold: true, color: HEX.cream }));
        L.add(new Button(this, this.panelX + 46, this.panelY + 42, { w: 74, h: 32, label: '↻ Xoay', size: 11, color: C.blue, onTap: () => this.rotate(sel) }).setEnabled(def.w !== def.h));
        L.add(new Button(this, this.panelX + 128, this.panelY + 42, { w: 74, h: 32, label: '📦 Cất đi', size: 11, color: C.grey, onTap: () => this.stow(sel) }).setEnabled(!def.fixed));
        L.add(new Button(this, this.panelX + 54, this.panelY + 82, { w: 90, h: 32, label: def.fixed ? 'Không bán' : `Bán +${formatMoney(sellValue(sel.type))}`, size: 10, color: C.red, onTap: () => this.sell(sel) }).setEnabled(!def.fixed));
        L.add(new Button(this, this.panelX + 138, this.panelY + 82, { w: 66, h: 32, label: 'Bỏ chọn', size: 10, color: C.grey, onTap: () => { this.selected = null; this.redraw(); } }));
      } else {
        L.add(txt(this, 12, this.panelY + 8, `${def.icon} ${def.name}${sel.shelf !== undefined ? ` (kệ ${sel.shelf + 1})` : ''}`, { size: 13, bold: true, color: HEX.cream }));
        L.add(new Button(this, 48, this.panelY + 48, { w: 78, h: 36, label: '↻ Xoay', size: 11, color: C.blue, onTap: () => this.rotate(sel) }).setEnabled(def.w !== def.h));
        L.add(new Button(this, 137, this.panelY + 48, { w: 76, h: 36, label: '📦 Cất đi', size: 11, color: C.grey, onTap: () => this.stow(sel) }).setEnabled(!def.fixed));
        L.add(new Button(this, 231, this.panelY + 48, { w: 96, h: 36, label: def.fixed ? 'Không bán' : `Bán +${formatMoney(sellValue(sel.type))}`, size: 10, color: C.red, onTap: () => this.sell(sel) }).setEnabled(!def.fixed));
        L.add(new Button(this, 322, this.panelY + 48, { w: 68, h: 36, label: 'Bỏ chọn', size: 10, color: C.grey, onTap: () => { this.selected = null; this.redraw(); } }));
      }
    } else {
      L.add(txt(this, this.panelX + 12, this.panelY + 6, this.placing ? '📍 Đang đặt · chạm lại thẻ để bỏ' : '🛒 Mua thêm', { size: 13, bold: true, color: HEX.cream }));
      L.add(txt(this, this.panelX + 145, this.panelY + 8, `💰 ${formatMoney(s.money)}`, {
        size: 11, bold: true, color: '#ffe082', origin: [0, 0],
      }));
      const rightBtnX = this.landscape ? this.panelX + this.panelW - 48 : W - 50;
      if (this.placing && !DATA.decor.some((d) => d.id === this.placing)) {
        const def = furniture(this.placing);
        L.add(new Button(this, rightBtnX, this.panelY + 20, {
          w: 86, h: 30, label: `↻ ${this.placingRot ? 'Dọc' : 'Ngang'}`, size: 11, color: C.blue,
          onTap: () => this.rotatePlacement(),
        }).setEnabled(def.w !== def.h));
      } else if (!this.placing) {
        L.add(new Button(this, rightBtnX, this.panelY + 20, {
          w: 86, h: 30, label: `📦 Cất (${s.storedFixtures.length})`, size: 10, color: C.blue,
          onTap: () => this.showStoredFixtures(),
        }).setEnabled(s.storedFixtures.length > 0));
      }
      this.renderShop(L);
    }
    if (this.landscape) {
      L.add(new Button(this, this.panelX + 48, H - 24, { w: 80, h: 32, label: '✕ Hủy', size: 13, color: C.grey, onTap: () => this.cancel() }));
      L.add(new Button(this, this.panelX + this.panelW - 54, H - 24, { w: 96, h: 34, label: 'Xong ✓', size: 15, color: C.green, onTap: () => this.done() }));
    } else {
      L.add(new Button(this, 70, H - 32, { w: 116, h: 42, label: '✕ Hủy', size: 15, color: C.grey, onTap: () => this.cancel() }));
      L.add(new Button(this, W - 80, H - 32, { w: 136, h: 46, label: 'Xong ✓', size: 17, color: C.green, onTap: () => this.done() }));
    }
  }

  /** Dải thẻ mua nội thất, vuốt ngang: món mua được xếp trước, món còn khóa xếp sau theo level. */
  private renderShop(L: Phaser.GameObjects.Container): void {
    const s = G.state;
    const items = catalog(s).map((it) => {
      const def = it.decor ? null : furniture(it.id);
      const missingPlot = !!def?.requiresPlot && !s.land.includes(def.requiresPlot);
      const limitReached = !!def?.limit && [...s.fixtures, ...s.storedFixtures].filter((f) => f.type === it.id).length >= def.limit;
      const tooLow = s.level < it.level;
      const requiredCashiers = def?.kind === 'counter' && !def.fixed ? s.fixtures.filter((f) => furniture(f.type).kind === 'counter').length + 1 : 0;
      const missingCashiers = requiredCashiers > s.staff.filter((staff) => staff.role === 'cashier').length;
      return { it, missingPlot, limitReached, tooLow, missingCashiers, requiredCashiers, locked: tooLow || missingPlot || limitReached || missingCashiers };
    });
    items.sort((a, b) => Number(a.locked) - Number(b.locked) || (a.locked ? a.it.level - b.it.level : 0));
    const row = this.add.container(-this.shopX, 0);
    row.setMask(this.shopMask.createGeometryMask());
    this.shopRow = row;
    L.add(row);
    const cy = this.shopTop + CARD_H / 2;
    items.forEach(({ it, missingPlot, limitReached, tooLow, missingCashiers, requiredCashiers, locked }, i) => {
      const x = 10 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const active = this.placing === it.id;
      const b = new Button(this, x, cy, {
        w: CARD_W, h: CARD_H, label: '', radius: 12,
        color: active ? C.yellow : locked ? 0x5a4a3e : C.wood,
        stroke: active ? 0xffffff : undefined, strokeAlpha: 0.9,
        onTap: () => {
          if (tooLow) { toast(this, `Mở ở level ${it.level}`); return; }
          if (missingPlot) { toast(this, 'Mở Đất D để mua món này'); return; }
          if (limitReached) { toast(this, `Đã đủ số lượng ${it.name}`); return; }
          if (missingCashiers) { toast(this, `Cần tuyển đủ ${requiredCashiers} thu ngân để vận hành ${requiredCashiers} quầy`); return; }
          if (active) this.stopPlacing();
          else this.startPlacing(it.id, null, 0);
          this.selected = null;
          this.redraw();
        },
      });
      // Khung sáng sau hình cho dễ nhìn.
      const g = this.add.graphics();
      g.fillStyle(0xfff4e0, locked ? 0.25 : 0.9).fillRoundedRect(-CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, 40, 8);
      b.add(g);
      const icon = furnitureImage(this, it.id, 0, -CARD_H / 2 + 26, CARD_W - 20, 32) ?? emoji(this, 0, -CARD_H / 2 + 26, it.icon, 22);
      b.add(icon.setAlpha(locked ? 0.45 : 1));
      const name = txt(this, 0, -CARD_H / 2 + 51, it.name, {
        size: 10, bold: true, color: locked ? '#d8c8b8' : HEX.white, origin: [0.5, 0], align: 'center', wrap: CARD_W - 8,
      });
      name.setMaxLines(2);
      b.add(name);
      // Nhãn giá / điều kiện ở đáy thẻ.
      const status = tooLow ? `Cần Lv ${it.level}` : missingPlot ? 'Cần Đất D' : limitReached ? '✓ Đã đủ' : missingCashiers ? `Cần ${requiredCashiers} thu ngân` : formatMoney(it.cost);
      const poor = !locked && s.money < it.cost;
      const chip = this.add.graphics();
      chip.fillStyle(0x000000, 0.35).fillRoundedRect(-CARD_W / 2 + 6, CARD_H / 2 - 24, CARD_W - 12, 18, 9);
      b.add(chip);
      b.add(txt(this, 0, CARD_H / 2 - 15, status, {
        size: 10, bold: true, origin: [0.5, 0.5],
        color: locked ? '#e0d0c0' : poor ? '#ff8a7a' : '#ffe082',
      }));
      row.add(b);
    });
    const contentW = 20 + items.length * (CARD_W + CARD_GAP) - CARD_GAP;
    this.shopMax = Math.max(0, contentW - this.panelW);
    this.shopX = Math.min(this.shopX, this.shopMax);
    row.setX((this.landscape ? this.panelX : 0) - this.shopX);
    if (this.shopMax > 0 && !this.placing) {
      // Chừa khoảng riêng cho nút Cất ở mép phải của cùng hàng tiêu đề.
      L.add(txt(this, (this.landscape ? this.panelX + this.panelW : W) - 102, this.panelY + 8, 'vuốt ngang ›', { size: 10, color: HEX.muted, origin: [1, 0] }));
    }
  }

  // ---------- Thao tác ----------

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.landscape ? p.worldX >= this.panelX : p.worldY >= this.panelY) return;
    const cell = this.cellAt(p.worldX, p.worldY);
    if (!cell) return;
    const f = this.fixtureAt(cell.x, cell.y);
    if (f && !this.placing) {
      this.drag = { uid: f.uid, startX: p.worldX, startY: p.worldY, moved: false, cell: null, offset: { x: cell.x - f.x, y: cell.y - f.y } };
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d && this.placing) {
      const cell = this.cellAt(p.worldX, p.worldY);
      if (!cell) return;
      this.showPlacementPreview(cell);
      return;
    }
    if (!d || !p.isDown) return;
    if (!d.moved && Math.hypot(p.worldX - d.startX, p.worldY - d.startY) < 8) return;
    const f = G.state.fixtures.find((item) => item.uid === d.uid);
    if (!f) return;
    if (!d.moved) {
      d.moved = true;
      this.selected = f.uid;
      this.redraw();
      this.ghost = this.fixtureView(f).setAlpha(0.75).setDepth(55);
    }
    const cell = this.cellAt(p.worldX, p.worldY);
    if (!cell) return;
    const x = cell.x - d.offset.x;
    const y = cell.y - d.offset.y;
    d.cell = { x, y };
    this.ghost?.setPosition(this.gx + x * this.cell, this.gy + y * this.cell);
    this.paintFootprint(f.type, x, y, f.rot, f.uid);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    this.drag = null;
    this.overlay.clear();
    this.ghost?.destroy();
    this.ghost = null;
    if ((this.landscape ? p.worldX >= this.panelX : p.worldY >= this.panelY) && !d) return;
    if (d?.moved) {
      const f = G.state.fixtures.find((item) => item.uid === d.uid);
      if (f && d.cell) {
        const error = moveFixture(G.state, f.uid, d.cell.x, d.cell.y, f.rot);
        if (error) { play('error'); toast(this, error === 'missing' ? 'Không tìm thấy' : PLACE_TEXT[error], H * 0.4, C.red); }
        else { play('pick'); this.blocked.clear(); }
      }
      this.redraw();
      return;
    }
    const cell = this.cellAt(p.worldX, p.worldY);
    if (!cell || p.getDistance() > 10) return;
    if (this.placing) { this.place(cell.x, cell.y); return; }
    const f = this.fixtureAt(cell.x, cell.y);
    if (f) {
      this.selected = this.selected === f.uid ? null : f.uid;
      play('tap');
      this.redraw();
      return;
    }
    const owner = plotAt(cell.x, cell.y);
    if (owner && owner !== 'initial' && !G.state.land.includes(owner)) this.askUnlock(owner);
    else if (this.selected !== null) { this.selected = null; this.redraw(); }
  }

  private paintFootprint(type: string, x: number, y: number, rot: 0 | 1, ignore?: number): void {
    const ok = !placementError(G.state, type, x, y, rot, ignore);
    this.overlay.clear();
    for (const c of fixtureCells({ type, x, y, rot })) {
      this.overlay.fillStyle(ok ? C.green : C.red, 0.45).fillRect(this.gx + c.x * this.cell, this.gy + c.y * this.cell, this.cell, this.cell);
    }
  }

  private fixtureAt(x: number, y: number): Fixture | undefined {
    return G.state.fixtures.find((f) => fixtureCells(f).some((c) => c.x === x && c.y === y));
  }

  private place(x: number, y: number): void {
    const id = this.placing!;
    const isDecor = DATA.decor.some((d) => d.id === id);
    const result = isDecor ? buyDecor(G.state, id, { x, y })
      : this.placingStoredUid !== null
        ? retrieveFixture(G.state, this.placingStoredUid, x, y, this.placingRot)
        : buyFixture(G.state, id, x, y, this.placingRot);
    // Mua mới trả về 'ok', còn retrieveFixture trả về null khi thành công.
    // Xem null là thất bại sẽ làm món đã lấy khỏi kho hiện toast "Không đặt được"
    // dù dữ liệu đã chuyển món vào tiệm.
    if (result !== 'ok' && result !== null) {
      play('error');
      this.paintFootprint(id, x, y, isDecor ? 0 : this.placingRot);
      this.time.delayedCall(400, () => this.overlay.clear());
      const msg = result === 'money' ? 'Chưa đủ tiền'
        : result === 'level' ? 'Chưa mở khóa'
        : result === 'plot' ? 'Mở Đất D để mua món này'
        : result === 'shop' ? 'Loại tiệm này không đặt được món này'
        : result === 'limit' ? `Đã đủ số lượng ${furniture(id).name}`
        : result === 'staff' ? `Cần tuyển đủ ${G.state.fixtures.filter((f) => furniture(f.type).kind === 'counter').length + 1} thu ngân để vận hành các quầy`
        : result in PLACE_TEXT ? PLACE_TEXT[result as PlaceError]
        : 'Không đặt được';
      toast(this, msg, H * 0.4, C.red);
      return;
    }
    play('cash');
    toast(this, this.placingStoredUid !== null
      ? `Đã lấy ${furniture(id).name} khỏi kho!`
      : `Đã mua ${isDecor ? decor(id).name : furniture(id).name}!`, H * 0.4, C.greenDark);
    this.placing = null;
    this.placingStoredUid = null;
    this.placingRot = 0;
    this.placementCell = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.overlay.clear();
    this.blocked.clear();
    this.redraw();
  }

  private startPlacing(type: string, storedUid: number | null, rot: 0 | 1): void {
    this.placing = type;
    this.placingStoredUid = storedUid;
    this.placingRot = rot;
    this.ghost?.destroy();
    this.ghost = null;
    this.overlay.clear();
    this.placementCell = null;
    if (DATA.decor.some((item) => item.id === type)) return;
    for (let y = 0; y < DATA.land.rows; y++) {
      for (let x = 0; x < DATA.land.cols; x++) {
        if (placementError(G.state, type, x, y, rot) === null) {
          this.showPlacementPreview({ x, y });
          return;
        }
      }
    }
  }

  private stopPlacing(): void {
    this.placing = null;
    this.placingStoredUid = null;
    this.placingRot = 0;
    this.placementCell = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.overlay.clear();
  }

  private showPlacementPreview(cell: { x: number; y: number }): void {
    if (!this.placing || DATA.decor.some((item) => item.id === this.placing)) return;
    this.placementCell = cell;
    this.paintFootprint(this.placing, cell.x, cell.y, this.placingRot);
    this.ghost?.destroy();
    this.ghost = this.fixtureView({ uid: -1, type: this.placing, x: cell.x, y: cell.y, rot: this.placingRot })
      .setAlpha(0.55).setDepth(55);
  }

  private rotatePlacement(): void {
    if (!this.placing || DATA.decor.some((d) => d.id === this.placing)) return;
    const def = furniture(this.placing);
    if (def.w === def.h) return;
    this.placingRot = this.placingRot ? 0 : 1;
    if (this.placementCell) {
      this.showPlacementPreview(this.placementCell);
    } else {
      this.ghost?.destroy();
      this.ghost = null;
    }
    this.redraw();
  }

  private stow(fixture: Fixture): void {
    const result = stowFixture(G.state, fixture.uid);
    if (result === 'fixed') { toast(this, 'Nội thất cố định không thể cất'); return; }
    if (result !== 'ok') return;
    this.selected = null;
    this.blocked.clear();
    toast(this, `Đã cất ${furniture(fixture.type).name}. Có thể lấy ra miễn phí sau.`);
    this.redraw();
  }

  private showStoredFixtures(): void {
    const stored = G.state.storedFixtures;
    if (!stored.length) return;
    const groups = new Map<string, { fixture: Fixture; count: number }>();
    for (const fixture of stored) {
      const group = groups.get(fixture.type);
      if (group) group.count++;
      else groups.set(fixture.type, { fixture, count: 1 });
    }
    dialog(this, {
      icon: '📦', title: 'Nội thất đang cất', body: 'Chọn món để lấy ra và đặt lại miễn phí.',
      buttons: [...groups.values()].map(({ fixture, count }) => ({
        label: `${furniture(fixture.type).name}${count > 1 ? ` ×${count}` : ''}`,
        color: C.blue,
        onTap: () => {
          this.startPlacing(fixture.type, fixture.uid, fixture.rot);
          this.selected = null;
          this.redraw();
        },
      })),
    });
  }

  private rotate(f: Fixture): void {
    const next = (f.rot ? 0 : 1) as 0 | 1;
    const error = moveFixture(G.state, f.uid, f.x, f.y, next);
    if (error) { play('error'); toast(this, error === 'missing' ? 'Không xoay được' : PLACE_TEXT[error], H * 0.4, C.red); return; }
    play('pick');
    this.blocked.clear();
    this.redraw();
  }

  private sell(f: Fixture): void {
    const def = furniture(f.type);
    dialog(this, { icon: def.icon, title: `Bán ${def.name}?`, body: `Nhận lại ${formatMoney(sellValue(f.type))} (50%). Hàng đang bày được trả về kho.`, buttons: [
      { label: 'Thôi', color: C.grey },
      { label: 'Bán', color: C.red, onTap: () => {
        const r = sellFixture(G.state, f.uid);
        if (r === 'space') { toast(this, 'Kho không đủ chỗ chứa hàng trên kệ này', H * 0.4, C.red); return; }
        if (r !== 'ok') return;
        play('coin');
        this.selected = null;
        this.redraw();
      } },
    ] });
  }

  private askUnlock(id: string): void {
    const p = plot(id);
    const status = plotStatus(G.state, id);
    const body = status === 'level' ? `Cần level ${p.level}.` : p.generatorOnly
      ? `Mở ô kỹ thuật riêng (${plotCells(p).length} ô) miễn phí ở level ${p.level}. Ô này chỉ dành cho máy phát điện, không chiếm chỗ bán hàng.`
      : `Mở ${p.name} (${plotCells(p).length} ô${p.storageOnly ? ', chỉ đặt kệ kho' : ''}) với giá ${formatMoney(p.cost)}.${status === 'money' ? '\nChưa đủ tiền.' : ''}`;
    dialog(this, { icon: '🏚️', title: p.name, body, buttons: status === 'available'
      ? [{ label: 'Để sau', color: C.grey }, { label: 'Mở', color: C.green, onTap: () => {
        if (unlockPlot(G.state, id) === 'open') {
          play('levelup');
          this.redraw();
          this.celebrate(id);
        }
      } }]
      : [{ label: 'Đóng', color: C.grey }] });
  }

  /** Hiệu ứng "dỡ rào" khi mở đất. */
  private celebrate(id: string): void {
    for (const c of plotCells(plot(id))) {
      const r = this.add.rectangle(this.gx + c.x * this.cell + this.cell / 2, this.gy + c.y * this.cell + this.cell / 2, this.cell, this.cell, 0x5c4632).setDepth(40);
      this.tweens.add({ targets: r, alpha: 0, scaleY: 0.1, duration: 500, delay: (c.x + c.y) * 40, onComplete: () => r.destroy() });
    }
    toast(this, `Đã mở ${plot(id).name}!`, H * 0.4, C.greenDark);
  }

  private cancel(): void {
    G.state = JSON.parse(this.snapshot);
    this.scene.start('Morning');
  }

  private done(): void {
    const check = checkPaths(G.state);
    if (!check.ok) {
      this.blocked = new Set(check.blocked);
      play('error');
      toast(this, 'Lối đi bị chặn! Khách phải đi được từ cửa tới quầy và mọi kệ (viền đỏ).', H * 0.4, C.red);
      this.redraw();
      return;
    }
    persist();
    this.scene.start('Morning');
  }
}
