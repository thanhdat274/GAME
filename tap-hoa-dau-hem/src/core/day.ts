import { computeTip, customerPayment, judgeChange, type ChangeResult } from './change';
import { createCustomer, meanSpawnSeconds, orderComplete, orderTotal, ratingFor, type Customer } from './customers';
import { DATA, product } from './data';
import { Emitter } from './events';
import { applyLevelUps, averageRating, isAtCap, ratingSpawnMultiplier, recordRating } from './progression';
import { Rng, daySeed } from './rng';
import { emptyStats, shelfCount, unlockedProducts, type DaySummary, type GameState } from './state';
import { canRefill, refillSlot } from './stock';

export type LeaveReason = 'served' | 'patience' | 'nothing';
export type PickResult = 'ok' | 'wrong' | 'empty' | 'busy' | 'none';

export interface DayEvents {
  customerArrived: Customer;
  customerFront: Customer;
  customerLeft: { customer: Customer; reason: LeaveReason; stars: number };
  picked: { customer: Customer; productId: string; shelf: number; slot: number };
  wrongPick: { customer: Customer; shelf: number; slot: number };
  paymentStarted: Customer;
  trayChanged: number[];
  changeResult: { customer: Customer; result: ChangeResult; given: number; tip: number; lost: number; auto: boolean };
  sale: { customer: Customer; amount: number; tip: number };
  refillStarted: { shelf: number; slot: number };
  refillDone: { shelf: number; slot: number; qty: number };
  closing: void;
  dayEnded: void;
}

interface Refill {
  shelf: number;
  slot: number;
  left: number;
}

/**
 * Một ngày mở cửa bán hàng. Chạy theo tick cố định, không phụ thuộc Phaser:
 * scene gọi các hàm hành động (pick, checkout, addBill...) và nghe sự kiện để vẽ.
 */
export class DaySession {
  readonly events = new Emitter<DayEvents>();
  readonly queue: Customer[] = [];
  tray: number[] = [];
  paused = false;
  closed = false;
  ended = false;
  /** Giây thật đã trôi qua trong phiên (dùng đo tốc độ thối tiền). */
  elapsed = 0;

  private rng: Rng;
  private nextSpawnIn: number;
  private nextId = 1;
  private refills: Refill[] = [];
  private acc = 0;

  constructor(readonly state: GameState, seed?: number) {
    this.rng = new Rng(seed ?? daySeed(state.day, Math.floor(state.clock)));
    this.nextSpawnIn = 1.2;
    this.closed = state.clock >= DATA.balance.closeMinute;
  }

  get front(): Customer | undefined {
    return this.queue[0];
  }

  /** Phút game trôi qua cho mỗi giây thật. */
  static minutesPerSecond(): number {
    const b = DATA.balance;
    return (b.closeMinute - b.openMinute) / b.daySeconds;
  }

  /** Cập nhật theo thời gian thật; bên trong chạy tick cố định `tickMs`. */
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
        if (this.queue.length < b.maxQueue) {
          this.spawn();
          const mean = meanSpawnSeconds(this.state.clock, ratingSpawnMultiplier(averageRating(this.state)), this.state.day);
          this.nextSpawnIn = Math.max(1, this.rng.exponential(mean));
        } else {
          this.nextSpawnIn = 0.5;
        }
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

    for (const [i, c] of [...this.queue].entries()) {
      c.patience -= dt * (i === 0 ? 1 : b.queuePatienceRate);
      if (c.patience <= 0) {
        c.patience = 0;
        this.leave(c, 'patience');
      }
    }

    this.promoteFront();

    if (this.closed && this.queue.length === 0 && !this.ended) {
      this.ended = true;
      this.events.emit('dayEnded', undefined);
    }
  }

  private spawn(): void {
    const c = createCustomer(this.nextId++, this.state.level, this.rng);
    this.queue.push(c);
    this.events.emit('customerArrived', c);
  }

  private promoteFront(): void {
    const c = this.front;
    if (!c || c.status !== 'queue') return;
    c.status = 'picking';
    const anyOnShelf = c.order.some((l) => this.availableOnShelf(l.productId) > 0);
    if (!anyOnShelf) {
      this.recordMissed(c);
      this.leave(c, 'nothing');
      return;
    }
    this.events.emit('customerFront', c);
  }

  private availableOnShelf(productId: string): number {
    let n = 0;
    this.state.shelves.slice(0, shelfCount(this.state.level)).forEach((row) =>
      row.forEach((s) => {
        if (s.productId === productId) n += s.qty;
      }),
    );
    return n;
  }

  /** Ghi nhận phần khách muốn mua nhưng kệ đã hết (để gợi ý nhập hàng hôm sau). */
  private recordMissed(c: Customer): void {
    const missed = this.state.today.missed;
    for (const l of c.order) {
      const lack = l.qty - l.picked;
      if (lack > 0 && this.availableOnShelf(l.productId) === 0) missed[l.productId] = (missed[l.productId] ?? 0) + lack;
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

  /** Người chơi chạm một ô kệ để lấy hàng cho khách đang phục vụ. */
  pick(shelf: number, slot: number): PickResult {
    const c = this.front;
    if (!c || c.status !== 'picking') return 'none';
    if (shelf >= shelfCount(this.state.level)) return 'none';
    if (this.isRefilling(shelf, slot) !== null) return 'busy';
    const s = this.state.shelves[shelf][slot];
    if (!s.productId || s.qty <= 0) return 'empty';
    const line = c.order.find((l) => l.productId === s.productId && l.picked < l.qty);
    if (!line) {
      c.patience = Math.max(0.1, c.patience - DATA.balance.wrongPickPenalty);
      this.events.emit('wrongPick', { customer: c, shelf, slot });
      return 'wrong';
    }
    s.qty--;
    line.picked++;
    this.events.emit('picked', { customer: c, productId: s.productId, shelf, slot });
    if (orderComplete(c)) this.checkout();
    return 'ok';
  }

  /** Bấm "Tính tiền" (hoặc tự động khi lấy đủ hàng). */
  checkout(): void {
    const c = this.front;
    if (!c || c.status !== 'picking') return;
    const total = orderTotal(c);
    if (total === 0) {
      this.recordMissed(c);
      this.leave(c, 'nothing');
      return;
    }
    if (!orderComplete(c)) {
      c.penalty += 1;
      this.recordMissed(c);
    }
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

  trayTotal(): number {
    return this.tray.reduce((a, b) => a + b, 0);
  }

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

  /** Bấm "Đưa" để thối tiền. */
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

  /** Tự thối đúng số tiền (chế độ tự động hoặc nút "Tự tính"), không có tip. */
  autoChange(): boolean {
    const c = this.front;
    if (!c || c.status !== 'paying') return false;
    this.events.emit('changeResult', { customer: c, result: 'exact', given: c.changeDue, tip: 0, lost: 0, auto: true });
    this.completeSale(c, 0, 0);
    return true;
  }

  private tipFor(c: Customer, auto: boolean): number {
    return computeTip(
      {
        elapsedSec: this.elapsed - c.changeStartedAt,
        undos: c.undos,
        shortAttempts: c.shortAttempts,
        tipMul: c.type.tipMul,
        auto,
      },
      this.rng,
    );
  }

  private completeSale(c: Customer, tip: number, lost: number): void {
    const b = DATA.balance;
    const st = this.state;
    const t = st.today;
    let items = 0;
    for (const l of c.order) {
      if (l.picked <= 0) continue;
      items += l.picked;
      t.cogs += product(l.productId).cost * l.picked;
      t.sold[l.productId] = (t.sold[l.productId] ?? 0) + l.picked;
    }
    st.money += c.total + tip - lost;
    t.revenue += c.total;
    t.tips += tip;
    t.overpaid += lost;
    t.served++;
    const stars = ratingFor(c);
    let exp = items * b.expPerItem;
    if (stars >= 3) {
      t.happy++;
      exp += b.expPerHappy;
    }
    st.exp += exp;
    t.expGained += exp;
    this.finish(c, 'served', stars);
    this.events.emit('sale', { customer: c, amount: c.total, tip });
  }

  private leave(c: Customer, reason: Exclude<LeaveReason, 'served'>): void {
    // Hàng khách đã cầm trả lại kho.
    for (const l of c.order) {
      if (l.picked > 0) this.state.warehouse[l.productId] = (this.state.warehouse[l.productId] ?? 0) + l.picked;
      l.picked = 0;
    }
    this.state.today.left++;
    this.finish(c, reason, 1);
  }

  private finish(c: Customer, reason: LeaveReason, stars: number): void {
    c.status = 'done';
    recordRating(this.state, stars);
    this.state.today.ratingSum += stars;
    this.state.today.ratingCount++;
    const i = this.queue.indexOf(c);
    if (i >= 0) this.queue.splice(i, 1);
    if (i === 0) this.tray = [];
    this.events.emit('customerLeft', { customer: c, reason, stars });
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
