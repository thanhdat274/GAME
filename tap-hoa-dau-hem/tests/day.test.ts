import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { DaySession, endDay, grandmaHelp, openShop, startNextDay } from '../src/core/day';
import { meanSpawnSeconds, newShopMultiplier, type Customer, type OrderLine } from '../src/core/customers';
import { createNewGame, type GameState, lotsFrom } from '../src/core/state';
import { makeChange } from '../src/core/change';
import { generateOrder } from '../src/core/customers';
import { Rng } from '../src/core/rng';

const order = (productId = 'mi_goi', qty = 1): OrderLine => ({ productId, qty, picked: 0, scanned: 0, missing: 0, pickedFrom: [] });

function stockedGame(level = 1, autoChange = false): GameState {
  const s = createNewGame();
  s.level = level;
  s.settings.autoChange = autoChange;
  s.zones = s.zones.map((_, index) => index < 2 ? 'dry' : null);
  s.shelves[0][0] = { productId: 'mi_goi', qty: 5 };
  s.shelves[0][1] = { productId: 'gao', qty: 5 };
  s.shelves[0][2] = { productId: 'nuoc_mam', qty: 5 };
  s.shelves[0][3] = { productId: 'dau_an', qty: 5 };
  s.shelves[0][4] = { productId: 'duong', qty: 5 };
  s.shelves[0][5] = { productId: 'muoi', qty: 5 };
  s.warehouse = lotsFrom(Object.fromEntries(['mi_goi', 'gao', 'nuoc_mam', 'dau_an', 'duong', 'muoi'].map((id) => [id, 20])));
  openShop(s);
  return s;
}

function forceNextOrder(d: DaySession, lines: OrderLine[]): void {
  let forced = false;
  d.events.on('customerArrived', (c) => {
    if (forced) return;
    forced = true;
    c.order = structuredClone(lines);
    c.shopBudget = 30;
    c.browseIndex = 0;
    c.browseTimer = DATA.balance.zoneWalkSeconds;
    c.counterRequestResolved = !c.order.some((line) => line.counterLine);
  });
}

function tickUntil(d: DaySession, predicate: () => boolean, max = 3000): void {
  for (let i = 0; i < max && !predicate(); i++) d.tick(0.1);
  if (!predicate()) throw new Error('condition not reached');
}

function front(d: DaySession): Customer {
  tickUntil(d, () => !!d.front && d.front.status === 'scanning');
  return d.front!;
}

describe('khách tự mua hàng và thanh toán', () => {
  it('snapshot/restore giữ mô phỏng và RNG xác định qua lần khởi tạo mới', () => {
    const state = stockedGame();
    const original = new DaySession(state, 345);
    for (let i = 0; i < 24; i++) original.update(0.1);

    const restoredState = structuredClone(state);
    const restored = DaySession.restore(restoredState, original.snapshot());
    for (let i = 0; i < 600; i++) {
      original.update(0.1);
      restored.update(0.1);
    }

    expect(restoredState).toEqual(state);
    expect(restored.snapshot()).toEqual(original.snapshot());
  });

  it('đồng hồ chạy tới 20:00, đóng cửa và kết thúc sau khi khách được dọn', () => {
    const s = stockedGame();
    const d = new DaySession(s, 1);
    let closing = 0;
    d.events.on('closing', () => closing++);
    for (let i = 0; i < 1800 && !d.ended; i++) d.tick(0.1);
    for (let i = 0; i < 4000 && !d.ended; i++) d.tick(0.1);
    expect(s.clock).toBe(DATA.balance.closeMinute);
    expect(closing).toBe(1);
    expect(d.ended).toBe(true);
  });

  it('tạm dừng thì đồng hồ không chạy', () => {
    const s = stockedGame();
    const d = new DaySession(s, 1);
    d.paused = true;
    d.update(10);
    expect(s.clock).toBe(DATA.balance.openMinute);
  });

  it('tự lấy hàng khỏi đúng khu kệ và xếp vào hàng thanh toán', () => {
    const s = stockedGame();
    const d = new DaySession(s, 2);
    forceNextOrder(d, [order()]);
    const before = s.shelves[0][0].qty;
    const c = front(d);
    expect(c.order[0].picked).toBe(1);
    expect(s.shelves[0][0].qty).toBe(before - 1);
    expect(c.status).toBe('scanning');
  });

  it('không giảm kiên nhẫn trong lúc duyệt; có giới hạn số khách đang đi và đang xếp hàng', () => {
    const s = stockedGame();
    const d = new DaySession(s, 3);
    let browsing: Customer | undefined;
    d.events.on('customerArrived', (c) => { browsing ??= c; });
    tickUntil(d, () => !!browsing);
    const patience = browsing!.patience;
    for (let i = 0; i < 15; i++) d.tick(0.1);
    expect(browsing!.patience).toBe(patience);
    let maxShop = 0;
    let maxQueue = 0;
    for (let i = 0; i < 900; i++) {
      d.tick(0.1);
      maxShop = Math.max(maxShop, d.shoppers.length + d.entrants.length);
      maxQueue = Math.max(maxQueue, d.queue.length + d.ready.length);
    }
    expect(maxShop).toBeLessThanOrEqual(DATA.balance.maxShoppers);
    expect(maxQueue).toBeLessThanOrEqual(DATA.balance.maxQueue);
  });

  it('tranh hàng: khách sau ghi nhận món hết mà không lấy âm số lượng', () => {
    const s = stockedGame();
    s.shelves[0][0].qty = 1;
    const d = new DaySession(s, 4);
    let forced = 0;
    d.events.on('customerArrived', (c) => {
      if (forced++ >= 2) return;
      c.order = [order()];
      c.shopBudget = 30;
      c.browseTimer = DATA.balance.zoneWalkSeconds;
      c.counterRequestResolved = true;
    });
    tickUntil(d, () => s.today.missed.mi_goi === 1);
    expect(s.shelves[0][0].qty).toBe(0);
    expect(s.today.missed.mi_goi).toBe(1);
  });

  it('quét từng món hoặc quét hết, doanh thu và giá vốn chỉ tính món đã quét', () => {
    const s = stockedGame();
    const d = new DaySession(s, 5);
    forceNextOrder(d, [order('mi_goi'), order('gao')]);
    const c = front(d);
    expect(d.scanItem('mi_goi')).toBe(true);
    expect(c.order[0].scanned).toBe(1);
    expect(d.scanAll()).toBe(true);
    expect(c.status === 'paying' || c.status === 'done').toBe(true);
    if (c.status === 'paying') {
      for (const bill of makeChange(c.changeDue)) d.addBill(bill);
      d.giveChange();
    }
    expect(s.today.itemsScanned).toBe(2);
    expect(s.today.sold.mi_goi).toBe(1);
    expect(s.today.sold.gao).toBe(1);
    expect(s.today.served).toBe(1);
  });

  it('quét từng món nhanh có tip combo; Quét hết và Tự quét không nhận tip combo', () => {
    const manualState = stockedGame();
    const manual = new DaySession(manualState, 51);
    forceNextOrder(manual, [order()]);
    const manualCustomer = front(manual);
    manualCustomer.type.tipMul = 0;
    manual.scanItem('mi_goi');
    if (manual.front?.status === 'paying') {
      for (const bill of makeChange(manualCustomer.changeDue)) manual.addBill(bill);
      manual.giveChange();
    }
    expect(manualState.today.tips).toBeGreaterThanOrEqual(DATA.balance.scanTipBonus);

    const allState = stockedGame();
    const all = new DaySession(allState, 52);
    forceNextOrder(all, [order()]);
    const allCustomer = front(all);
    allCustomer.type.tipMul = 0;
    all.scanAll();
    if (all.front?.status === 'paying') {
      allCustomer.changeStartedAt = all.elapsed - DATA.balance.fastChangeSeconds;
      for (const bill of makeChange(allCustomer.changeDue)) all.addBill(bill);
      all.giveChange();
    }
    expect(allState.today.tips).toBe(0);

    const autoState = stockedGame(1, true);
    autoState.settings.autoScan = true;
    const auto = new DaySession(autoState, 53);
    forceNextOrder(auto, [order()]);
    let autoCustomer: Customer | undefined;
    auto.events.on('customerArrived', (c) => { autoCustomer ??= c; });
    let autoTip: number | undefined;
    auto.events.on('sale', (event) => { if (event.customer === autoCustomer) autoTip = event.tip; });
    tickUntil(auto, () => !!autoCustomer && autoCustomer.status === 'done');
    expect(autoTip).toBe(0);
  });

  it('thối thiếu, thối đúng, thối dư và tự thối giữ đúng kế toán', () => {
    const s = stockedGame();
    const d = new DaySession(s, 54);
    forceNextOrder(d, [order('nuoc_mam')]);
    const c = front(d);
    d.scanItem('nuoc_mam');
    if (c.status !== 'paying') throw new Error('expected payment state');
    c.changeDue = 10000;
    c.bill = c.total + c.changeDue;
    d.addBill(1000);
    expect(d.giveChange()).toBe('short');
    expect(c.shortAttempts).toBe(1);
    for (const bill of makeChange(c.changeDue)) d.addBill(bill);
    expect(d.giveChange()).toBe('exact');
    expect(s.today.served).toBe(1);

    const overState = stockedGame();
    const over = new DaySession(overState, 55);
    forceNextOrder(over, [order('nuoc_mam')]);
    const overCustomer = front(over);
    over.scanItem('nuoc_mam');
    if (overCustomer.status !== 'paying') throw new Error('expected payment state');
    overCustomer.changeDue = 10000;
    overCustomer.bill = overCustomer.total + 10000;
    over.addBill(15000);
    expect(over.giveChange()).toBe('over');
    expect(overState.today.overpaid).toBe(5000);
    expect(overState.money).toBe(DATA.balance.startMoney + overCustomer.total - 5000);
  });

  it('khách bỏ đi thì trả món trong giỏ về đúng kệ', () => {
    const s = stockedGame();
    const d = new DaySession(s, 6);
    forceNextOrder(d, [order()]);
    const before = s.shelves[0][0].qty;
    const c = front(d);
    expect(s.shelves[0][0].qty).toBe(before - 1);
    d.closed = true;
    d.shoppers.splice(0);
    d.entrants.splice(0);
    d.ready.splice(0);
    d.queue.splice(0, d.queue.length, c);
    c.patience = 0.05;
    for (let i = 0; i < 500 && c.status !== 'done'; i++) d.tick(0.1);
    expect(c.status).toBe('done');
    expect(s.shelves[0][0].qty).toBe(before);
    expect(s.today.left).toBe(1);
  });

  it('nạp theo khu lần lượt từng ô', () => {
    const s = stockedGame();
    s.shelves[0][0].qty = 1;
    s.shelves[0][1].qty = 1;
    const d = new DaySession(s, 7);
    expect(d.refillZone('dry')).toBe(true);
    expect(d.refillZone('dry')).toBe(false);
    for (let i = 0; i < 6; i++) d.tick(0.1);
    expect(s.shelves[0][0].qty).toBeGreaterThan(1);
    expect(s.shelves[0][1].qty).toBe(1);
    for (let i = 0; i < 20; i++) d.tick(0.1);
    expect(s.shelves[0][1].qty).toBeGreaterThan(1);
  });

  it('chỉ phục vụ món sau quầy tại level 3 trở lên; món đúng trừ kho quầy', () => {
    const s = stockedGame(3);
    s.shelves[1][0] = { productId: 'the_cao', qty: 0 };
    s.counter[0] = { productId: 'the_cao', qty: 2 };
    const d = new DaySession(s, 8);
    forceNextOrder(d, [{ ...order('the_cao'), counterLine: true }]);
    const c = front(d);
    expect(c.counterRequestLeft).not.toBeNull();
    expect(d.serveCounterRequest(0)).toBe('ok');
    expect(s.counter[0].qty).toBe(1);
    expect(c.order[0].picked).toBe(1);
    expect(d.scanItem('the_cao')).toBe(true);
    expect(s.today.counterServed).toBe(1);
  });

  it('không sinh yêu cầu hàng sau quầy trước level được mở khóa trong levels.json', () => {
    const type = { ...DATA.customers[0], counterRequestChance: 1 };
    for (let seed = 1; seed <= 50; seed++) {
      expect(generateOrder(type, 2, new Rng(seed)).some((line) => line.counterLine)).toBe(false);
    }
  });

  it('yêu cầu quầy sai bị phạt kiên nhẫn; yêu cầu hết hạn được ghi là thiếu', () => {
    const s = stockedGame(3);
    s.counter[0] = { productId: 'the_cao', qty: 2 };
    s.counter[1] = { productId: 'thuoc_la', qty: 2 };
    const d = new DaySession(s, 9);
    forceNextOrder(d, [{ ...order('the_cao'), counterLine: true }]);
    const c = front(d);
    const patience = c.patience;
    expect(d.serveCounterRequest(1)).toBe('wrong');
    expect(c.patience).toBe(patience - DATA.balance.counterWrongPenalty);
    for (let i = 0; i < DATA.balance.counterRequestSeconds * 10 + 5 && c.counterRequestLeft !== null; i++) d.tick(0.1);
    expect(c.order[0].missing).toBe(1);
    expect(s.today.missed.the_cao).toBe(1);
  });

  it('tự quét mặc định tắt; bật thì giỏ tự chuyển sang thanh toán', () => {
    const s = stockedGame(1, true);
    s.settings.autoScan = true;
    const d = new DaySession(s, 10);
    forceNextOrder(d, [order()]);
    let autoCustomer: Customer | undefined;
    d.events.on('customerArrived', (c) => { autoCustomer ??= c; });
    tickUntil(d, () => !!autoCustomer && (autoCustomer.order[0].scanned === 1 || autoCustomer.status === 'done'));
    const c = autoCustomer!;
    expect(c.order[0].scanned).toBe(1);
    expect(c.status === 'paying' || c.status === 'done').toBe(true);
    expect(s.today.itemsScanned).toBe(1);
  });
});

describe('nhu cầu, tiến độ và ngày mới', () => {
  it('đồng hồ ngày mới và tốc độ mở tiệm tăng dần', () => {
    expect(newShopMultiplier(1)).toBe(0.6);
    expect(newShopMultiplier(2)).toBe(0.8);
    expect(newShopMultiplier(3)).toBe(1);
    expect(meanSpawnSeconds(600, 1, 1)).toBeGreaterThan(meanSpawnSeconds(600, 1, 3));
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 1 });
    endDay(s);
    startNextDay(s);
    expect(s.day).toBe(2);
    expect(s.phase).toBe('morning');
  });

  it('tổng kết lãi gộp, món bán chạy và nhu cầu bỏ lỡ', () => {
    const s = createNewGame();
    s.today = { ...s.today, revenue: 150000, cogs: 110000, sold: { mi_goi: 12, muoi: 3 }, missed: { gao: 2 } };
    const sum = endDay(s);
    expect(sum.grossProfit).toBe(40000);
    expect(sum.bestSeller).toEqual({ productId: 'mi_goi', qty: 12 });
    expect(sum.missed).toEqual([{ productId: 'gao', qty: 2 }]);
    expect(s.yesterdayMissed.gao).toBe(2);
  });

  it('lên level được áp dụng ở tổng kết; bà gửi tiền khi kẹt vốn', () => {
    const s = createNewGame();
    s.exp = 125;
    expect(endDay(s).levelUps).toEqual([2]);
    expect(s.level).toBe(2);
    s.money = 1000;
    s.day = 5;
    expect(grandmaHelp(s)).toBe(50000);
  });
});
