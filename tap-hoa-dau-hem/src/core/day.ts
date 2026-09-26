import { computeTip, customerPayment, judgeChange, type ChangeResult } from './change';
import { createCustomer, meanSpawnSeconds, orderTotal, ratingFor, type Customer, type OrderLine } from './customers';
import { recordDay } from './analytics';
import { applyPlanogram, planogramProduct, runRestockRules } from './autorestock';
import { DATA, hasFeature, product, type Category } from './data';
import { attractionMultiplier, hasCat } from './decor';
import { createPhoneOrder, deliveryUnlocked, orderShortfall, orderUnits, reserveItems, tripSeconds, type PhoneOrder } from './delivery';
import { Emitter } from './events';
import { EffectStack } from './effects';
import { eventDefinition, scheduleEvents } from './eventScheduler';
import { calendarDate } from './calendar';
import { deliverBranchShipments, simulateBranches } from './branches';
import { prestigeRevenueMultiplier } from './prestige';
import { prepareRecipe } from './recipes';
import { cleanDiningTable, seatDiner, serveExtraDiningOrder, tickDining } from './dining';
import { counterFixture, counterFixtures, maxQueueFor, maxShoppersFor, walkTiles, walkableGrid } from './layout';
import { canGiveCredit, collectDebt, markBadDebts, recordDebt, repaymentsToday } from './ledger';
import { cheapSpawnMultiplier, keepChance } from './pricing';
import { applyLevelUps, averageRating, isAtCap, ratingSpawnMultiplier, recordRating, trafficMultiplier } from './progression';
import { checkAchievements, claimAllDone, ensureDailyQuests } from './quests';
import { ensureWeeklyQuests, updateWeeklyQuestProgress } from './weeklyQuests';
import { refreshPartyOrder } from './partyOrders';
import { Rng, daySeed } from './rng';
import { ensureScheduleReady, shiftAt, worksShift } from './schedule';
import {
  addStaffExp, errorChance, friendlyStarChance, friendlyTipMul, payroll, tiredAfterMinutes, timeFactor, updateMoods,
} from './staff';
import {
  emptyStats, fixtureOfShelf, formatMoney, shelfKind, unlockedProducts, usableShelves, warehouseQty, warehouseTotals,
  type DaySummary, type GameState, type JournalEntry, type Staff, type StaffDayPerf,
  type DiningTableState,
} from './state';
import {
  assignSlot, canRefill, electricityCost, expireLots, putIntoSlot, receiveDeliveries, refillSlot, shelfCapacity, slotUnitPrice, stowHolding,
  takeOneFromSlot, zoneOf, type DeliveryResult,
  spoilFrozenStock,
} from './stock';
import { PLAYER, ROLE_TASKS, TaskQueue, type Task } from './tasks';

export type LeaveReason = 'served' | 'patience' | 'nothing' | 'thief';

/** Quầy do nhân viên thu ngân đứng (quầy của người chơi là `DaySession.queue`). */
export interface Lane {
  id: number;
  staffId: string;
  queue: Customer[];
  job: { customerId: number; phase: 'scan' | 'change'; left: number } | null;
  /** Nhân viên sắp hết ca: phục vụ xong khách đang làm rồi bàn giao. */
  closing: boolean;
}

/** Trạng thái trong ngày của một nhân viên. */
export interface Worker {
  id: string;
  present: boolean;
  /** Phút đã làm hôm nay (để tính mệt). */
  minutes: number;
  tired: boolean;
  task: string | null;
  left: number;
  idle: number;
}

export type IncidentKind = 'thief' | 'complaint' | 'outOfStock' | 'noCashier';

/** Sự cố chạm được (hiện dạng thông báo trong chế độ quản lý). */
export interface Incident {
  id: number;
  kind: IncidentKind;
  text: string;
  customerId?: number;
  amount?: number;
  productId?: string;
  resolved: boolean;
}
export type CounterResult = 'ok' | 'wrong' | 'empty' | 'none';

export interface DayEvents {
  customerArrived: Customer;
  customerBrowse: { customer: Customer; zone: Category; shelf: number | null; tiles: number };
  customerFront: Customer;
  customerLeft: { customer: Customer; reason: LeaveReason; stars: number };
  itemTaken: { customer: Customer; productId: string; shelf: number; slot: number };
  itemMissing: { customer: Customer; productId: string };
  basketReady: Customer;
  itemScanned: { customer: Customer; productId: string; scanned: number; remaining: number };
  counterRequested: { customer: Customer; productId: string; seconds: number };
  counterServed: { customer: Customer; productId: string; slot: number };
  counterWrong: { customer: Customer; slot: number };
  counterExpired: { customer: Customer; productId: string };
  paymentStarted: Customer;
  trayChanged: number[];
  changeResult: { customer: Customer; result: ChangeResult; given: number; tip: number; lost: number; auto: boolean };
  sale: { customer: Customer; amount: number; tip: number };
  refillStarted: { shelf: number; slot: number };
  refillDone: { shelf: number; slot: number; qty: number };
  zoneRefillDone: { zone: Exclude<Category, 'counter'>; count: number };
  priceComplaint: { customer: Customer; productId: string };
  notCold: { customer: Customer; productId: string };
  bargainRequested: { customer: Customer; pct: number };
  bargainResolved: { customer: Customer; accepted: boolean; left: boolean };
  creditRequested: { customer: Customer; amount: number; allowed: boolean };
  creditResolved: { customer: Customer; granted: boolean; amount: number };
  debtRepaid: { debtId: number; name: string; amount: number };
  delivery: DeliveryResult;
  catPetted: Customer;
  staffArrived: Staff;
  diningChanged: DiningTableState[];
  staffLeft: Staff;
  staffTired: Staff;
  staffServed: { staff: Staff; customer: Customer; lane: number };
  staffMistake: { staff: Staff; kind: 'over' | 'short'; amount: number };
  staffRefill: { staff: Staff; shelf: number; slot: number; qty: number };
  staffLevelUp: Staff;
  lanesChanged: void;
  thiefFleeing: Customer;
  thiefCaught: { customer: Customer; by: 'player' | 'camera' | 'staff'; fine: number };
  thiefEscaped: { customer: Customer; cost: number };
  phoneRing: PhoneOrder;
  phoneOrderUpdate: PhoneOrder;
  incident: Incident;
  journal: JournalEntry;
  closing: void;
  dayEnded: void;
}

interface Refill { shelf: number; slot: number; left: number }
interface ZoneRefill { zone: Exclude<Category, 'counter'>; slots: { shelf: number; slot: number }[]; left: number; index: number }

export interface DaySessionSnapshot {
  version: 1;
  queue: Customer[];
  shoppers: Customer[];
  ready: Customer[];
  entrants: Customer[];
  tray: number[];
  paused: boolean;
  closed: boolean;
  ended: boolean;
  elapsed: number;
  rngState: number;
  nextSpawnIn: number;
  nextId: number;
  refills: Refill[];
  zoneRefills: ZoneRefill[];
  acc: number;
  /** Giai đoạn 3 (tùy chọn để snapshot cũ vẫn đọc được). */
  lanes?: Lane[];
  workers?: Worker[];
  tasks?: Task[];
  phoneOrders?: PhoneOrder[];
  incidents?: Incident[];
  fleeing?: Customer[];
  playerAway?: number;
  counters?: { nextOrderId: number; nextIncidentId: number; nextLaneId: number; taskAcc: number; missedAlerted: string[] };
}

/** Core phiên bán: khách tự duyệt hàng, người chơi quét giỏ, thối tiền và phục vụ hàng sau quầy. */
export class DaySession {
  readonly events = new Emitter<DayEvents>();
  readonly queue: Customer[] = [];
  readonly shoppers: Customer[] = [];
  readonly ready: Customer[] = [];
  readonly entrants: Customer[] = [];
  tray: number[] = [];
  paused = false;
  closed = false;
  ended = false;
  elapsed = 0;

  /** Quầy của nhân viên thu ngân. */
  lanes: Lane[] = [];
  workers: Worker[] = [];
  tasks = new TaskQueue();
  readonly phoneOrders: PhoneOrder[] = [];
  readonly incidents: Incident[] = [];
  /** Kẻ trộm đang chạy ra cửa (còn bắt được). */
  readonly fleeing: Customer[] = [];
  /** Người chơi đang tự đi giao hàng (giây còn lại); quầy bỏ trống. */
  playerAway = 0;
  /** Tự phục vụ quầy người chơi (bỏ qua ngày, mô phỏng): quét, thối tiền tự động. */
  autoPlayer = false;
  /** Giây giữa hai thao tác của người chơi tự động (0 = tức thì). */
  autoPlayerReact = 0;
  private autoCooldown = 0;

  private rng: Rng;
  private nextSpawnIn = 1.2;
  private nextId = 1;
  private refills: Refill[] = [];
  private zoneRefills: ZoneRefill[] = [];
  private acc = 0;
  private nextOrderId = 1;
  private nextIncidentId = 1;
  private nextLaneId = 1;
  private taskAcc = 0;
  private missedAlerted = new Set<string>();

  constructor(readonly state: GameState, seed?: number) {
    this.rng = new Rng(seed ?? daySeed(state.day, Math.floor(state.clock)));
    this.closed = state.clock >= DATA.balance.closeMinute;
  }

  /** Restore the exact simulation runtime from a server snapshot. */
  static restore(state: GameState, snapshot: DaySessionSnapshot): DaySession {
    if (snapshot.version !== 1) throw new Error(`DaySession snapshot version không hỗ trợ: ${snapshot.version}`);
    const session = new DaySession(state, 0);
    session.queue.push(...structuredClone(snapshot.queue));
    session.shoppers.push(...structuredClone(snapshot.shoppers));
    session.ready.push(...structuredClone(snapshot.ready));
    session.entrants.push(...structuredClone(snapshot.entrants));
    session.tray = [...snapshot.tray];
    session.paused = snapshot.paused;
    session.closed = snapshot.closed;
    session.ended = snapshot.ended;
    session.elapsed = snapshot.elapsed;
    session.rng = Rng.restore(snapshot.rngState);
    session.nextSpawnIn = snapshot.nextSpawnIn;
    session.nextId = snapshot.nextId;
    session.refills = structuredClone(snapshot.refills);
    session.zoneRefills = structuredClone(snapshot.zoneRefills);
    session.acc = snapshot.acc;
    session.lanes = structuredClone(snapshot.lanes ?? []);
    session.workers = structuredClone(snapshot.workers ?? []);
    session.tasks = TaskQueue.from(snapshot.tasks ?? []);
    session.phoneOrders.push(...structuredClone(snapshot.phoneOrders ?? []));
    session.incidents.push(...structuredClone(snapshot.incidents ?? []));
    session.fleeing.push(...structuredClone(snapshot.fleeing ?? []));
    session.playerAway = snapshot.playerAway ?? 0;
    if (snapshot.counters) {
      session.nextOrderId = snapshot.counters.nextOrderId;
      session.nextIncidentId = snapshot.counters.nextIncidentId;
      session.nextLaneId = snapshot.counters.nextLaneId;
      session.taskAcc = snapshot.counters.taskAcc;
      session.missedAlerted = new Set(snapshot.counters.missedAlerted);
    }
    return session;
  }

  /** Capture all non-GameState fields needed to continue this simulation elsewhere. */
  snapshot(): DaySessionSnapshot {
    return {
      version: 1,
      queue: structuredClone(this.queue),
      shoppers: structuredClone(this.shoppers),
      ready: structuredClone(this.ready),
      entrants: structuredClone(this.entrants),
      tray: [...this.tray],
      paused: this.paused,
      closed: this.closed,
      ended: this.ended,
      elapsed: this.elapsed,
      rngState: this.rng.snapshot(),
      nextSpawnIn: this.nextSpawnIn,
      nextId: this.nextId,
      refills: structuredClone(this.refills),
      zoneRefills: structuredClone(this.zoneRefills),
      acc: this.acc,
      lanes: structuredClone(this.lanes),
      workers: structuredClone(this.workers),
      tasks: this.tasks.toJSON(),
      phoneOrders: structuredClone(this.phoneOrders),
      incidents: structuredClone(this.incidents),
      fleeing: structuredClone(this.fleeing),
      playerAway: this.playerAway,
      counters: {
        nextOrderId: this.nextOrderId, nextIncidentId: this.nextIncidentId, nextLaneId: this.nextLaneId,
        taskAcc: this.taskAcc, missedAlerted: [...this.missedAlerted],
      },
    };
  }

  get front(): Customer | undefined { return this.queue[0]; }
  get customers(): Customer[] {
    return [...this.shoppers, ...this.entrants, ...this.ready, ...this.queue, ...this.lanes.flatMap((l) => l.queue), ...this.fleeing];
  }

  static minutesPerSecond(): number {
    const b = DATA.balance;
    return (b.closeMinute - b.openMinute) / b.daySeconds;
  }

  update(dtSec: number): void {
    if (this.paused || this.ended) return;
    const step = DATA.balance.tickMs / 1000;
    this.acc += Math.min(dtSec, 0.5);
    while (this.acc >= step) {
      this.acc -= step;
      this.tick(step);
      if (this.ended) break;
    }
  }

  tick(dt: number): void {
    const b = DATA.balance;
    this.elapsed += dt;
    const diningChanged = tickDining(this.state, dt);
    if (diningChanged.length) this.events.emit('diningChanged', diningChanged);
    const before = this.state.clock;
    if (!this.closed) {
      this.state.clock = Math.min(b.closeMinute, this.state.clock + dt * DaySession.minutesPerSecond());
      if (this.state.clock >= b.closeMinute) {
        this.closed = true;
        this.events.emit('closing', undefined);
      }
    }
    if (this.playerAway > 0) this.playerAway = Math.max(0, this.playerAway - dt);
    this.tickStaff(dt, this.state.clock - before);
    if (!this.closed) {
      this.nextSpawnIn -= dt;
      if (this.nextSpawnIn <= 0) {
        const inStore = this.shoppers.length + this.entrants.length + this.ready.length + this.queue.length + this.lanes.reduce((n, l) => n + l.queue.length, 0);
        if (inStore < maxShoppersFor(this.state) + this.maxQueue() * (1 + this.lanes.length)) {
          this.spawn();
          const mul = ratingSpawnMultiplier(averageRating(this.state)) * attractionMultiplier(this.state) * cheapSpawnMultiplier(this.state)
            * trafficMultiplier(this.state.level);
          const effects = EffectStack.forDay(this.state.day, this.state.calendarStartMonth, this.state.calendarStartYear, this.state.activeEvents);
          const mean = meanSpawnSeconds(this.state.clock, mul, this.state.day, effects.multiply('trafficMul'));
          this.nextSpawnIn = Math.max(1, this.rng.exponential(mean));
        } else this.nextSpawnIn = 0.5;
      }
    }

    for (const r of [...this.refills]) {
      r.left -= dt;
      if (r.left <= 0) {
        this.refills.splice(this.refills.indexOf(r), 1);
        if (this.tasks.get(`refill:${r.shelf}:${r.slot}`)?.claimedBy === PLAYER) this.tasks.complete(`refill:${r.shelf}:${r.slot}`);
        const qty = refillSlot(this.state, r.shelf, r.slot);
        this.events.emit('refillDone', { shelf: r.shelf, slot: r.slot, qty });
      }
    }
    this.tickZoneRefills(dt);
    this.tickDeliveries();
    this.tickDebtVisits();
    this.admitShoppers();
    for (const c of [...this.shoppers]) this.tickBrowse(c, dt);
    this.admitShoppers();
    this.admitReady();
    this.tickFleeing(dt);
    this.tickPhone(dt);

    const inLanes = this.lanes.flatMap((l) => l.queue);
    const waiting = [...this.queue, ...this.ready, ...inLanes].filter((c) => c.status === 'waiting' || c.status === 'scanning' || c.status === 'paying' || c.status === 'bargain' || c.status === 'credit');
    const cat = hasCat(this.state);
    for (const c of waiting) {
      const rate = c === this.front || this.lanes.some((l) => l.queue[0] === c) ? 1 : b.queuePatienceRate;
      c.patience -= dt * rate;
      c.waited = (c.waited ?? 0) + dt;
      if (cat && !c.catChecked && c.waited >= b.cat.waitSeconds) {
        c.catChecked = true;
        if (this.rng.next() < b.cat.chance) {
          c.patience = Math.min(c.patienceMax, c.patience + b.cat.bonusSeconds);
          this.events.emit('catPetted', c);
        }
      }
      if (c.patience <= 0) {
        c.patience = 0;
        this.leave(c, 'patience');
      }
    }
    const c = this.front;
    if (c?.status === 'scanning') this.tickCounterRequest(c, dt);
    this.promoteFront();
    this.tickLanes(dt);
    if (this.autoPlayer) this.autoServe(dt);

    if (this.closed && this.customers.length === 0 && !this.ended) {
      this.finishOrders();
      this.ended = true;
      this.events.emit('dayEnded', undefined);
    }
  }

  private maxQueue(): number {
    return maxQueueFor(this.state);
  }

  private spawn(): void {
    const c = createCustomer(this.nextId++, this.state.level, this.rng, this.state);
    if (hasFeature(this.state.level, 'thief') && this.rng.next() < DATA.balance.security.thiefChance) {
      c.thief = true;
      delete c.name;
      delete c.look;
      c.order = c.order.filter((line) => !line.counterLine);
      c.counterRequestResolved = true;
      delete c.wantsCredit;
      delete c.bargainPct;
    }
    const hour = Math.max(0, Math.min(this.state.today.hourly.length - 1, Math.floor((this.state.clock - DATA.balance.openMinute) / 60)));
    this.state.today.hourly[hour] = (this.state.today.hourly[hour] ?? 0) + 1;
    if (c.name) this.state.regulars[c.name] = (this.state.regulars[c.name] ?? 0) + 1;
    this.entrants.push(c);
    this.events.emit('customerArrived', c);
    this.admitShoppers();
  }

  private admitShoppers(): void {
    while (this.shoppers.length < maxShoppersFor(this.state) && this.entrants.length) {
      const c = this.entrants.shift()!;
      if (c.status === 'done') continue;
      c.status = 'browsing';
      c.browseIndex = 0;
      c.browsePicking = false;
      c.at = null;
      const first = c.order.find((line) => !line.counterLine);
      c.browseTimer = first ? this.walkTo(c, first) : DATA.balance.zoneWalkSeconds;
      this.shoppers.push(c);
    }
  }

  private tickBrowse(c: Customer, dt: number): void {
    if (c.status !== 'browsing') return;
    const lines = c.order.filter((line) => !line.counterLine);
    if (c.browseIndex >= lines.length || c.shopBudget <= 0) {
      this.finishBrowsing(c);
      return;
    }
    c.shopBudget -= dt;
    if (c.shopBudget <= 0) { this.finishBrowsing(c); return; }
    c.browseTimer -= dt;
    if (c.browseTimer > 0) return;
    const line = lines[c.browseIndex];
    if (!line) { this.finishBrowsing(c); return; }
    if (!c.browsePicking) {
      c.browsePicking = true;
      c.browseTimer = DATA.balance.pickSeconds;
      return;
    }
    this.takeFromShelf(c, line);
    c.browsePicking = false;
    if (line.picked + line.missing < line.qty) {
      c.browseTimer = DATA.balance.zoneWalkSeconds;
      return;
    }
    c.browseIndex++;
    const next = lines[c.browseIndex];
    if (next) c.browseTimer = this.walkTo(c, next);
    else this.finishBrowsing(c);
  }

  /** Kệ khách sẽ tới để lấy món: kệ đúng khu đang có món (ưu tiên tủ lạnh cho đồ uống lạnh). */
  private targetShelf(productId: string): number | null {
    const p = product(productId);
    const shelves = usableShelves(this.state).filter((r) => zoneOf(this.state, r) === p.category);
    const withItem = shelves.filter((r) => this.state.shelves[r].some((s) => s.productId === p.id && s.qty > 0));
    const cold = withItem.filter((r) => shelfKind(this.state, r) !== 'shelf');
    return (p.prefersCold ? cold[0] : undefined) ?? withItem[0] ?? shelves[0] ?? null;
  }

  /** Thời gian đi tới kệ của món tiếp theo: tiệm nhỏ giữ nhịp cũ, tiệm lớn đi xa hơn. */
  private walkTo(c: Customer, line: OrderLine): number {
    const b = DATA.balance;
    const shelf = this.targetShelf(line.productId);
    const to = shelf === null ? null : fixtureOfShelf(this.state, shelf) ?? null;
    const from = c.at === null || c.at === undefined ? null : this.state.fixtures.find((f) => f.uid === c.at) ?? null;
    let tiles = 0;
    try {
      tiles = to ? walkTiles(this.state, from, to, this.grid()) : 0;
    } catch {
      tiles = 0;
    }
    c.at = to?.uid ?? c.at ?? null;
    this.events.emit('customerBrowse', { customer: c, zone: product(line.productId).category, shelf, tiles });
    return b.zoneWalkSeconds + Math.max(0, tiles - 3) * b.walkSecondsPerTile;
  }

  private gridCache: { key: string; grid: boolean[] } | null = null;
  private grid(): boolean[] {
    const key = JSON.stringify(this.state.fixtures) + this.state.land.join();
    if (this.gridCache?.key !== key) this.gridCache = { key, grid: walkableGrid(this.state) };
    return this.gridCache.grid;
  }

  private takeFromShelf(c: Customer, line: OrderLine): void {
    const p = product(line.productId);
    const zone = p.category;
    let source: { shelf: number; slot: number } | null = null;
    const shelves = usableShelves(this.state).filter((r) => zoneOf(this.state, r) === zone);
    // Đồ uống thích lạnh: lấy ở tủ lạnh trước.
    if (p.prefersCold) shelves.sort((a, b) => (shelfKind(this.state, a) === 'shelf' ? 1 : 0) - (shelfKind(this.state, b) === 'shelf' ? 1 : 0));
    for (const r of shelves) {
      const row = this.state.shelves[r];
      const col = row.findIndex((slot) => slot.productId === p.id && slot.qty > 0);
      if (col >= 0) { source = { shelf: r, slot: col }; break; }
    }
    if (source && line.picked === 0 && !line.declined && this.declines(c, line, source.shelf)) return;
    if (!source) {
      line.missing++;
      c.basketMissing++;
      if (c.penalty < 1) c.penalty++;
      this.state.today.missed[p.id] = (this.state.today.missed[p.id] ?? 0) + 1;
      this.events.emit('itemMissing', { customer: c, productId: p.id });
      this.noteMissing(p.id);
      return;
    }
    const slot = this.state.shelves[source.shelf][source.slot];
    const unit = slotUnitPrice(this.state, slot);
    const exp = takeOneFromSlot(slot) ?? null;
    line.picked++;
    line.value = (line.value ?? 0) + unit;
    line.pickedFrom ??= [];
    const recorded = line.pickedFrom.find((item) => item.shelf === source!.shelf && item.slot === source!.slot);
    if (recorded) {
      recorded.qty++;
      (recorded.exps ??= []).push(exp);
    } else line.pickedFrom.push({ ...source, qty: 1, exps: [exp] });
    this.events.emit('itemTaken', { customer: c, productId: p.id, ...source });
  }

  /** Khách xét giá và độ lạnh trước khi lấy món; từ chối thì bỏ cả dòng (không tính là hết hàng). */
  private declines(c: Customer, line: OrderLine, shelf: number): boolean {
    const p = product(line.productId);
    const t = this.state.today;
    let reason: 'price' | 'cold' | null = null;
    const keep = keepChance(this.state, p.id, c.type);
    if (keep < 1 && this.rng.next() >= keep) reason = 'price';
    else if (p.prefersCold && shelfKind(this.state, shelf) === 'shelf' && this.rng.next() >= DATA.balance.notColdBuyChance) reason = 'cold';
    if (!reason) return false;
    line.declined = reason;
    line.missing = line.qty - line.picked;
    if (reason === 'price') {
      t.priceComplaints[p.id] = (t.priceComplaints[p.id] ?? 0) + 1;
      this.events.emit('priceComplaint', { customer: c, productId: p.id });
    } else {
      t.notCold[p.id] = (t.notCold[p.id] ?? 0) + 1;
      this.events.emit('notCold', { customer: c, productId: p.id });
    }
    return true;
  }

  private finishBrowsing(c: Customer): void {
    if (c.status !== 'browsing') return;
    if (c.thief) {
      this.thiefDone(c);
      return;
    }
    if (c.shopBudget <= 0) {
      for (const line of c.order) {
        if (line.counterLine) continue;
        const missing = line.qty - line.picked - line.missing;
        if (missing <= 0) continue;
        line.missing += missing;
        c.basketMissing += missing;
        c.penalty = Math.min(1, c.penalty + 1);
        this.state.today.missed[line.productId] = (this.state.today.missed[line.productId] ?? 0) + missing;
      }
    }
    if (!c.order.some((line) => line.picked > 0) && !c.order.some((line) => line.counterLine)) {
      this.removeFrom(this.shoppers, c);
      this.leave(c, 'nothing');
      return;
    }
    const lane = this.chooseLane();
    if (lane === null) return;
    this.removeFrom(this.shoppers, c);
    c.at = counterFixture(this.state)?.uid ?? null;
    c.status = 'waiting';
    this.joinLane(c, lane);
  }

  private admitReady(): void {
    while (this.ready.length) {
      const lane = this.chooseLane();
      if (lane === null) break;
      const c = this.ready.shift()!;
      if (c.status === 'done') continue;
      this.joinLane(c, lane);
    }
  }

  /** Vào quầy: 0 = quầy người chơi, số khác = id quầy nhân viên. */
  private joinLane(c: Customer, laneId: number): void {
    c.lane = laneId;
    if (laneId === 0) this.queue.push(c);
    else this.lanes.find((l) => l.id === laneId)!.queue.push(c);
    this.events.emit('basketReady', c);
  }

  /** Quầy người chơi nhận khách mới không (chế độ quản lý có thu ngân thì không; đang đi giao thì không). */
  playerLaneOpen(): boolean {
    if (this.playerAway > 0 && !this.autoPlayer) return false;
    const staffed = this.lanes.some((l) => !l.closing);
    if (this.state.today.managerDay && staffed) return false;
    return true;
  }

  /**
   * Khách xếp vào quầy ít người chờ nhất trong các quầy đang có người đứng. Bằng nhau thì vào quầy
   * nhân viên trước, người chơi nhận phần đông khách dư (vẫn có việc nhưng không bị quá tải).
   */
  private chooseLane(): number | null {
    const max = this.maxQueue();
    const options: { id: number; len: number }[] = [];
    for (const l of this.lanes) if (!l.closing) options.push({ id: l.id, len: l.queue.length });
    if (this.playerLaneOpen()) options.push({ id: 0, len: this.queue.length });
    let best: { id: number; len: number } | null = null;
    for (const o of options) if (o.len < max && (!best || o.len < best.len)) best = o;
    return best?.id ?? null;
  }

  private promoteFront(): void {
    const c = this.front;
    if (!c || c.status !== 'waiting') return;
    c.status = 'scanning';
    this.events.emit('customerFront', c);
    const request = c.order.find((line) => line.counterLine && line.picked === 0 && line.missing === 0);
    if (request) this.beginCounterRequest(c, request);
    if (this.state.settings.autoScan) this.scanAll(true);
  }

  private beginCounterRequest(c: Customer, line: OrderLine): void {
    const unlock = DATA.levels.levels.find((level) => level.counterUnlock)?.level ?? Number.POSITIVE_INFINITY;
    if (this.state.level < unlock) {
      line.missing = line.qty;
      c.basketMissing += line.qty;
      c.penalty = Math.min(1, c.penalty + 1);
      this.state.today.missed[line.productId] = (this.state.today.missed[line.productId] ?? 0) + line.qty;
      c.counterRequestResolved = true;
      this.events.emit('counterExpired', { customer: c, productId: line.productId });
      return;
    }
    const have = this.state.counter.some((slot) => slot.productId === line.productId && slot.qty > 0);
    if (!have) {
      line.missing = line.qty;
      c.basketMissing += line.qty;
      c.penalty = Math.min(1, c.penalty + 1);
      this.state.today.missed[line.productId] = (this.state.today.missed[line.productId] ?? 0) + line.qty;
      c.counterRequestResolved = true;
      this.events.emit('counterExpired', { customer: c, productId: line.productId });
      return;
    }
    c.counterRequestResolved = false;
    c.counterRequestLeft = c.counterRequestSeconds;
    this.events.emit('counterRequested', { customer: c, productId: line.productId, seconds: c.counterRequestSeconds });
  }

  private tickCounterRequest(c: Customer, dt: number): void {
    if (c.counterRequestResolved || c.counterRequestLeft === null) return;
    c.counterRequestLeft -= dt;
    if (c.counterRequestLeft <= 0) {
      const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0);
      if (!line) return;
      line.missing = line.qty;
      c.basketMissing += line.qty;
      c.penalty = Math.min(1, c.penalty + 1);
      this.state.today.missed[line.productId] = (this.state.today.missed[line.productId] ?? 0) + line.qty;
      c.counterRequestLeft = null;
      c.counterRequestResolved = true;
      this.events.emit('counterExpired', { customer: c, productId: line.productId });
      this.maybeStartPayment(c);
    }
  }

  /** Xe giao hàng của mối sỉ tới đúng giờ. */
  private tickDeliveries(): void {
    if (!this.state.deliveries.length) return;
    for (const d of receiveDeliveries(this.state, this.state.day, this.state.clock)) this.events.emit('delivery', d);
  }

  /** Khách nợ ghé trả tiền rải rác trong ngày. */
  private tickDebtVisits(): void {
    const due = repaymentsToday(this.state);
    if (!due.length) return;
    const span = DATA.balance.daySeconds;
    for (const debt of due) {
      const frac = ((debt.id * 0.618034) % 1);
      if (this.elapsed < span * (0.15 + 0.6 * frac) && !this.closed) continue;
      const amount = collectDebt(this.state, debt.id);
      if (amount) this.events.emit('debtRepaid', { debtId: debt.id, name: debt.name, amount });
    }
  }

  /** Kệ người chơi đang tự nạp (ô đầu tiên trong hàng đợi nạp), để sơ đồ trực tiếp vẽ người chơi đứng ở kệ đó. */
  playerRefillShelf(): number | null {
    return this.refills[0]?.shelf ?? null;
  }

  isRefilling(shelf: number, slot: number): number | null {
    const r = this.refills.find((x) => x.shelf === shelf && x.slot === slot);
    return r ? 1 - r.left / DATA.balance.refillSeconds : null;
  }

  startRefill(shelf: number, slot: number): boolean {
    if (this.isRefilling(shelf, slot) !== null || !canRefill(this.state, shelf, slot)) return false;
    // Người chơi cũng là một tác nhân: chạm ô kệ = tự nhận việc nạp ô đó (nhân viên không nhận trùng).
    this.tasks.upsert(`refill:${shelf}:${slot}`, 'refill', 1);
    this.tasks.claimKey(PLAYER, `refill:${shelf}:${slot}`);
    this.refills.push({ shelf, slot, left: DATA.balance.refillSeconds });
    this.events.emit('refillStarted', { shelf, slot });
    return true;
  }

  refillZone(zone: Exclude<Category, 'counter'>): boolean {
    if (this.zoneRefills.some((r) => r.zone === zone)) return false;
    const slots: { shelf: number; slot: number }[] = [];
    for (const shelf of usableShelves(this.state)) {
      if (zoneOf(this.state, shelf) !== zone) continue;
      this.state.shelves[shelf].forEach((_, index) => {
        if (canRefill(this.state, shelf, index)) slots.push({ shelf, slot: index });
      });
    }
    if (!slots.length) return false;
    this.zoneRefills.push({ zone, slots, left: DATA.balance.zoneRefillSecondsPerSlot, index: 0 });
    return true;
  }

  private tickZoneRefills(dt: number): void {
    for (const refill of [...this.zoneRefills]) {
      refill.left -= dt;
      if (refill.left > 0) continue;
      const slot = refill.slots[refill.index];
      if (slot) refillSlot(this.state, slot.shelf, slot.slot);
      refill.index++;
      if (refill.index >= refill.slots.length) {
        this.zoneRefills.splice(this.zoneRefills.indexOf(refill), 1);
        this.events.emit('zoneRefillDone', { zone: refill.zone, count: refill.index });
      } else refill.left += DATA.balance.zoneRefillSecondsPerSlot;
    }
  }

  scanItem(productId: string): boolean {
    const c = this.front;
    if (!c || c.status !== 'scanning') return false;
    const line = c.order.find((item) => item.productId === productId && item.picked > item.scanned);
    if (!line) return false;
    if (c.scanStartedAt === null) c.scanStartedAt = this.elapsed;
    line.scanned++;
    this.state.today.itemsScanned++;
    this.events.emit('itemScanned', { customer: c, productId, scanned: line.scanned, remaining: line.picked - line.scanned });
    this.maybeStartPayment(c);
    return true;
  }

  scanAll(auto = false): boolean {
    const c = this.front;
    if (!c || c.status !== 'scanning') return false;
    for (const line of c.order) {
      const amount = line.picked - line.scanned;
      if (amount <= 0) continue;
      line.scanned = line.picked;
      this.state.today.itemsScanned += amount;
      this.events.emit('itemScanned', { customer: c, productId: line.productId, scanned: line.scanned, remaining: 0 });
    }
    c.comboTipEligible = false;
    if (auto) c.autoScanned = true;
    if (auto && c.scanStartedAt === null) c.scanStartedAt = this.elapsed;
    this.maybeStartPayment(c);
    return true;
  }

  private maybeStartPayment(c: Customer): void {
    if (c !== this.front || c.status !== 'scanning') return;
    if (!c.counterRequestResolved) return;
    if (c.order.some((line) => line.picked > line.scanned)) return;
    const total = orderTotal(c, this.state);
    if (total <= 0) {
      this.leave(c, 'nothing');
      return;
    }
    if (c.wantsCredit && !c.creditResolved) {
      c.status = 'credit';
      this.events.emit('creditRequested', { customer: c, amount: total, allowed: canGiveCredit(this.state, total) });
      return;
    }
    if (c.bargainPct && !c.bargainResolved) {
      c.status = 'bargain';
      this.events.emit('bargainRequested', { customer: c, pct: c.bargainPct });
      return;
    }
    this.startPayment(c);
  }

  private startPayment(c: Customer): void {
    const total = orderTotal(c, this.state);
    c.comboTipEligible = c.scanStartedAt !== null && this.elapsed - c.scanStartedAt <= DATA.balance.scanComboSeconds;
    c.total = total;
    c.bill = customerPayment(total, this.rng);
    c.changeDue = c.bill - total;
    c.status = 'paying';
    c.changeStartedAt = this.elapsed;
    this.tray = [];
    this.events.emit('paymentStarted', c);
    if (c.changeDue === 0) this.completeSale(c, this.tipFor(c, false), 0);
    else if (this.state.settings.autoChange) this.autoChange();
  }

  /** Người chơi trả lời khách mặc cả: bớt thì giảm tiền, không bớt thì khách có thể bỏ về. */
  resolveBargain(accept: boolean): boolean {
    const c = this.front;
    if (!c || c.status !== 'bargain') return false;
    const cfg = DATA.balance.bargain;
    c.bargainResolved = true;
    c.status = 'scanning';
    if (accept) {
      const before = orderTotal(c, this.state);
      c.discountPct = c.bargainPct;
      this.state.today.bargainDiscount += before - orderTotal(c, this.state);
      this.events.emit('bargainResolved', { customer: c, accepted: true, left: false });
      this.startPayment(c);
      return true;
    }
    if (this.rng.next() < cfg.declineLeave) {
      this.events.emit('bargainResolved', { customer: c, accepted: false, left: true });
      this.leave(c, 'nothing');
      return true;
    }
    c.maxStars = cfg.declineMaxStars;
    this.events.emit('bargainResolved', { customer: c, accepted: false, left: false });
    this.startPayment(c);
    return true;
  }

  /** Người chơi cho hoặc không cho khách ghi sổ. */
  resolveCredit(grant: boolean): boolean {
    const c = this.front;
    if (!c || c.status !== 'credit') return false;
    const amount = orderTotal(c, this.state);
    c.creditResolved = true;
    if (grant) {
      if (!canGiveCredit(this.state, amount)) {
        c.status = 'credit';
        c.creditResolved = false;
        return false;
      }
      recordDebt(this.state, c.name ?? c.type.name, amount, this.rng);
      this.events.emit('creditResolved', { customer: c, granted: true, amount });
      c.total = amount;
      this.completeSale(c, 0, 0, true);
      return true;
    }
    this.events.emit('creditResolved', { customer: c, granted: false, amount });
    for (const line of c.order) this.returnLine(line);
    this.state.today.left++;
    this.finish(c, 'nothing', DATA.balance.debt.refuseStars);
    return true;
  }

  /** Kept as a convenience for the "Quét hết" action; partial checkout is no longer supported. */
  checkout(): void { this.scanAll(false); }

  serveCounterRequest(slotIndex: number): CounterResult {
    const c = this.front;
    if (!c || c.status !== 'scanning' || c.counterRequestResolved) return 'none';
    const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0);
    if (!line) return 'none';
    const slot = this.state.counter[slotIndex];
    if (!slot || slot.productId !== line.productId || slot.qty <= 0) {
      c.patience = Math.max(0, c.patience - DATA.balance.counterWrongPenalty);
      this.events.emit('counterWrong', { customer: c, slot: slotIndex });
      return slot?.productId === line.productId ? 'empty' : 'wrong';
    }
    slot.qty--;
    line.picked++;
    line.counterSlot = slotIndex;
    c.counterRequestLeft = null;
    c.counterRequestResolved = true;
    this.state.today.counterServed++;
    this.events.emit('counterServed', { customer: c, productId: line.productId, slot: slotIndex });
    if (this.state.settings.autoScan) {
      c.autoScanned = true;
      this.scanItem(line.productId);
    }
    else this.maybeStartPayment(c);
    return 'ok';
  }

  trayTotal(): number { return this.tray.reduce((a, b) => a + b, 0); }
  addBill(value: number): void {
    if (this.front?.status !== 'paying') return;
    this.tray.push(value);
    this.events.emit('trayChanged', this.tray);
  }
  undoBill(): void {
    const c = this.front;
    if (c?.status !== 'paying' || this.tray.length === 0) return;
    this.tray.pop();
    c.undos++;
    this.events.emit('trayChanged', this.tray);
  }

  giveChange(): ChangeResult | null {
    const c = this.front;
    if (!c || c.status !== 'paying') return null;
    const given = this.trayTotal();
    const result = judgeChange(given, c.changeDue);
    if (result === 'short') {
      c.shortAttempts++;
      if (c.shortAttempts === 1) c.penalty += 1;
      this.tray = [];
      this.events.emit('changeResult', { customer: c, result, given, tip: 0, lost: 0, auto: false });
      this.events.emit('trayChanged', this.tray);
      return result;
    }
    const lost = result === 'over' ? given - c.changeDue : 0;
    const tip = result === 'exact' ? this.tipFor(c, false) : 0;
    this.events.emit('changeResult', { customer: c, result, given, tip, lost, auto: false });
    this.completeSale(c, tip, lost);
    return result;
  }

  autoChange(): boolean {
    const c = this.front;
    if (!c || c.status !== 'paying') return false;
    this.events.emit('changeResult', { customer: c, result: 'exact', given: c.changeDue, tip: 0, lost: 0, auto: true });
    this.completeSale(c, 0, 0);
    return true;
  }

  cleanTable(fixtureUid: number): boolean {
    if (!cleanDiningTable(this.state, fixtureUid)) return false;
    this.events.emit('diningChanged', this.state.diningTables);
    return true;
  }

  serveDiningOrder(fixtureUid: number, counterSlot: number): boolean {
    if (!serveExtraDiningOrder(this.state, fixtureUid, counterSlot)) return false;
    this.events.emit('diningChanged', this.state.diningTables);
    return true;
  }

  private tipFor(c: Customer, auto: boolean): number {
    const automatic = auto || c.autoScanned;
    const ordinary = computeTip({ elapsedSec: this.elapsed - c.changeStartedAt, undos: c.undos, shortAttempts: c.shortAttempts, tipMul: c.type.tipMul, auto: automatic }, this.rng);
    return ordinary + (c.comboTipEligible && !automatic && c.shortAttempts === 0 && c.undos === 0 ? DATA.balance.scanTipBonus : 0);
  }

  private completeSale(c: Customer, tip: number, lost: number, credit = false, staff?: Staff): void {
    const b = DATA.balance;
    const t = this.state.today;
    c.total = Math.round(c.total * prestigeRevenueMultiplier(this.state) / 1000) * 1000;
    let items = 0;
    for (const line of c.order) {
      if (line.scanned <= 0) continue;
      items += line.scanned;
      t.cogs += product(line.productId).cost * line.scanned;
      t.sold[line.productId] = (t.sold[line.productId] ?? 0) + line.scanned;
    }
    this.state.lifetime.sold += items;
    this.state.lifetime.served++;
    // Ghi sổ: chưa thu tiền, doanh thu tính khi khách trả nợ.
    if (!credit) {
      this.state.money += c.total + tip - lost;
      t.revenue += c.total;
    }
    t.tips += tip;
    t.overpaid += lost;
    t.served++;
    const stars = ratingFor(c);
    let exp = items * b.expPerItem;
    if (stars >= 3) { t.happy++; exp += b.expPerHappy; }
    if (staff) {
      // Chế độ quản lý: chủ tiệm nhận 50% EXP từ việc nhân viên làm.
      if (t.managerDay) exp = Math.round(exp * b.staff.managerExpMul);
      t.staffExp += exp;
      const perf = this.perf(staff);
      perf.served++;
      perf.ratingSum += stars;
      perf.ratingCount++;
      staff.lifetime.served++;
      staff.lifetime.ratingSum += stars;
      staff.lifetime.ratingCount++;
      this.staffExp(staff);
    }
    this.state.exp += exp;
    t.expGained += exp;
    const dineTable = c.order.find((line) => line.scanned > 0 && DATA.recipes.some((recipe) => recipe.output === line.productId));
    const seated = dineTable ? seatDiner(this.state, c.id, dineTable.productId) : null;
    this.finish(c, 'served', stars);
    if (seated) this.events.emit('diningChanged', [seated]);
    this.events.emit('sale', { customer: c, amount: c.total, tip });
    if (staff) this.events.emit('staffServed', { staff, customer: c, lane: c.lane ?? 0 });
  }

  private returnLine(line: OrderLine): void {
    let remaining = line.picked;
    if (line.counterLine && line.counterSlot !== undefined) {
      const counter = this.state.counter[line.counterSlot];
      if (counter?.productId === line.productId) {
        const returned = Math.min(remaining, DATA.balance.counterCapacity - counter.qty);
        counter.qty += returned;
        remaining -= returned;
      }
    } else {
      const exps: (number | null)[] = [];
      for (const origin of line.pickedFrom ?? []) exps.push(...(origin.exps ?? []));
      const nextExp = () => (exps.length ? exps.shift()! : null);
      for (const origin of line.pickedFrom ?? []) {
        const slot = this.state.shelves[origin.shelf]?.[origin.slot];
        if (!slot || slot.productId !== line.productId) continue;
        const returned = Math.min(origin.qty, remaining, shelfCapacity(this.state, origin.shelf) - slot.qty);
        for (let i = 0; i < returned; i++) putIntoSlot(slot, 1, nextExp());
        remaining -= returned;
        if (!remaining) break;
      }
      if (remaining > 0) {
        const p = product(line.productId);
        for (const shelf of usableShelves(this.state)) {
          if (remaining <= 0) break;
          if (zoneOf(this.state, shelf) !== p.category) continue;
          const cap = shelfCapacity(this.state, shelf);
          const slot = this.state.shelves[shelf].find((item) => item.productId === p.id && item.qty < cap);
          if (!slot) continue;
          const returned = Math.min(remaining, cap - slot.qty);
          for (let i = 0; i < returned; i++) putIntoSlot(slot, 1, nextExp());
          remaining -= returned;
        }
      }
      while (remaining > 0) {
        const exp = nextExp();
        const lot = this.state.warehouse.find((l) => l.productId === line.productId && l.exp === exp);
        if (lot) lot.qty++;
        else this.state.warehouse.push({ productId: line.productId, qty: 1, exp });
        remaining--;
      }
    }
    if (remaining > 0) {
      const lot = this.state.warehouse.find((l) => l.productId === line.productId && l.exp === null);
      if (lot) lot.qty += remaining;
      else this.state.warehouse.push({ productId: line.productId, qty: remaining, exp: null });
    }
    line.picked = 0;
    line.scanned = 0;
    line.value = 0;
    line.pickedFrom = [];
  }

  private leave(c: Customer, reason: Exclude<LeaveReason, 'served'>): void {
    for (const line of c.order) this.returnLine(line);
    this.state.today.left++;
    this.finish(c, reason, 1);
  }

  private finish(c: Customer, reason: LeaveReason, stars: number): void {
    const wasFront = this.front === c;
    c.status = 'done';
    recordRating(this.state, stars);
    this.state.today.ratingSum += stars;
    this.state.today.ratingCount++;
    this.removeFrom(this.queue, c);
    this.removeFrom(this.shoppers, c);
    this.removeFrom(this.entrants, c);
    this.removeFrom(this.ready, c);
    for (const l of this.lanes) this.removeFrom(l.queue, c);
    if (wasFront) this.tray = [];
    this.events.emit('customerLeft', { customer: c, reason, stars });
    this.admitShoppers();
    this.admitReady();
    this.promoteFront();
  }

  private removeFrom(list: Customer[], c: Customer): void {
    const i = list.indexOf(c);
    if (i >= 0) list.splice(i, 1);
  }

  // ================= Giai đoạn 3: nhân viên, trộm, giao hàng =================

  /** Ghi một dòng nhật ký theo giờ game. */
  log(text: string): void {
    const entry = { m: Math.floor(this.state.clock), t: text };
    const journal = this.state.today.journal;
    journal.push(entry);
    if (journal.length > 120) journal.shift();
    this.events.emit('journal', entry);
  }

  staffOf(id: string | null): Staff | undefined {
    return id ? this.state.staff.find((s) => s.id === id) : undefined;
  }

  workerOf(id: string | null): Worker | undefined {
    return id ? this.workers.find((w) => w.id === id) : undefined;
  }

  /** Nhân viên đang có mặt ở tiệm. */
  presentStaff(): Staff[] {
    return this.state.staff.filter((s) => this.workerOf(s.id)?.present);
  }

  private isOnShift(s: Staff): boolean {
    return !s.quitting && worksShift(this.state, s.id, this.state.day, shiftAt(this.state.clock));
  }

  private perf(s: Staff): StaffDayPerf {
    return (this.state.today.staffPerf[s.id] ??= { name: s.name, served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 });
  }

  private staffExp(s: Staff): void {
    const ups = addStaffExp(s, DATA.balance.staff.expPerJob);
    if (ups > 0) {
      this.log(`${s.name} lên cấp ${s.level}! Lương ${formatMoney(s.wage)}/ngày`);
      this.state.today.staffLevelUps.push(`${s.name} lên cấp ${s.level}`);
      this.events.emit('staffLevelUp', s);
    }
  }

  private jobDone(s: Staff): void {
    this.perf(s).jobs++;
    s.lifetime.jobs++;
    this.staffExp(s);
  }

  private busy(s: Staff): boolean {
    const w = this.workerOf(s.id);
    if (w?.task) return true;
    return this.lanes.some((l) => l.staffId === s.id && !!l.job);
  }

  private tickStaff(dt: number, minutes: number): void {
    if (!this.state.staff.length && !this.workers.length && !this.lanes.length) return;
    for (const s of this.state.staff) {
      let w = this.workerOf(s.id);
      if (!w) {
        w = { id: s.id, present: false, minutes: 0, tired: false, task: null, left: 0, idle: 0 };
        this.workers.push(w);
      }
      const should = this.closed ? w.present : this.isOnShift(s);
      if (should && !w.present) {
        w.present = true;
        this.events.emit('staffArrived', s);
        this.log(`${s.name} vào ca`);
      } else if (!should && w.present && !this.busy(s)) {
        w.present = false;
        w.task = null;
        this.tasks.releaseAgent(s.id);
        this.events.emit('staffLeft', s);
        this.log(`${s.name} hết ca`);
      }
      if (w.present) {
        w.minutes += minutes;
        if (!w.tired && w.minutes > tiredAfterMinutes(s)) {
          w.tired = true;
          this.events.emit('staffTired', s);
          this.log(`${s.name} mệt, làm chậm lại`);
        }
      }
    }
    // Nhân viên bị sa thải/nghỉ giữa chừng thì rời tiệm.
    this.workers = this.workers.filter((w) => this.state.staff.some((s) => s.id === w.id));
    this.syncLanes();
    this.taskAcc -= dt;
    if (this.taskAcc <= 0) {
      this.taskAcc = DATA.balance.staff.refillCheckSeconds;
      this.refreshTasks();
    }
    this.tickWorkers(dt);
  }

  /** Mở/đóng quầy theo thu ngân có mặt; hết ca thì bàn giao quầy cho người vào ca. */
  private syncLanes(): void {
    let changed = false;
    const cashiers = this.state.staff.filter((s) => s.role === 'cashier' && this.workerOf(s.id)?.present && (this.closed || this.isOnShift(s)));
    const positions = counterFixtures(this.state).length * 2;
    const playerSpot = this.state.today.managerDay && cashiers.length > 0 ? 0 : 1;
    const maxLanes = Math.max(0, positions - playerSpot);
    for (const lane of this.lanes) {
      if (!lane.closing && !cashiers.some((s) => s.id === lane.staffId)) lane.closing = true;
    }
    for (const lane of [...this.lanes]) {
      if (!lane.closing || lane.job) continue;
      const free = cashiers.find((s) => !this.lanes.some((l) => l.staffId === s.id && !l.closing));
      const old = this.staffOf(lane.staffId);
      if (free && this.lanes.filter((l) => !l.closing).length < maxLanes) {
        lane.staffId = free.id;
        lane.closing = false;
        this.log(`${old?.name ?? 'Thu ngân'} bàn giao quầy cho ${free.name}`);
      } else {
        this.lanes.splice(this.lanes.indexOf(lane), 1);
        for (const c of lane.queue) {
          c.status = 'waiting';
          this.ready.unshift(c);
        }
      }
      changed = true;
    }
    for (const s of cashiers) {
      if (this.lanes.filter((l) => !l.closing).length >= maxLanes) break;
      if (this.lanes.some((l) => l.staffId === s.id)) continue;
      this.lanes.push({ id: this.nextLaneId++, staffId: s.id, queue: [], job: null, closing: false });
      changed = true;
    }
    // Chế độ quản lý có thu ngân: khách đang chờ ở quầy người chơi chuyển sang quầy nhân viên.
    if (!this.autoPlayer && !this.playerLaneOpen()) {
      for (const c of [...this.queue]) {
        const untouched = c.status === 'waiting' || (c.status === 'scanning' && c.order.every((l) => l.scanned === 0));
        if (!untouched) continue;
        this.removeFrom(this.queue, c);
        c.status = 'waiting';
        this.ready.push(c);
        changed = true;
      }
    }
    if (this.state.today.managerDay && !cashiers.length && !this.closed) {
      const key = `noCashier:${shiftAt(this.state.clock)}`;
      if (!this.missedAlerted.has(key)) {
        this.missedAlerted.add(key);
        this.addIncident('noCashier', 'Ca này không có thu ngân — bạn phải tự đứng quầy!');
      }
    }
    if (changed) {
      this.admitReady();
      this.events.emit('lanesChanged', undefined);
    }
  }

  /** Cập nhật hàng đợi việc: ô kệ vơi dưới 40% (hoặc ô trống theo sơ đồ), hàng chờ cất kho, đơn chờ giao. */
  private refreshTasks(): void {
    const threshold = DATA.balance.staff.refillThreshold;
    const keep = new Set<string>();
    for (const r of usableShelves(this.state)) {
      const capacity = shelfCapacity(this.state, r);
      this.state.shelves[r].forEach((slot, c) => {
        const pid = slot.productId ?? planogramProduct(this.state, r, c);
        if (!pid) return;
        const fill = slot.productId ? slot.qty / capacity : 0;
        if (fill >= threshold || warehouseQty(this.state, pid) <= 0 || this.isRefilling(r, c) !== null) return;
        const key = `refill:${r}:${c}`;
        keep.add(key);
        this.tasks.upsert(key, 'refill', 1 - fill);
      });
    }
    this.tasks.prune('refill', keep);
    const receive = new Set<string>();
    if (this.state.holding.length) {
      receive.add('receive');
      this.tasks.upsert('receive', 'receive', 1);
    }
    this.tasks.prune('receive', receive);
    const deliver = new Set<string>();
    for (const o of this.phoneOrders) {
      if (o.status !== 'accepted' || o.courier) continue;
      deliver.add(`deliver:${o.id}`);
      this.tasks.upsert(`deliver:${o.id}`, 'deliver', 10_000 - o.deadline);
    }
    this.tasks.prune('deliver', deliver);
  }

  private tickWorkers(dt: number): void {
    for (const w of this.workers) {
      if (!w.present) continue;
      const s = this.staffOf(w.id);
      if (!s || s.role === 'cashier') continue;
      if (w.task) {
        if (w.task.startsWith('deliver:')) continue; // chuyến giao chạy trong tickPhone
        w.left -= dt;
        if (w.left <= 0) this.finishTask(s, w);
        continue;
      }
      if (!this.closed && !this.isOnShift(s)) continue;
      w.idle -= dt;
      if (w.idle > 0) continue;
      if (s.role === 'chef' || s.role === 'barista') {
        const category = s.role === 'chef' ? 'food' : 'beverage';
        const recipe = DATA.recipes.find((item) => item.category === category && item.unlockLevel <= this.state.level
          && this.state.activeRecipes.includes(item.id) && this.state.fixtures.some((f) => f.type === item.station)
          && Object.entries(item.ingredients).every(([id, qty]) => this.state.warehouse.reduce((n, lot) => n + (lot.productId === id ? lot.qty : 0), 0) >= qty));
        if (!recipe) { w.idle = DATA.balance.staff.refillCheckSeconds; continue; }
        w.task = `cook:${recipe.id}`;
        w.left = recipe.prepSeconds * timeFactor(s, w.tired);
        continue;
      }
      if (s.role === 'branch_manager') { w.idle = DATA.balance.staff.refillCheckSeconds; continue; }
      w.idle = DATA.balance.staff.refillCheckSeconds;
      const task = this.tasks.claim(s.id, ROLE_TASKS[s.role].filter((k) => k !== 'watch'));
      if (!task) continue;
      w.task = task.key;
      if (task.kind === 'deliver') {
        const order = this.phoneOrders.find((o) => `deliver:${o.id}` === task.key);
        if (!order) { w.task = null; this.tasks.complete(task.key); continue; }
        order.courier = s.id;
        order.status = 'out';
        order.tripTotal = tripSeconds(order.distance, timeFactor(s, w.tired));
        order.tripLeft = order.tripTotal;
        this.log(`${s.name} chạy xe đi giao cho ${order.name}`);
        this.events.emit('phoneOrderUpdate', order);
      } else {
        const b = DATA.balance;
        w.left = (b.staff.refillWalkSeconds + b.refillSeconds) * timeFactor(s, w.tired);
      }
    }
  }

  private finishTask(s: Staff, w: Worker): void {
    const key = w.task!;
    w.task = null;
    this.tasks.complete(key);
    if (key.startsWith('cook:')) {
      const recipeId = key.slice('cook:'.length);
      const result = prepareRecipe(this.state, recipeId, Math.min(1.2, 0.75 + s.stats.accuracy * 0.045));
      if (result.ok) {
        this.jobDone(s);
        this.log(`${s.name} chế biến ${product(result.output).name} đưa ra quầy`);
      }
      return;
    }
    if (key === 'receive') {
      if (!this.state.holding.length) return;
      stowHolding(this.state);
      this.log(`${s.name} cất hàng giao vào kho`);
      this.jobDone(s);
      return;
    }
    const [, rs, cs] = key.split(':');
    const r = Number(rs);
    const c = Number(cs);
    const slot = this.state.shelves[r]?.[c];
    if (!slot) return;
    let qty = 0;
    try {
      if (!slot.productId) {
        const want = planogramProduct(this.state, r, c);
        if (want) qty = assignSlot(this.state, r, c, want);
      } else qty = refillSlot(this.state, r, c);
    } catch {
      qty = 0;
    }
    if (qty <= 0) return;
    this.jobDone(s);
    this.events.emit('staffRefill', { staff: s, shelf: r, slot: c, qty });
  }

  /** Thu ngân phục vụ khách ở quầy của mình: quét món khách tự lấy, hàng sau quầy, tính tiền, thối tiền. */
  private tickLanes(dt: number): void {
    const cfg = DATA.balance.staff;
    for (const lane of this.lanes) {
      const s = this.staffOf(lane.staffId);
      const w = this.workerOf(lane.staffId);
      if (!s || !w) continue;
      const c = lane.queue[0];
      if (lane.job && (!c || c.id !== lane.job.customerId)) lane.job = null;
      if (!c) continue;
      if (!lane.job) {
        if (lane.closing || c.status !== 'waiting') continue;
        c.status = 'scanning';
        const items = c.order.reduce((n, l) => n + l.picked, 0);
        const counter = c.order.some((l) => l.counterLine && l.picked === 0 && l.missing === 0);
        lane.job = { customerId: c.id, phase: 'scan', left: (items * cfg.scanSecondsPerItem + (counter ? cfg.counterSeconds : 0)) * timeFactor(s, w.tired) };
        continue;
      }
      lane.job.left -= dt;
      if (lane.job.left > 0) continue;
      if (lane.job.phase === 'scan') this.staffCheckout(lane, c, s, w);
      else this.staffChange(lane, c, s);
    }
  }

  private staffCheckout(lane: Lane, c: Customer, s: Staff, w: Worker): void {
    const b = DATA.balance;
    const t = this.state.today;
    const req = c.order.find((l) => l.counterLine && l.picked === 0 && l.missing === 0);
    if (req) {
      const idx = this.state.counter.findIndex((slot) => slot.productId === req.productId && slot.qty > 0);
      if (idx >= 0) {
        this.state.counter[idx].qty--;
        req.picked++;
        req.counterSlot = idx;
        t.counterServed++;
      } else {
        req.missing = req.qty;
        c.basketMissing += req.qty;
        c.penalty = Math.min(1, c.penalty + 1);
        t.missed[req.productId] = (t.missed[req.productId] ?? 0) + req.qty;
      }
    }
    c.counterRequestResolved = true;
    c.counterRequestLeft = null;
    for (const line of c.order) {
      const n = line.picked - line.scanned;
      if (n <= 0) continue;
      line.scanned = line.picked;
      t.itemsScanned += n;
    }
    c.autoScanned = true;
    let total = orderTotal(c, this.state);
    if (total <= 0) {
      lane.job = null;
      this.leave(c, 'nothing');
      return;
    }
    if (c.wantsCredit && !c.creditResolved) {
      c.creditResolved = true;
      lane.job = null;
      if (canGiveCredit(this.state, total)) {
        recordDebt(this.state, c.name ?? c.type.name, total, this.rng);
        c.total = total;
        this.log(`${s.name} cho ${c.name ?? 'khách'} ghi sổ ${formatMoney(total)}`);
        this.completeSale(c, 0, 0, true, s);
      } else {
        for (const line of c.order) this.returnLine(line);
        t.left++;
        this.finish(c, 'nothing', b.debt.refuseStars);
      }
      return;
    }
    if (c.bargainPct && !c.bargainResolved) {
      c.bargainResolved = true;
      if (c.bargainPct <= b.staff.bargainAcceptMax) {
        c.discountPct = c.bargainPct;
        const after = orderTotal(c, this.state);
        t.bargainDiscount += total - after;
        total = after;
      } else if (this.rng.next() < b.bargain.declineLeave) {
        lane.job = null;
        this.leave(c, 'nothing');
        return;
      } else c.maxStars = b.bargain.declineMaxStars;
    }
    c.total = total;
    c.status = 'paying';
    lane.job = { customerId: c.id, phase: 'change', left: b.staff.changeSeconds * timeFactor(s, w.tired) };
  }

  private staffChange(lane: Lane, c: Customer, s: Staff): void {
    const cfg = DATA.balance.staff;
    lane.job = null;
    let lost = 0;
    if (this.rng.next() < errorChance(s, this.state.day)) {
      const amount = this.rng.pick(cfg.wrongChangeValues);
      this.perf(s).mistakes++;
      s.lifetime.mistakes++;
      if (this.rng.next() < 0.5) {
        lost = amount;
        this.log(`${s.name} thối dư ${formatMoney(amount)}`);
        this.events.emit('staffMistake', { staff: s, kind: 'over', amount });
      } else {
        c.penalty = Math.min(2, c.penalty + 1);
        this.state.today.complaints++;
        this.log(`Khách phàn nàn ${s.name} thối thiếu ${formatMoney(amount)}`);
        this.events.emit('staffMistake', { staff: s, kind: 'short', amount });
        this.addIncident('complaint', `Khách phàn nàn ${s.name} thối thiếu ${formatMoney(amount)}`, { amount, customerId: c.id });
      }
    }
    const tip = this.rng.next() < cfg.tipChance * c.type.tipMul * friendlyTipMul(s) ? DATA.balance.tipMin : 0;
    if (this.rng.next() < friendlyStarChance(s)) c.bonusStars = 1;
    this.completeSale(c, tip, lost, false, s);
  }

  // ---------- Trộm vặt ----------

  private thiefDone(c: Customer): void {
    const taken = c.order.reduce((n, l) => n + l.picked, 0);
    this.removeFrom(this.shoppers, c);
    if (!taken) {
      this.drop(c);
      return;
    }
    const sec = DATA.balance.security;
    const camera = this.state.camera && hasFeature(this.state.level, 'camera');
    const watcher = this.state.staff.find((s) => s.role === 'refill' && this.workerOf(s.id)?.present);
    if (camera && this.rng.next() < sec.cameraDetect) {
      this.caught(c, 'camera');
      return;
    }
    if (watcher && this.rng.next() < sec.refillDetect) {
      this.caught(c, 'staff', watcher);
      return;
    }
    c.status = 'fleeing';
    c.fleeLeft = sec.catchWindowSeconds;
    this.fleeing.push(c);
    this.events.emit('thiefFleeing', c);
    this.addIncident('thief', 'Có người lấy hàng không trả tiền! Chạm vào để bắt', { customerId: c.id });
  }

  /** Người chơi chạm vào kẻ trộm trong 3 giây. */
  catchThief(customerId: number): boolean {
    const c = this.fleeing.find((x) => x.id === customerId);
    if (!c) return false;
    this.caught(c, 'player');
    return true;
  }

  private caught(c: Customer, by: 'player' | 'camera' | 'staff', staff?: Staff): void {
    const t = this.state.today;
    const value = c.order.reduce((sum, l) => sum + (l.value ?? 0), 0);
    const fine = Math.round(value * DATA.balance.security.fineMul);
    for (const line of c.order) this.returnLine(line);
    this.state.money += fine;
    t.fines += fine;
    t.thievesCaught++;
    if (staff) this.jobDone(staff);
    const who = by === 'camera' ? 'Camera báo động' : by === 'staff' ? `${staff?.name} phát hiện` : 'Chủ tiệm bắt quả tang';
    this.log(`${who}: kẻ trộm trả hàng, bồi thường ${formatMoney(fine)}`);
    this.events.emit('thiefCaught', { customer: c, by, fine });
    this.resolveIncidentsFor(c.id);
    this.drop(c);
  }

  private tickFleeing(dt: number): void {
    for (const c of [...this.fleeing]) {
      c.fleeLeft = (c.fleeLeft ?? 0) - dt;
      if (c.fleeLeft > 0) continue;
      const t = this.state.today;
      let cost = 0;
      const names: string[] = [];
      for (const line of c.order) {
        if (!line.picked) continue;
        cost += product(line.productId).cost * line.picked;
        names.push(`${line.picked} ${product(line.productId).name.toLowerCase()}`);
      }
      t.theftCost += cost;
      t.thefts++;
      this.log(`Mất trộm: ${names.join(', ')}`);
      this.events.emit('thiefEscaped', { customer: c, cost });
      this.resolveIncidentsFor(c.id);
      this.drop(c);
    }
  }

  /** Bỏ khách khỏi tiệm mà không tính sao (kẻ trộm). */
  private drop(c: Customer): void {
    c.status = 'done';
    for (const list of [this.shoppers, this.entrants, this.ready, this.queue, this.fleeing, ...this.lanes.map((l) => l.queue)]) this.removeFrom(list, c);
    this.events.emit('customerLeft', { customer: c, reason: 'thief', stars: 0 });
    this.admitShoppers();
  }

  // ---------- Sự cố ----------

  private addIncident(kind: Incident['kind'], text: string, extra: Partial<Incident> = {}): Incident {
    const incident: Incident = { id: this.nextIncidentId++, kind, text, resolved: false, ...extra };
    this.incidents.push(incident);
    if (this.incidents.length > 30) this.incidents.shift();
    this.events.emit('incident', incident);
    return incident;
  }

  private resolveIncidentsFor(customerId: number): void {
    for (const i of this.incidents) if (i.customerId === customerId && i.kind === 'thief') i.resolved = true;
  }

  openIncidents(): Incident[] {
    return this.incidents.filter((i) => !i.resolved);
  }

  /** Xử lý sự cố: bắt trộm, "Xin lỗi + bù tiền" cho khách phàn nàn, hoặc bỏ qua. */
  resolveIncident(id: number, action: 'catch' | 'apologize' | 'dismiss'): boolean {
    const incident = this.incidents.find((i) => i.id === id);
    if (!incident || incident.resolved) return false;
    if (action === 'catch') {
      if (incident.kind !== 'thief' || incident.customerId === undefined || !this.catchThief(incident.customerId)) return false;
    } else if (action === 'apologize') {
      if (incident.kind !== 'complaint') return false;
      const amount = incident.amount ?? 0;
      this.state.money -= amount;
      this.state.today.overpaid += amount;
      recordRating(this.state, 4);
      this.log(`Xin lỗi khách, bù ${formatMoney(amount)}`);
    }
    incident.resolved = true;
    return true;
  }

  private noteMissing(productId: string): void {
    if ((this.state.today.missed[productId] ?? 0) < 3 || this.missedAlerted.has(productId)) return;
    this.missedAlerted.add(productId);
    this.addIncident('outOfStock', `Hết ${product(productId).name.toLowerCase()}! Khách hỏi mà không có`, { productId });
  }

  // ---------- Giao hàng tận nhà ----------

  private tickPhone(dt: number): void {
    if (!deliveryUnlocked(this.state)) return;
    const cfg = DATA.balance.delivery;
    if (!this.closed && !this.phoneOrders.some((o) => o.status === 'ringing') && this.rng.next() < cfg.ringChancePerSecond * dt) {
      const order = createPhoneOrder(this.state, this.rng, this.nextOrderId++, this.state.clock);
      this.phoneOrders.push(order);
      this.events.emit('phoneRing', order);
      if (this.autoPlayer || this.state.today.managerDay) this.autoAnswer(order);
    }
    for (const o of this.phoneOrders) {
      if (o.status === 'ringing') {
        o.answerLeft -= dt;
        if (o.answerLeft <= 0) {
          o.status = 'missed';
          this.log(`Lỡ cuộc gọi đặt hàng của ${o.name}`);
          this.events.emit('phoneOrderUpdate', o);
        }
        continue;
      }
      if (o.status !== 'out') continue;
      o.tripLeft -= dt;
      if (!o.delivered && o.tripLeft <= o.tripTotal / 2) this.deliverOrder(o);
      if (o.tripLeft <= 0) {
        o.status = 'done';
        const w = this.workerOf(o.courier);
        if (w) {
          w.task = null;
          this.tasks.complete(`deliver:${o.id}`);
        }
        this.events.emit('phoneOrderUpdate', o);
      }
    }
  }

  /** Chế độ quản lý / bỏ qua ngày: nhận đơn nếu đủ hàng và có nhân viên giao hàng, không thì từ chối. */
  private autoAnswer(o: PhoneOrder): void {
    const courier = this.state.staff.some((s) => s.role === 'delivery' && this.workerOf(s.id)?.present);
    if (courier && !orderShortfall(this.state, o.items).length) this.acceptOrder(o.id);
    else this.declineOrder(o.id);
  }

  acceptOrder(id: number): 'ok' | 'short' | 'missing' {
    const o = this.phoneOrders.find((x) => x.id === id);
    if (!o || o.status !== 'ringing') return 'missing';
    if (orderShortfall(this.state, o.items).length) return 'short';
    o.cost = reserveItems(this.state, o.items);
    o.status = 'accepted';
    this.log(`Nhận đơn giao hàng của ${o.name} (${orderUnits(o)} món)`);
    this.events.emit('phoneOrderUpdate', o);
    return 'ok';
  }

  declineOrder(id: number): boolean {
    const o = this.phoneOrders.find((x) => x.id === id);
    if (!o || o.status !== 'ringing') return false;
    o.status = 'declined';
    this.events.emit('phoneOrderUpdate', o);
    return true;
  }

  /** Chủ tiệm tự đi giao: quầy bỏ trống trong thời gian đi. */
  selfDeliver(id: number): boolean {
    const o = this.phoneOrders.find((x) => x.id === id);
    if (!o || o.status !== 'accepted' || o.courier || this.playerAway > 0) return false;
    this.tasks.complete(`deliver:${o.id}`);
    o.courier = PLAYER;
    o.status = 'out';
    o.tripTotal = tripSeconds(o.distance);
    o.tripLeft = o.tripTotal;
    this.playerAway = o.tripTotal;
    this.log(`Chủ tiệm tự đi giao cho ${o.name}`);
    this.events.emit('phoneOrderUpdate', o);
    return true;
  }

  private deliverOrder(o: PhoneOrder): void {
    const b = DATA.balance;
    const t = this.state.today;
    o.delivered = true;
    o.onTime = this.state.clock <= o.deadline;
    const units = orderUnits(o);
    this.state.money += o.value + (o.onTime ? o.fee : 0);
    t.revenue += o.value;
    t.cogs += o.cost;
    for (const [pid, q] of Object.entries(o.items)) t.sold[pid] = (t.sold[pid] ?? 0) + q;
    this.state.lifetime.sold += units;
    t.deliveries++;
    if (o.onTime) t.deliveryFees += o.fee;
    else t.lateDeliveries++;
    const stars = o.onTime ? b.delivery.onTimeStars : b.delivery.lateStars;
    recordRating(this.state, stars);
    t.ratingSum += stars;
    t.ratingCount++;
    let exp = units * b.expPerItem + (stars >= 3 ? b.expPerHappy : 0);
    const courier = this.staffOf(o.courier);
    if (courier) {
      if (t.managerDay) exp = Math.round(exp * b.staff.managerExpMul);
      t.staffExp += exp;
      this.jobDone(courier);
    }
    this.state.exp += exp;
    t.expGained += exp;
    this.log(`${o.onTime ? 'Giao đúng hạn' : 'Giao trễ'} cho ${o.name}: +${formatMoney(o.value + (o.onTime ? o.fee : 0))}`);
    this.events.emit('phoneOrderUpdate', o);
  }

  /** Đóng cửa: đơn đã nhận mà chưa giao được giao muộn; cuộc gọi đang reo coi như lỡ. */
  private finishOrders(): void {
    for (const o of this.phoneOrders) {
      if (o.status === 'ringing') o.status = 'missed';
      if ((o.status === 'accepted' || o.status === 'out') && !o.delivered) this.deliverOrder(o);
      if (o.status === 'accepted' || o.status === 'out') o.status = 'done';
    }
    for (const w of this.workers) if (w.task?.startsWith('deliver:')) w.task = null;
  }

  // ---------- Tự phục vụ quầy người chơi (bỏ qua ngày / mô phỏng) ----------

  private autoServe(dt: number): void {
    if (this.autoCooldown > 0) {
      this.autoCooldown -= dt;
      return;
    }
    const c = this.front;
    if (!c || c.status === 'waiting') return;
    this.autoCooldown = this.autoPlayerReact;
    if (c.status === 'scanning' && !c.counterRequestResolved) {
      const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0);
      const idx = line ? this.state.counter.findIndex((slot) => slot.productId === line.productId && slot.qty > 0) : -1;
      if (idx >= 0) this.serveCounterRequest(idx);
      else c.counterRequestLeft = 0;
    }
    if (c.status === 'scanning' && c.counterRequestResolved) {
      // Có độ trễ (mô phỏng người thật): quét từng món mỗi lần chạm; bỏ qua ngày thì quét hết.
      const line = c.order.find((item) => item.picked > item.scanned);
      if (this.autoPlayerReact > 0 && line) this.scanItem(line.productId);
      else this.scanAll(true);
    }
    if (c.status === 'bargain') this.resolveBargain(true);
    if (c.status === 'credit') this.resolveCredit(canGiveCredit(this.state, orderTotal(c, this.state)));
    if (c.status === 'paying') this.autoChange();
  }
}

/** "Bỏ qua ngày": chạy hết ngày bằng tick không render (quầy người chơi tự phục vụ). */
export function runDayHeadless(session: DaySession, maxTicks = DATA.balance.manager.skipMaxTicks): void {
  session.autoPlayer = true;
  session.paused = false;
  const step = DATA.balance.tickMs / 1000;
  for (let i = 0; i < maxTicks && !session.ended; i++) session.tick(step);
}

/** Kết thúc ngày: tính tổng kết, áp dụng lên level, chuyển sang pha tổng kết. */
export function endDay(state: GameState): DaySummary {
  const t = state.today;
  updateEventProgress(state);
  updateWeeklyQuestProgress(state);
  let best: DaySummary['bestSeller'] = null;
  for (const [productId, qty] of Object.entries(t.sold)) if (!best || qty > best.qty) best = { productId, qty };
  // Hàng về muộn (đơn giao trong ngày) vẫn nhận trước khi đóng sổ.
  const outage = state.activeEvents.find((event) => event.id === 'power_outage');
  if (outage && Number(outage.params?.outageHours ?? 0) > 3) spoilFrozenStock(state);
  receiveDeliveries(state, state.day, DATA.balance.closeMinute);
  expireLots(state, state.day);
  const power = electricityCost(state);
  state.money -= power;
  t.electricity += power;
  // Lương cuối ngày cho người có ca; thiếu tiền thành nợ lương.
  const pay = payroll(state);
  state.morningNotes = updateMoods(state).map((n) => n.text);
  if (pay.debt > 0) state.morningNotes.push(`Còn nợ lương nhân viên ${formatMoney(pay.debt)}`);
  markBadDebts(state);
  const avg = t.ratingCount ? t.ratingSum / t.ratingCount : 0;
  state.lifetime.loveStreak = t.ratingCount && avg >= DATA.balance.loveStreakRating ? state.lifetime.loveStreak + 1 : 0;
  const achievements = checkAchievements(state).map((a) => a.id);
  const levelUps = applyLevelUps(state).map((l) => l.level);
  const summary: DaySummary = {
    day: state.day,
    revenue: t.revenue,
    cogs: t.cogs,
    grossProfit: t.revenue - t.cogs,
    tips: t.tips,
    overpaid: t.overpaid,
    served: t.served,
    happy: t.happy,
    left: t.left,
    avgRating: t.ratingCount ? t.ratingSum / t.ratingCount : 0,
    expGained: t.expGained,
    bestSeller: best,
    missed: Object.entries(t.missed)
      .map(([productId, qty]) => ({ productId, qty }))
      .sort((a, b) => b.qty - a.qty),
    levelUps,
    capReached: isAtCap(state) && state.exp >= nextCapExp(),
    spoiled: Object.entries(t.spoiled).map(([productId, qty]) => ({ productId, qty })).sort((a, b) => b.qty - a.qty),
    spoiledCost: t.spoiledCost,
    electricity: t.electricity,
    priceComplaints: Object.entries(t.priceComplaints).map(([productId, qty]) => ({ productId, qty })).sort((a, b) => b.qty - a.qty),
    debtCollectedAmount: t.debtCollectedAmount,
    debtGiven: t.debtGiven,
    badDebt: t.badDebt,
    netProfit: t.revenue - t.cogs + t.tips - t.overpaid + t.debtCollectedAmount - t.spoiledCost - t.electricity + t.questMoney
      - t.wages - t.bonuses - t.theftCost + t.fines + t.deliveryFees,
    achievements,
    wages: t.wages,
    wageDebt: state.wageDebt,
    bonuses: t.bonuses,
    theftCost: t.theftCost,
    fines: t.fines,
    deliveryFees: t.deliveryFees,
    staffLevelUps: [...t.staffLevelUps],
    journal: [...t.journal],
  };
  recordDay(state, summary);
  if (t.managerDay) {
    state.managerStats.push({ day: state.day, revenue: t.revenue, profit: summary.netProfit ?? 0, sold: { ...t.sold } });
    const keep = DATA.balance.offline.historyDays;
    if (state.managerStats.length > keep) state.managerStats.splice(0, state.managerStats.length - keep);
  }
  state.yesterdaySold = { ...t.sold };
  state.yesterdayMissed = { ...t.missed };
  state.yesterdayComplaints = { ...t.priceComplaints };
  state.phase = 'summary';
  state.lastSummary = summary;
  return summary;
}

/** Event goods sold add points; a saved claim key prevents duplicate seasonal prizes. */
function updateEventProgress(state: GameState): void {
  const year = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear }).year;
  for (const active of state.activeEvents) {
    const def = eventDefinition(active.id);
    const key = `${active.id}:${year}`;
    if (def?.rewardAt && def.rewardDecor) {
      const points = DATA.products.filter((item) => item.eventOnly === active.id)
        .reduce((sum, item) => sum + (state.today.sold[item.id] ?? 0), 0);
      state.eventProgress[key] = (state.eventProgress[key] ?? 0) + points;
      if (state.eventProgress[key] >= def.rewardAt && !state.eventRewards.includes(key)) {
        state.eventRewards.push(key);
        if (!state.decorOwned.includes(def.rewardDecor)) state.decorOwned.push(def.rewardDecor);
        state.today.journal.push({ m: DATA.balance.closeMinute, t: `Đạt mốc sự kiện ${def.name}: nhận ${def.rewardDecor}` });
      }
    }
    for (const quest of def?.quests ?? []) {
      const questKey = `quest:${quest.id}:${year}`;
      if (state.eventRewards.includes(questKey)) continue;
      const amount = quest.metric === 'soldEventItems'
        ? DATA.products.filter((item) => item.eventOnly === active.id).reduce((sum, item) => sum + (state.today.sold[item.id] ?? 0), 0)
        : quest.metric === 'soldProduct'
          ? (state.today.sold[quest.arg ?? ''] ?? 0)
          : quest.metric === 'soldProductList'
            ? (quest.arg ?? '').split(',').reduce((sum, id) => sum + (state.today.sold[id] ?? 0), 0)
            : quest.metric === 'soldCategory'
              ? DATA.products.filter((item) => item.category === quest.arg).reduce((sum, item) => sum + (state.today.sold[item.id] ?? 0), 0)
              : quest.metric === 'served' ? state.today.served : state.today.revenue;
      state.eventProgress[questKey] = (state.eventProgress[questKey] ?? 0) + amount;
      if (state.eventProgress[questKey] < quest.target) continue;
      state.eventRewards.push(questKey);
      state.money += quest.rewardMoney;
      state.today.questMoney += quest.rewardMoney;
      state.exp += quest.rewardExp;
      state.today.expGained += quest.rewardExp;
      state.today.journal.push({ m: DATA.balance.closeMinute, t: `Nhiệm vụ sự kiện \"${quest.text}\" hoàn thành: +${formatMoney(quest.rewardMoney)} và ${quest.rewardExp} EXP.` });
    }
  }
}

/** EXP cần cho level sau level tối đa (để hiện "Sắp ra mắt"). */
function nextCapExp(): number {
  const levels = DATA.levels.levels;
  const last = levels[levels.length - 1];
  const prev = levels[levels.length - 2] ?? { exp: 0 };
  return last.exp + Math.round((last.exp - prev.exp) * 1.6);
}

/** Sang ngày mới; trả về số tiền "Bà gửi" nếu người chơi bị kẹt vốn. */
export function startNextDay(state: GameState): number {
  claimAllDone(state);
  state.day++;
  const branchIncome = simulateBranches(state, state.day - 1);
  const arrivals = deliverBranchShipments(state, state.day);
  if (arrivals) state.morningNotes.push(`🚚 ${arrivals} chuyến xe hàng đã đến chi nhánh.`);
  for (const [id, amount] of Object.entries(branchIncome)) {
    const name = state.stores.find((store) => store.id === id)?.name ?? id;
    state.morningNotes.push(`${name} đóng góp ${formatMoney(amount)} từ ngày hôm qua.`);
  }
  state.phase = 'morning';
  state.clock = DATA.balance.openMinute;
  state.today = emptyStats();
  state.lastSummary = null;
  scheduleEvents(state);
  ensureDailyQuests(state);
  ensureWeeklyQuests(state);
  refreshPartyOrder(state);
  ensureScheduleReady(state);
  // Quy tắc đặt hàng tự động chạy mỗi buổi sáng.
  const restock = runRestockRules(state);
  state.morningNotes.push(...restock.messages);
  for (const text of restock.messages) state.today.journal.push({ m: DATA.balance.openMinute, t: text });
  return grandmaHelp(state);
}

export function isBroke(state: GameState): boolean {
  const cheapest = Math.min(...unlockedProducts(state.level, state).map((p) => p.cost));
  const hasStock =
    Object.values(warehouseTotals(state)).some((q) => q > 0) || state.shelves.some((row) => row.some((s) => s.qty > 0)) || state.deliveries.length > 0;
  return state.money < cheapest && !hasStock;
}

/** "Bà gửi tiền": chống kẹt vốn, tối đa một lần mỗi 3 ngày. */
export function grandmaHelp(state: GameState): number {
  const b = DATA.balance;
  if (!isBroke(state) || state.day - state.lastGrandmaDay < b.grandmaCooldownDays) return 0;
  state.money += b.grandmaGift;
  state.lastGrandmaDay = state.day;
  return b.grandmaGift;
}

export function openShop(state: GameState): void {
  // Giữ tổn thất đã ghi buổi sáng (bỏ lô hàng) khi bắt đầu ngày bán.
  const morning = state.today;
  state.phase = 'open';
  state.clock = DATA.balance.openMinute;
  state.today = emptyStats();
  state.today.spoiled = morning.spoiled ?? {};
  state.today.spoiledCost = morning.spoiledCost ?? 0;
  // Buổi sáng: thưởng, trợ cấp sa thải và nhật ký tự nhập hàng vẫn tính cho ngày này.
  state.today.bonuses = morning.bonuses ?? 0;
  state.today.wages = morning.wages ?? 0;
  state.today.journal = [...(morning.journal ?? [])];
  state.today.managerDay = state.manager.enabled && hasFeature(state.level, 'manager');
  ensureDailyQuests(state);
  stockerMorning(state);
}

/** Nhân viên kho có ca sáng: cất hàng chờ và bày kệ theo sơ đồ trước giờ mở cửa. */
export function stockerMorning(state: GameState): number {
  const stocker = state.staff.find((s) => s.role === 'stocker' && !s.quitting && worksShift(state, s.id, state.day, 0));
  if (!stocker) return 0;
  stowHolding(state);
  const placed = state.planogram ? applyPlanogram(state) : 0;
  if (placed > 0) state.today.journal.push({ m: DATA.balance.openMinute, t: `${stocker.name} bày ${placed} món lên kệ theo sơ đồ` });
  return placed;
}

/** Bật/tắt "Để nhân viên lo" (từ level 20, chỉ đổi ở buổi sáng). */
export function setManagerMode(state: GameState, on: boolean): boolean {
  if (on && !hasFeature(state.level, 'manager')) return false;
  if (state.phase !== 'morning') return false;
  state.manager.enabled = on;
  return true;
}

export function setManagerSpeed(state: GameState, speed: number): void {
  if (DATA.balance.manager.speeds.includes(speed)) state.manager.speed = speed;
}
