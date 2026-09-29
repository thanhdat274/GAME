import { computeTip, customerPayment, judgeChange, type ChangeResult } from './change';
import { BASE_VARIANT, addCup, brewedCupPrice, cupPrice, isCustomRecipe, isMadeToOrder, pickServed, removeCupRecord, slotMatch, staffBrewQuality } from './customCups';
import { askable, createCustomer, meanSpawnSeconds, orderTotal, ratingFor, shopDensityAt, type Customer, type OrderLine, type PaymentMethod } from './customers';
import { recordDay } from './analytics';
import { applyPlanogram, planogramProduct, runRestockRules } from './autorestock';
import { DATA, hasFeature, product, recipeByOutput, recipeById, type Category, type RecipeDef } from './data';
import { attractionMultiplier, hasCat } from './decor';
import { createPhoneOrder, deliveryUnlocked, orderShortfall, orderUnits, reserveItems, tripSeconds, type PhoneOrder } from './delivery';
import { Emitter } from './events';
import { EffectStack } from './effects';
import { eventDefinition, scheduleEvents } from './eventScheduler';
import { calendarDate } from './calendar';
import { deliverBranchShipments, simulateBranches } from './branches';
import { prestigeRevenueMultiplier } from './prestige';
import { brewCup, checkBrew, makeServing, missingIngredients, prepareRecipe } from './recipes';
import { cleanDiningTable, seatDiner, serveDiningAddOns, serveExtraDiningOrder, tickDining } from './dining';
import { activeShopType } from './shopTypes';
import { cookedPortions, discardSpoiledSoaks, soakStatus, spoilRiceEndOfDay, startSoak, steamBatch, suggestSoakKg } from './stickyRice';
import { fillOrder, orderRemaining, pendingOrdersFrom, runInternalSupplyMorning } from './internalSupply';
import { counterFixture, counterFixtures, maxQueueFor, maxShoppersFor, walkTiles, walkableGrid } from './layout';
import { canGiveCredit, collectDebt, markBadDebts, recordDebt, repaymentsToday } from './ledger';
import { cheapSpawnMultiplier, keepChance } from './pricing';
import { addPlayerExperience, applyLevelUps, averageRating, isAtCap, ratingSpawnMultiplier, recordRating, saleExpMultiplier, trafficMultiplier } from './progression';
import { checkAchievements, claimAllDone, ensureDailyQuests } from './quests';
import { ensureWeeklyQuests, updateWeeklyQuestProgress } from './weeklyQuests';
import { refreshPartyOrder } from './partyOrders';
import { maybeCustomerReview, maybeDeliveryReview, type Review } from './reviews';
import { Rng, daySeed } from './rng';
import { ensureScheduleReady, shiftAt, worksShift } from './schedule';
import {
  addStaffExp, errorChance, friendlyStarChance, friendlyTipMul, payroll, tiredAfterMinutes, timeFactor, updateMoods,
} from './staff';
import {
  emptyStats, fixtureOfShelf, formatMoney, priceOf, shelfKind, unlockedProducts, usableShelves, warehouseQty, warehouseTotals, type Slot,
  type DaySummary, type GameState, type JournalEntry, type Staff, type StaffDayPerf,
  type DiningTableState,
  formatClock,
} from './state';
import {
  assignSlot, canRefill, electricityCost, refillCounterSlot, expireLots, putIntoSlot, receiveDeliveries, refillSlot, shelfCapacity, slotUnitPrice, stowHolding,
  findSlotWith, takeLots, takeOneFromSlot, zoneOf, type DeliveryResult,
  spoilFrozenStock,
} from './stock';
import { maintenancePatienceRate, maintenanceTrafficMul, wearOvernight } from './maintenance';
import { callsPolice, nightBurglary, resolvePoliceCases } from './security';
import { PLAYER, ROLE_TASKS, TaskQueue, type Task } from './tasks';
import { endDayTax, recordTaxableRevenue, taxKindOfProduct, taxReminders, updateTax } from './tax';

/** 'closed' = tiệm đóng cửa sớm, khách chưa lấy gì được mời về (không chấm sao). */
export type LeaveReason = 'served' | 'patience' | 'nothing' | 'thief' | 'closed';

/** Quầy do nhân viên thu ngân đứng (quầy của người chơi là `DaySession.queue`). */
export interface Lane {
  id: number;
  staffId: string;
  queue: Customer[];
  job: { customerId: number; phase: 'ask' | 'scan' | 'change'; left: number } | null;
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

export type IncidentKind = 'thief' | 'complaint' | 'outOfStock' | 'noCashier' | 'counterfeit';

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
  /** Khách vừa để lại đánh giá. */
  review: Review;
  itemTaken: { customer: Customer; productId: string; shelf: number; slot: number };
  itemMissing: { customer: Customer; productId: string };
  /** Khách tới quầy hỏi món hết trên kệ; người đứng quầy bắt đầu kiểm kho. */
  stockAsking: Customer;
  /** Khách ra quầy hỏi món hết trên kệ: `found` = số lấy được từ kho (đã bày thêm lên kệ), `missing` = số thật sự hết. */
  stockAsked: { customer: Customer; productId: string; found: number; missing: number; restocked: number };
  basketReady: Customer;
  itemScanned: { customer: Customer; productId: string; scanned: number; remaining: number };
  counterRequested: { customer: Customer; productId: string; seconds: number; variantId?: string };
  counterServed: { customer: Customer; productId: string; slot: number };
  counterWrong: { customer: Customer; slot: number };
  /** Ly trà tùy biến đã đưa: loại khách gọi, loại đưa và mức khớp (exact/better/worse). */
  counterVariant: { customer: Customer; productId: string; wanted: string; served: string; fit: 'exact' | 'better' | 'worse' };
  counterExpired: { customer: Customer; productId: string };
  /** Pha ngay theo đơn: bắt đầu, xong (khách nhận ly) hoặc hủy (khách rời trước khi xong). */
  brewStarted: { customer: Customer; productId: string; variantId?: string; seconds: number };
  brewDone: { customer: Customer; productId: string; quality?: number; by?: string | null };
  brewCancelled: { customer: Customer; productId: string };
  paymentStarted: Customer;
  trayChanged: number[];
  changeResult: { customer: Customer; result: ChangeResult; given: number; tip: number; lost: number; auto: boolean };
  sale: { customer: Customer; amount: number; tip: number };
  invoice: { customer: Customer; issued: boolean };
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
  /** Khách chen lên hàng quầy `lane` (0 = quầy người chơi). */
  queueCut: { customer: Customer; lane: number };
  /** Người đứng quầy (`by` = id nhân viên hoặc 'player') nhắc khách chen hàng ra sau xếp hàng. */
  queueScold: { customer: Customer; lane: number; by: string };
  /** Khách phá phách trong tiệm; `by` = người nhắc nhở (id nhân viên / 'player'), `guard` = bảo vệ xử lý kịp. */
  rowdy: { customer: Customer; by: string; guard: boolean };
  /**
   * Khách trả bằng tiền giả và người đứng quầy (`by`) phát hiện: 'police' = báo công an, người dùng tiền giả bị đưa đi;
   * 'repaid' = trả lại tờ giả, khách đổi tờ thật; 'left' = trả lại tờ giả, khách bỏ đi.
   */
  counterfeit: { customer: Customer; by: string; bill: number; action: 'police' | 'repaid' | 'left' };
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
  playerAtCounter?: boolean;
  counters?: { nextOrderId: number; nextIncidentId: number; nextLaneId: number; taskAcc: number; missedAlerted: string[]; nextTicket?: number };
  /** RNG riêng cho hành vi khách (chen hàng, phá phách) để không làm lệch mô phỏng chính. */
  socialRngState?: number;
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
  /**
   * Góc nhìn trên xuống: người chơi phải đứng ở quầy mới quét giỏ / tính tiền được.
   * Khi rời quầy, khách đầu hàng đứng chờ (vẫn mất kiên nhẫn) cho tới khi người chơi quay lại.
   */
  playerAtCounter = true;
  /** Tự phục vụ quầy người chơi (bỏ qua ngày, mô phỏng): quét, thối tiền tự động. */
  autoPlayer = false;
  /** Giây giữa hai thao tác của người chơi tự động (0 = tức thì). */
  autoPlayerReact = 0;
  /** Người chơi tự động nạp kệ lúc quầy rảnh (chơi hộ khi người chơi rảnh tay; "Bỏ qua ngày" không bật). */
  autoRefill = false;
  private autoCooldown = 0;
  /** Mẻ đang pha ngay cho khách đầu hàng (chỉ một mẻ một lúc); không lưu vào bản lưu. */
  private brew: { customerId: number; customer: Customer; line: OrderLine; variant: string; quality: number; total: number; left: number } | null = null;
  /** Mẻ pha chế viên đang pha (theo mã nhân viên), có thể cho khách đang xếp hàng; không lưu vào bản lưu. */
  private staffBrews = new Map<string, { customerId: number; line: OrderLine; variant: string; quality: number; total: number }>();
  /** Ly đã pha xong cho khách chưa tới lượt (theo mã khách); khách rời đi thì ly bỏ. */
  private prebrewed = new Map<number, { variant: string; quality: number }>();

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
  /** Số thứ tự phát cho khách khi ra quầy (ai tới trước tính tiền trước). */
  private nextTicket = 1;
  private social: Rng;

  constructor(readonly state: GameState, seed?: number) {
    this.rng = new Rng(seed ?? daySeed(state.day, Math.floor(state.clock)));
    this.social = new Rng(((seed ?? daySeed(state.day, Math.floor(state.clock))) ^ 0x5ce1a) >>> 0);
    this.closed = state.clock >= DATA.balance.closeMinute || state.today.closedEarlyAt !== undefined;
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
    session.playerAtCounter = snapshot.playerAtCounter ?? true;
    if (snapshot.counters) {
      session.nextOrderId = snapshot.counters.nextOrderId;
      session.nextIncidentId = snapshot.counters.nextIncidentId;
      session.nextLaneId = snapshot.counters.nextLaneId;
      session.taskAcc = snapshot.counters.taskAcc;
      session.missedAlerted = new Set(snapshot.counters.missedAlerted);
      session.nextTicket = snapshot.counters.nextTicket ?? 1;
    }
    if (snapshot.socialRngState !== undefined) session.social = Rng.restore(snapshot.socialRngState);
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
      playerAtCounter: this.playerAtCounter,
      counters: {
        nextOrderId: this.nextOrderId, nextIncidentId: this.nextIncidentId, nextLaneId: this.nextLaneId,
        taskAcc: this.taskAcc, missedAlerted: [...this.missedAlerted], nextTicket: this.nextTicket,
      },
      socialRngState: this.social.snapshot(),
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
            * trafficMultiplier(this.state.level) * maintenanceTrafficMul(this.state);
          const effects = EffectStack.forDay(this.state.day, this.state.calendarStartMonth, this.state.calendarStartYear, this.state.activeEvents);
          const mean = meanSpawnSeconds(this.state.clock, mul, this.state.day, effects.multiply('trafficMul'), shopDensityAt(this.state, this.state.clock));
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
    const heat = maintenancePatienceRate(this.state);
    for (const c of waiting) {
      // Sau khi đóng cửa, khách nhân viên đang tính tiền được phục vụ nốt, không bị đuổi giữa giao dịch.
      // Khách chờ người chơi thì vẫn hết kiên nhẫn, để ngày kết thúc được khi không ai đứng quầy.
      if (this.closed && this.lanes.some((lane) => lane.job?.customerId === c.id)) continue;
      let rate = c === this.front || this.lanes.some((l) => l.queue[0] === c) ? 1 : b.queuePatienceRate;
      // Khách thấy chủ tiệm đang bận nạp kệ thì chờ thong thả hơn.
      if (!this.playerAtCounter && !this.autoPlayer && c.lane === 0) rate *= b.topDown.awayPatienceRate;
      rate *= heat;
      // Khách đang được pha ly theo đơn chờ thong thả hơn.
      if (this.isBrewingFor(c.id)) rate *= b.madeToOrder.brewPatienceRate;
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
    this.tickQueueCutters(dt);
    const c = this.front;
    if (c?.status === 'scanning') this.tickCounterRequest(c, dt);
    this.tickBrew(dt);
    if (c?.status === 'waiting' && c.askLeft && c.askLeft > 0 && (this.playerAtCounter || this.autoPlayer)) c.askLeft = Math.max(0, c.askLeft - dt);
    this.promoteFront();
    this.tickLanes(dt);
    this.balanceCheckoutQueues();
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
    // Tiệm chỉ bán ở quầy mà chưa mở bán món nào: không có khách ghé.
    if (!c.order.length) return;
    if (hasFeature(this.state.level, 'thief') && this.rng.next() < DATA.balance.security.thiefChance) {
      c.thief = true;
      delete c.name;
      delete c.look;
      c.order = c.order.filter((line) => !line.counterLine);
      c.counterRequestResolved = true;
      delete c.wantsCredit;
      delete c.bargainPct;
    } else if (hasFeature(this.state.level, 'thief') && this.social.next() < DATA.balance.queue.rowdyChance) {
      c.rowdy = true;
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

  /**
   * Chủ tiệm đóng cửa sớm (có việc đột xuất): không đón khách mới, không nhận cuộc gọi mới.
   * Khách đang lựa hàng ra quầy tính tiền với những gì đã lấy; khách chưa lấy gì thì được mời về.
   * Khách đang xếp hàng vẫn được phục vụ nốt. Trả về false nếu tiệm đã đóng.
   */
  closeEarly(): boolean {
    if (this.closed || this.ended) return false;
    this.closed = true;
    this.state.today.closedEarlyAt = Math.floor(this.state.clock);
    this.log(`🚪 Đóng cửa sớm lúc ${formatClock(this.state.clock)}`);
    this.events.emit('closing', undefined);
    for (const c of [...this.entrants]) this.sendHome(c);
    for (const c of [...this.shoppers]) this.tickBrowse(c, 0);
    return true;
  }

  /** Mời khách chưa mua gì ra về khi đóng cửa sớm: không bị tính là khách bỏ về, không chấm sao. */
  private sendHome(c: Customer): void {
    for (const line of c.order) this.returnLine(line);
    this.state.today.sentHome = (this.state.today.sentHome ?? 0) + 1;
    this.finish(c, 'closed', 0);
  }

  private tickBrowse(c: Customer, dt: number): void {
    if (c.status !== 'browsing') return;
    if (this.state.today.closedEarlyAt !== undefined && !c.thief) {
      // Đóng cửa sớm: thôi lựa, ra quầy với những gì đã lấy (chưa lấy gì thì về).
      if (!c.order.some((line) => line.picked > 0) && !c.order.some((line) => line.counterLine)) this.sendHome(c);
      else this.finishBrowsing(c);
      return;
    }
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
    if (c.rowdy) this.disturb(c);
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

  /**
   * Khách phá phách (bày bừa, la lối): bảo vệ trong ca nhắc ngay, không ai bị làm phiền.
   * Không có bảo vệ thì nhân viên / chủ tiệm nhắc, nhưng khách khác trong tiệm đã bực mình (mất kiên nhẫn).
   */
  private disturb(c: Customer): void {
    c.rowdy = false;
    const guard = this.presentGuard();
    const helper = guard ?? this.state.staff.find((s) => (s.role === 'refill' || s.role === 'stocker') && this.workerOf(s.id)?.present);
    const by = helper?.id ?? PLAYER;
    if (!guard) {
      const loss = DATA.balance.queue.rowdyAnnoySeconds;
      for (const other of this.customers) if (other !== c && !other.thief) other.patience = Math.max(0.5, other.patience - loss);
    } else this.jobDone(guard);
    this.log(`${helper?.name ?? 'Chủ tiệm'} nhắc ${c.name ?? 'khách'} giữ trật tự`);
    this.events.emit('rowdy', { customer: c, by, guard: !!guard });
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
    // Không lấy được gì và cũng không có món hết để hỏi (vd chê đắt hết): về luôn.
    // Có món hết trên kệ thì vẫn ra quầy hỏi xem trong kho còn không.
    if (!c.order.some((line) => line.picked > 0) && !c.order.some((line) => line.counterLine) && !c.order.some(askable)) {
      this.removeFrom(this.shoppers, c);
      this.leave(c, 'nothing');
      return;
    }
    const lane = this.chooseLane();
    if (lane === null) return;
    this.removeFrom(this.shoppers, c);
    c.at = counterFixture(this.state)?.uid ?? null;
    c.status = 'waiting';
    c.ticket ??= this.nextTicket++;
    this.joinLane(c, lane, true);
  }

  private admitReady(): void {
    while (this.ready.length) {
      const lane = this.chooseLane();
      if (lane === null) break;
      const c = this.ready.shift()!;
      if (c.status === 'done') continue;
      this.joinLane(c, lane, true);
    }
  }

  /**
   * Khách tới quầy hỏi các món hết trên kệ. Kho còn thì lấy cho khách luôn (nạp thêm lên kệ rồi đưa khách);
   * kho cũng hết thì chỉ tính tiền phần còn lại. Trả về false nếu khách chẳng mua được gì và đã ra về.
   * Vẫn giữ sao bị trừ do hết hàng trên kệ (khách phải hỏi mới có), nên nạp kệ đầy đủ vẫn có lợi.
   */
  private askForMissing(c: Customer): boolean {
    for (const line of c.order) {
      if (!askable(line)) continue;
      line.asked = true;
      const want = line.missing;
      let found = 0;
      let restocked = 0;
      // Nạp đầy các ô kệ đang bày món này (kể cả ô đã bán hết) từ kho, rồi lấy từ kệ đưa khách.
      for (const shelf of usableShelves(this.state)) {
        this.state.shelves[shelf].forEach((slot, index) => {
          if (slot.productId === line.productId && canRefill(this.state, shelf, index)) restocked += refillSlot(this.state, shelf, index);
        });
      }
      while (found < want) {
        const at = findSlotWith(this.state, line.productId);
        if (!at) break;
        const slot = this.state.shelves[at.shelf][at.slot];
        line.value = (line.value ?? 0) + slotUnitPrice(this.state, slot);
        const exp = takeOneFromSlot(slot) ?? null;
        line.pickedFrom ??= [];
        const recorded = line.pickedFrom.find((item) => item.shelf === at.shelf && item.slot === at.slot);
        if (recorded) { recorded.qty++; (recorded.exps ??= []).push(exp); }
        else line.pickedFrom.push({ ...at, qty: 1, exps: [exp] });
        found++;
      }
      // Món không bày trên kệ nào: lấy thẳng trong kho.
      if (found < want) {
        const unit = priceOf(line.productId, this.state);
        for (const lot of takeLots(this.state, line.productId, want - found)) {
          found += lot.qty;
          line.value = (line.value ?? 0) + unit * lot.qty;
        }
      }
      if (found > 0) {
        line.picked += found;
        line.missing -= found;
        c.basketMissing = Math.max(0, c.basketMissing - found);
        const missed = this.state.today.missed;
        missed[line.productId] = Math.max(0, (missed[line.productId] ?? 0) - found);
        if (!missed[line.productId]) delete missed[line.productId];
      }
      this.events.emit('stockAsked', { customer: c, productId: line.productId, found, missing: line.missing, restocked });
    }
    if (!c.order.some((line) => line.picked > 0) && !c.order.some((line) => line.counterLine)) {
      this.leave(c, 'nothing');
      return false;
    }
    return true;
  }

  private requestStockFetch(c: Customer): boolean {
    const available = this.state.staff.some((s) => (s.role === 'refill' || s.role === 'stocker')
      && this.workerOf(s.id)?.present && (this.closed || this.isOnShift(s)));
    if (!available) return false;
    this.tasks.upsert(`fetch:${c.id}`, 'fetch', 20_000 - c.id);
    return true;
  }

  /** Hàng chờ của một quầy: 0 = quầy người chơi, số khác = id quầy nhân viên. */
  private laneQueue(laneId: number): Customer[] | null {
    return laneId === 0 ? this.queue : this.lanes.find((l) => l.id === laneId)?.queue ?? null;
  }

  /**
   * Vào quầy: 0 = quầy người chơi, số khác = id quầy nhân viên. Khách đứng theo số thứ tự tới quầy
   * (không chen lên trước người đang được tính tiền). `fresh` = vừa lấy hàng xong, có thể là khách chen hàng.
   */
  private joinLane(c: Customer, laneId: number, fresh = false): void {
    c.lane = laneId;
    const queue = this.laneQueue(laneId)!;
    if (fresh && this.tryCutIn(c, laneId, queue)) return;
    insertByTicket(queue, c, 1);
    this.events.emit('basketReady', c);
  }

  /** Khách ý thức kém chen lên ngay sau người đang tính tiền (hàng có từ 2 người trở lên). */
  private tryCutIn(c: Customer, laneId: number, queue: Customer[]): boolean {
    if (c.scolded || c.thief || queue.length < 2 || !hasFeature(this.state.level, 'thief')) return false;
    if (this.social.next() >= DATA.balance.queue.cutChance) return false;
    queue.splice(1, 0, c);
    c.cutLeft = DATA.balance.queue.cutNoticeSeconds;
    this.events.emit('basketReady', c);
    this.events.emit('queueCut', { customer: c, lane: laneId });
    return true;
  }

  /** Người đứng quầy của hàng (id nhân viên / 'player'); null nếu quầy người chơi đang bỏ trống. */
  private laneKeeper(laneId: number): string | null {
    if (laneId !== 0) return this.lanes.find((l) => l.id === laneId)?.staffId ?? null;
    return this.playerAtCounter || this.autoPlayer ? PLAYER : null;
  }

  /**
   * Khách chen hàng: người đứng quầy (hoặc bảo vệ) thấy thì nhắc ra cuối hàng xếp lại.
   * Chen được tới đầu hàng mà không ai nhắc thì những người phía sau bực mình (mất kiên nhẫn).
   */
  private tickQueueCutters(dt: number): void {
    const cfg = DATA.balance.queue;
    const guard = this.presentGuard();
    for (const laneId of [0, ...this.lanes.map((l) => l.id)]) {
      const queue = this.laneQueue(laneId)!;
      for (const c of [...queue]) {
        if (c.cutLeft === undefined) continue;
        const index = queue.indexOf(c);
        if (index === 0) {
          // Không ai kịp nhắc: người xếp sau bực mình.
          delete c.cutLeft;
          c.scolded = true;
          for (const other of queue.slice(1)) other.patience = Math.max(0.5, other.patience - cfg.cutSkipPatience);
          continue;
        }
        const keeper = this.laneKeeper(laneId) ?? guard?.id ?? null;
        if (!keeper) continue;
        c.cutLeft -= dt;
        if (c.cutLeft > 0) continue;
        delete c.cutLeft;
        c.scolded = true;
        queue.splice(index, 1);
        c.ticket = this.nextTicket++;
        queue.push(c);
        const who = keeper === PLAYER ? 'Chủ tiệm' : this.staffOf(keeper)?.name ?? 'Nhân viên';
        this.log(`${who} nhắc ${c.name ?? 'khách'} chen hàng ra sau xếp hàng`);
        this.events.emit('queueScold', { customer: c, lane: laneId, by: keeper });
        this.events.emit('lanesChanged', undefined);
      }
    }
  }

  /**
   * Khách trả tiền mặt bằng tờ giả. Người đứng quầy (chủ tiệm / thu ngân, theo độ chính xác) có thể phát hiện:
   * - tiệm báo công an: người dùng tiền giả bị công an đưa đi, không bán được đơn nhưng được phường khen (EXP);
   * - không báo: trả lại tờ giả, khách đổi tờ thật (hoặc bỏ đi).
   * Không phát hiện thì bán như thường nhưng mất mệnh giá tờ giả khi kiểm két. Trả về true nếu khách không mua nữa.
   */
  private counterfeit(c: Customer, total: number, staff: Staff | null): boolean {
    const cfg = DATA.balance.security;
    if (c.fakeBill !== undefined || !hasFeature(this.state.level, 'thief') || this.social.next() >= cfg.counterfeitChance) return false;
    const bills = [...cfg.counterfeitBills].sort((a, b) => a - b);
    const bill = bills.find((v) => v >= total) ?? bills[bills.length - 1];
    const detect = staff ? cfg.staffDetectBase + staff.stats.accuracy * cfg.staffDetectPerAccuracy : cfg.playerDetect;
    if (this.social.next() >= detect) {
      c.fakeBill = bill;
      return false;
    }
    const by = staff?.id ?? PLAYER;
    const who = staff?.name ?? 'Chủ tiệm';
    if (staff) this.jobDone(staff);
    if (callsPolice(this.state)) {
      for (const line of c.order) this.returnLine(line);
      const t = this.state.today;
      t.counterfeitReports = (t.counterfeitReports ?? 0) + 1;
      addPlayerExperience(this.state, cfg.counterfeitReportExp);
      t.expGained += cfg.counterfeitReportExp;
      this.log(`${who} phát hiện tờ ${formatMoney(bill)} giả, báo công an`);
      this.events.emit('counterfeit', { customer: c, by, bill, action: 'police' });
      this.addIncident('counterfeit', `🚓 ${who} phát hiện tờ ${formatMoney(bill)} giả — đã báo công an, người dùng tiền giả bị đưa đi`, { customerId: c.id });
      this.drop(c);
      return true;
    }
    if (this.social.next() < cfg.counterfeitRepay) {
      this.log(`${who} trả lại tờ ${formatMoney(bill)} giả, khách đổi tờ khác`);
      this.events.emit('counterfeit', { customer: c, by, bill, action: 'repaid' });
      c.fakeBill = 0;
      return false;
    }
    this.log(`${who} trả lại tờ ${formatMoney(bill)} giả, khách bỏ đi`);
    this.events.emit('counterfeit', { customer: c, by, bill, action: 'left' });
    this.leave(c, 'nothing');
    return true;
  }

  /** Bảo vệ đang trong ca (null nếu không có). */
  presentGuard(): Staff | null {
    return this.state.staff.find((s) => s.role === 'guard' && this.workerOf(s.id)?.present) ?? null;
  }

  /** Quầy người chơi nhận khách mới không (chế độ quản lý có thu ngân thì không; đang đi giao thì không). */
  playerLaneOpen(): boolean {
    if (this.playerAway > 0 && !this.autoPlayer) return false;
    const staffed = this.lanes.some((l) => !l.closing);
    if (this.state.today.managerDay && staffed) return false;
    // Góc nhìn trên xuống: người chơi rời quầy mà có thu ngân thì quầy người chơi tạm đóng, khách sang quầy thu ngân.
    if (!this.playerAtCounter && !this.autoPlayer && staffed) return false;
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

  /**
   * Mời khách sang quầy vắng hơn, giữ đúng thứ tự tới trước tính trước:
   * - chỉ người tới sớm nhất trong số đang chờ được mời trước, và chỉ khi sang quầy kia được tính tiền sớm hơn;
   * - mỗi khách đổi quầy tối đa một lần (không nhảy qua lại giữa các quầy);
   * - không đụng tới khách đang được tính tiền hay đang chen hàng.
   */
  private balanceCheckoutQueues(): void {
    const max = this.maxQueue();
    const playerOpen = this.playerLaneOpen();
    const open = [
      ...(playerOpen ? [{ id: 0, queue: this.queue }] : []),
      ...this.lanes.filter((lane) => !lane.closing).map((lane) => ({ id: lane.id, queue: lane.queue })),
    ];
    if (!open.length) return;
    const sources = [
      { id: 0, queue: this.queue, open: playerOpen },
      ...this.lanes.map((lane) => ({ id: lane.id, queue: lane.queue, open: !lane.closing })),
    ];
    let changed = false;
    for (let moves = 0; moves < 20; moves++) {
      const target = open.reduce((a, b) => (b.queue.length < a.queue.length ? b : a));
      if (target.queue.length >= max) break;
      let pick: { from: Customer[]; index: number; c: Customer } | null = null;
      for (const src of sources) {
        if (src.id === target.id) continue;
        src.queue.forEach((c, index) => {
          // Đầu hàng quầy đang mở sắp/đang được tính tiền: giữ nguyên.
          if (src.open && index === 0) return;
          if (c.status !== 'waiting' || c.switched || c.cutLeft !== undefined || c.askLeft !== undefined) return;
          // Quầy bỏ trống: cả người đầu hàng cũng đang phải chờ.
          const position = src.open ? index : index + 1;
          if (position <= target.queue.length) return;
          if (!pick || (c.ticket ?? 0) < (pick.c.ticket ?? 0)) pick = { from: src.queue, index, c };
        });
      }
      if (!pick) break;
      const { from, index, c } = pick as { from: Customer[]; index: number; c: Customer };
      from.splice(index, 1);
      c.lane = target.id;
      c.switched = true;
      insertByTicket(target.queue, c, 1);
      changed = true;
    }
    if (changed) this.events.emit('lanesChanged', undefined);
  }

  private promoteFront(): void {
    const c = this.front;
    if (!c || c.status !== 'waiting') return;
    if (!this.playerAtCounter && !this.autoPlayer) return;
    if (c.order.some(askable)) {
      // Nhân viên kho/tiếp hàng lấy món khách hỏi; người chơi chỉ chờ món được mang ra.
      if (c.askLeft === undefined) {
        this.events.emit('stockAsking', c);
        c.askLeft = this.requestStockFetch(c) ? -1 : DATA.balance.askStockSeconds;
      }
      // Nhân viên kho hết ca giữa chừng: người đứng quầy tự đi kiểm kho.
      if (c.askLeft < 0) {
        if (this.requestStockFetch(c)) return;
        c.askLeft = DATA.balance.askStockSeconds;
      }
      if (c.askLeft > 0) return;
      if (!this.askForMissing(c)) return;
    }
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
    // Pha chế viên đã pha sẵn ly này trong lúc khách xếp hàng: giao ngay.
    const pre = this.prebrewed.get(c.id);
    if (pre) {
      this.prebrewed.delete(c.id);
      this.serveBrewed(c, line, pre.variant, pre.quality, 'staff');
      return;
    }
    const have = this.state.counter.some((slot) => slot.productId === line.productId && slot.qty > 0);
    // Món trà: hết ly trên quầy vẫn được yêu cầu nếu pha ngay được (món pha theo đơn luôn thế).
    const brewable = !have && this.canBrewLine(line);
    if (!have && !brewable) {
      line.missing = line.qty;
      c.basketMissing += line.qty;
      c.penalty = Math.min(1, c.penalty + 1);
      this.state.today.missed[line.productId] = (this.state.today.missed[line.productId] ?? 0) + line.qty;
      c.counterRequestResolved = true;
      this.events.emit('counterExpired', { customer: c, productId: line.productId });
      return;
    }
    c.counterRequestResolved = false;
    // Khách chờ pha theo đơn được thêm thời gian để kịp bấm Pha ngay.
    const seconds = c.counterRequestSeconds + (brewable ? DATA.balance.madeToOrder.waitSeconds : 0);
    c.counterRequestLeft = seconds;
    this.events.emit('counterRequested', { customer: c, productId: line.productId, seconds, variantId: line.variantId });
  }

  private tickCounterRequest(c: Customer, dt: number): void {
    if (c.counterRequestResolved || c.counterRequestLeft === null) return;
    // Đang pha ly cho khách này thì bộ đếm yêu cầu tạm dừng (kiên nhẫn chung vẫn giảm).
    if (this.isBrewingFor(c.id)) return;
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
      const fridge = shelfKind(this.state, shelf) === 'fridge';
      if (!fridge && zoneOf(this.state, shelf) !== zone) continue;
      this.state.shelves[shelf].forEach((slot, index) => {
        const matchesZone = fridge ? slot.productId !== null && product(slot.productId).category === zone : true;
        if (matchesZone && canRefill(this.state, shelf, index)) slots.push({ shelf, slot: index });
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
    // Khách gọi nhiều món ở quầy (tiệm xôi): phục vụ lần lượt từng món.
    while (c.counterRequestResolved) {
      const next = c.order.find((line) => line.counterLine && line.picked === 0 && line.missing === 0);
      if (!next) break;
      this.beginCounterRequest(c, next);
    }
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

  private pickPaymentMethod(): PaymentMethod {
    if (this.rng.next() >= DATA.balance.cashlessChance) return 'cash';
    return this.rng.next() < 0.5 ? 'card' : 'transfer';
  }

  private startPayment(c: Customer): void {
    const total = orderTotal(c, this.state);
    c.comboTipEligible = c.scanStartedAt !== null && this.elapsed - c.scanStartedAt <= DATA.balance.scanComboSeconds;
    c.total = total;
    c.paymentMethod = this.pickPaymentMethod();
    c.bill = c.paymentMethod === 'cash' ? customerPayment(total, this.rng) : total;
    if (c.paymentMethod === 'cash' && this.counterfeit(c, total, null)) return;
    c.changeDue = c.bill - total;
    c.status = 'paying';
    c.changeStartedAt = this.elapsed;
    this.tray = [];
    this.events.emit('paymentStarted', c);
    if (c.paymentMethod !== 'cash') this.completeSale(c, 0, 0);
    else if (c.changeDue === 0) this.completeSale(c, this.tipFor(c, false), 0);
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
    this.applyCustomCup(c, line, slot);
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

  /**
   * Món trà tùy biến: chọn ly đưa cho khách (đúng loại nếu có, không thì gần nhất), ghi giá theo ly thực sự đưa và phạt nếu ly kém hơn.
   * Dùng chung cho người chơi, thu ngân và tự phục vụ; người gọi tự giảm `slot.qty`.
   */
  private applyCustomCup(c: Customer, line: OrderLine, slot: Slot): void {
    const recipe = recipeByOutput(line.productId);
    if (!isCustomRecipe(recipe)) return;
    const want = line.variantId ?? BASE_VARIANT;
    const served = pickServed(slot, recipe, want);
    if (!served) return;
    removeCupRecord(slot, served.key);
    line.servedVariant = served.key;
    line.value = (line.value ?? 0) + cupPrice(recipe, priceOf(line.productId, this.state), want, served.key);
    if (served.fit === 'worse') {
      // Ly kém hơn khách gọi (thiếu topping/size...): trừ một sao và một phần kiên nhẫn, vẫn trả tiền ly nhận được.
      c.penalty = Math.min(1, c.penalty + 1);
      c.patience = Math.max(0, c.patience - DATA.balance.counterWrongPenalty / 2);
    }
    this.events.emit('counterVariant', { customer: c, productId: line.productId, wanted: want, served: served.key, fit: served.fit });
  }

  // ---------- Pha ngay theo đơn (món trà) ----------

  /** Dòng đơn quầy này pha ngay được không (món trà có tùy chọn, quầy chưa có đúng ly, đủ nguyên liệu và trạm)? */
  private canBrewLine(line: OrderLine): boolean {
    const recipe = recipeByOutput(line.productId);
    if (!isCustomRecipe(recipe)) return false;
    if (this.state.counter.some((slot) => slotMatch(slot, line) === 'exact')) return false;
    return checkBrew(this.state, recipe.id, line.variantId || undefined).ok;
  }

  /** Khách đầu hàng đang chờ ly mà có thể pha ngay: món, tùy chọn và thời gian pha; null nếu không (hoặc đã có người đang pha ly này). */
  brewOffer(): { recipeId: string; productId: string; variant: string; seconds: number } | null {
    const c = this.front;
    if (!c || c.status !== 'scanning' || c.counterRequestResolved || this.isBrewingFor(c.id)) return null;
    const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0);
    if (!line || !this.canBrewLine(line)) return null;
    const recipe = recipeByOutput(line.productId)!;
    return { recipeId: recipe.id, productId: line.productId, variant: line.variantId ?? BASE_VARIANT, seconds: recipe.prepSeconds };
  }

  /** Đang có mẻ pha cho khách này (người chơi hoặc pha chế viên)? */
  private isBrewingFor(customerId: number): boolean {
    if (this.brew?.customerId === customerId) return true;
    for (const b of this.staffBrews.values()) if (b.customerId === customerId) return true;
    return false;
  }

  /** Tiến độ mẻ đang pha cho khách đầu hàng: 0..1 và số giây còn lại; `by` là tên pha chế viên nếu không phải người chơi; null nếu không có mẻ. */
  brewProgress(): { productId: string; progress: number; left: number; by?: string } | null {
    const b = this.brew;
    if (b) return { productId: b.line.productId, progress: 1 - Math.max(0, b.left) / b.total, left: Math.max(0, b.left) };
    const c = this.front;
    if (!c) return null;
    for (const [staffId, sb] of this.staffBrews) {
      if (sb.customerId !== c.id) continue;
      const left = Math.max(0, this.workerOf(staffId)?.left ?? 0);
      return { productId: sb.line.productId, progress: 1 - left / sb.total, left, by: this.staffOf(staffId)?.name ?? 'Nhân viên' };
    }
    return null;
  }

  /** Bắt đầu pha ly khách đầu hàng đang gọi: nguyên liệu bị trừ ngay, ly xong sau `prepSeconds` với chất lượng `quality`. */
  startBrew(quality: number = DATA.balance.madeToOrder.autoQuality): boolean {
    const offer = this.brewOffer();
    if (!offer) return false;
    const c = this.front!;
    const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0)!;
    if (!brewCup(this.state, offer.recipeId, offer.variant || undefined).ok) return false;
    this.brew = { customerId: c.id, customer: c, line, variant: offer.variant, quality, total: offer.seconds, left: offer.seconds };
    this.events.emit('brewStarted', { customer: c, productId: line.productId, variantId: line.variantId, seconds: offer.seconds });
    return true;
  }

  /** Người chơi pha tay ly khách đầu hàng gọi (mini-game): trừ nguyên liệu và giao ngay ly với chất lượng `quality`. */
  brewByHand(quality: number): boolean {
    const offer = this.brewOffer();
    if (!offer) return false;
    const c = this.front!;
    const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0)!;
    if (!brewCup(this.state, offer.recipeId, offer.variant || undefined).ok) return false;
    this.serveBrewed(c, line, offer.variant, quality, null);
    return true;
  }

  private tickBrew(dt: number): void {
    const b = this.brew;
    if (!b) return;
    const c = this.front;
    if (!c || c.id !== b.customerId || c.status !== 'scanning' || c.counterRequestResolved) {
      // Khách rời hoặc bỏ hàng trước khi pha xong: mẻ bị bỏ, nguyên liệu đã trừ không hoàn lại.
      this.brew = null;
      this.events.emit('brewCancelled', { customer: b.customer, productId: b.line.productId });
      this.log(`Mẻ ${product(b.line.productId).name} bị bỏ vì khách không đợi được`);
      return;
    }
    b.left -= dt;
    if (b.left > 0) return;
    this.brew = null;
    this.serveBrewed(c, b.line, b.variant, b.quality, null);
  }

  /** Ly pha xong đưa tới khách đầu hàng, rồi quét/tính tiền như khi phục vụ từ quầy. `by`: tên pha chế viên, null nếu người chơi. */
  private serveBrewed(c: Customer, line: OrderLine, variant: string, quality: number, by: string | null): void {
    this.completeBrewedLine(c, line, variant, quality);
    this.events.emit('brewDone', { customer: c, productId: line.productId, quality, by });
    if (this.state.settings.autoScan) {
      c.autoScanned = true;
      this.scanItem(line.productId);
    } else this.maybeStartPayment(c);
  }

  /** Khách nhận đúng ly vừa pha: ghi giá theo chất lượng cộng phụ thu, đánh dấu đã phục vụ (không qua ô quầy). */
  private completeBrewedLine(c: Customer, line: OrderLine, variant: string, quality = 1): void {
    const recipe = recipeByOutput(line.productId)!;
    line.picked++;
    line.servedVariant = variant;
    line.value = (line.value ?? 0) + brewedCupPrice(recipe, priceOf(line.productId, this.state), variant, variant, quality);
    c.counterRequestLeft = null;
    c.counterRequestResolved = true;
    this.state.today.counterServed++;
    this.events.emit('counterServed', { customer: c, productId: line.productId, slot: -1 });
  }

  /** Pha và đưa ngay ly đúng loại (thu ngân/tự động: thời gian pha đã tính vào việc của người đó). */
  private brewInstant(c: Customer, line: OrderLine, quality: number): boolean {
    const recipe = recipeByOutput(line.productId);
    if (!isCustomRecipe(recipe) || !brewCup(this.state, recipe.id, line.variantId || undefined).ok) return false;
    this.completeBrewedLine(c, line, line.variantId ?? BASE_VARIANT, quality);
    return true;
  }

  /** Giây pha cộng thêm vào việc của thu ngân khi khách gọi ly phải pha ngay (ly pha chế viên đã pha sẵn thì không mất thời gian). */
  private brewSecondsFor(c: Customer): number {
    if (this.prebrewed.has(c.id)) return 0;
    const line = c.order.find((l) => l.counterLine && l.picked === 0 && l.missing === 0);
    return line && this.canBrewLine(line) ? recipeByOutput(line.productId)!.prepSeconds : 0;
  }

  /**
   * Khách tiếp theo pha chế viên nên pha cho: khách đang xếp hàng (chưa tới lượt) hoặc khách đầu hàng đang chờ ly,
   * gọi ly pha ngay được và chưa có ai đang pha. Ưu tiên theo thứ tự hàng của người chơi rồi tới hàng thu ngân.
   */
  private brewTarget(): { customer: Customer; line: OrderLine; recipe: RecipeDef; variant: string } | null {
    for (const c of [...this.queue, ...this.lanes.flatMap((lane) => lane.queue)]) {
      const waiting = c.status === 'waiting' || (c === this.front && c.status === 'scanning' && !c.counterRequestResolved);
      if (!waiting || this.prebrewed.has(c.id) || this.isBrewingFor(c.id)) continue;
      const line = c.order.find((l) => l.counterLine && l.picked === 0 && l.missing === 0);
      if (!line || !this.canBrewLine(line)) continue;
      return { customer: c, line, recipe: recipeByOutput(line.productId)!, variant: line.variantId ?? BASE_VARIANT };
    }
    return null;
  }

  /** Pha chế viên nhận pha một ly cho khách đang chờ: trừ nguyên liệu ngay, ly xong sau thời gian pha của người đó. */
  private startStaffBrew(s: Staff, w: Worker): boolean {
    const target = this.brewTarget();
    if (!target || !brewCup(this.state, target.recipe.id, target.variant || undefined).ok) return false;
    const total = target.recipe.prepSeconds * timeFactor(s, w.tired);
    w.task = `brew:${target.customer.id}`;
    w.left = total;
    this.staffBrews.set(s.id, { customerId: target.customer.id, line: target.line, variant: target.variant, quality: staffBrewQuality(s.stats.accuracy), total });
    if (target.customer === this.front) this.events.emit('brewStarted', { customer: target.customer, productId: target.line.productId, variantId: target.line.variantId, seconds: total });
    return true;
  }

  /** Xong ly của pha chế viên: giao ngay nếu khách đang chờ ở quầy, không thì để dành tới lượt khách. */
  private finishStaffBrew(s: Staff): void {
    const b = this.staffBrews.get(s.id);
    this.staffBrews.delete(s.id);
    if (!b) return;
    const c = this.customers.find((x) => x.id === b.customerId);
    if (!c || c.status === 'done' || c.status === 'fleeing' || b.line.picked > 0 || b.line.missing > 0) return;
    this.jobDone(s);
    this.log(`${s.name} pha xong ${product(b.line.productId).name} cho khách`);
    if (c === this.front && c.status === 'scanning' && !c.counterRequestResolved) this.serveBrewed(c, b.line, b.variant, b.quality, s.name);
    else this.prebrewed.set(c.id, { variant: b.variant, quality: b.quality });
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

  /** Khách công ty xin hóa đơn: có máy tính tiền thì xuất ngay (thêm sao, EXP); không có thì khách phật ý. */
  private handleInvoiceRequest(c: Customer): number {
    if (!c.wantsInvoice) return 0;
    const cfg = DATA.balance.tax.invoiceCustomer;
    const ok = this.state.tax.invoiceMachine;
    if (ok) c.bonusStars = (c.bonusStars ?? 0) + 1;
    else c.maxStars = Math.min(c.maxStars ?? 5, cfg.noInvoiceMaxStars);
    this.log(ok ? 'Xuất hóa đơn điện tử cho khách công ty' : 'Khách công ty xin hóa đơn đỏ nhưng tiệm chưa có máy tính tiền');
    this.events.emit('invoice', { customer: c, issued: ok });
    return ok ? cfg.bonusExp : 0;
  }

  /** Tách doanh thu một đơn theo nhóm ngành chịu thuế (món chế biến = ăn uống, còn lại = hàng hóa). */
  private recordSaleTax(c: Customer): void {
    let gross = 0;
    let food = 0;
    for (const line of c.order) {
      if (line.scanned <= 0) continue;
      const unit = line.value !== undefined && line.picked > 0 ? line.value / line.picked : priceOf(line.productId, this.state);
      const value = unit * line.scanned;
      gross += value;
      if (taxKindOfProduct(line.productId) === 'food') food += value;
    }
    const foodPart = gross > 0 ? Math.round((c.total * food) / gross) : 0;
    recordTaxableRevenue(this.state, 'food', foodPart);
    recordTaxableRevenue(this.state, 'goods', c.total - foodPart);
  }

  private completeSale(c: Customer, tip: number, lost: number, credit = false, staff?: Staff): void {
    const b = DATA.balance;
    const t = this.state.today;
    c.total = Math.round(c.total * prestigeRevenueMultiplier(this.state) / 500) * 500;
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
      this.recordSaleTax(c);
    }
    if (c.fakeBill) {
      // Nhận phải tờ giả mà không biết: mất cả mệnh giá (tiền thối khách đưa bằng tiền thật).
      this.state.money -= c.fakeBill;
      t.counterfeitLoss = (t.counterfeitLoss ?? 0) + c.fakeBill;
      t.journal.push({ m: Math.floor(this.state.clock), t: `Nhận phải tờ ${formatMoney(c.fakeBill)} giả` });
      delete c.fakeBill;
    }
    t.tips += tip;
    t.overpaid += lost;
    t.served++;
    const invoiceExp = this.handleInvoiceRequest(c);
    const stars = ratingFor(c);
    let exp = items * b.expPerItem + invoiceExp;
    if (stars >= 3) { t.happy++; exp += b.expPerHappy; }
    exp = Math.round(exp * saleExpMultiplier(this.state.level));
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
    addPlayerExperience(this.state, exp);
    t.expGained += exp;
    const dineTable = c.order.find((line) => line.scanned > 0 && DATA.recipes.some((recipe) => recipe.output === line.productId));
    const dineChance = activeShopType(this.state).def.dineInChance;
    const wantsSeat = !!dineTable && (dineChance >= 1 || this.rng.next() < dineChance);
    const seated = wantsSeat ? seatDiner(this.state, c.id, dineTable!.productId) : null;
    if (seated) serveDiningAddOns(this.state, seated, this.rng);
    this.finish(c, 'served', stars);
    if (seated) this.events.emit('diningChanged', [seated]);
    this.events.emit('sale', { customer: c, amount: c.total, tip });
    if (staff) this.events.emit('staffServed', { staff, customer: c, lane: c.lane ?? 0 });
  }

  private returnLine(line: OrderLine): void {
    let remaining = line.picked;
    // Ly pha ngay không qua ô quầy: khách bỏ về thì ly bị bỏ.
    if (line.counterLine && line.counterSlot === undefined) return;
    if (line.counterLine && line.counterSlot !== undefined) {
      const counter = this.state.counter[line.counterSlot];
      if (counter?.productId === line.productId) {
        const returned = Math.min(remaining, DATA.balance.counterCapacity - counter.qty);
        // Ly tùy biến được trả lại đúng loại đã lấy.
        if (line.servedVariant !== undefined && isCustomRecipe(recipeByOutput(line.productId))) for (let i = 0; i < returned; i++) addCup(counter, line.servedVariant);
        else counter.qty += returned;
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
    const fetchKey = `fetch:${c.id}`;
    this.tasks.complete(fetchKey);
    for (const worker of this.workers) {
      if (worker.task !== fetchKey) continue;
      worker.task = null;
      worker.left = 0;
      worker.idle = DATA.balance.staff.refillCheckSeconds;
    }
    c.status = 'done';
    this.prebrewed.delete(c.id);
    for (const [staffId, b] of this.staffBrews) {
      if (b.customerId !== c.id) continue;
      // Khách đi mất khi đang pha: mẻ bị bỏ, nguyên liệu đã trừ không hoàn lại.
      this.staffBrews.delete(staffId);
      const worker = this.workerOf(staffId);
      if (worker) { worker.task = null; worker.left = 0; worker.idle = 0; }
      this.events.emit('brewCancelled', { customer: c, productId: b.line.productId });
    }
    if (reason !== 'closed') {
      recordRating(this.state, stars);
      this.state.today.ratingSum += stars;
      this.state.today.ratingCount++;
      if (reason !== 'thief') {
        const review = maybeCustomerReview(this.state, c, reason, stars);
        if (review) this.events.emit('review', review);
      }
    }
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
          insertByTicket(this.ready, c, 0);
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
    // (Người chơi chỉ tạm rời quầy thì khách vẫn đứng nguyên hàng; ai tới sớm được mời sang quầy trống.)
    if (!this.autoPlayer && this.state.today.managerDay && !this.playerLaneOpen()) {
      for (const c of [...this.queue]) {
        const untouched = c.status === 'waiting' || (c.status === 'scanning' && c.order.every((l) => l.scanned === 0));
        if (!untouched) continue;
        this.removeFrom(this.queue, c);
        c.status = 'waiting';
        insertByTicket(this.ready, c, 0);
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
      if (s.role === 'barista' && this.startStaffBrew(s, w)) continue;
      if (s.role === 'chef' || s.role === 'barista') {
        const category = s.role === 'chef' ? 'food' : 'beverage';
        const recipe = DATA.recipes.find((item) => item.category === category && item.unlockLevel <= this.state.level
          && !isMadeToOrder(item) && this.state.activeRecipes.includes(item.id) && this.state.fixtures.some((f) => f.type === item.station)
          && Object.entries(item.ingredients).every(([id, qty]) => this.state.warehouse.reduce((n, lot) => n + (lot.productId === id ? lot.qty : 0), 0) >= qty));
        // Pha chế viên kiểm tra khách chờ ly thường xuyên hơn để kịp pha theo đơn.
        if (!recipe) { w.idle = s.role === 'barista' ? Math.min(DATA.balance.staff.refillCheckSeconds, 1) : DATA.balance.staff.refillCheckSeconds; continue; }
        w.task = `cook:${recipe.id}`;
        w.left = recipe.prepSeconds * timeFactor(s, w.tired);
        continue;
      }
      if (s.role === 'xoi_cook') {
        const job = this.xoiCookJob();
        if (!job) { w.idle = DATA.balance.staff.refillCheckSeconds; continue; }
        w.task = job.key;
        w.left = job.seconds * timeFactor(s, w.tired);
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

  /**
   * Việc tiếp theo của Thợ nấu xôi: hấp khi hết nếp chín, làm đơn nội bộ trước (trừ khi tắt ưu tiên),
   * rồi làm món bán lẻ còn ít ở quầy.
   */
  private xoiCookJob(): { key: string; seconds: number } | null {
    const st = this.state;
    const shop = activeShopType(st);
    if (shop.def.id !== 'xoi') return null;
    const hasStation = (station: string) => st.fixtures.some((f) => f.type === station);
    if (cookedPortions(st) < 3 && hasStation('xung_hap')) {
      const ready = st.soakBatches.find((b) => soakStatus(b, st.day, st.clock).kind === 'ready');
      if (ready) return { key: `steam:${ready.id}`, seconds: DATA.balance.stickyRice.steamSeconds * 2 };
    }
    const canMake = (recipe: RecipeDef) => hasStation(recipe.station) && !missingIngredients(st, recipe).length;
    if (st.settings.xoiOrderPriority !== false) {
      for (const order of pendingOrdersFrom(st, st.activeStoreId)) {
        if (order.dueDay > st.day + 1) continue;
        for (const id of Object.keys(order.items)) {
          const recipe = recipeByOutput(id);
          if (recipe && orderRemaining(order, id) > 0 && canMake(recipe)) return { key: `xoi:${recipe.id}:${order.id}`, seconds: recipe.prepSeconds };
        }
      }
    }
    const retail = DATA.recipes.find((r) => shop.allowsRecipe(r.id) && !r.packaged && st.activeRecipes.includes(r.id) && canMake(r)
      && st.counter.filter((slot) => slot.productId === r.output).reduce((n, slot) => n + slot.qty, 0) < 3);
    return retail ? { key: `cook:${retail.id}`, seconds: retail.prepSeconds } : null;
  }

  private finishTask(s: Staff, w: Worker): void {
    const key = w.task!;
    w.task = null;
    this.tasks.complete(key);
    const quality = Math.min(1.2, 0.75 + s.stats.accuracy * 0.045);
    if (key.startsWith('steam:')) {
      const result = steamBatch(this.state, this.state, key.slice('steam:'.length), quality);
      if (result.ok) { this.jobDone(s); this.log(`${s.name} hấp xong ${result.rice.portions} phần nếp chín`); }
      return;
    }
    if (key.startsWith('xoi:')) {
      const [, recipeId, orderId] = key.split(':');
      const recipe = recipeById(recipeId);
      const order = this.state.internalOrders.find((o) => o.id === orderId);
      if (!recipe || !order || orderRemaining(order, recipe.output) <= 0) return;
      if (makeServing(this.state, recipe, this.state.day, this.state.clock, quality) === null) return;
      fillOrder(order, recipe.output, 1);
      this.jobDone(s);
      this.log(`${s.name} làm 1 ${product(recipe.output).name} cho đơn của ${this.state.stores.find((x) => x.id === order.toStoreId)?.name ?? 'tiệm khác'}`);
      return;
    }
    if (key.startsWith('brew:')) {
      this.finishStaffBrew(s);
      return;
    }
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
    if (key.startsWith('fetch:')) {
      const customerId = Number(key.slice('fetch:'.length));
      const customer = [...this.queue, ...this.lanes.flatMap((lane) => lane.queue)].find((c) => c.id === customerId);
      if (customer) {
        customer.askLeft = 0;
        this.askForMissing(customer);
      }
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
        if (c.order.some(askable)) {
          // Nhân viên kho/tiếp hàng lấy món khách hỏi; thu ngân không phải rời quầy.
          if (c.askLeft === undefined) this.events.emit('stockAsking', c);
          if ((c.askLeft === undefined || c.askLeft < 0) && this.requestStockFetch(c)) {
            c.askLeft = -1;
            continue;
          }
          // Không có nhân viên kho/tiếp hàng đang làm: thu ngân tự kiểm kho như trước.
          c.askLeft = DATA.balance.askStockSeconds;
          lane.job = { customerId: c.id, phase: 'ask', left: DATA.balance.askStockSeconds * timeFactor(s, w.tired) };
          continue;
        }
        c.status = 'scanning';
        const items = c.order.reduce((n, l) => n + l.picked, 0);
        const counter = c.order.some((l) => l.counterLine && l.picked === 0 && l.missing === 0);
        lane.job = { customerId: c.id, phase: 'scan', left: (items * cfg.scanSecondsPerItem + (counter ? cfg.counterSeconds : 0) + this.brewSecondsFor(c)) * timeFactor(s, w.tired) };
        continue;
      }
      lane.job.left -= dt;
      if (lane.job.phase === 'ask') c.askLeft = Math.max(0, lane.job.left);
      if (lane.job.left > 0) continue;
      if (lane.job.phase === 'ask') {
        lane.job = null;
        if (this.askForMissing(c)) c.askLeft = 0;
        continue;
      }
      if (lane.job.phase === 'scan') this.staffCheckout(lane, c, s, w);
      else this.staffChange(lane, c, s);
    }
  }

  private staffCheckout(lane: Lane, c: Customer, s: Staff, w: Worker): void {
    const b = DATA.balance;
    const t = this.state.today;
    const req = c.order.find((l) => l.counterLine && l.picked === 0 && l.missing === 0);
    if (req) {
      // Ưu tiên đúng ly có sẵn, rồi pha ngay (thời gian pha đã cộng vào việc của thu ngân), rồi ly thay thế gần nhất.
      const pre = this.prebrewed.get(c.id);
      if (pre) this.prebrewed.delete(c.id);
      const exact = pre ? -1 : this.state.counter.findIndex((slot) => slotMatch(slot, req) === 'exact');
      const idx = pre ? -1 : exact >= 0 ? exact : this.canBrewLine(req) ? -1 : this.state.counter.findIndex((slot) => slot.productId === req.productId && slot.qty > 0);
      if (pre) {
        // Pha chế viên đã pha sẵn ly này.
        this.completeBrewedLine(c, req, pre.variant, pre.quality);
      } else if (idx >= 0) {
        const slot = this.state.counter[idx];
        this.applyCustomCup(c, req, slot);
        slot.qty--;
        req.picked++;
        req.counterSlot = idx;
        t.counterServed++;
      } else if (this.brewInstant(c, req, staffBrewQuality(s.stats.accuracy))) {
        // Ly pha theo đơn đã đưa cho khách.
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
    c.paymentMethod = this.pickPaymentMethod();
    c.status = 'paying';
    lane.job = { customerId: c.id, phase: 'change', left: b.staff.changeSeconds * timeFactor(s, w.tired) };
  }

  private staffChange(lane: Lane, c: Customer, s: Staff): void {
    const cfg = DATA.balance.staff;
    lane.job = null;
    if (c.paymentMethod !== 'cash') {
      this.jobDone(s);
      this.completeSale(c, 0, 0, false, s);
      return;
    }
    if (this.counterfeit(c, c.total, s)) return;
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
        c.shortChanged = true;
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
    const guard = this.presentGuard();
    if (guard && this.social.next() < sec.guardDetect) {
      this.caught(c, 'staff', guard);
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
    recordTaxableRevenue(this.state, 'goods', o.value);
    if (o.onTime) recordTaxableRevenue(this.state, 'service', o.fee);
    for (const [pid, q] of Object.entries(o.items)) t.sold[pid] = (t.sold[pid] ?? 0) + q;
    this.state.lifetime.sold += units;
    t.deliveries++;
    if (o.onTime) t.deliveryFees += o.fee;
    else t.lateDeliveries++;
    const stars = o.onTime ? b.delivery.onTimeStars : b.delivery.lateStars;
    recordRating(this.state, stars);
    const review = maybeDeliveryReview(this.state, o.id, !!o.onTime, stars);
    if (review) this.events.emit('review', review);
    t.ratingSum += stars;
    t.ratingCount++;
    let exp = units * b.expPerItem + (stars >= 3 ? b.expPerHappy : 0);
    exp = Math.round(exp * saleExpMultiplier(this.state.level));
    const courier = this.staffOf(o.courier);
    if (courier) {
      if (t.managerDay) exp = Math.round(exp * b.staff.managerExpMul);
      t.staffExp += exp;
      this.jobDone(courier);
    }
    addPlayerExperience(this.state, exp);
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
    if (!c || c.status === 'waiting') {
      if (this.autoRefill && this.autoRefillOne()) this.autoCooldown = this.autoPlayerReact;
      return;
    }
    this.autoCooldown = this.autoPlayerReact;
    if (c.status === 'scanning' && !c.counterRequestResolved) {
      const line = c.order.find((item) => item.counterLine && item.picked === 0 && item.missing === 0);
      // Đang pha ly cho khách này thì chờ mẻ xong.
      if (this.isBrewingFor(c.id)) return;
      const exact = line ? this.state.counter.findIndex((slot) => slotMatch(slot, line) === 'exact') : -1;
      if (exact >= 0) this.serveCounterRequest(exact);
      else if (this.startBrew()) return;
      else {
        const idx = line ? this.state.counter.findIndex((slot) => slot.productId === line.productId && slot.qty > 0) : -1;
        if (idx >= 0) this.serveCounterRequest(idx);
        else c.counterRequestLeft = 0;
      }
    }
    if (c.status === 'scanning' && c.counterRequestResolved) {
      // Có độ trễ (mô phỏng người thật): quét từng món mỗi lần chạm; bỏ qua ngày thì quét hết.
      const line = c.order.find((item) => item.picked > item.scanned);
      if (this.autoPlayerReact > 0 && line) this.scanItem(line.productId);
      else this.scanAll(true);
    }
    // Bớt như nhân viên: chỉ nhận khi khách xin không quá ngưỡng, xin nhiều hơn thì từ chối.
    if (c.status === 'bargain') this.resolveBargain((c.bargainPct ?? 0) <= DATA.balance.staff.bargainAcceptMax);
    if (c.status === 'credit') this.resolveCredit(canGiveCredit(this.state, orderTotal(c, this.state)));
    if (c.status === 'paying') this.autoChange();
  }

  /**
   * Quầy rảnh thì nạp ô vơi nhất (dưới ngưỡng nạp của nhân viên), mỗi lần một ô: ô kệ mất vài giây như người chơi chạm nạp,
   * ô sau quầy lấy từ kho ngay như lúc người chơi tự bày. Bỏ qua ô kệ nhân viên đã nhận.
   */
  private autoRefillOne(): boolean {
    if (this.refills.length) return false;
    const threshold = DATA.balance.staff.refillThreshold;
    let best: { shelf: number; slot: number; fill: number } | null = null;
    for (const shelf of usableShelves(this.state)) {
      const capacity = shelfCapacity(this.state, shelf);
      this.state.shelves[shelf].forEach((item, slot) => {
        const fill = item.qty / capacity;
        if (fill >= threshold || !canRefill(this.state, shelf, slot)) return;
        const claimed = this.tasks.get(`refill:${shelf}:${slot}`)?.claimedBy;
        if (claimed && claimed !== PLAYER) return;
        if (!best || fill < best.fill) best = { shelf, slot, fill };
      });
    }
    // Ô sau quầy dùng shelf = -1.
    this.state.counter.forEach((item, slot) => {
      if (!item.productId) return;
      const fill = item.qty / DATA.balance.counterCapacity;
      if (fill >= threshold || warehouseQty(this.state, item.productId) <= 0) return;
      if (!best || fill < best.fill) best = { shelf: -1, slot, fill };
    });
    const pick = best as { shelf: number; slot: number } | null;
    if (!pick) return false;
    if (pick.shelf < 0) return refillCounterSlot(this.state, pick.slot) > 0;
    return this.startRefill(pick.shelf, pick.slot);
  }
}

/** "Bỏ qua ngày": chạy hết ngày bằng tick không render (quầy người chơi tự phục vụ). */
/**
 * Xếp khách vào hàng theo số thứ tự tới quầy (số nhỏ đứng trước), nhưng không chen lên trước vị trí `minIndex`
 * (vd 1 = người đầu hàng đang được tính tiền). Khách chưa có số đứng cuối.
 */
export function insertByTicket(queue: Customer[], c: Customer, minIndex: number): void {
  const t = c.ticket ?? Number.POSITIVE_INFINITY;
  let i = queue.length;
  while (i > minIndex && (queue[i - 1].ticket ?? Number.POSITIVE_INFINITY) > t && queue[i - 1].cutLeft === undefined) i--;
  queue.splice(i, 0, c);
}

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
  // Tiệm xôi: nếp chín thừa và mẻ ngâm quá hạn bị bỏ cuối ngày; có thợ thì thợ tự ngâm cho mai.
  spoilRiceEndOfDay(state, state);
  let soakNote: string | null = null;
  if (state.staff.some((st) => st.role === 'xoi_cook' && !st.quitting)) {
    const kg = suggestSoakKg(state);
    if (kg > 0 && startSoak(state, state, kg).ok) soakNote = `🪣 Thợ nấu xôi đã ngâm ${kg} kg nếp cho hôm nay.`;
  }
  const power = electricityCost(state);
  state.money -= power;
  t.electricity += power;
  // Lương cuối ngày cho người có ca; thiếu tiền thành nợ lương.
  const pay = payroll(state);
  state.morningNotes = updateMoods(state).map((n) => n.text);
  if (soakNote) state.morningNotes.push(soakNote);
  if (pay.debt > 0) state.morningNotes.push(`Còn nợ lương nhân viên ${formatMoney(pay.debt)}`);
  if (t.counterfeitLoss) state.morningNotes.push(`💸 Kiểm két cuối ngày phát hiện ${formatMoney(t.counterfeitLoss)} tiền giả lọt qua quầy. Thu ngân càng chính xác càng dễ phát hiện.`);
  markBadDebts(state);
  const avg = t.ratingCount ? t.ratingSum / t.ratingCount : 0;
  state.lifetime.loveStreak = t.ratingCount && avg >= DATA.balance.loveStreakRating ? state.lifetime.loveStreak + 1 : 0;
  const preTaxProfit = t.revenue - t.cogs + t.tips - t.overpaid + t.debtCollectedAmount - t.spoiledCost - t.electricity + t.questMoney
    - t.wages - t.bonuses - t.theftCost + t.fines + t.deliveryFees - (t.counterfeitLoss ?? 0) + (t.policeRecovered ?? 0);
  const dayTax = endDayTax(state, preTaxProfit);
  const achievements = checkAchievements(state).map((a) => a.id);
  const levelUps = [...t.levelUps, ...applyLevelUps(state).map((l) => l.level)];
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
    netProfit: preTaxProfit - dayTax.tax,
    achievements,
    wages: t.wages,
    wageDebt: state.wageDebt,
    bonuses: t.bonuses,
    theftCost: t.theftCost,
    counterfeitLoss: t.counterfeitLoss,
    policeRecovered: t.policeRecovered,
    fines: t.fines,
    deliveryFees: t.deliveryFees,
    internalCost: t.internalCost,
    staffLevelUps: [...t.staffLevelUps],
    journal: [...t.journal],
    closedEarlyAt: t.closedEarlyAt,
    sentHome: t.sentHome,
    tax: dayTax.tax,
    staffPit: dayTax.staffPit,
    taxReserved: dayTax.reserved,
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
      addPlayerExperience(state, quest.rewardExp);
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
  const yesterdayRevenue = state.today.revenue;
  const branchIncome = simulateBranches(state, state.day - 1);
  // Reset trước các chuyến giao để giá vốn nhận hàng được ghi vào ngày mới.
  state.phase = 'morning';
  state.clock = DATA.balance.openMinute;
  state.today = emptyStats();
  state.lastSummary = null;
  // Qua đêm (tiệm đóng cửa): trộm đột nhập, đồ đạc hao mòn / hỏng.
  state.morningNotes.push(...resolvePoliceCases(state));
  state.morningNotes.push(...nightBurglary(state, yesterdayRevenue));
  state.morningNotes.push(...wearOvernight(state));
  const arrivals = deliverBranchShipments(state, state.day, DATA.balance.openMinute);
  if (arrivals) state.morningNotes.push(`🚚 ${arrivals} chuyến xe hàng đã đến chi nhánh.`);
  // Đơn nội bộ: giao xôi gói tới hạn (7h), sinh đơn định kỳ cho sáng mai, dọn đơn cũ.
  runInternalSupplyMorning(state);
  for (const [id, amount] of Object.entries(branchIncome)) {
    const name = state.stores.find((store) => store.id === id)?.name ?? id;
    state.morningNotes.push(`${name} đóng góp ${formatMoney(amount)} từ ngày hôm qua.`);
  }
  discardSpoiledSoaks(state, state);
  updateTax(state);
  state.morningNotes.push(...taxReminders(state));
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
  // Thuế của doanh thu buổi sáng (giao đơn tiệc, thu nợ) vẫn tính vào tổng kết ngày.
  state.today.taxAccrued = morning.taxAccrued ?? 0;
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
