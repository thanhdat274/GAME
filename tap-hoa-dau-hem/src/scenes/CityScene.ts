import Phaser from 'phaser';
import { branchAvailable, maxStores, openBranch, visitStore } from '../core/branches';
import { clampScroll, lotAt, parseCityMap, type CityLot, type CityMap, type TiledMap } from '../core/cityMap';
import {
  cellCenter, cellOf, createWalker, doorCell, isWalkable, nearestWalkable, pickWanderTarget, promenadeCells, stepWalker, walkTo, walkableGrid,
  type Cell, type Walker,
} from '../core/cityWalk';
import { DATA, type BranchDef, type CustomerType } from '../core/data';
import { formatMoney } from '../core/state';
import cityMapJson from '../data/cityMap.json';
import { G, persist } from '../game';
import { customerTexture, staffType } from '../ui/art';
import { cityShops, pickShop, shopIsOpen, type ShopTarget } from '../core/cityShopping';
import { ambientAt, formatClock, multiplyColor, normalizeMinute, phaseIcon, presenceAt } from '../core/timeOfDay';
import { buildingDoor, buildingTexture, buildingWindows, ensureCityTileset, ensureGlowTexture, CITY_TILESET_KEY, type BuildingKind } from '../ui/cityTiles';
import { card, pageFrame } from '../ui/page';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, ZOOM, emoji, txt } from '../ui/theme';

/** Mức thu phóng của camera thế giới (tỉ lệ so với ZOOM); chỉ dùng bước nguyên/nửa để pixel art không nhòe. */
const ZOOM_STEPS = [1, 1.5, 2];
/** Dịch con trỏ quá ngưỡng này (px logic) thì tính là kéo, không phải chạm (cùng ngưỡng với ScrollArea). */
const DRAG_THRESHOLD = 8;
const MAP_KEY = 'city-map';
const SHEET_H = 150;
/** Nhân vật vẽ ở đơn vị 2×ZOOM texel/px logic; thu về 12×20 px thế giới (một ô 16 px). */
const CHAR_SCALE = 1 / (2 * ZOOM);
const PLAYER_SPEED = 56;
const WALK_FRAME_SECONDS = 0.18;
/** Đồng hồ ngày-đêm trên phố chạy nhanh để thấy được chu kỳ: 4 phút game mỗi giây thật (~6 phút thật cho 24 giờ). */
const MINUTES_PER_SECOND = 4;
/** Màu nền cỏ của camera thế giới ban ngày (nhân với màu môi trường để vùng ngoài bản đồ khớp). */
const GROUND_BG = 0x5fae3d;
const LAMP_GLOW_SIZE = 46;
/** Xác suất một người rảnh đi mua ở tiệm thay vì dạo tiếp. */
const SHOP_CHANCE = 0.55;
const PLAYER_LOOK = { shirt: '#d84a3a', pants: '#3b4a6b', hair: '#2a1b12', skin: '#f1c9a0' };
/** Vị trí người chơi khi rời màn (trong phiên chơi), để quay lại vẫn đứng ở đó. */
let lastPlayerCell: Cell | null = null;

interface Actor {
  walker: Walker;
  sprite: Phaser.GameObjects.Image;
  type: CustomerType;
  frame: 0 | 1;
  frameTimer: number;
  /** Dân phố: thời gian đứng nghỉ còn lại trước khi chọn điểm dạo mới. */
  rest: number;
  speed: number;
  /** Dân phố ẩn khi vắng người (đêm); người chơi luôn hiện. */
  active: boolean;
  /** Tiệm đang đi tới để mua. */
  shop: ShopTarget | null;
  /** Thời gian còn ở trong tiệm (giây); > 0 nghĩa là đang ở trong, sprite ẩn. */
  inside: number;
}

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
  private grid: boolean[] = [];
  private promenade: Cell[] = [];
  private player!: Actor;
  private npcs: Actor[] = [];
  private pendingLot: LotView | null = null;
  private follow = true;
  private marker!: Phaser.GameObjects.Graphics;
  private youLabel!: Phaser.GameObjects.Text;
  /** Giờ hiển thị trên phố (phút trong ngày, số thực); tách khỏi đồng hồ game. */
  private minute = 0;
  private clockPaused = false;
  private clockBtn!: Button;
  private shownClock = '';
  private overlay!: Phaser.GameObjects.Rectangle;
  private lightGfx!: Phaser.GameObjects.Graphics;
  private lampGlows: Phaser.GameObjects.Image[] = [];
  private litLots: LotView[] = [];
  private lastDark = -1;
  private shops: ShopTarget[] = [];
  /** Độ sáng còn lại của cửa (0..1) theo id lô đất, tăng khi có người vào/ra. */
  private pulse = new Map<number, number>();
  private pulseGfx!: Phaser.GameObjects.Graphics;

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
    this.npcs = [];
    this.pendingLot = null;
    this.follow = true;
    this.minute = G.state.clock;
    this.clockPaused = false;
    this.shownClock = '';
    this.lampGlows = [];
    this.litLots = [];
    this.lastDark = -1;
    this.pulse.clear();

    this.worldCam = this.cameras.main.setBackgroundColor(0x5fae3d);
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'ui');
    this.uiCam.setZoom(ZOOM).centerOn(W / 2, H / 2);

    this.buildWorld();
    this.buildActors();
    this.shops = cityShops(G.state, this.map);
    this.uiCam.ignore([...this.worldObjects]);

    pageFrame(this, '🗺️ Bản đồ thành phố', () => { persist(); this.scene.start('Morning'); }, `Tiền chung · ${formatMoney(G.state.money)}`, 0);
    this.buildZoomButtons();
    this.buildClock();

    this.zoomIndex = 0;
    this.applyCamera();
    this.centerOnActor(this.player);
    this.bindInput();
    this.events.once('shutdown', () => { lastPlayerCell = cellOf(this.map, this.player.walker.x, this.player.walker.y); this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('pointerup'); this.input.off('wheel'); });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.updateClock(dt);
    this.updateActors(dt);
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
      const view: LotView = { lot, def, building, label, sub };
      this.views.push(view);
      if (opened) this.litLots.push(view);
    }
    this.highlight = this.add.graphics().setDepth(10);
    this.worldObjects.add(this.highlight);
    this.buildLighting();
    this.refreshStatus();
  }

  /** Lớp phủ nhân màu theo giờ và các nguồn sáng ban đêm (đèn đường, cửa sổ, cửa). */
  private buildLighting(): void {
    const world = this.worldSize();
    this.overlay = this.add.rectangle(0, 0, world.w, world.h, 0xffffff).setOrigin(0, 0).setDepth(30).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.worldObjects.add(this.overlay);
    const glowKey = ensureGlowTexture(this);
    const t = this.map.tile;
    for (let i = 0; i < this.map.objects.length; i++) {
      if (!this.map.lights.has(this.map.objects[i])) continue;
      const x = (i % this.map.cols) * t + t / 2;
      const y = Math.floor(i / this.map.cols) * t + 3;
      const glow = this.add.image(x, y, glowKey).setDisplaySize(LAMP_GLOW_SIZE, LAMP_GLOW_SIZE).setTint(0xffd68a).setBlendMode(Phaser.BlendModes.ADD).setDepth(31).setAlpha(0);
      this.lampGlows.push(glow);
      this.worldObjects.add(glow);
    }
    this.lightGfx = this.add.graphics().setDepth(31).setBlendMode(Phaser.BlendModes.ADD);
    this.worldObjects.add(this.lightGfx);
    this.pulseGfx = this.add.graphics().setDepth(32).setBlendMode(Phaser.BlendModes.ADD);
    this.worldObjects.add(this.pulseGfx);
  }

  /** Áp dụng màu môi trường của giờ hiện tại: lớp phủ, nền camera, đèn đường, cửa sổ. */
  private applyAmbient(): void {
    const a = ambientAt(this.minute);
    this.overlay.setFillStyle(a.tint, 1);
    this.worldCam.setBackgroundColor(multiplyColor(GROUND_BG, a.tint));
    const flicker = 0.92 + 0.08 * Math.sin(this.time.now / 260);
    for (const glow of this.lampGlows) glow.setAlpha(a.darkness * 0.9 * flicker);
    if (Math.abs(a.darkness - this.lastDark) > 0.004) {
      this.lastDark = a.darkness;
      this.drawWindowLights(a.darkness);
    }
  }

  private drawWindowLights(darkness: number): void {
    const g = this.lightGfx;
    g.clear();
    if (darkness <= 0.01) return;
    const t = this.map.tile;
    for (const { lot } of this.litLots) {
      const ox = lot.x * t;
      const oy = lot.y * t;
      const doorCol = lot.door.x - lot.x;
      g.fillStyle(0xffc85a, darkness * 0.75);
      for (const w of buildingWindows(lot.w, lot.h, doorCol)) g.fillRect(ox + w.x - 1, oy + w.y - 1, w.w + 2, w.h + 2);
      const d = buildingDoor(lot.h, doorCol);
      g.fillStyle(0xffb04a, darkness * 0.55).fillRect(ox + d.x, oy + d.y, d.w, d.h);
      // Vệt sáng trước cửa trải ra vỉa hè.
      g.fillStyle(0xffc060, darkness * 0.22).fillRect(ox + d.x - 6, oy + lot.h * t, d.w + 12, 8);
    }
  }

  private buildClock(): void {
    this.clockBtn = new Button(this, 50, 72, { w: 82, h: 22, radius: 4, label: '', size: 11, color: C.hud, sound: false, onTap: () => { this.clockPaused = !this.clockPaused; this.shownClock = ''; } });
    this.clockBtn.setDepth(20);
  }

  private updateClock(dt: number): void {
    if (!this.clockPaused) this.minute = normalizeMinute(this.minute + dt * MINUTES_PER_SECOND);
    const text = formatClock(this.minute);
    const label = `${phaseIcon(ambientAt(this.minute).phase)} ${text}${this.clockPaused ? ' ⏸' : ''}`;
    if (label !== this.shownClock) { this.shownClock = label; this.clockBtn.label.setText(label); }
    this.applyAmbient();
    this.applyPresence();
  }

  /** Dân phố thưa dần về đêm: người thứ `target` trở đi ẩn và đứng yên; hiện lại thì xuất hiện ở điểm dạo ngẫu nhiên. */
  private applyPresence(): void {
    const target = Math.round(this.npcs.length * presenceAt(this.minute));
    this.npcs.forEach((npc, i) => {
      const active = i < target;
      if (active === npc.active) return;
      npc.active = active;
      npc.sprite.setVisible(active);
      npc.walker.path = [];
      npc.shop = null;
      npc.inside = 0;
      if (active) {
        const at = pickWanderTarget(this.promenade, () => Math.random());
        if (at) { const c = cellCenter(this.map, at); npc.walker.x = c.x; npc.walker.y = c.y; }
        npc.rest = Math.random() * 2;
      }
    });
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

  // ---- Nhân vật -------------------------------------------------------------------------------

  private makeActor(type: CustomerType, at: Cell, speed: number): Actor {
    const walker = createWalker(this.map, at);
    const sprite = this.add.image(walker.x, walker.y + 6, customerTexture(this, type)).setOrigin(0.5, 1).setScale(CHAR_SCALE);
    this.worldObjects.add(sprite);
    return { walker, sprite, type, frame: 0, frameTimer: 0, rest: 0, speed, active: true, shop: null, inside: 0 };
  }

  private buildActors(): void {
    this.grid = walkableGrid(this.map);
    this.promenade = promenadeCells(this.map, this.grid);
    const activeLot = this.map.lots.find((l) => l.storeId === G.state.activeStoreId) ?? this.map.lots[0];
    const start = lastPlayerCell && isWalkable(this.map, this.grid, lastPlayerCell) ? lastPlayerCell : doorCell(activeLot);
    this.player = this.makeActor(staffType({ id: 'player', name: 'Chủ tiệm', look: PLAYER_LOOK }), start, PLAYER_SPEED);
    this.youLabel = txt(this, 0, 0, 'Bạn', { size: 9, bold: true, color: HEX.white, stroke: '#3b2618', origin: [0.5, 1], align: 'center' }).setDepth(50);

    // Dân phố: nhiều tiệm mở thì phố đông hơn.
    const count = Math.min(12, 6 + G.state.stores.length);
    for (let i = 0; i < count && this.promenade.length; i++) {
      const type = Phaser.Utils.Array.GetRandom(DATA.customers);
      const at = pickWanderTarget(this.promenade, () => Math.random())!;
      const npc = this.makeActor(type, at, Phaser.Math.Between(18, 30));
      npc.rest = Math.random() * 3;
      this.npcs.push(npc);
    }
    this.marker = this.add.graphics().setDepth(9);
    this.worldObjects.add(this.marker);
  }

  private updateActors(dt: number): void {
    const arrived = stepWalker(this.map, this.player.walker, this.player.speed, dt);
    this.animate(this.player, dt);
    if (arrived && this.pendingLot) {
      const view = this.pendingLot;
      this.pendingLot = null;
      this.select(view);
    }
    for (const npc of this.npcs) {
      if (!npc.active) continue;
      if (npc.inside > 0) {
        npc.inside -= dt;
        if (npc.inside <= 0) this.leaveShop(npc);
        continue;
      }
      if (npc.walker.path.length) {
        if (stepWalker(this.map, npc.walker, npc.speed, dt) && npc.shop) this.enterShop(npc);
      } else {
        npc.rest -= dt;
        if (npc.rest <= 0) this.chooseErrand(npc);
      }
      this.animate(npc, dt);
    }
    this.followPlayer(dt);
    this.drawMarker();
    this.drawPulses(dt);
  }

  /** Người rảnh: đi mua ở một tiệm đang mở (theo sở thích, độ đông và hàng còn) hoặc dạo tiếp. */
  private chooseErrand(npc: Actor): void {
    npc.rest = Phaser.Math.FloatBetween(1, 4);
    if (Math.random() < SHOP_CHANCE) {
      const shop = pickShop(npc.type, this.shops, this.minute, () => Math.random());
      if (shop && walkTo(this.map, this.grid, npc.walker, shop.door)) {
        npc.shop = shop;
        if (npc.walker.path.length === 0) this.enterShop(npc);
        return;
      }
    }
    const target = pickWanderTarget(this.promenade, () => Math.random());
    if (target) walkTo(this.map, this.grid, npc.walker, target);
  }

  /** Tới cửa: vào tiệm nếu còn mở cửa, không thì đi tiếp. */
  private enterShop(npc: Actor): void {
    const shop = npc.shop;
    if (!shop || !shopIsOpen(this.minute)) { npc.shop = null; npc.rest = 0.5; return; }
    npc.inside = Phaser.Math.FloatBetween(2, 5);
    npc.sprite.setVisible(false);
    this.pulseDoor(shop.id);
    this.floatIcon(npc.walker.x, npc.walker.y, '🛒');
  }

  private leaveShop(npc: Actor): void {
    const shop = npc.shop;
    npc.inside = 0;
    npc.shop = null;
    npc.rest = Phaser.Math.FloatBetween(1, 3);
    npc.sprite.setVisible(true);
    if (shop) this.pulseDoor(shop.id);
    this.floatIcon(npc.walker.x, npc.walker.y, '🛍️');
  }

  private pulseDoor(storeId: string): void {
    const view = this.views.find((v) => v.lot.storeId === storeId);
    if (view) this.pulse.set(view.lot.id, 1);
  }

  /** Biểu tượng nhỏ nổi lên từ cửa rồi mờ dần. */
  private floatIcon(x: number, y: number, icon: string): void {
    const t = emoji(this, x, y - 8, icon, 9).setDepth(40);
    this.worldObjects.add(t);
    this.uiCam.ignore(t);
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 1000, onComplete: () => { this.worldObjects.delete(t); t.destroy(); } });
  }

  /** Cửa nhấp sáng khi có người vào/ra; mờ dần theo thời gian. */
  private drawPulses(dt: number): void {
    const g = this.pulseGfx;
    g.clear();
    if (!this.pulse.size) return;
    const t = this.map.tile;
    for (const [lotId, v] of this.pulse) {
      const view = this.views.find((x) => x.lot.id === lotId);
      if (!view) { this.pulse.delete(lotId); continue; }
      const { lot } = view;
      const d = buildingDoor(lot.h, lot.door.x - lot.x);
      g.fillStyle(0xffd27a, v * 0.7).fillRect(lot.x * t + d.x, lot.y * t + d.y, d.w, d.h);
      g.fillStyle(0xffc060, v * 0.35).fillRect(lot.x * t + d.x - 6, (lot.y + lot.h) * t, d.w + 12, 8);
      const next = v - dt * 1.4;
      if (next <= 0) this.pulse.delete(lotId); else this.pulse.set(lotId, next);
    }
  }

  /** Đặt sprite theo vị trí và hướng; đổi khung bước chân khi đang đi. */
  private animate(a: Actor, dt: number): void {
    const moving = a.walker.path.length > 0;
    if (moving) {
      a.frameTimer += dt;
      if (a.frameTimer >= WALK_FRAME_SECONDS) { a.frameTimer = 0; a.frame = a.frame === 0 ? 1 : 0; }
    } else { a.frame = 0; a.frameTimer = 0; }
    const back = a.walker.facing === 'up';
    a.sprite.setTexture(customerTexture(this, a.type, a.frame, back));
    a.sprite.setFlipX(a.walker.facing === 'left');
    a.sprite.setPosition(a.walker.x, a.walker.y + 6).setDepth(20 + a.walker.y / 1000);
  }

  private followPlayer(dt: number): void {
    if (!this.follow) return;
    const view = this.viewSize();
    const goal = { x: this.player.walker.x - view.w / 2, y: this.player.walker.y - view.h / 2 };
    const k = 1 - Math.exp(-6 * dt);
    this.pan = { x: this.pan.x + (goal.x - this.pan.x) * k, y: this.pan.y + (goal.y - this.pan.y) * k };
    this.applyCamera();
  }

  private centerOnActor(a: Actor): void {
    const view = this.viewSize();
    this.pan = { x: a.walker.x - view.w / 2, y: a.walker.y - view.h / 2 };
    this.applyCamera();
  }

  private drawMarker(): void {
    this.marker.clear();
    const path = this.player.walker.path;
    if (!path.length) return;
    const c = cellCenter(this.map, path[path.length - 1]);
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 160);
    this.marker.lineStyle(1.5, 0xffffff, 0.5 + 0.4 * pulse).strokeCircle(c.x, c.y, 4 + pulse * 2);
    this.marker.fillStyle(0xffe08a, 0.8).fillCircle(c.x, c.y, 2);
  }

  /** Người chơi đi tới ô `target` (hoặc tới cửa `lot` rồi mở bảng thông tin). */
  private walkPlayerTo(target: Cell, lot: LotView | null): void {
    this.select(null);
    this.pendingLot = null;
    if (!walkTo(this.map, this.grid, this.player.walker, target)) { toast(this, 'Không đi tới được chỗ đó'); return; }
    this.follow = true;
    if (lot) {
      if (this.player.walker.path.length === 0) this.select(lot);
      else this.pendingLot = lot;
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
    const me = this.toUi(this.player.walker.x, this.player.walker.y - 14);
    this.youLabel.setPosition(me.x, me.y);
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
      this.follow = false;
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
    if (view) { this.walkPlayerTo(doorCell(view.lot), view); return; }
    const cell = { x: Math.floor(w.x / this.map.tile), y: Math.floor(w.y / this.map.tile) };
    const target = isWalkable(this.map, this.grid, cell) ? cell : nearestWalkable(this.map, this.grid, cell);
    if (target) this.walkPlayerTo(target, null);
  }

  private buildZoomButtons(): void {
    const x = W - 26;
    new Button(this, x, 86, { w: 36, h: 36, label: '+', size: 20, color: C.wood, onTap: () => this.setZoomIndex(this.zoomIndex + 1) });
    new Button(this, x, 170, { w: 36, h: 36, label: '◎', size: 16, color: C.blue, onTap: () => { this.follow = true; } });
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
    this.follow = false;
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
