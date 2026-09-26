import { computeTip, customerPayment, judgeChange, type ChangeResult } from './change';
import { createCustomer, meanSpawnSeconds, orderTotal, ratingFor, type Customer, type OrderLine } from './customers';
import { DATA, product, type Category } from './data';
import { Emitter } from './events';
import { applyLevelUps, averageRating, isAtCap, ratingSpawnMultiplier, recordRating } from './progression';
import { Rng, daySeed } from './rng';
import { emptyStats, shelfCount, unlockedProducts, type DaySummary, type GameState } from './state';
import { canRefill, refillSlot, zoneOf } from './stock';

export type LeaveReason = 'served' | 'patience' | 'nothing';
export type CounterResult = 'ok' | 'wrong' | 'empty' | 'none';

export interface DayEvents {
  customerArrived: Customer;
  customerBrowse: { customer: Customer; zone: Category };
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
        if (this.shoppers.length + this.entrants.length + this.ready.length + this.queue.length < b.maxShoppers + b.maxQueue) {
          this.spawn();
          const mean = meanSpawnSeconds(this.state.clock, ratingSpawnMultiplier(averageRating(this.state)), this.state.day);
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
    this.admitShoppers();
    for (const c of [...this.shoppers]) this.tickBrowse(c, dt);
    this.admitShoppers();
    this.admitReady();

    const waiting = [...this.queue, ...this.ready].filter((c) => c.status === 'waiting' || c.status === 'scanning' || c.status === 'paying');
    for (const c of waiting) {
      const rate = c === this.front ? 1 : b.queuePatienceRate;
      c.patience -= dt * rate;
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

  private spawn(): void {
    const c = createCustomer(this.nextId++, this.state.level, this.rng);
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
      c.browseTimer = DATA.balance.zoneWalkSeconds;
      c.browsePicking = false;
      const first = c.order.find((line) => !line.counterLine);
      if (first) this.events.emit('customerBrowse', { customer: c, zone: product(first.productId).category });
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
    if (next) {
      c.browseTimer = DATA.balance.zoneWalkSeconds;
      this.events.emit('customerBrowse', { customer: c, zone: product(next.productId).category });
    } else this.finishBrowsing(c);
  }

  private takeFromShelf(c: Customer, line: OrderLine): void {
    const p = product(line.productId);
    const zone = p.category;
    let source: { shelf: number; slot: number } | null = null;
    for (let r = 0; r < shelfCount(this.state.level) && !source; r++) {
      if (zoneOf(this.state, r) !== zone) continue;
      const row = this.state.shelves[r];
      const col = row.findIndex((slot) => slot.productId === p.id && slot.qty > 0);
      if (col >= 0) source = { shelf: r, slot: col };
    }
    if (!source) {
      line.missing++;
      c.basketMissing++;
      if (c.penalty < 1) c.penalty++;
      this.state.today.missed[p.id] = (this.state.today.missed[p.id] ?? 0) + 1;
      this.events.emit('itemMissing', { customer: c, productId: p.id });
      return;
    }
    const slot = this.state.shelves[source.shelf][source.slot];
    slot.qty--;
    line.picked++;
    line.pickedFrom ??= [];
    const recorded = line.pickedFrom.find((item) => item.shelf === source!.shelf && item.slot === source!.slot);
    if (recorded) recorded.qty++;
    else line.pickedFrom.push({ ...source, qty: 1 });
    this.events.emit('itemTaken', { customer: c, productId: p.id, ...source });
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
    if (this.queue.length >= DATA.balance.maxQueue) return;
    this.removeFrom(this.shoppers, c);
    c.status = 'waiting';
    this.queue.push(c);
    this.events.emit('basketReady', c);
  }

  private admitReady(): void {
    while (this.queue.length < DATA.balance.maxQueue && this.ready.length) {
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
    for (let shelf = 0; shelf < shelfCount(this.state.level); shelf++) {
      if (zoneOf(this.state, shelf) !== zone) continue;
      this.state.shelves[shelf].forEach((slot, index) => {
        if (slot.productId && slot.qty < DATA.balance.slotCapacity && (this.state.warehouse[slot.productId] ?? 0) > 0) slots.push({ shelf, slot: index });
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
    const total = orderTotal(c);
    if (total <= 0) {
      this.leave(c, 'nothing');
      return;
    }
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

  private completeSale(c: Customer, tip: number, lost: number): void {
    const b = DATA.balance;
    const t = this.state.today;
    let items = 0;
    for (const line of c.order) {
      if (line.scanned <= 0) continue;
      items += line.scanned;
      t.cogs += product(line.productId).cost * line.scanned;
      t.sold[line.productId] = (t.sold[line.productId] ?? 0) + line.scanned;
    }
    this.state.money += c.total + tip - lost;
    t.revenue += c.total;
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
      for (const origin of line.pickedFrom ?? []) {
        const slot = this.state.shelves[origin.shelf]?.[origin.slot];
        if (!slot || slot.productId !== line.productId) continue;
        const returned = Math.min(origin.qty, remaining, DATA.balance.slotCapacity - slot.qty);
        slot.qty += returned;
        remaining -= returned;
        if (!remaining) break;
      }
      if (remaining > 0) {
        const p = product(line.productId);
        for (let shelf = 0; shelf < shelfCount(this.state.level) && remaining > 0; shelf++) {
          if (zoneOf(this.state, shelf) !== p.category) continue;
          const slot = this.state.shelves[shelf].find((item) => item.productId === p.id && item.qty < DATA.balance.slotCapacity);
          if (!slot) continue;
          const returned = Math.min(remaining, DATA.balance.slotCapacity - slot.qty);
          slot.qty += returned;
          remaining -= returned;
        }
      }
    }
    if (remaining > 0) this.state.warehouse[line.productId] = (this.state.warehouse[line.productId] ?? 0) + remaining;
    line.picked = 0;
    line.scanned = 0;
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
  };
  state.yesterdaySold = { ...t.sold };
  state.yesterdayMissed = { ...t.missed };
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
  state.day++;
  state.phase = 'morning';
  state.clock = DATA.balance.openMinute;
  state.today = emptyStats();
  state.lastSummary = null;
  return grandmaHelp(state);
}

export function isBroke(state: GameState): boolean {
  const cheapest = Math.min(...unlockedProducts(state.level).map((p) => p.cost));
  const hasStock =
    Object.values(state.warehouse).some((q) => q > 0) || state.shelves.some((row) => row.some((s) => s.qty > 0));
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
  state.phase = 'open';
  state.clock = DATA.balance.openMinute;
  state.today = emptyStats();
}
