import Phaser from 'phaser';
import type { Customer } from '../core/customers';
import { DATA, furniture, product, type CustomerType } from '../core/data';
import type { DaySession } from '../core/day';
import { findPath, fixtureCells, walkableGrid, type Cell } from '../core/layout';
import { customerGoal, goalCells, goalKey, laneCounter, queueLine, staffGoal, type Goal } from '../core/liveMap';
import { roleDef } from '../core/staff';
import { formatClock, formatMoney, type Fixture } from '../core/state';
import { canRefill, shelfCapacity, warehouseCapacity, warehouseCellsUsed } from '../core/stock';
import { fixtureInfo, fixtureStockLevel, sellsGoods, storeView } from '../core/storeMap';
import { customerLook, customerSprite, productIcon, setWalkFrame, staffType } from './art';
import { cellAt, drawFixture, drawFloor, type FloorGeom } from './floorPlan';
import { ZONE_NAMES } from './shelves';
import { play } from './sound';
import { Button, panel } from './widgets';
import { C, H, HEX, W, txt } from './theme';

/** Tốc độ đi trên sơ đồ (ô/giây, theo thời gian game). */
const SPEED = { customer: 3.2, staff: 3.6, player: 4, flee: 6 } as const;
const PLAYER_LOOK = { shirt: '#d84a3a', pants: '#3b2a1f', hair: '#2b1b12', skin: '#f2c9a0' };
/** Khoảng cách tối đa (ô) để bắt kẻ trộm khi tự đi lại. */
const CATCH_TILES = 3;

export type LiveMapMode = 'watch' | 'play';

export interface LiveMapOptions {
  /** 'watch' = lớp phủ chỉ để xem; 'play' = góc nhìn chơi, người chơi chạm ô để đi. */
  mode: LiveMapMode;
  /** Vùng màn hình dành cho sơ đồ ở chế độ chơi (từ `top` tới `bottom`). */
  top?: number;
  bottom?: number;
  depth?: number;
  /** Nút đổi góc nhìn (hiện trong cả hai chế độ nếu có). */
  onSwitchMode?: () => void;
}

interface Agent {
  id: string;
  sprite: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Text | null;
  type: CustomerType;
  /** Vị trí theo ô (số thực, 0 = mép trái/trên ô đầu). */
  pos: { x: number; y: number };
  path: Cell[];
  goal: Goal;
  goalKey: string;
  speed: number;
  /** Lệch nhỏ để nhiều người đứng cùng ô không chồng khít lên nhau. */
  jitter: { x: number; y: number };
  /** Khách đã rời phiên: đi ra cửa rồi xóa. */
  leaving: boolean;
  hidden: boolean;
  customer?: Customer;
  staffId?: string;
}

interface SlotView {
  slot: number;
  qty: Phaser.GameObjects.Text;
  plus: Button;
  bar: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
}

/**
 * Sơ đồ trực tiếp trong giờ bán: mặt bằng từ trên xuống, khách đi từ cửa tới kệ theo đường tìm được trên lưới,
 * ra quầy xếp hàng rồi về; nhân viên đi bày hàng, nấu, đứng quầy.
 * Chế độ 'play': người chơi chạm ô để đi, phải tới sát kệ mới nạp được và đứng ở quầy mới tính tiền được.
 */
export class LiveMap {
  private readonly mode: LiveMapMode;
  private readonly geom: FloorGeom;
  private readonly personH: number;
  private readonly infoY: number;
  private root: Phaser.GameObjects.Container;
  private fixtureLayer: Phaser.GameObjects.Container;
  private people: Phaser.GameObjects.Container;
  private fx: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Container;
  private sheet: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text | null = null;
  private agents = new Map<string, Agent>();
  private grid: boolean[] = [];
  private gridKey = '';
  private lines = new Map<number, Cell[]>();
  private selected: { kind: 'fixture'; uid: number } | { kind: 'agent'; id: string } | null = null;
  private walkAcc = 0;
  private walkFrame: 0 | 1 = 0;
  private infoAcc = 0;
  private unsub: (() => void)[] = [];
  // ---------- Chế độ chơi ----------
  private playerGoal: Goal = { kind: 'behind', lane: 0 };
  /** Đang đi về quầy: tới nơi thì vào đứng sau quầy. */
  private toCounter = false;
  private wasAway = false;
  private sheetFor: number | null = null;
  /** Kệ người chơi vừa tự đóng bảng nạp (không mở lại cho tới khi đi chỗ khác). */
  private sheetDismissed: number | null = null;
  private slotViews: SlotView[] = [];
  private note = '';
  private noteLeft = 0;

  constructor(private scene: Phaser.Scene, private session: DaySession, opts: LiveMapOptions) {
    const s = scene;
    this.mode = opts.mode;
    const top = opts.top ?? 50;
    const bottom = opts.bottom ?? H;
    if (this.mode === 'watch') {
      const cell = 40;
      this.geom = { gx: (W - DATA.land.cols * cell) / 2, gy: 64, cell };
      this.personH = 30;
    } else {
      // Chừa cột phải cho các nút nổi của màn bán (nhiệm vụ, điện thoại) và dải trạng thái phía dưới.
      const cell = Math.floor(Math.min((W - 52) / DATA.land.cols, (bottom - top - 44) / DATA.land.rows));
      this.geom = { gx: 6, gy: top + 4, cell };
      this.personH = Math.round(cell * 0.75);
    }
    this.infoY = this.geom.gy + DATA.land.rows * this.geom.cell + 6;
    this.root = s.add.container(0, 0).setDepth(opts.depth ?? 5000).setVisible(false);
    if (this.mode === 'watch') {
      // Chặn chạm xuống màn bán hàng phía dưới.
      const blocker = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
      blocker.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.getDistance() < 10) this.onTap(p.worldX, p.worldY); });
      this.root.add(blocker);
      this.root.add(panel(s, 6, 6, W - 12, H - 12, C.wall));
      this.title = txt(s, 18, 22, '', { size: 15, bold: true });
      this.root.add(this.title);
      this.root.add(txt(s, 18, 42, 'Chạm kệ hoặc người để xem · tiệm vẫn đang bán', { size: 10, color: HEX.muted }));
      this.root.add(new Button(s, W - 52, 32, { w: 72, h: 32, label: 'Đóng', size: 13, color: C.grey, onTap: () => this.close() }));
      if (opts.onSwitchMode) {
        this.root.add(new Button(s, W / 2, H - 40, { w: 240, h: 40, label: '🎮 Chơi ở góc nhìn này', size: 14, color: C.green, onTap: () => opts.onSwitchMode?.() }));
      }
    } else {
      const bg = s.add.rectangle(W / 2, (top + bottom) / 2, W, bottom - top, C.bg, 1).setInteractive();
      bg.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.getDistance() < 12) this.onTap(p.worldX, p.worldY); });
      this.root.add(bg);
      if (opts.onSwitchMode) {
        this.root.add(new Button(s, W - 42, bottom - 20, { w: 76, h: 28, label: '👀 Nhìn ngang', size: 10, color: C.wood, onTap: () => opts.onSwitchMode?.() }));
      }
    }
    this.fixtureLayer = s.add.container(0, 0);
    this.people = s.add.container(0, 0);
    this.fx = s.add.container(0, 0);
    this.info = s.add.container(0, 0);
    this.sheet = s.add.container(0, 0);
    this.root.add([this.fixtureLayer, this.people, this.fx, this.info, this.sheet]);

    const ev = session.events;
    this.unsub.push(
      ev.on('itemTaken', ({ customer, productId }) => this.popIcon(`c${customer.id}`, productId)),
      ev.on('itemMissing', ({ customer }) => this.popText(`c${customer.id}`, '❓')),
      ev.on('priceComplaint', ({ customer }) => this.popText(`c${customer.id}`, '💸')),
      ev.on('notCold', ({ customer }) => this.popText(`c${customer.id}`, '🥵')),
      ev.on('sale', ({ customer, amount }) => this.popText(`c${customer.id}`, `+${formatMoney(amount)}`, HEX.green)),
      ev.on('staffRefill', ({ staff }) => this.popText(`s${staff.id}`, '📦')),
      ev.on('refillDone', () => this.popText('player', '📦')),
      ev.on('customerLeft', ({ customer, reason }) => { if (reason === 'patience') this.popText(`c${customer.id}`, '😤'); }),
    );
    s.events.once('shutdown', () => this.destroy());
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Người chơi đang đứng sau quầy (chế độ chơi). */
  get playerAtCounter(): boolean {
    return this.playerGoal.kind === 'behind';
  }

  open(): void {
    this.selected = null;
    this.root.setVisible(true);
    this.redrawFixtures();
    // Đặt ngay mọi người vào chỗ hiện tại của họ thay vì cho đi từ cửa.
    this.sync(0, true);
    this.renderInfo();
  }

  close(): void {
    this.root.setVisible(false);
    for (const a of [...this.agents.values()]) this.removeAgent(a);
    this.fx.removeAll(true);
    this.closeSheet();
  }

  destroy(): void {
    for (const off of this.unsub) off();
    this.unsub = [];
    this.agents.clear();
    if (this.root.active) this.root.destroy();
  }

  /** Gọi mỗi khung hình từ ShopScene. `gameDt` = giây mô phỏng đã chạy (đã nhân tốc độ quản lý). */
  update(gameDt: number): void {
    if (!this.root.visible) return;
    this.sync(gameDt, false);
    this.walkAcc += gameDt;
    if (this.walkAcc >= 0.15) {
      this.walkAcc = 0;
      this.walkFrame = this.walkFrame ? 0 : 1;
      for (const a of this.agents.values()) if (a.path.length) setWalkFrame(a.sprite, a.type, this.walkFrame);
    }
    if (this.noteLeft > 0) this.noteLeft -= gameDt;
    this.infoAcc += gameDt;
    if (this.infoAcc >= 0.25) {
      this.infoAcc = 0;
      this.renderInfo();
      this.refreshSheet();
    }
  }

  /** Đi về quầy (chạm quầy trên sơ đồ, hoặc nút "Về quầy" ở bảng tính tiền). */
  walkToCounter(): void {
    if (this.playerGoal.kind === 'behind') return;
    const counter = laneCounter(this.session.state, 0)?.counter;
    if (!counter) return;
    this.toCounter = true;
    this.playerGoal = { kind: 'fixture', uid: counter.uid };
    this.closeSheet();
  }

  // ---------- Đồng bộ với phiên bán ----------

  private ensureGrid(): void {
    const state = this.session.state;
    const k = JSON.stringify(state.fixtures) + state.land.join();
    if (k === this.gridKey) return;
    this.gridKey = k;
    this.grid = walkableGrid(state);
    this.lines.clear();
  }

  private line(lane: number): Cell[] {
    let l = this.lines.get(lane);
    if (!l) { l = queueLine(this.session.state, lane, this.grid); this.lines.set(lane, l); }
    return l;
  }

  private sync(dt: number, snap: boolean): void {
    this.ensureGrid();
    const state = this.session.state;
    const seen = new Set<string>();
    for (const c of this.session.customers) {
      const id = `c${c.id}`;
      seen.add(id);
      let a = this.agents.get(id);
      if (!a) a = this.addAgent(id, customerLook(c), SPEED.customer, snap ? null : DATA.land.door);
      a.customer = c;
      a.speed = c.status === 'fleeing' ? SPEED.flee : SPEED.customer;
      if (c.status === 'fleeing' && !a.tag) {
        a.tag = txt(this.scene, 0, 0, this.mode === 'play' ? '🚨' : '🏃', { size: 12, emoji: true, origin: [0.5, 1] });
        this.people.add(a.tag);
      }
      this.setGoal(a, customerGoal(this.session, c), snap);
    }
    for (const st of this.session.presentStaff()) {
      const id = `s${st.id}`;
      seen.add(id);
      let a = this.agents.get(id);
      if (!a) {
        a = this.addAgent(id, staffType(st), SPEED.staff, snap ? null : DATA.land.door);
        a.tag = txt(this.scene, 0, 0, roleDef(st.role).icon, { size: 10, emoji: true, origin: [0.5, 1] });
        this.people.add(a.tag);
      }
      a.staffId = st.id;
      const lane = this.session.lanes.findIndex((l) => l.staffId === st.id);
      this.setGoal(a, staffGoal(state, this.session.workerOf(st.id)?.task ?? null, lane >= 0 ? lane + 1 : null), snap);
    }
    // Người chơi.
    const playerId = 'player';
    seen.add(playerId);
    let me = this.agents.get(playerId);
    if (!me) {
      me = this.addAgent(playerId, staffType({ id: 'player', name: 'Bạn', look: PLAYER_LOOK }), this.mode === 'play' ? SPEED.player : SPEED.staff, null);
      me.tag = txt(this.scene, 0, 0, 'Bạn', { size: 8, bold: true, color: HEX.white, origin: [0.5, 1] }).setBackgroundColor('#d84a3acc').setPadding(2, 0, 2, 0);
      this.people.add(me.tag);
    }
    const away = this.session.playerAway > 0;
    if (this.mode === 'play') {
      // Đi giao hàng xong thì tự về quầy.
      if (this.wasAway && !away) this.walkToCounter();
      this.wasAway = away;
      this.setGoal(me, away ? { kind: 'away' } : this.playerGoal, snap);
    } else {
      const refillShelf = this.session.playerRefillShelf();
      const refillFixture = refillShelf === null ? undefined : state.fixtures.find((f) => f.shelf === refillShelf);
      const goal: Goal = away ? { kind: 'away' }
        : refillFixture ? { kind: 'fixture', uid: refillFixture.uid } : { kind: 'behind', lane: 0 };
      this.setGoal(me, goal, snap);
    }

    for (const a of [...this.agents.values()]) {
      if (!seen.has(a.id) && !a.leaving) {
        a.leaving = true;
        a.tag?.setText('');
        this.setGoal(a, { kind: 'door' }, snap);
      }
      this.step(a, dt);
      if (a.leaving && !a.path.length) this.removeAgent(a);
    }
    this.people.sort('depth');
    if (this.mode === 'play') this.playerArrived(me);
  }

  /** Người chơi tới nơi: vào quầy, hoặc mở bảng nạp kệ. */
  private playerArrived(me: Agent): void {
    if (me.path.length || this.session.playerAway > 0) return;
    const goal = this.playerGoal;
    if (goal.kind !== 'fixture') return;
    const f = this.session.state.fixtures.find((item) => item.uid === goal.uid);
    if (!f) { this.playerGoal = { kind: 'stay' }; return; }
    if (this.toCounter && furniture(f.type).kind === 'counter') {
      this.toCounter = false;
      this.playerGoal = { kind: 'behind', lane: 0 };
      this.setGoal(me, this.playerGoal, false);
      return;
    }
    if (f.shelf !== undefined && this.sheetFor !== f.uid && this.sheetDismissed !== f.uid) this.openSheet(f);
  }

  private addAgent(id: string, type: CustomerType, speed: number, start: Cell | null): Agent {
    const sprite = customerSprite(this.scene, 0, 0, type);
    sprite.setScale(this.personH / sprite.height);
    this.people.add(sprite);
    const door = DATA.land.door;
    const hash = [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const a: Agent = {
      id, sprite, tag: null, type, speed,
      pos: start ? { x: start.x, y: start.y + 0.6 } : { x: door.x, y: door.y },
      path: [], goal: { kind: 'stay' }, goalKey: '', jitter: { x: ((hash % 7) - 3) * 2.2, y: (((hash >> 3) % 5) - 2) * 1.6 },
      leaving: false, hidden: false,
    };
    // Người mới xuất hiện khi mở sơ đồ: chưa có chỗ đứng, sẽ được đặt thẳng vào đích ở setGoal.
    if (!start) a.goalKey = '__new';
    this.agents.set(id, a);
    return a;
  }

  private removeAgent(a: Agent): void {
    a.sprite.destroy();
    a.tag?.destroy();
    this.agents.delete(a.id);
    if (this.selected?.kind === 'agent' && this.selected.id === a.id) this.selected = null;
  }

  /** Ô xuất phát để tìm đường: ô đang đứng, hoặc các ô đi được quanh đó (khi đang đứng sau quầy / lệch khỏi lưới). */
  private startCells(pos: { x: number; y: number }): Cell[] {
    const { cols, rows } = DATA.land;
    const here = { x: Math.round(pos.x), y: Math.round(pos.y) };
    const ok = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < cols && c.y < rows && this.grid[c.y * cols + c.x];
    if (ok(here)) return [here];
    const out: Cell[] = [];
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      const c = { x: here.x + dx, y: here.y + dy };
      if (ok(c)) out.push(c);
    }
    return out;
  }

  private setGoal(a: Agent, goal: Goal, snap: boolean): void {
    const k = goalKey(goal);
    if (k === a.goalKey) return;
    const fresh = a.goalKey === '__new';
    a.goal = goal;
    a.goalKey = k;
    a.hidden = false;
    if (goal.kind === 'stay') { a.path = []; return; }
    if (goal.kind === 'behind') {
      a.path = [];
      const spot = this.behindSpot(goal.lane);
      if (spot) a.pos = spot;
      return;
    }
    const state = this.session.state;
    const targets = goalCells(state, goal, this.grid, (lane) => this.line(lane));
    if (!targets?.length) { a.path = []; return; }
    if (snap || fresh) {
      a.pos = { ...targets[0] };
      a.path = [];
      if (goal.kind === 'away') a.hidden = true;
      return;
    }
    const from = this.startCells(a.pos);
    const path = from.length ? findPath(state, from, targets, this.grid) : null;
    a.path = path ?? [targets[0]];
  }

  /** Chỗ đứng sau quầy của một vị trí quầy (trên hình quầy, lệch theo vị trí thứ mấy). */
  private behindSpot(lane: number): { x: number; y: number } | null {
    const lc = laneCounter(this.session.state, lane);
    if (!lc) return null;
    const cells = fixtureCells(lc.counter);
    const cell = cells[Math.min(lc.variant, cells.length - 1)];
    return { x: cell.x, y: cell.y - 0.3 };
  }

  private step(a: Agent, dt: number): void {
    let move = a.speed * dt;
    while (move > 0 && a.path.length) {
      const next = a.path[0];
      const dx = next.x - a.pos.x;
      const dy = next.y - a.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= move) {
        a.pos = { x: next.x, y: next.y };
        a.path.shift();
        move -= d;
      } else {
        a.pos = { x: a.pos.x + (dx / d) * move, y: a.pos.y + (dy / d) * move };
        if (Math.abs(dx) > 0.01) a.sprite.setFlipX(dx < 0);
        move = 0;
      }
    }
    if (!a.path.length) {
      setWalkFrame(a.sprite, a.type, 0);
      if (a.goal.kind === 'away') a.hidden = true;
    }
    const { gx, gy, cell } = this.geom;
    const x = gx + (a.pos.x + 0.5) * cell + a.jitter.x;
    const y = gy + (a.pos.y + 0.5) * cell + cell * 0.35 + a.jitter.y;
    a.sprite.setPosition(x, y).setVisible(!a.hidden).setDepth(y);
    a.tag?.setPosition(x, y - this.personH - 1).setVisible(!a.hidden).setDepth(y + 1);
    const sel = this.selected?.kind === 'agent' && this.selected.id === a.id;
    a.sprite.setTint(sel ? 0xfff176 : 0xffffff);
  }

  // ---------- Hiệu ứng ----------

  private popAt(id: string, obj: Phaser.GameObjects.GameObject & { x: number; y: number; setPosition: (x: number, y: number) => unknown }): void {
    const a = this.agents.get(id);
    if (!this.root.visible || !a || a.hidden) { obj.destroy(); return; }
    obj.setPosition(a.sprite.x, a.sprite.y - this.personH - 6);
    this.fx.add(obj);
    this.scene.tweens.add({ targets: obj, y: obj.y - 16, alpha: 0, delay: 350, duration: 650, onComplete: () => obj.destroy() });
  }

  private popIcon(id: string, productId: string): void {
    if (!this.root.visible) return;
    this.popAt(id, productIcon(this.scene, 0, 0, product(productId), 18));
  }

  private popText(id: string, text: string, color: string = HEX.ink): void {
    if (!this.root.visible) return;
    this.popAt(id, txt(this.scene, 0, 0, text, { size: 11, bold: true, color, origin: [0.5, 1], emoji: /\p{Extended_Pictographic}/u.test(text) }));
  }

  private say(text: string): void {
    this.note = text;
    this.noteLeft = 2.5;
    this.renderInfo();
  }

  // ---------- Chạm ----------

  private redrawFixtures(): void {
    this.fixtureLayer.removeAll(true);
    const state = this.session.state;
    this.fixtureLayer.add(drawFloor(this.scene, this.geom, state.land));
    const view = storeView(state)!;
    for (const f of state.fixtures) {
      const sel = this.selected?.kind === 'fixture' && this.selected.uid === f.uid;
      const stock = sellsGoods(furniture(f.type).kind) ? fixtureStockLevel(fixtureInfo(view, f)) : null;
      this.fixtureLayer.add(drawFixture(this.scene, this.geom, f, { selected: sel, stock }));
    }
  }

  private agentNear(worldX: number, worldY: number): Agent | null {
    let best: Agent | null = null;
    let bestD = 20;
    for (const a of this.agents.values()) {
      if (a.hidden) continue;
      const d = Math.hypot(a.sprite.x - worldX, a.sprite.y - this.personH / 2 - worldY);
      if (d < bestD) { best = a; bestD = d; }
    }
    return best;
  }

  private fixtureAtCell(cell: Cell): Fixture | undefined {
    return this.session.state.fixtures.find((item) => fixtureCells(item).some((c) => c.x === cell.x && c.y === cell.y));
  }

  private onTap(worldX: number, worldY: number): void {
    if (this.mode === 'play') { this.onTapPlay(worldX, worldY); return; }
    // Người trước (hình nhỏ nên chạm gần là được), rồi mới tới nội thất.
    const best = this.agentNear(worldX, worldY);
    if (best) { this.selectAgent(best.id); return; }
    const cell = cellAt(this.geom, worldX, worldY);
    if (!cell) return;
    const f = this.fixtureAtCell(cell);
    this.selected = f ? { kind: 'fixture', uid: f.uid } : null;
    this.redrawFixtures();
    this.renderInfo();
  }

  private onTapPlay(worldX: number, worldY: number): void {
    if (this.session.paused) return;
    const who = this.agentNear(worldX, worldY);
    if (who?.customer?.status === 'fleeing') { this.tryCatch(who); return; }
    const cell = cellAt(this.geom, worldX, worldY);
    if (!cell) return;
    if (this.session.playerAway > 0) { this.say('🛵 Bạn đang đi giao hàng'); return; }
    const f = this.fixtureAtCell(cell);
    this.sheetDismissed = null;
    if (f) {
      const def = furniture(f.type);
      if (def.kind === 'counter') { this.walkToCounter(); this.marker(cell); return; }
      if (!goalCells(this.session.state, { kind: 'fixture', uid: f.uid }, this.grid, (l) => this.line(l))) { this.say('Không có lối tới đó'); return; }
      this.toCounter = false;
      this.closeSheet();
      this.playerGoal = { kind: 'fixture', uid: f.uid };
      if (def.kind === 'storage') this.say(`📦 Kho: ${warehouseCellsUsed(this.session.state.warehouse)}/${warehouseCapacity(this.session.state)} ô`);
      this.marker(cell);
      return;
    }
    if (!this.grid[cell.y * DATA.land.cols + cell.x]) { this.say('Không đi vào đó được'); return; }
    this.toCounter = false;
    this.closeSheet();
    this.playerGoal = { kind: 'cell', x: cell.x, y: cell.y };
    this.marker(cell);
  }

  private tryCatch(thief: Agent): void {
    const me = this.agents.get('player');
    const d = me ? Math.hypot(me.pos.x - thief.pos.x, me.pos.y - thief.pos.y) : Infinity;
    if (d > CATCH_TILES) {
      this.say('🚨 Xa quá! Chạy lại gần để bắt');
      this.toCounter = false;
      this.closeSheet();
      this.playerGoal = { kind: 'cell', x: DATA.land.door.x, y: DATA.land.door.y };
      return;
    }
    if (thief.customer && this.session.catchThief(thief.customer.id)) this.say('👮 Bắt được kẻ trộm!');
  }

  /** Vòng tròn nhỏ ở ô vừa chạm. */
  private marker(cell: Cell): void {
    const { gx, gy, cell: size } = this.geom;
    const m = this.scene.add.circle(gx + (cell.x + 0.5) * size, gy + (cell.y + 0.5) * size, size * 0.3, 0xffffff, 0).setStrokeStyle(2, C.yellow);
    this.fx.add(m);
    this.scene.tweens.add({ targets: m, scale: 1.6, alpha: 0, duration: 450, onComplete: () => m.destroy() });
  }

  private selectAgent(id: string): void {
    this.selected = { kind: 'agent', id };
    this.redrawFixtures();
    this.renderInfo();
  }

  // ---------- Bảng nạp kệ (chế độ chơi) ----------

  private openSheet(f: Fixture): void {
    this.closeSheet();
    const r = f.shelf!;
    const s = this.scene;
    const state = this.session.state;
    const slots = state.shelves[r] ?? [];
    const perRow = Math.min(6, Math.max(1, slots.length));
    const sw = 46;
    const sh = 54;
    const rows = Math.ceil(slots.length / perRow);
    const h = 30 + rows * (sh + 6) + 4;
    const w = perRow * (sw + 4) + 12;
    const { gx, gy, cell } = this.geom;
    const x0 = Math.max(4, Math.min(W - 4 - w, gx + (f.x + 0.5) * cell - w / 2));
    const mapBottom = gy + DATA.land.rows * cell;
    const fy = gy + f.y * cell;
    // Mở phía trên kệ nếu còn chỗ, không thì phía dưới.
    const y0 = fy - h - 4 >= gy ? fy - h - 4 : Math.min(mapBottom - h, fy + cell * 2);
    this.sheet.add(s.add.rectangle(x0 + w / 2, y0 + h / 2, w, h, 0xffffff, 0.001).setInteractive());
    this.sheet.add(panel(s, x0, y0, w, h));
    const zone = state.zones[r];
    const def = furniture(f.type);
    this.sheet.add(txt(s, x0 + 10, y0 + 8, `${def.kind === 'shelf' ? 'Kệ' : def.name} ${r + 1}${zone ? ` · ${ZONE_NAMES[zone]}` : ''}`, { size: 11, bold: true }));
    this.sheet.add(new Button(s, x0 + w - 16, y0 + 14, { w: 22, h: 20, label: '×', size: 12, color: C.grey, onTap: () => { this.sheetDismissed = f.uid; this.closeSheet(); } }));
    slots.forEach((slot, i) => {
      const x = x0 + 6 + (i % perRow) * (sw + 4);
      const y = y0 + 28 + Math.floor(i / perRow) * (sh + 6);
      const g = s.add.graphics();
      g.fillStyle(C.slot, 1).fillRoundedRect(x, y, sw, sh, 6).lineStyle(1.5, C.slotEdge, 1).strokeRoundedRect(x, y, sw, sh, 6);
      this.sheet.add(g);
      if (slot.productId) this.sheet.add(productIcon(s, x + sw / 2, y + 20, product(slot.productId), 26));
      else this.sheet.add(txt(s, x + sw / 2, y + 20, 'trống', { size: 9, color: HEX.muted, origin: [0.5, 0.5] }));
      const qty = txt(s, x + sw / 2, y + sh - 8, '', { size: 9, bold: true, origin: [0.5, 0.5] });
      const bar = s.add.graphics();
      const plus = new Button(s, x + sw - 8, y + 8, { w: 20, h: 20, label: '+', size: 13, color: C.green, radius: 10, onTap: () => {
        if (this.session.startRefill(r, i)) { play('step'); this.refreshSheet(); } else this.say('Ô này chưa nạp được');
      } });
      this.sheet.add([qty, bar, plus]);
      this.slotViews.push({ slot: i, qty, plus, bar, x, y });
    });
    this.sheetFor = f.uid;
    this.refreshSheet();
  }

  private refreshSheet(): void {
    if (this.sheetFor === null || !this.slotViews.length) return;
    const f = this.session.state.fixtures.find((item) => item.uid === this.sheetFor);
    if (!f || f.shelf === undefined) { this.closeSheet(); return; }
    const r = f.shelf;
    const state = this.session.state;
    const cap = shelfCapacity(state, r);
    for (const v of this.slotViews) {
      const slot = state.shelves[r]?.[v.slot];
      if (!slot) continue;
      const prog = this.session.isRefilling(r, v.slot);
      v.qty.setText(slot.productId ? `${slot.qty}/${cap}` : '').setColor(slot.productId && slot.qty === 0 ? HEX.red : HEX.ink);
      v.plus.setVisible(prog === null && canRefill(state, r, v.slot));
      v.bar.clear();
      if (prog !== null) {
        v.bar.fillStyle(0x000000, 0.3).fillRoundedRect(v.x + 4, v.y + 36, 38, 5, 2);
        v.bar.fillStyle(C.green, 1).fillRoundedRect(v.x + 4, v.y + 36, 38 * prog, 5, 2);
      }
    }
  }

  private closeSheet(): void {
    this.sheet.removeAll(true);
    this.slotViews = [];
    this.sheetFor = null;
  }

  // ---------- Bảng thông tin ----------

  private renderInfo(): void {
    const s = this.scene;
    const L = this.info;
    L.removeAll(true);
    const state = this.session.state;
    this.title?.setText(`🗺️ Sơ đồ trực tiếp · ${formatClock(state.clock)}`);
    const shopping = this.session.shoppers.length + this.session.entrants.length;
    const queued = this.session.queue.length + this.session.ready.length + this.session.lanes.reduce((n, l) => n + l.queue.length, 0);
    const counts = `🛒 ${shopping} đang chọn · 🧾 ${queued} chờ tính tiền · 👥 ${this.session.presentStaff().length} NV`;
    if (this.mode === 'play') {
      L.add(txt(s, 8, this.infoY, this.noteLeft > 0 ? this.note : this.playerStatus(), { size: 11, bold: true, color: HEX.cream, wrap: W - 96 }));
      L.add(txt(s, 8, this.infoY + 18, counts, { size: 10, color: HEX.cream }));
      return;
    }
    L.add(txt(s, 18, this.infoY, counts, { size: 11, bold: true }));
    let y = this.infoY + 20;
    const sel = this.selected;
    if (!sel) {
      L.add(txt(s, 18, y, 'Chạm một kệ để xem còn hàng gì, hoặc chạm một người\nđể xem họ đang làm gì.', { size: 11, color: HEX.muted }));
      return;
    }
    if (sel.kind === 'agent') {
      const a = this.agents.get(sel.id);
      if (!a) { this.selected = null; return; }
      L.add(txt(s, 18, y, this.describeAgent(a), { size: 11, wrap: W - 40 }));
      return;
    }
    const f = state.fixtures.find((item) => item.uid === sel.uid);
    if (!f) { this.selected = null; return; }
    const infoF = fixtureInfo(storeView(state)!, f);
    const name = infoF.shelf !== undefined ? `${infoF.kind === 'shelf' ? 'Kệ' : infoF.name} ${infoF.shelf + 1}` : infoF.name;
    const here = [...this.agents.values()].filter((a) => a.goal.kind === 'fixture' && a.goal.uid === f.uid && !a.path.length).length;
    L.add(txt(s, 18, y, `${infoF.icon} ${name}${here ? ` · ${here} người đang đứng` : ''}`, { size: 12, bold: true }));
    y += 20;
    if (!infoF.lines.length) {
      L.add(txt(s, 18, y, infoF.note ?? 'Chưa bày món nào', { size: 11, color: HEX.muted, wrap: W - 40 }));
      return;
    }
    const cols = 2;
    infoF.lines.slice(0, 6).forEach((line, i) => {
      const x = 18 + (i % cols) * ((W - 36) / cols);
      const ly = y + Math.floor(i / cols) * 24;
      L.add(productIcon(s, x + 9, ly + 9, product(line.productId), 18));
      L.add(txt(s, x + 22, ly + 2, `${line.name} x${line.qty} · ${formatMoney(line.price)}`, { size: 10, color: line.qty ? HEX.ink : HEX.red, wrap: (W - 36) / cols - 26 }));
    });
    if (infoF.lines.length > 6) L.add(txt(s, W - 18, y + 72, `+${infoF.lines.length - 6} món`, { size: 10, color: HEX.muted, origin: [1, 0] }));
  }

  private playerStatus(): string {
    if (this.session.playerAway > 0) return '🛵 Bạn đang đi giao hàng';
    const me = this.agents.get('player');
    const g = this.playerGoal;
    if (g.kind === 'behind') return '🧾 Đang đứng quầy · chạm kệ để đi nạp hàng';
    const walking = !!me?.path.length;
    if (g.kind === 'fixture') {
      if (this.toCounter) return '🚶 Đang về quầy…';
      const f = this.session.state.fixtures.find((item) => item.uid === g.uid);
      const def = f ? furniture(f.type) : null;
      const name = f?.shelf !== undefined ? `${def?.kind === 'shelf' ? 'Kệ' : def?.name} ${f.shelf + 1}` : def?.name ?? '';
      return walking ? `🚶 Đang tới ${name}…` : f?.shelf !== undefined ? `📦 Ở ${name} · bấm + để nạp ô` : `🧍 Đang ở ${name}`;
    }
    return walking ? '🚶 Đang đi…' : '🧍 Chạm quầy để về tính tiền';
  }

  private describeAgent(a: Agent): string {
    if (a.id === 'player') {
      if (a.goal.kind === 'behind') return '🧑 Bạn: đang đứng quầy tính tiền.';
      if (a.goal.kind === 'away') return '🛵 Bạn: đang đi giao hàng.';
      return '🧑 Bạn: đang nạp hàng lên kệ.';
    }
    if (a.staffId) {
      const st = this.session.staffOf(a.staffId);
      const task = this.session.workerOf(a.staffId)?.task ?? null;
      const doing = a.goal.kind === 'behind' ? 'đứng quầy tính tiền'
        : task?.startsWith('cook:') ? 'đang chế biến món'
          : task === 'receive' ? 'đang cất hàng vào kho'
            : task?.startsWith('deliver:') ? 'đang đi giao hàng'
              : task ? 'đang bày hàng lên kệ' : 'đang rảnh';
      return st ? `${roleDef(st.role).icon} ${st.name} (${roleDef(st.role).name}): ${doing}.` : 'Nhân viên';
    }
    const c = a.customer;
    if (!c) return 'Khách';
    if (a.leaving) return `${c.name ?? c.type.name}: đang về.`;
    const who = c.name ? `${c.name} (${c.type.name})` : c.type.name;
    const list = c.order.map((l) => `${product(l.productId).name} ${l.counterLine ? '(ở quầy)' : `${l.picked}/${l.qty}`}`).join(', ');
    const status = c.status === 'browsing' ? 'đang chọn hàng' : c.status === 'entering' ? 'đang chờ vào' : c.status === 'fleeing' ? 'đang bỏ chạy!' : 'đang chờ tính tiền';
    return `🧍 ${who}: ${status}.\nGiỏ: ${list || 'chưa có gì'}`;
  }
}
