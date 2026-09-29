import Phaser from 'phaser';
import { branchAvailable, maxStores, openBranch, visitStore } from '../core/branches';
import { clampScroll, lotAt, parseCityMap, type CityLot, type CityMap, type TiledMap } from '../core/cityMap';
import { DATA, type BranchDef } from '../core/data';
import { formatMoney } from '../core/state';
import cityMapJson from '../data/cityMap.json';
import { G, persist } from '../game';
import { buildingTexture, ensureCityTileset, CITY_TILESET_KEY, type BuildingKind } from '../ui/cityTiles';
import { card, pageFrame } from '../ui/page';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, ZOOM, txt } from '../ui/theme';

/** Mức thu phóng của camera thế giới (tỉ lệ so với ZOOM); chỉ dùng bước nguyên/nửa để pixel art không nhòe. */
const ZOOM_STEPS = [1, 1.5, 2];
/** Dịch con trỏ quá ngưỡng này (px logic) thì tính là kéo, không phải chạm (cùng ngưỡng với ScrollArea). */
const DRAG_THRESHOLD = 8;
const MAP_KEY = 'city-map';
const SHEET_H = 150;

interface LotView {
  lot: CityLot;
  def: BranchDef | null;
  building: Phaser.GameObjects.Image | null;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
}

/**
 * Bản đồ phố dạng tilemap (Tiled JSON): kéo để di chuyển, thu phóng, chạm tòa nhà để xem/ghé/mở tiệm.
 * Hai camera: camera chính vẽ thế giới (zoom thay đổi), camera UI giữ nguyên tỉ lệ như các màn khác.
 */
export class CityScene extends Phaser.Scene {
  private map!: CityMap;
  private worldCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private worldObjects = new Set<Phaser.GameObjects.GameObject>();
  private ignored = new Set<Phaser.GameObjects.GameObject>();
  private views: LotView[] = [];
  private zoomIndex = 0;
  /** Góc trên-trái khung nhìn trong tọa độ thế giới (px). */
  private pan = { x: 0, y: 0 };
  private selected: LotView | null = null;
  private highlight!: Phaser.GameObjects.Graphics;
  private sheet: Phaser.GameObjects.Container | null = null;
  private drag: { x: number; y: number; panX: number; panY: number; moved: boolean; id: number } | null = null;
  private pinchStart = 0;
  private pinchIndex = 0;
  private childCount = -1;

  constructor() { super('City'); }

  create(): void {
    this.map = parseCityMap(cityMapJson as unknown as TiledMap);
    this.views = [];
    this.worldObjects.clear();
    this.ignored.clear();
    this.selected = null;
    this.sheet = null;
    this.drag = null;
    this.childCount = -1;

    this.worldCam = this.cameras.main.setBackgroundColor(0x5fae3d);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'ui');
    this.uiCam.setZoom(ZOOM).centerOn(W / 2, H / 2);

    this.buildWorld();
    this.uiCam.ignore([...this.worldObjects]);

    pageFrame(this, '🗺️ Bản đồ thành phố', () => { persist(); this.scene.start('Morning'); }, `Tiền chung · ${formatMoney(G.state.money)}`, 0);
    this.buildZoomButtons();

    this.zoomIndex = 0;
    this.applyCamera();
    const active = this.map.lots.find((l) => l.storeId === G.state.activeStoreId) ?? this.map.lots[0];
    this.centerOnLot(active);
    this.bindInput();
    this.events.once('shutdown', () => { this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('pointerup'); this.input.off('wheel'); });
  }

  update(): void {
    // Đối tượng UI thêm sau (bảng thông tin, toast...) phải bị camera thế giới bỏ qua.
    if (this.children.length !== this.childCount) {
      this.childCount = this.children.length;
      const fresh = this.children.list.filter((o) => !this.worldObjects.has(o) && !this.ignored.has(o));
      if (fresh.length) { this.worldCam.ignore(fresh); fresh.forEach((o) => this.ignored.add(o)); }
    }
    this.placeLabels();
  }

  // ---- Thế giới -------------------------------------------------------------------------------

  private buildWorld(): void {
    ensureCityTileset(this);
    if (!this.cache.tilemap.exists(MAP_KEY)) this.cache.tilemap.add(MAP_KEY, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: cityMapJson });
    const tilemap = this.make.tilemap({ key: MAP_KEY });
    const tileset = tilemap.addTilesetImage('city', CITY_TILESET_KEY, this.map.tile, this.map.tile, 0, 0);
    if (!tileset) throw new Error('Không nạp được tileset phố');
    const ground = tilemap.createLayer('ground', tileset, 0, 0)?.setDepth(0);
    const objects = tilemap.createLayer('objects', tileset, 0, 0)?.setDepth(1);
    for (const layer of [ground, objects]) if (layer) this.worldObjects.add(layer);

    const s = G.state;
    for (const lot of this.map.lots) {
      const def = lot.storeId && lot.storeId !== 'main' ? DATA.branches.find((b) => b.id === lot.storeId) ?? null : null;
      const kind: BuildingKind = !lot.storeId ? 'vacant' : lot.storeId === 'main' ? 'main' : ((def?.kind as BuildingKind | undefined) ?? 'main');
      const key = buildingTexture(this, kind, lot.w, lot.h, lot.door.x - lot.x);
      const building = this.add.image(lot.x * this.map.tile, lot.y * this.map.tile, key).setOrigin(0, 0).setDepth(2);
      const opened = !lot.storeId ? false : s.stores.some((st) => st.id === lot.storeId);
      const locked = !!def && !opened && !branchAvailable(s, def);
      if (locked) building.setTint(0x8a8a8a);
      this.worldObjects.add(building);
      const label = txt(this, 0, 0, lot.storeId ? lot.name : 'Đất trống', { size: 11, bold: true, color: HEX.white, stroke: '#3b2618', origin: [0.5, 1], align: 'center' }).setDepth(50);
      const sub = txt(this, 0, 0, '', { size: 9, bold: true, color: HEX.cream, stroke: '#3b2618', origin: [0.5, 0], align: 'center' }).setDepth(50);
      this.views.push({ lot, def, building, label, sub });
    }
    this.highlight = this.add.graphics().setDepth(10);
    this.worldObjects.add(this.highlight);
    this.refreshStatus();
  }

  private refreshStatus(): void {
    const s = G.state;
    for (const v of this.views) {
      const { lot, def } = v;
      let text = '';
      let color = HEX.cream;
      if (!lot.storeId) { text = 'Sắp mở rộng'; color = '#cfe8bd'; }
      else if (s.stores.some((st) => st.id === lot.storeId)) {
        if (s.activeStoreId === lot.storeId) { text = '● Đang ghé'; color = '#9be3a4'; }
        else text = 'Đã mở';
      } else if (def) {
        text = branchAvailable(s, def) ? `Mở tiệm · ${formatMoney(def.cost)}` : `🔒 Level ${def.unlockLevel}`;
        color = branchAvailable(s, def) ? '#ffe08a' : '#c9c1b4';
      }
      v.sub.setText(text).setColor(color);
    }
  }

  // ---- Camera ---------------------------------------------------------------------------------

  private get zoomScale(): number { return ZOOM * ZOOM_STEPS[this.zoomIndex]; }

  private viewSize(): { w: number; h: number } {
    return { w: this.scale.width / this.zoomScale, h: this.scale.height / this.zoomScale };
  }

  private worldSize(): { w: number; h: number } {
    return { w: this.map.cols * this.map.tile, h: this.map.rows * this.map.tile };
  }

  private applyCamera(): void {
    const view = this.viewSize();
    this.pan = clampScroll(this.pan, view, this.worldSize());
    this.worldCam.setZoom(this.zoomScale).centerOn(this.pan.x + view.w / 2, this.pan.y + view.h / 2);
  }

  /** Đổi mức zoom giữ nguyên điểm giữa khung nhìn. */
  private setZoomIndex(index: number): void {
    const next = Phaser.Math.Clamp(index, 0, ZOOM_STEPS.length - 1);
    if (next === this.zoomIndex) return;
    const before = this.viewSize();
    const cx = this.pan.x + before.w / 2;
    const cy = this.pan.y + before.h / 2;
    this.zoomIndex = next;
    const after = this.viewSize();
    this.pan = { x: cx - after.w / 2, y: cy - after.h / 2 };
    this.applyCamera();
  }

  private centerOnLot(lot: CityLot): void {
    const view = this.viewSize();
    this.pan = {
      x: (lot.x + lot.w / 2) * this.map.tile - view.w / 2,
      y: (lot.y + lot.h / 2) * this.map.tile - view.h / 2,
    };
    this.applyCamera();
  }

  /** Điểm thế giới → tọa độ logic của camera UI (để đặt nhãn sắc nét, không bị phóng theo bản đồ). */
  private toUi(wx: number, wy: number): { x: number; y: number } {
    const k = this.zoomScale / ZOOM;
    return { x: (wx - this.pan.x) * k, y: (wy - this.pan.y) * k };
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    return { x: this.pan.x + px / this.zoomScale, y: this.pan.y + py / this.zoomScale };
  }

  private placeLabels(): void {
    for (const v of this.views) {
      const top = this.toUi((v.lot.x + v.lot.w / 2) * this.map.tile, v.lot.y * this.map.tile);
      const bottom = this.toUi((v.lot.x + v.lot.w / 2) * this.map.tile, (v.lot.y + v.lot.h) * this.map.tile);
      const visible = top.x > -80 && top.x < W + 80 && bottom.y > 40 && top.y < H + 20;
      v.label.setVisible(visible).setPosition(top.x, top.y - 2);
      v.sub.setVisible(visible).setPosition(bottom.x, bottom.y + 2);
    }
    this.drawHighlight();
  }

  private drawHighlight(): void {
    this.highlight.clear();
    if (!this.selected) return;
    const { lot } = this.selected;
    const t = this.map.tile;
    const pulse = 0.55 + 0.45 * Math.sin(this.time.now / 220);
    this.highlight.lineStyle(2, 0xffe08a, pulse).strokeRect(lot.x * t - 1, lot.y * t - 1, lot.w * t + 2, lot.h * t + 2);
  }

  // ---- Nhập liệu ------------------------------------------------------------------------------

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length) return;
      const pointers = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown);
      if (pointers.length >= 2) {
        this.pinchStart = Phaser.Math.Distance.Between(pointers[0].x, pointers[0].y, pointers[1].x, pointers[1].y);
        this.pinchIndex = this.zoomIndex;
        this.drag = null;
        return;
      }
      this.drag = { x: p.x, y: p.y, panX: this.pan.x, panY: this.pan.y, moved: false, id: p.id };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const pointers = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown);
      if (pointers.length >= 2 && this.pinchStart > 0) {
        const d = Phaser.Math.Distance.Between(pointers[0].x, pointers[0].y, pointers[1].x, pointers[1].y);
        const ratio = d / this.pinchStart;
        this.setZoomIndex(this.pinchIndex + (ratio > 1.25 ? 1 : ratio < 0.8 ? -1 : 0));
        return;
      }
      const d = this.drag;
      if (!d || !p.isDown || p.id !== d.id) return;
      const dx = p.x - d.x;
      const dy = p.y - d.y;
      if (!d.moved && Math.hypot(dx, dy) / ZOOM > DRAG_THRESHOLD) d.moved = true;
      if (!d.moved) return;
      this.pan = { x: d.panX - dx / this.zoomScale, y: d.panY - dy / this.zoomScale };
      this.applyCamera();
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const d = this.drag;
      this.drag = null;
      this.pinchStart = 0;
      if (!d || d.moved || over.length || p.id !== d.id) return;
      this.tapWorld(p.x, p.y);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.setZoomIndex(this.zoomIndex + (dy < 0 ? 1 : -1));
    });
  }

  private tapWorld(px: number, py: number): void {
    const w = this.toWorld(px, py);
    const lot = lotAt(this.map, Math.floor(w.x / this.map.tile), Math.floor(w.y / this.map.tile));
    const view = lot ? this.views.find((v) => v.lot === lot) ?? null : null;
    this.select(view);
  }

  private buildZoomButtons(): void {
    const x = W - 26;
    new Button(this, x, 86, { w: 36, h: 36, label: '+', size: 20, color: C.wood, onTap: () => this.setZoomIndex(this.zoomIndex + 1) });
    new Button(this, x, 128, { w: 36, h: 36, label: '−', size: 20, color: C.wood, onTap: () => this.setZoomIndex(this.zoomIndex - 1) });
  }

  // ---- Bảng thông tin -------------------------------------------------------------------------

  private select(view: LotView | null): void {
    this.sheet?.destroy(true);
    this.sheet = null;
    this.selected = view;
    if (view) {
      this.openSheet(view);
      this.revealAboveSheet(view.lot);
    }
  }

  /** Cuộn để tòa nhà nằm giữa vùng trống phía trên bảng thông tin, không bị bảng che. */
  private revealAboveSheet(lot: CityLot): void {
    const regionTop = 58;
    const regionBottom = H - SHEET_H - 16;
    const k = ZOOM / this.zoomScale;
    this.pan = {
      x: (lot.x + lot.w / 2) * this.map.tile - (W / 2) * k,
      y: (lot.y + lot.h / 2) * this.map.tile - ((regionTop + regionBottom) / 2) * k,
    };
    this.applyCamera();
  }

  private openSheet(view: LotView): void {
    const s = G.state;
    const { lot, def } = view;
    const store = s.stores.find((st) => st.id === lot.storeId);
    const h = SHEET_H;
    const top = H - h - 8;
    const sheet = this.add.container(0, 0).setDepth(200);
    this.sheet = sheet;
    // Nền bảng chặn chạm xuyên xuống bản đồ.
    const blocker = this.add.rectangle(W / 2, top + h / 2, W - 16, h, 0x000000, 0).setInteractive();
    sheet.add([blocker, card(this, 8, top, W - 16, h, C.panel)]);
    const title = !lot.storeId ? '🌿 Đất trống' : `${def?.icon ?? '🏪'} ${lot.name}`;
    sheet.add(txt(this, 18, top + 10, title, { size: 14, bold: true }));
    sheet.add(new Button(this, W - 30, top + 20, { w: 32, h: 28, label: '✕', size: 12, color: C.grey, onTap: () => this.select(null) }));
    const desc = !lot.storeId ? 'Lô đất chờ khu mới. Sẽ mở khi thành phố mở rộng.' : def?.description ?? 'Cửa hàng gốc của bạn.';
    sheet.add(txt(this, 18, top + 34, desc, { size: 10, color: HEX.muted, wrap: W - 48 }));

    const btnY = top + h - 30;
    if (!lot.storeId) return;
    if (store) {
      const current = s.activeStoreId === lot.storeId;
      sheet.add(txt(this, 18, top + 62, current ? 'Đang ghé tiệm này' : `Tiệm đã mở · mô phỏng đến ngày ${store.simDay ?? s.branchLastSimDay[lot.storeId] ?? s.day}`, { size: 10, color: current ? HEX.green : HEX.ink, wrap: W - 48 }));
      const buttons: { label: string; color: number; onTap: () => void }[] = [];
      if (!current) buttons.push({ label: 'Ghé tiệm', color: C.blue, onTap: () => { visitStore(s, lot.storeId); persist(); this.scene.start('Morning'); } });
      buttons.push({ label: '🗺️ Xem kệ', color: C.wood, onTap: () => { persist(); this.scene.start('StoreMap', { storeId: lot.storeId, back: 'City' }); } });
      buttons.push({ label: '📋 Danh sách', color: C.wood, onTap: () => { persist(); this.scene.start('Branches'); } });
      const bw = Math.min(104, (W - 32 - (buttons.length - 1) * 6) / buttons.length);
      buttons.forEach((b, i) => sheet.add(new Button(this, 16 + bw / 2 + i * (bw + 6), btnY, { w: bw, h: 36, label: b.label, size: 11, color: b.color, onTap: b.onTap })));
      return;
    }
    if (!def) return;
    const available = branchAvailable(s, def);
    sheet.add(txt(this, 18, top + 62, available ? `Phí mở ${formatMoney(def.cost)}` : `Mở ở Level ${def.unlockLevel}${def.feature && s.level >= def.unlockLevel ? ' (cần mở tính năng)' : ''}`, { size: 10, bold: true, color: available ? HEX.ink : HEX.red, wrap: W - 48 }));
    const open = new Button(this, W / 2, btnY, { w: 150, h: 36, label: 'Mở tiệm', size: 12, color: C.green, onTap: () => {
      const result = openBranch(s, def.id);
      if (!result.ok) { toast(this, result.reason === 'money' ? 'Chưa đủ tiền mở chi nhánh' : result.reason === 'limit' ? `Đã đạt giới hạn ${maxStores()} cửa hàng` : 'Chưa mở chi nhánh này'); return; }
      persist(); this.scene.start('Morning');
    } });
    open.setEnabled(available);
    sheet.add(open);
  }
}
