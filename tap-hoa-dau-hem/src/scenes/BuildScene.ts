import Phaser from 'phaser';
import { DATA, decor, furniture, hasFeature, type FurnitureKind } from '../core/data';
import { buyDecor } from '../core/decor';
import {
  buyFixture, checkPaths, fixtureCells, footprint, moveFixture, placementError, plot, plotAt, plotCells, plotStatus,
  sellValue, unlockPlot, type PlaceError,
} from '../core/layout';
import { formatMoney, type Fixture, type GameState } from '../core/state';
import { sellFixture } from '../core/stock';
import { G, persist } from '../game';
import { play } from '../ui/sound';
import { furnitureImage } from '../ui/art';
import { Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, emoji, setupCamera, txt } from '../ui/theme';

const CELL = 46;
const GX = (W - DATA.land.cols * CELL) / 2;
const GY = 60;
const PANEL_Y = GY + DATA.land.rows * CELL + 6;

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
  'storage-only': 'Sân sau chỉ đặt kệ kho',
};

/** Những gì có thể mua trong chế độ Sắp xếp (nội thất + đồ trang trí đặt sàn). */
function catalog(state: GameState): { id: string; name: string; icon: string; cost: number; level: number; decor: boolean }[] {
  const items = DATA.furniture.filter((f) => !f.fixed).map((f) => ({ id: f.id, name: f.name, icon: f.icon, cost: f.cost, level: f.unlockLevel, decor: false }));
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
  private blocked = new Set<number>();
  private drag: { uid: number; startX: number; startY: number; moved: boolean; cell: { x: number; y: number } | null; offset: { x: number; y: number } } | null = null;
  private ghost: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Build');
  }

  create(data: { buy?: string }): void {
    setupCamera(this);
    const s = G.state;
    this.snapshot = JSON.stringify(s);
    this.selected = null;
    this.placing = data?.buy ?? null;
    this.blocked.clear();
    this.drag = null;
    this.ghost = null;

    const bg = this.add.graphics();
    bg.fillStyle(C.bg, 1).fillRect(0, 0, W, H);
    bg.fillStyle(C.hud, 1).fillRect(0, 0, W, 50);
    txt(this, W / 2, 16, '🏗️ Sắp xếp tiệm', { size: 17, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    this.hint = txt(this, W / 2, 38, '', { size: 11, color: HEX.cream, origin: [0.5, 0.5], align: 'center' });

    this.gridG = this.add.graphics();
    this.fixtureLayer = this.add.container(0, 0);
    this.overlay = this.add.graphics().setDepth(50);
    this.panelLayer = this.add.container(0, 0).setDepth(60);

    // Chạm lên nút / hộp thoại (đối tượng tương tác) thì không xử lý như chạm lưới.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => { if (!over.length) this.onDown(p); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length && !this.drag?.moved) { this.drag = null; return; }
      this.onUp(p);
    });

    this.redraw();
  }

  // ---------- Vẽ ----------

  private cellAt(worldX: number, worldY: number): { x: number; y: number } | null {
    const x = Math.floor((worldX - GX) / CELL);
    const y = Math.floor((worldY - GY) / CELL);
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
      const px = GX + x * CELL;
      const py = GY + y * CELL;
      if (!owner) {
        g.fillStyle(0x3a2a20, 1).fillRect(px, py, CELL, CELL);
        continue;
      }
      const storage = owner !== 'initial' && plot(owner).storageOnly;
      if (open) g.fillStyle(storage ? 0x9aa48a : (x + y) % 2 ? C.floorA : C.floorB, 1).fillRect(px, py, CELL, CELL);
      else g.fillStyle(0x5c4632, 1).fillRect(px, py, CELL, CELL);
      g.lineStyle(1, 0x000000, 0.15).strokeRect(px, py, CELL, CELL);
    }
    // Cửa ra vào
    g.fillStyle(C.red, 1).fillRect(GX + door.x * CELL + 4, GY + (door.y + 1) * CELL - 6, CELL - 8, 6);

    this.fixtureLayer.removeAll(true);
    this.fixtureLayer.add(emoji(this, GX + door.x * CELL + CELL / 2, GY + door.y * CELL + CELL / 2, '🚪', 20));
    // Đất khóa: nhãn giá / level ở giữa mảnh.
    for (const p of DATA.land.plots) {
      if (s.land.includes(p.id)) continue;
      const cells = plotCells(p);
      const cx = GX + (cells.reduce((a, c) => a + c.x, 0) / cells.length) * CELL + CELL / 2;
      const cy = GY + (cells.reduce((a, c) => a + c.y, 0) / cells.length) * CELL + CELL / 2;
      const status = plotStatus(s, p.id);
      const label = status === 'level' ? `🔒 ${p.name}\nCần level ${p.level}` : `🔒 ${p.name}\n${formatMoney(p.cost)}`;
      const t = txt(this, cx, cy, label, { size: 11, bold: true, color: HEX.cream, origin: [0.5, 0.5], align: 'center' });
      t.setBackgroundColor(status === 'available' ? '#2a7a43cc' : '#00000088').setPadding(4, 2, 4, 2);
      this.fixtureLayer.add(t);
    }
    for (const f of s.fixtures) this.fixtureLayer.add(this.fixtureView(f));
    this.renderPanel();
  }

  private fixtureView(f: Fixture): Phaser.GameObjects.Container {
    const def = furniture(f.type);
    const { w, h } = footprint(f.type, f.rot);
    const c = this.add.container(GX + f.x * CELL, GY + f.y * CELL);
    const g = this.add.graphics();
    const color = KIND_COLOR[def.kind];
    g.fillStyle(0x000000, 0.2).fillRoundedRect(3, 5, w * CELL - 6, h * CELL - 6, 6);
    g.fillStyle(color, 1).fillRoundedRect(3, 3, w * CELL - 6, h * CELL - 6, 6);
    const sel = this.selected === f.uid;
    const bad = this.blocked.has(f.uid);
    g.lineStyle(sel || bad ? 3 : 1.5, bad ? C.red : sel ? C.yellow : 0x000000, sel || bad ? 1 : 0.35).strokeRoundedRect(3, 3, w * CELL - 6, h * CELL - 6, 6);
    c.add(g);
    // Pixel art theo footprint gốc; nội thất xoay thì ảnh xoay 90°.
    const img = furnitureImage(this, f.type, (w * CELL) / 2, (h * CELL) / 2, w * CELL - 8, h * CELL - 8, f.rot);
    c.add(img ?? emoji(this, (w * CELL) / 2, (h * CELL) / 2, def.icon, 18));
    if (w * h > 1) {
      const label = f.shelf !== undefined ? `${def.kind === 'shelf' ? 'Kệ' : def.name} ${f.shelf + 1}` : def.name;
      const tag = txt(this, (w * CELL) / 2, h * CELL - 8, label, { size: 8, bold: true, color: HEX.white, origin: [0.5, 0.5] });
      c.add(tag.setBackgroundColor('#000000aa').setPadding(3, 0, 3, 0));
    }
    return c;
  }

  private renderPanel(): void {
    const s = G.state;
    const L = this.panelLayer;
    L.removeAll(true);
    const g = this.add.graphics();
    g.fillStyle(C.hud, 1).fillRect(0, PANEL_Y, W, H - PANEL_Y);
    L.add(g);
    const sel = this.selected !== null ? s.fixtures.find((f) => f.uid === this.selected) : undefined;
    if (this.placing) {
      const item = catalog(s).find((i) => i.id === this.placing);
      this.hint.setText(`Chạm một ô trống đã mở để đặt ${item?.name ?? ''}`);
    } else if (sel) this.hint.setText('Kéo để di chuyển · ô xanh hợp lệ, đỏ không hợp lệ');
    else this.hint.setText('Chạm nội thất để chọn · chạm đất khóa để mở');

    if (sel) {
      const def = furniture(sel.type);
      L.add(txt(this, 12, PANEL_Y + 8, `${def.icon} ${def.name}${sel.shelf !== undefined ? ` (kệ ${sel.shelf + 1})` : ''}`, { size: 13, bold: true, color: HEX.cream }));
      L.add(new Button(this, 60, PANEL_Y + 48, { w: 100, h: 36, label: '↻ Xoay', size: 13, color: C.blue, onTap: () => this.rotate(sel) }));
      L.add(new Button(this, 176, PANEL_Y + 48, { w: 120, h: 36, label: def.fixed ? 'Không bán' : `Bán +${formatMoney(sellValue(sel.type))}`, size: 12, color: C.red, onTap: () => this.sell(sel) }).setEnabled(!def.fixed));
      L.add(new Button(this, 300, PANEL_Y + 48, { w: 90, h: 36, label: 'Bỏ chọn', size: 12, color: C.grey, onTap: () => { this.selected = null; this.redraw(); } }));
    } else {
      L.add(txt(this, 12, PANEL_Y + 6, this.placing ? 'Đang chọn chỗ đặt…' : 'Mua thêm:', { size: 12, bold: true, color: HEX.cream }));
      const items = catalog(s);
      const cw = Math.min(66, (W - 16) / items.length - 4);
      items.forEach((it, i) => {
        const x = 8 + cw / 2 + i * (cw + 4);
        const y = PANEL_Y + 58;
        const def = it.decor ? null : furniture(it.id);
        const missingPlot = !!def?.requiresPlot && !s.land.includes(def.requiresPlot);
        const limitReached = !!def?.limit && s.fixtures.filter((f) => f.type === it.id).length >= def.limit;
        const locked = s.level < it.level || missingPlot || limitReached;
        const status = s.level < it.level ? `Lv ${it.level}` : missingPlot ? 'Mở Đất D' : limitReached ? 'Đã đủ' : formatMoney(it.cost);
        const active = this.placing === it.id;
        const b = new Button(this, x, y, {
          w: cw, h: 70, size: 9, color: active ? C.yellow : locked ? C.grey : C.wood,
          label: `\n\n${it.name}\n${status}`,
          onTap: () => {
            if (s.level < it.level) { toast(this, `Mở ở level ${it.level}`); return; }
            if (missingPlot) { toast(this, 'Mở Đất D để mua món này'); return; }
            if (limitReached) { toast(this, `Đã đủ số lượng ${it.name}`); return; }
            this.placing = active ? null : it.id;
            this.selected = null;
            this.redraw();
          },
        });
        const icon = furnitureImage(this, it.id, 0, -16, cw - 14, 26);
        if (icon) b.add(icon.setAlpha(locked ? 0.5 : 1));
        L.add(b);
      });
    }
    L.add(new Button(this, 70, H - 28, { w: 116, h: 42, label: '✕ Hủy', size: 15, color: C.grey, onTap: () => this.cancel() }));
    L.add(new Button(this, W - 80, H - 28, { w: 136, h: 46, label: 'Xong ✓', size: 17, color: C.green, onTap: () => this.done() }));
  }

  // ---------- Thao tác ----------

  private onDown(p: Phaser.Input.Pointer): void {
    if (p.worldY >= PANEL_Y) return;
    const cell = this.cellAt(p.worldX, p.worldY);
    if (!cell) return;
    const f = this.fixtureAt(cell.x, cell.y);
    if (f && !this.placing) {
      this.drag = { uid: f.uid, startX: p.worldX, startY: p.worldY, moved: false, cell: null, offset: { x: cell.x - f.x, y: cell.y - f.y } };
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
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
    this.ghost?.setPosition(GX + x * CELL, GY + y * CELL);
    this.paintFootprint(f.type, x, y, f.rot, f.uid);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    this.drag = null;
    this.overlay.clear();
    this.ghost?.destroy();
    this.ghost = null;
    if (p.worldY >= PANEL_Y && !d) return;
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
      this.overlay.fillStyle(ok ? C.green : C.red, 0.45).fillRect(GX + c.x * CELL, GY + c.y * CELL, CELL, CELL);
    }
  }

  private fixtureAt(x: number, y: number): Fixture | undefined {
    return G.state.fixtures.find((f) => fixtureCells(f).some((c) => c.x === x && c.y === y));
  }

  private place(x: number, y: number): void {
    const id = this.placing!;
    const isDecor = DATA.decor.some((d) => d.id === id);
    const result = isDecor ? buyDecor(G.state, id, { x, y }) : buyFixture(G.state, id, x, y, 0);
    if (result !== 'ok') {
      play('error');
      this.paintFootprint(id, x, y, 0);
      this.time.delayedCall(400, () => this.overlay.clear());
      const msg = result === 'money' ? 'Chưa đủ tiền'
        : result === 'level' ? 'Chưa mở khóa'
        : result === 'plot' ? 'Mở Đất D để mua món này'
        : result === 'limit' ? `Đã đủ số lượng ${furniture(id).name}`
        : result in PLACE_TEXT ? PLACE_TEXT[result as PlaceError]
        : 'Không đặt được';
      toast(this, msg, H * 0.4, C.red);
      return;
    }
    play('cash');
    toast(this, `Đã mua ${isDecor ? decor(id).name : furniture(id).name}!`, H * 0.4, C.greenDark);
    this.placing = null;
    this.blocked.clear();
    this.redraw();
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
    const body = status === 'level' ? `Cần level ${p.level}.` : `Mở ${p.name} (${plotCells(p).length} ô${p.storageOnly ? ', chỉ đặt kệ kho' : ''}) với giá ${formatMoney(p.cost)}.${status === 'money' ? '\nChưa đủ tiền.' : ''}`;
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
      const r = this.add.rectangle(GX + c.x * CELL + CELL / 2, GY + c.y * CELL + CELL / 2, CELL, CELL, 0x5c4632).setDepth(40);
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
