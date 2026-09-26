import { computeTip, customerPayment, judgeChange, type ChangeResult } from './change';
import { createCustomer, meanSpawnSeconds, orderTotal, ratingFor, type Customer, type OrderLine } from './customers';
import { DATA, product, type Category } from './data';
import { attractionMultiplier, hasCat } from './decor';
import { Emitter } from './events';
import { counterFixture, maxQueueFor, walkTiles, walkableGrid } from './layout';
import { canGiveCredit, collectDebt, markBadDebts, recordDebt, repaymentsToday } from './ledger';
import { cheapSpawnMultiplier, keepChance } from './pricing';
import { applyLevelUps, averageRating, isAtCap, ratingSpawnMultiplier, recordRating } from './progression';
import { checkAchievements, claimAllDone, ensureDailyQuests } from './quests';
import { Rng, daySeed } from './rng';
import {
  emptyStats, fixtureOfShelf, shelfKind, unlockedProducts, usableShelves, warehouseTotals,
  type DaySummary, type GameState,
} from './state';
import {
  canRefill, electricityCost, expireLots, putIntoSlot, receiveDeliveries, refillSlot, slotUnitPrice, takeOneFromSlot, zoneOf,
  type DeliveryResult,
} from './stock';

export type LeaveReason = 'served' | 'patience' | 'nothing';
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

  private rng: Rng;
  private nextSpawnIn = 1.2;
  private nextId = 1;
  private refills: Refill[] = [];
  private zoneRefills: ZoneRefill[] = [];
  private acc = 0;

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
    };
  }

  get front(): Customer | undefined { return this.queue[0]; }
  get customers(): Customer[] { return [...this.shoppers, ...this.entrants, ...this.ready, ...this.queue]; }

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
    if (!this.closed) {
      this.state.clock = Math.min(b.closeMinute, this.state.clock + dt * DaySession.minutesPerSecond());
      if (this.state.clock >= b.closeMinute) {
        this.closed = true;
        this.events.emit('closing', undefined);
      }
    }
    if (!this.closed) {
      this.nextSpawnIn -= dt;
      if (this.nextSpawnIn <= 0) {
        if (this.shoppers.length + this.entrants.length + this.ready.length + this.queue.length < b.maxShoppers + this.maxQueue()) {
          this.spawn();
          const mul = ratingSpawnMultiplier(averageRating(this.state)) * attractionMultiplier(this.state) * cheapSpawnMultiplier(this.state);
          const mean = meanSpawnSeconds(this.state.clock, mul, this.state.day);
          this.nextSpawnIn = Math.max(1, this.rng.exponential(mean));
        } else this.nextSpawnIn = 0.5;
      }
    }

    for (const r of [...this.refills]) {
      r.left -= dt;
      if (r.left <= 0) {
        this.refills.splice(this.refills.indexOf(r), 1);
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

    const waiting = [...this.queue, ...this.ready].filter((c) => c.status === 'waiting' || c.status === 'scanning' || c.status === 'paying' || c.status === 'bargain' || c.status === 'credit');
    const cat = hasCat(this.state);
    for (const c of waiting) {
      const rate = c === this.front ? 1 : b.queuePatienceRate;
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

    if (this.closed && this.customers.length === 0 && !this.ended) {
      this.ended = true;
      this.events.emit('dayEnded', undefined);
    }
  }

  private maxQueue(): number {
    return maxQueueFor(this.state);
  }

  private spawn(): void {
    const c = createCustomer(this.nextId++, this.state.level, this.rng, this.state);
    if (c.name) this.state.regulars[c.name] = (this.state.regulars[c.name] ?? 0) + 1;
    this.entrants.push(c);
    this.events.emit('customerArrived', c);
    this.admitShoppers();
  }

  private admitShoppers(): void {
    while (this.shoppers.length < DATA.balance.maxShoppers && this.entrants.length) {
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
    if (this.queue.length >= this.maxQueue()) return;
    this.removeFrom(this.shoppers, c);
    c.at = counterFixture(this.state)?.uid ?? null;
    c.status = 'waiting';
    this.queue.push(c);
    this.events.emit('basketReady', c);
  }

  private admitReady(): void {
    while (this.queue.length < this.maxQueue() && this.ready.length) {
      const c = this.ready.shift()!;
      if (c.status === 'done') continue;
      this.queue.push(c);
      this.events.emit('basketReady', c);
    }
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

  isRefilling(shelf: number, slot: number): number | null {
    const r = this.refills.find((x) => x.shelf === shelf && x.slot === slot);
    return r ? 1 - r.left / DATA.balance.refillSeconds : null;
  }

  startRefill(shelf: number, slot: number): boolean {
    if (this.isRefilling(shelf, slot) !== null || !canRefill(this.state, shelf, slot)) return false;
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

  private tipFor(c: Customer, auto: boolean): number {
    const automatic = auto || c.autoScanned;
    const ordinary = computeTip({ elapsedSec: this.elapsed - c.changeStartedAt, undos: c.undos, shortAttempts: c.shortAttempts, tipMul: c.type.tipMul, auto: automatic }, this.rng);
    return ordinary + (c.comboTipEligible && !automatic && c.shortAttempts === 0 && c.undos === 0 ? DATA.balance.scanTipBonus : 0);
  }

  private completeSale(c: Customer, tip: number, lost: number, credit = false): void {
    const b = DATA.balance;
    const t = this.state.today;
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
    this.state.exp += exp;
    t.expGained += exp;
    this.finish(c, 'served', stars);
    this.events.emit('sale', { customer: c, amount: c.total, tip });
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
        const returned = Math.min(origin.qty, remaining, DATA.balance.slotCapacity - slot.qty);
        for (let i = 0; i < returned; i++) putIntoSlot(slot, 1, nextExp());
        remaining -= returned;
        if (!remaining) break;
      }
      if (remaining > 0) {
        const p = product(line.productId);
        for (const shelf of usableShelves(this.state)) {
          if (remaining <= 0) break;
          if (zoneOf(this.state, shelf) !== p.category) continue;
          const slot = this.state.shelves[shelf].find((item) => item.productId === p.id && item.qty < DATA.balance.slotCapacity);
          if (!slot) continue;
          const returned = Math.min(remaining, DATA.balance.slotCapacity - slot.qty);
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
}

/** Kết thúc ngày: tính tổng kết, áp dụng lên level, chuyển sang pha tổng kết. */
export function endDay(state: GameState): DaySummary {
  const t = state.today;
  let best: DaySummary['bestSeller'] = null;
  for (const [productId, qty] of Object.entries(t.sold)) if (!best || qty > best.qty) best = { productId, qty };
  // Hàng về muộn (đơn giao trong ngày) vẫn nhận trước khi đóng sổ.
  receiveDeliveries(state, state.day, DATA.balance.closeMinute);
  expireLots(state, state.day);
  const power = electricityCost(state);
  state.money -= power;
  t.electricity += power;
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
    netProfit: t.revenue - t.cogs + t.tips - t.overpaid + t.debtCollectedAmount - t.spoiledCost - t.electricity + t.questMoney,
    achievements,
  };
  state.yesterdaySold = { ...t.sold };
  state.yesterdayMissed = { ...t.missed };
  state.yesterdayComplaints = { ...t.priceComplaints };
  state.phase = 'summary';
  state.lastSummary = summary;
  return summary;
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
  state.phase = 'morning';
  state.clock = DATA.balance.openMinute;
  state.today = emptyStats();
  state.lastSummary = null;
  ensureDailyQuests(state);
  return grandmaHelp(state);
}

export function isBroke(state: GameState): boolean {
  const cheapest = Math.min(...unlockedProducts(state.level).map((p) => p.cost));
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
  ensureDailyQuests(state);
}
