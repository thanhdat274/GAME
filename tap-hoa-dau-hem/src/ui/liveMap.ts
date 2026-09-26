import Phaser from 'phaser';
import type { Customer } from '../core/customers';
import { DATA, furniture, product, type CustomerType } from '../core/data';
import type { DaySession } from '../core/day';
import { findPath, fixtureCells, walkableGrid, type Cell } from '../core/layout';
import { customerGoal, goalCells, goalKey, laneCounter, queueLine, staffGoal, type Goal } from '../core/liveMap';
import { roleDef } from '../core/staff';
import { formatClock, formatMoney } from '../core/state';
import { fixtureInfo, fixtureStockLevel, sellsGoods, storeView } from '../core/storeMap';
import { customerLook, customerSprite, productIcon, setWalkFrame, staffType } from './art';
import { cellAt, drawFixture, drawFloor, type FloorGeom } from './floorPlan';
import { Button, panel } from './widgets';
import { C, H, HEX, W, txt } from './theme';

const CELL = 40;
const GEOM: FloorGeom = { gx: (W - DATA.land.cols * CELL) / 2, gy: 64, cell: CELL };
const INFO_Y = GEOM.gy + DATA.land.rows * CELL + 6;
const PERSON_H = 30;
/** Tốc độ đi trên sơ đồ (ô/giây, theo thời gian game). */
const SPEED = { customer: 3.2, staff: 3.6, flee: 6 } as const;
const PLAYER_LOOK = { shirt: '#d84a3a', pants: '#3b2a1f', hair: '#2b1b12', skin: '#f2c9a0' };

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

/**
 * Sơ đồ trực tiếp trong giờ bán: mặt bằng từ trên xuống, khách đi từ cửa tới kệ theo đường tìm được trên lưới,
 * ra quầy xếp hàng rồi về; nhân viên đi bày hàng, nấu, đứng quầy. Phiên bán vẫn chạy phía sau.
 */
export class LiveMap {
  private root: Phaser.GameObjects.Container;
  private fixtureLayer: Phaser.GameObjects.Container;
  private people: Phaser.GameObjects.Container;
  private fx: Phaser.GameObjects.Container;
  private info: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private agents = new Map<string, Agent>();
  private grid: boolean[] = [];
  private gridKey = '';
  private lines = new Map<number, Cell[]>();
  private selected: { kind: 'fixture'; uid: number } | { kind: 'agent'; id: string } | null = null;
  private walkAcc = 0;
  private walkFrame: 0 | 1 = 0;
  private infoAcc = 0;
  private unsub: (() => void)[] = [];

  constructor(private scene: Phaser.Scene, private session: DaySession) {
    const s = scene;
    this.root = s.add.container(0, 0).setDepth(5000).setVisible(false);
    // Chặn chạm xuống màn bán hàng phía dưới.
    const blocker = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
    blocker.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.getDistance() < 10) this.onTap(p.worldX, p.worldY); });
    this.root.add(blocker);
    this.root.add(panel(s, 6, 6, W - 12, H - 12, C.wall));
    this.title = txt(s, 18, 22, '', { size: 15, bold: true });
    this.root.add(this.title);
    this.root.add(txt(s, 18, 42, 'Chạm kệ hoặc người để xem · tiệm vẫn đang bán', { size: 10, color: HEX.muted }));
    this.root.add(new Button(s, W - 52, 32, { w: 72, h: 32, label: 'Đóng', size: 13, color: C.grey, onTap: () => this.close() }));
    this.fixtureLayer = s.add.container(0, 0);
    this.people = s.add.container(0, 0);
    this.fx = s.add.container(0, 0);
    this.info = s.add.container(0, 0);
    this.root.add([this.fixtureLayer, this.people, this.fx, this.info]);

    const ev = session.events;
    this.unsub.push(
      ev.on('itemTaken', ({ customer, productId }) => this.popIcon(`c${customer.id}`, productId)),
      ev.on('itemMissing', ({ customer }) => this.popText(`c${customer.id}`, '❓')),
      ev.on('priceComplaint', ({ customer }) => this.popText(`c${customer.id}`, '💸')),
      ev.on('notCold', ({ customer }) => this.popText(`c${customer.id}`, '🥵')),
      ev.on('sale', ({ customer, amount }) => this.popText(`c${customer.id}`, `+${formatMoney(amount)}`, HEX.green)),
      ev.on('staffRefill', ({ staff }) => this.popText(`s${staff.id}`, '📦')),
      ev.on('customerLeft', ({ customer, reason }) => { if (reason === 'patience') this.popText(`c${customer.id}`, '😤'); }),
    );
    s.events.once('shutdown', () => this.destroy());
  }

  get visible(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.selected = null;
    this.root.setVisible(true);
    this.redrawFixtures();
    // Đặt ngay mọi người vào chỗ hiện tại của họ thay vì cho đi từ cửa.
    this.sync(0, true);
  }

  close(): void {
    this.root.setVisible(false);
    for (const a of this.agents.values()) this.removeAgent(a);
    this.fx.removeAll(true);
  }

  destroy(): void {
    for (const off of this.unsub) off();
    this.unsub = [];
    this.agents.clear();
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
    this.infoAcc += gameDt;
    if (this.infoAcc >= 0.25) {
      this.infoAcc = 0;
      this.renderInfo();
    }
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
      a.tag?.setText(c.status === 'fleeing' ? '🏃' : '');
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
    // Người chơi: đứng quầy của mình, hoặc đi nạp kệ / đi giao hàng.
    const playerId = 'player';
    seen.add(playerId);
    let me = this.agents.get(playerId);
    if (!me) {
      me = this.addAgent(playerId, staffType({ id: 'player', name: 'Bạn', look: PLAYER_LOOK }), SPEED.staff, null);
      me.tag = txt(this.scene, 0, 0, 'Bạn', { size: 8, bold: true, color: HEX.white, origin: [0.5, 1] }).setBackgroundColor('#d84a3acc').setPadding(2, 0, 2, 0);
      this.people.add(me.tag);
    }
    const refillShelf = this.session.playerRefillShelf();
    const refillFixture = refillShelf === null ? undefined : state.fixtures.find((f) => f.shelf === refillShelf);
    const playerGoal: Goal = this.session.playerAway > 0 ? { kind: 'away' }
      : refillFixture ? { kind: 'fixture', uid: refillFixture.uid } : { kind: 'behind', lane: 0 };
    this.setGoal(me, playerGoal, snap);

    for (const a of this.agents.values()) {
      if (!seen.has(a.id) && !a.leaving) {
        a.leaving = true;
        a.tag?.setText('');
        this.setGoal(a, { kind: 'door' }, snap);
      }
      this.step(a, dt);
      if (a.leaving && !a.path.length) this.removeAgent(a);
    }
    this.people.sort('depth');
  }

  private addAgent(id: string, type: CustomerType, speed: number, start: Cell | null): Agent {
    const sprite = customerSprite(this.scene, 0, 0, type);
    sprite.setScale(PERSON_H / sprite.height);
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
    const here = { x: Math.round(a.pos.x), y: Math.round(a.pos.y) };
    const inGrid = here.x >= 0 && here.y >= 0 && here.x < DATA.land.cols && here.y < DATA.land.rows;
    const path = inGrid ? findPath(state, [here], targets, this.grid) : null;
    a.path = path ? path.slice(1) : [targets[0]];
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
    const x = GEOM.gx + (a.pos.x + 0.5) * CELL + a.jitter.x;
    const y = GEOM.gy + (a.pos.y + 0.5) * CELL + CELL * 0.35 + a.jitter.y;
    a.sprite.setPosition(x, y).setVisible(!a.hidden).setDepth(y);
    a.tag?.setPosition(x, y - PERSON_H - 1).setVisible(!a.hidden).setDepth(y + 1);
    const sel = this.selected?.kind === 'agent' && this.selected.id === a.id;
    a.sprite.setTint(sel ? 0xfff176 : 0xffffff);
  }

  // ---------- Hiệu ứng ----------

  private popAt(id: string, obj: Phaser.GameObjects.GameObject & { x: number; y: number; setPosition: (x: number, y: number) => unknown }): void {
    const a = this.agents.get(id);
    if (!this.root.visible || !a || a.hidden) { obj.destroy(); return; }
    obj.setPosition(a.sprite.x, a.sprite.y - PERSON_H - 6);
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

  // ---------- Chạm và bảng thông tin ----------

  private redrawFixtures(): void {
    this.fixtureLayer.removeAll(true);
    const state = this.session.state;
    this.fixtureLayer.add(drawFloor(this.scene, GEOM, state.land));
    const view = storeView(state)!;
    for (const f of state.fixtures) {
      const sel = this.selected?.kind === 'fixture' && this.selected.uid === f.uid;
      const stock = sellsGoods(furniture(f.type).kind) ? fixtureStockLevel(fixtureInfo(view, f)) : null;
      this.fixtureLayer.add(drawFixture(this.scene, GEOM, f, { selected: sel, stock }));
    }
  }

  private onTap(worldX: number, worldY: number): void {
    // Người trước (hình nhỏ nên chạm gần là được), rồi mới tới nội thất.
    let best: Agent | null = null;
    let bestD = 20;
    for (const a of this.agents.values()) {
      if (a.hidden) continue;
      const d = Math.hypot(a.sprite.x - worldX, a.sprite.y - PERSON_H / 2 - worldY);
      if (d < bestD) { best = a; bestD = d; }
    }
    if (best) { this.selectAgent(best.id); return; }
    const cell = cellAt(GEOM, worldX, worldY);
    if (!cell) return;
    const f = this.session.state.fixtures.find((item) => fixtureCells(item).some((c) => c.x === cell.x && c.y === cell.y));
    this.selected = f ? { kind: 'fixture', uid: f.uid } : null;
    this.redrawFixtures();
    this.renderInfo();
  }

  private selectAgent(id: string): void {
    this.selected = { kind: 'agent', id };
    this.redrawFixtures();
    this.renderInfo();
  }

  private renderInfo(): void {
    const s = this.scene;
    const L = this.info;
    L.removeAll(true);
    const state = this.session.state;
    this.title.setText(`🗺️ Sơ đồ trực tiếp · ${formatClock(state.clock)}`);
    const shopping = this.session.shoppers.length + this.session.entrants.length;
    const queued = this.session.queue.length + this.session.ready.length + this.session.lanes.reduce((n, l) => n + l.queue.length, 0);
    L.add(txt(s, 18, INFO_Y, `🛒 ${shopping} đang chọn hàng · 🧾 ${queued} chờ tính tiền · 👥 ${this.session.presentStaff().length} nhân viên`, { size: 11, bold: true }));
    let y = INFO_Y + 20;
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
