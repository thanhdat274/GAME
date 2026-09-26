import { describe, expect, it } from 'vitest';
import { DATA, validateProducts } from '../src/core/data';
import { DaySession, endDay, openShop, startNextDay } from '../src/core/day';
import { type Customer, type OrderLine } from '../src/core/customers';
import { attraction, attractionMultiplier, buyDecor } from '../src/core/decor';
import {
  buyFixture, checkPaths, maxQueueFor, placementError, plotStatus, unlockPlot, walkTiles,
} from '../src/core/layout';
import { canGiveCredit, debtLimit, markBadDebts, recordDebt, remindDebt, repaymentsToday } from '../src/core/ledger';
import { cheapSpawnMultiplier, clampPrice, keepChance, priceRange, setPrice } from '../src/core/pricing';
import { checkAchievements, claimQuest, ensureDailyQuests, questDef, questDone, rerollQuest } from '../src/core/quests';
import { Rng } from '../src/core/rng';
import { exportBackupCode, importBackupCode, migrate } from '../src/core/save';
import {
  assignSlot, buyStock, checkCart, discardLot, electricityCost, expireLots, lineCost, priceFactor, receiveDeliveries,
  refillSlot, sellFixture, setClearance, slotFreshness, stowHolding, unitCost, upgradeWarehouse, warehouseCapacity,
} from '../src/core/stock';
import { createNewGame, lotsFrom, shelfKind, warehouseQty, type GameState } from '../src/core/state';
import { BACKUP_KEY, PRE_MIGRATE_KEY, SAVE_KEY, loadGame, type KeyValueStore } from '../src/core/save';
import saveV2 from './fixtures/save-v2.json';

function lvl(level: number, money = 2_000_000): GameState {
  const s = createNewGame();
  s.level = level;
  s.money = money;
  s.settings.autoChange = false;
  return s;
}

/** Tiệm L5 có Đất A và một tủ lạnh ở (0,3). */
function withFridge(level = 5): { s: GameState; fridge: number } {
  const s = lvl(level);
  expect(unlockPlot(s, 'A')).toBe('open');
  expect(buyFixture(s, 'fridge', 0, 3, 0)).toBe('ok');
  const fridge = s.fixtures.find((f) => f.type === 'fridge')!.shelf!;
  return { s, fridge };
}

const line = (productId: string, qty = 1): OrderLine => ({ productId, qty, picked: 0, scanned: 0, missing: 0, pickedFrom: [] });

function forceOrder(d: DaySession, lines: OrderLine[], patch: Partial<Customer> = {}): void {
  let forced = false;
  d.events.on('customerArrived', (c) => {
    if (forced) return;
    forced = true;
    c.order = structuredClone(lines);
    c.shopBudget = 60;
    c.counterRequestResolved = true;
    Object.assign(c, patch);
  });
}

function tickUntil(d: DaySession, predicate: () => boolean, max = 4000): void {
  for (let i = 0; i < max && !predicate(); i++) d.tick(0.1);
  if (!predicate()) throw new Error('condition not reached');
}

describe('dữ liệu giai đoạn 2', () => {
  it('có 16 món mới với trường hạn dùng / lạnh hợp lệ', () => {
    const fresh = DATA.products.filter((p) => p.unlockLevel <= 20 && ['drink', 'fresh', 'frozen'].includes(p.category));
    expect(fresh).toHaveLength(16);
    expect(DATA.products.filter((p) => p.requiresCold === 'freezer').every((p) => p.unlockLevel === 9)).toBe(true);
    expect(DATA.levels.maxLevel).toBe(35);
    expect(DATA.levels.levels.slice(0, 9).map((l) => l.exp)).toEqual([0, 80, 200, 360, 560, 800, 1080, 1400, 1780]);
  });

  it('báo lỗi shelfLifeDays <= 0 và requiresCold sai, chỉ rõ id', () => {
    const errors = validateProducts([
      { id: 'hu', name: 'Hư', category: 'fresh', icon: '?', color: '#fff', cost: 1000, price: 2000, size: 1, unlockLevel: 7, shelfLifeDays: 0 },
      { id: 'lanh', name: 'Lạnh', category: 'frozen', icon: '?', color: '#fff', cost: 1000, price: 2000, size: 1, unlockLevel: 9, requiresCold: 'ice' },
    ]);
    expect(errors).toEqual(['hu: shelfLifeDays phải > 0', 'lanh: requiresCold phải là "fridge" hoặc "freezer"']);
  });
});

describe('mặt bằng và nội thất', () => {
  it('bố cục mặc định có lối đi thông tới quầy và 3 kệ', () => {
    expect(checkPaths(createNewGame())).toEqual({ ok: true, blocked: [] });
  });

  it('đất A cần level 5 và 150.000đ; mở thì trừ tiền', () => {
    const s = lvl(4, 180_000);
    expect(plotStatus(s, 'A')).toBe('level');
    s.level = 5;
    expect(unlockPlot(s, 'A')).toBe('open');
    expect(s.money).toBe(30_000);
    expect(plotStatus(s, 'B')).toBe('level');
    expect(maxQueueFor(s)).toBe(DATA.balance.maxQueue + 1);
  });

  it('không đặt chồng, không đặt lên đất khóa hoặc cửa', () => {
    const s = lvl(9);
    expect(placementError(s, 'fridge', 0, 3, 0)).toBe('locked');
    unlockPlot(s, 'A');
    expect(placementError(s, 'fridge', 0, 4, 0)).toBe('overlap');
    expect(placementError(s, 'fridge', 0, 3, 0)).toBeNull();
    expect(placementError(s, 'storage_rack', 0, 7, 0)).toBe('door');
  });

  it('sân sau chỉ đặt kệ kho', () => {
    const s = lvl(9);
    unlockPlot(s, 'A');
    unlockPlot(s, 'B');
    unlockPlot(s, 'C');
    expect(placementError(s, 'fridge', 4, 0, 0)).toBe('storage-only');
    expect(buyFixture(s, 'storage_rack', 4, 0, 0)).toBe('ok');
    expect(warehouseCapacity(s)).toBe(30 + 10);
  });

  it('bố cục chặn lối đi bị phát hiện bằng BFS', () => {
    const s = lvl(5);
    unlockPlot(s, 'A');
    // Tủ lạnh đặt vào lối đi duy nhất (cột 1) chặn cửa với quầy và các kệ.
    expect(buyFixture(s, 'fridge', 1, 5, 0)).toBe('ok');
    const result = checkPaths(s);
    expect(result.ok).toBe(false);
    expect(result.blocked.length).toBeGreaterThan(0);
  });

  it('bán kệ còn hàng: hàng về kho và nhận 50% giá', () => {
    const { s, fridge } = withFridge();
    s.warehouse = lotsFrom({ nuoc_ngot: 12 });
    assignSlot(s, fridge, 0, 'nuoc_ngot');
    assignSlot(s, fridge, 1, 'nuoc_ngot');
    const money = s.money;
    const uid = s.fixtures.find((f) => f.shelf === fridge)!.uid;
    expect(sellFixture(s, uid)).toBe('ok');
    expect(warehouseQty(s, 'nuoc_ngot')).toBe(12);
    expect(s.money).toBe(money + 60_000);
  });

  it('quãng đường tăng khi nội thất ở xa', () => {
    const { s, fridge } = withFridge();
    const f = s.fixtures.find((item) => item.shelf === fridge)!;
    const near = s.fixtures.find((item) => item.shelf === 0)!;
    expect(walkTiles(s, null, f)).toBeGreaterThan(walkTiles(s, null, near));
  });
});

describe('kho, tủ lạnh và hạn dùng', () => {
  it('nâng cấp kho cần level 8 và tiền', () => {
    const s = lvl(7);
    expect(upgradeWarehouse(s)).toBe('level');
    s.level = 8;
    const before = s.money;
    expect(upgradeWarehouse(s)).toBe('ok');
    expect(warehouseCapacity(s)).toBe(50);
    expect(s.money).toBe(before - 250_000);
  });

  it('kem chỉ bày được trong tủ đông, nước ngọt bày được tủ lạnh', () => {
    const { s, fridge } = withFridge(9);
    s.warehouse = lotsFrom({ kem_que: 5, nuoc_ngot: 5 });
    expect(() => assignSlot(s, 0, 0, 'kem_que')).toThrow('needs-freezer');
    expect(() => assignSlot(s, fridge, 0, 'kem_que')).toThrow('needs-freezer');
    expect(assignSlot(s, fridge, 0, 'nuoc_ngot')).toBe(5);
    expect(shelfKind(s, fridge)).toBe('fridge');
  });

  it('tiền điện: 1 tủ lạnh + 1 tủ đông = 13.000đ', () => {
    const { s } = withFridge(9);
    unlockPlot(s, 'B');
    expect(buyFixture(s, 'freezer', 4, 3, 0)).toBe('ok');
    expect(electricityCost(s)).toBe(13_000);
    s.phase = 'open';
    const sum = endDay(s);
    expect(sum.electricity).toBe(13_000);
  });

  it('nhập bánh mì ngày 12 thì hạn tới hết ngày 13, hết ngày 13 thì hỏng', () => {
    const s = lvl(7);
    s.day = 12;
    expect(buyStock(s, { banh_mi: 10 }).ok).toBe(true);
    expect(s.warehouse[0]).toMatchObject({ productId: 'banh_mi', qty: 10, exp: 13 });
    assignSlot(s, 0, 0, 'banh_mi');
    s.shelves[0][0].qty = 3;
    s.shelves[0][0].lots = [{ qty: 3, exp: 13 }];
    s.day = 13;
    s.today.spoiled = {};
    expireLots(s, 13);
    expect(s.today.spoiled).toEqual({ banh_mi: 3 });
    expect(s.today.spoiledCost).toBe(9_000);
    expect(s.shelves[0][0].qty).toBe(0);
  });

  it('nạp kệ lấy lô hạn sớm nhất trước (FEFO)', () => {
    const s = lvl(7);
    s.warehouse = [{ productId: 'trung_ga', qty: 10, exp: 16 }, { productId: 'trung_ga', qty: 4, exp: 14 }];
    assignSlot(s, 0, 0, 'trung_ga');
    expect(s.shelves[0][0].lots).toEqual([{ qty: 4, exp: 14 }, { qty: 6, exp: 16 }]);
    expect(s.warehouse).toEqual([{ productId: 'trung_ga', qty: 4, exp: 16 }]);
  });

  it('nhãn hạn và bán xả chỉ cho hàng hết hạn hôm nay', () => {
    const s = lvl(7);
    s.day = 5;
    s.warehouse = [{ productId: 'banh_mi', qty: 5, exp: 5 }, { productId: 'rau_muong', qty: 5, exp: 6 }];
    assignSlot(s, 0, 0, 'banh_mi');
    assignSlot(s, 0, 1, 'rau_muong');
    expect(slotFreshness(s.shelves[0][0], 5)).toBe('today');
    expect(slotFreshness(s.shelves[0][1], 5)).toBe('soon');
    expect(setClearance(s, 0, 1, 50)).toBe(false);
    expect(setClearance(s, 0, 0, 50)).toBe(true);
  });

  it('bỏ lô ghi tổn thất theo giá vốn', () => {
    const s = lvl(7);
    s.warehouse = [{ productId: 'trung_ga', qty: 10, exp: 3 }];
    expect(discardLot(s, 0)).toBe(true);
    expect(s.warehouse).toEqual([]);
    expect(s.today.spoiledCost).toBe(25_000);
  });
});

describe('mối sỉ và giá', () => {
  it('giá sỉ dao động trong ±15% và tất định theo ngày', () => {
    const s = lvl(6);
    for (let day = 1; day < 40; day++) {
      const f = priceFactor('mi_goi', day);
      expect(f).toBeGreaterThanOrEqual(0.85);
      expect(f).toBeLessThanOrEqual(1.15);
      expect(priceFactor('mi_goi', day)).toBe(f);
    }
    expect(unitCost(lvl(5), 'mi_goi')).toBe(3500);
    expect(unitCost(s, 'mi_goi', 'anh_ba')).toBeLessThan(unitCost(s, 'mi_goi', 'co_tu'));
  });

  it('mua từ 50 đơn vị giảm 5%', () => {
    const s = lvl(6);
    const unit = unitCost(s, 'mi_goi');
    expect(lineCost(s, 'mi_goi', 49)).toBe(unit * 49);
    expect(lineCost(s, 'mi_goi', 50)).toBe(Math.round(unit * 50 * 0.95));
  });

  it('Anh Ba: dưới 200.000đ không đặt được; giao 15:00 hôm sau; dư kho vào hàng chờ', () => {
    const s = lvl(6, 5_000_000);
    s.day = 20;
    const small = checkCart(s, { mi_goi: 10 }, 'anh_ba');
    expect(small).toMatchObject({ ok: false, reason: 'min-order' });
    const money = s.money;
    const r = buyStock(s, { gao: 200 }, 'anh_ba');
    expect(r.ok).toBe(true);
    expect(s.money).toBeLessThan(money);
    expect(warehouseQty(s, 'gao')).toBe(0);
    expect(receiveDeliveries(s, 21, 899)).toEqual([]);
    const got = receiveDeliveries(s, 21, 900);
    expect(got[0].stored).toBe(150); // 30 ô / size 2 = 150 gói
    expect(got[0].held).toBe(50);
    expect(stowHolding(s)).toBe(50);
  });

  it('giá bán kẹp trong 80–150% theo bước 500đ', () => {
    const s = lvl(6);
    expect(priceRange('snack')).toEqual({ min: 6500, max: 12000, ref: 8000 });
    expect(setPrice(s, 'snack', 1000)).toBe(6500);
    expect(setPrice(s, 'snack', 9800)).toBe(10000);
    expect(clampPrice('snack', 99999)).toBe(12000);
    setPrice(s, 'snack', 8000);
    expect(s.prices.snack).toBeUndefined();
  });

  it('học sinh gần như không mua snack giá 150%', () => {
    const s = lvl(6);
    setPrice(s, 'snack', 12000);
    const student = DATA.customers.find((c) => c.id === 'hoc_sinh')!;
    const office = DATA.customers.find((c) => c.id === 'van_phong')!;
    expect(keepChance(s, 'snack', student)).toBeCloseTo(DATA.balance.pricing.minKeep);
    expect(keepChance(s, 'snack', office)).toBeCloseTo(0.75);
  });

  it('giá rẻ tăng sinh khách tối đa 10%', () => {
    const s = lvl(6);
    expect(cheapSpawnMultiplier(s)).toBe(1);
    for (const p of DATA.products) if (!p.behindCounter && p.unlockLevel <= 6) setPrice(s, p.id, 0);
    expect(cheapSpawnMultiplier(s)).toBeGreaterThan(1.08);
    expect(cheapSpawnMultiplier(s)).toBeLessThanOrEqual(1.1);
  });
});

describe('sổ nợ', () => {
  it('hạn mức 20% tiền mặt', () => {
    const s = lvl(7, 100_000);
    expect(debtLimit(s)).toBe(20_000);
    expect(canGiveCredit(s, 20_000)).toBe(true);
    expect(canGiveCredit(s, 20_500)).toBe(false);
    expect(canGiveCredit(lvl(6, 100_000), 1000)).toBe(false);
  });

  it('tỉ lệ trả đúng hạn / trễ / quỵt xấp xỉ 80/15/5', () => {
    const s = lvl(7, 1e12);
    const rng = new Rng(7);
    for (let i = 0; i < 4000; i++) recordDebt(s, 'Chú Sáu', 1000, rng);
    const count = (fate: string) => s.ledger.filter((d) => d.fate === fate).length / 4000;
    expect(count('onTime')).toBeCloseTo(0.8, 1);
    expect(count('late')).toBeCloseTo(0.15, 1);
    expect(count('default')).toBeCloseTo(0.05, 1);
  });

  it('nhắc khi chưa tới hạn thì ghi 2 sao; quá 7 ngày thành nợ khó đòi', () => {
    const s = lvl(7, 1_000_000);
    const rng = new Rng(1);
    const d = recordDebt(s, 'Chú Sáu', 35_000, rng);
    d.fate = 'default';
    d.repayDay = null;
    expect(remindDebt(s, d.id, rng)).toBe('early');
    expect(s.ratings.at(-1)).toBe(2);
    s.day += 7;
    markBadDebts(s);
    expect(d.status).toBe('bad');
    expect(s.today.badDebt).toBe(35_000);
  });

  it('nhắc nợ quá hạn thường khiến khách trả trong 2 ngày', () => {
    let repaid = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = lvl(7, 1_000_000);
      const rng = new Rng(seed);
      const d = recordDebt(s, 'Cô Bảy', 20_000, rng);
      d.repayDay = null;
      s.day = d.dueDay + 1;
      remindDebt(s, d.id, rng);
      if (d.repayDay !== null && d.repayDay <= s.day + 2) repaid++;
    }
    expect(repaid / 200).toBeGreaterThan(0.88);
  });

  it('khách nợ tới trả trong ngày bán hàng', () => {
    const s = lvl(7, 1_000_000);
    const d = recordDebt(s, 'Chú Sáu', 35_000, new Rng(3));
    d.repayDay = s.day + 1;
    startNextDay(s);
    expect(repaymentsToday(s)).toHaveLength(1);
    openShop(s);
    const session = new DaySession(s, 9);
    const money = s.money;
    let event = 0;
    session.events.on('debtRepaid', () => event++);
    for (let i = 0; i < 2000 && !session.ended; i++) session.tick(0.1);
    expect(event).toBe(1);
    expect(d.status).toBe('paid');
    expect(s.today.debtCollectedAmount).toBe(35_000);
    expect(s.money).toBeGreaterThanOrEqual(money + 35_000 - 1);
  });
});

describe('phiên bán giai đoạn 2', () => {
  function drinkShop(onShelf: boolean): GameState {
    const { s, fridge } = withFridge(6);
    s.warehouse = lotsFrom({ nuoc_ngot: 40 });
    if (onShelf) assignSlot(s, 0, 0, 'nuoc_ngot');
    else assignSlot(s, fridge, 0, 'nuoc_ngot');
    openShop(s);
    return s;
  }

  it('nước ngọt để kệ thường: khoảng một nửa khách chê "không lạnh"', () => {
    let cold = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = drinkShop(true);
      const d = new DaySession(s, seed);
      forceOrder(d, [line('nuoc_ngot')]);
      let declined = false;
      d.events.on('notCold', () => { declined = true; });
      tickUntil(d, () => declined || (d.front?.status === 'scanning') || s.today.left > 0);
      if (declined) cold++;
    }
    expect(cold / 60).toBeGreaterThan(0.3);
    expect(cold / 60).toBeLessThan(0.7);
  });

  it('nước ngọt trong tủ lạnh không bị chê', () => {
    const s = drinkShop(false);
    const d = new DaySession(s, 4);
    forceOrder(d, [line('nuoc_ngot', 2)]);
    tickUntil(d, () => d.front?.status === 'scanning');
    expect(d.front!.order[0].picked).toBe(2);
    expect(s.today.notCold).toEqual({});
  });

  it('giá đặt được tính vào tiền khách trả; giá quá cao bị chê', () => {
    const s = drinkShop(false);
    setPrice(s, 'nuoc_ngot', 12000);
    const d = new DaySession(s, 11);
    forceOrder(d, [line('nuoc_ngot', 1)], { type: DATA.customers.find((c) => c.id === 'van_phong')! });
    let complaint = false;
    d.events.on('priceComplaint', () => { complaint = true; });
    tickUntil(d, () => complaint || d.front?.status === 'scanning');
    if (!complaint) {
      d.scanAll();
      expect(d.front!.total).toBe(12000);
    } else {
      expect(s.today.priceComplaints.nuoc_ngot).toBe(1);
    }
  });

  it('bán xả 50% giảm nửa giá của món lấy từ ô đó', () => {
    const s = lvl(7);
    s.day = 3;
    s.warehouse = [{ productId: 'banh_mi', qty: 5, exp: 3 }];
    assignSlot(s, 0, 0, 'banh_mi');
    openShop(s);
    setClearance(s, 0, 0, 50);
    const d = new DaySession(s, 2);
    forceOrder(d, [line('banh_mi', 2)]);
    tickUntil(d, () => d.front?.status === 'scanning');
    d.scanAll();
    if (d.front) d.autoChange();
    expect(s.today.revenue).toBe(5000);
  });

  it('khách mặc cả: bớt thì giảm tiền; không bớt thì hoặc bỏ về hoặc tối đa 3 sao', () => {
    const s = lvl(9);
    s.warehouse = lotsFrom({ gao: 20 });
    assignSlot(s, 0, 0, 'gao');
    openShop(s);
    const d = new DaySession(s, 5);
    forceOrder(d, [line('gao', 1)], { bargainPct: 10, wantsCredit: false });
    tickUntil(d, () => d.front?.status === 'scanning');
    d.scanAll();
    expect(d.front!.status).toBe('bargain');
    d.resolveBargain(true);
    expect(d.front!.status).toBe('paying');
    expect(d.front!.total).toBe(18000);

    let left = 0;
    let capped = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t = lvl(9);
      t.warehouse = lotsFrom({ gao: 20 });
      assignSlot(t, 0, 0, 'gao');
      openShop(t);
      const e = new DaySession(t, seed);
      forceOrder(e, [line('gao', 1)], { bargainPct: 10, wantsCredit: false });
      tickUntil(e, () => e.front?.status === 'scanning');
      e.scanAll();
      const c = e.front!;
      e.resolveBargain(false);
      if (c.status === 'done' && t.today.left) left++;
      else if (c.maxStars === 3) capped++;
    }
    expect(left).toBeGreaterThan(8);
    expect(capped).toBeGreaterThan(8);
  });

  it('khách ghi sổ: cho nợ ghi vào sổ, không cho thì khách bỏ về 2 sao', () => {
    const s = lvl(7, 1_000_000);
    s.warehouse = lotsFrom({ gao: 20 });
    assignSlot(s, 0, 0, 'gao');
    openShop(s);
    const d = new DaySession(s, 8);
    forceOrder(d, [line('gao', 1)], { wantsCredit: true, name: 'Chú Sáu' });
    let requested = false;
    d.events.on('creditRequested', (e) => { requested = e.allowed; });
    tickUntil(d, () => d.front?.status === 'scanning');
    d.scanAll();
    expect(requested).toBe(true);
    const money = s.money;
    expect(d.resolveCredit(true)).toBe(true);
    expect(s.money).toBe(money);
    expect(s.ledger[0]).toMatchObject({ name: 'Chú Sáu', amount: 20000, dueDay: s.day + 3 });

    const t = lvl(7, 1_000_000);
    t.warehouse = lotsFrom({ gao: 20 });
    assignSlot(t, 0, 0, 'gao');
    openShop(t);
    const e = new DaySession(t, 8);
    forceOrder(e, [line('gao', 1)], { wantsCredit: true, name: 'Chú Sáu' });
    let stars = 0;
    e.events.on('customerLeft', (ev) => { stars = ev.stars; });
    tickUntil(e, () => e.front?.status === 'scanning');
    e.scanAll();
    e.resolveCredit(false);
    expect(stars).toBe(2);
    expect(t.shelves[0][0].qty).toBe(10);
  });
});

describe('làm tròn tiền', () => {
  it('tổng đơn luôn chia hết 1.000đ để thối được bằng khay tiền', () => {
    const s = lvl(7);
    s.warehouse = lotsFrom({ trung_ga: 20 });
    assignSlot(s, 0, 0, 'trung_ga');
    openShop(s);
    const d = new DaySession(s, 3);
    forceOrder(d, [line('trung_ga', 1)]);
    tickUntil(d, () => d.front?.status === 'scanning');
    d.scanAll();
    const total = d.front?.total ?? s.today.revenue;
    expect(total % 1000).toBe(0);
    expect(total).toBe(4000);
  });
});

describe('nhiệm vụ, thành tựu, trang trí', () => {
  it('từ level 5 có 3 nhiệm vụ mỗi ngày; xong thì nhận thưởng', () => {
    const s = lvl(5);
    ensureDailyQuests(s);
    expect(s.quests?.list).toHaveLength(3);
    const idx = 0;
    const q = questDef(s.quests!.list[idx].id);
    expect(claimQuest(s, idx)).toEqual({ ok: false, reason: 'not-done' });
    s.today.sold = { mi_goi: 999, nuoc_ngot: 999, snack: 999 };
    s.today.served = 999; s.today.happy = 999; s.today.revenue = 9e9; s.today.itemsScanned = 999; s.today.counterServed = 99;
    if (questDone(s, q)) {
      const money = s.money;
      expect(claimQuest(s, idx).ok).toBe(true);
      expect(s.money).toBe(money + q.money);
    }
    expect(lvl(4).quests).toBeNull();
  });

  it('đổi nhiệm vụ 1 lần/ngày', () => {
    const s = lvl(9);
    ensureDailyQuests(s);
    const before = s.quests!.list[1].id;
    expect(rerollQuest(s, 1)).toBe(true);
    expect(s.quests!.list[1].id).not.toBe(before);
    expect(rerollQuest(s, 2)).toBe(false);
  });

  it('7 ngày liền ≥ 4.8 sao mở mèo mướp', () => {
    const s = lvl(5);
    s.lifetime.loveStreak = 7;
    const got = checkAchievements(s);
    expect(got.map((a) => a.id)).toContain('loved_7');
    expect(s.decorOwned).toContain('meo_muop');
  });

  it('mèo quầy: khách chờ quá 5 giây có ~20% vuốt mèo, +2 giây kiên nhẫn', () => {
    let petted = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = lvl(5);
      s.decorOwned.push('meo_muop');
      s.warehouse = lotsFrom({ gao: 40 });
      assignSlot(s, 0, 0, 'gao');
      openShop(s);
      const d = new DaySession(s, seed);
      d.events.on('catPetted', (c) => {
        petted++;
        expect(c.waited).toBeGreaterThanOrEqual(5);
      });
      // Chỉ tính khách đã chờ đủ 5 giây (được xét vuốt mèo).
      d.events.on('customerLeft', ({ customer }) => { if (customer.catChecked) total++; });
      for (let i = 0; i < 900; i++) d.tick(0.1);
    }
    expect(total).toBeGreaterThan(50);
    expect(petted / total).toBeGreaterThan(0.1);
    expect(petted / total).toBeLessThan(0.3);
  });

  it('thu hút tối đa 100 → sinh khách +25%', () => {
    const s = lvl(9, 10_000_000);
    expect(attractionMultiplier(s)).toBe(1);
    for (const id of ['bien_led', 'day_den', 'lich_treo', 'than_tai', 'may_quat']) expect(buyDecor(s, id)).toBe('ok');
    s.decorOwned.push('tien_tai', 'meo_muop');
    expect(attraction(s)).toBe(92);
    s.decorOwned.push('meo_muop');
    unlockPlot(s, 'A');
    expect(buyDecor(s, 'chau_cay', { x: 3, y: 3 })).toBe('ok');
    expect(attraction(s)).toBe(100);
    expect(attractionMultiplier(s)).toBe(1.25);
  });
});

describe('bản lưu v3', () => {
  it('migrate v2: giữ dữ liệu và cập nhật level theo mốc EXP mới', () => {
    const v2 = (saveV2 as { state: Record<string, unknown> }).state;
    const s = migrate({ version: 2, state: structuredClone(v2) });
    expect(s.version).toBe(5);
    expect(s.warehouse).toEqual([{ productId: 'mi_goi', qty: 30, exp: null }, { productId: 'the_cao', qty: 4, exp: null }]);
    expect(s.money).toBe(432_100);
    expect(s.level).toBe(6);
    expect(s.zones).toEqual(['dry', 'snack', 'household']);
    expect(s.counter[0]).toEqual({ productId: 'gas_mini', qty: 2 });
    expect(s.settings).toEqual({ sound: false, autoChange: false, autoScan: true });
    expect(s.fixtures.filter((f) => f.shelf !== undefined).map((f) => f.shelf)).toEqual([0, 1, 2]);
    expect(s.shelves[0][0]).toMatchObject({ productId: 'mi_goi', qty: 6 });
    expect(checkPaths(s).ok).toBe(true);
    expect(s.ledger).toEqual([]);
  });

  it('tải bản v2 từ bộ nhớ: migrate thành công, giữ bản cũ làm dự phòng, không ghi đè bản v2', () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
    const raw = JSON.stringify(saveV2);
    store.setItem(SAVE_KEY, raw);
    const res = loadGame(store);
    expect(res.status).toBe('ok');
    expect(store.getItem(SAVE_KEY)).toBe(raw);
    expect(JSON.parse(store.getItem(PRE_MIGRATE_KEY)!)).toMatchObject({ version: 2, raw });
    // Bản lưu hỏng: không ghi đè, giữ .bak để thử lại.
    store.setItem(SAVE_KEY, '{"version":2,"state":{"warehouse":"x","shelves":5}');
    expect(loadGame(store).status).toBe('corrupt');
    expect(store.getItem(BACKUP_KEY)).toContain('"version":2');
  });

  it('mã sao lưu xuất rồi nhập lại đúng tiến trình', async () => {
    const s = lvl(6, 777_000);
    s.day = 15;
    s.warehouse = [{ productId: 'trung_ga', qty: 3, exp: 17 }];
    const code = await exportBackupCode(s);
    expect(code.startsWith('THDH1:')).toBe(true);
    const back = await importBackupCode(`  ${code}\n`);
    expect(back.money).toBe(777_000);
    expect(back.day).toBe(15);
    expect(back.warehouse).toEqual(s.warehouse);
    await expect(importBackupCode('xyz')).rejects.toThrow('không đúng định dạng');
    await expect(importBackupCode('THDH1:abc')).rejects.toThrow('hỏng');
  });
});

describe('cuối ngày', () => {
  it('tổng kết có hàng hỏng, tiền điện, chê giá và lãi ròng', () => {
    const { s } = withFridge(7);
    s.phase = 'open';
    s.today.revenue = 100_000;
    s.today.cogs = 70_000;
    s.today.priceComplaints = { nuoc_ngot: 6 };
    s.warehouse = [{ productId: 'banh_mi', qty: 2, exp: s.day }];
    const sum = endDay(s);
    expect(sum.spoiled).toEqual([{ productId: 'banh_mi', qty: 2 }]);
    expect(sum.electricity).toBe(5000);
    expect(sum.priceComplaints).toEqual([{ productId: 'nuoc_ngot', qty: 6 }]);
    expect(sum.netProfit).toBe(100_000 - 70_000 - 6000 - 5000);
  });

  it('refill vẫn đúng với kho nhiều lô', () => {
    const s = lvl(7);
    s.warehouse = [{ productId: 'trung_ga', qty: 3, exp: 9 }, { productId: 'trung_ga', qty: 3, exp: 10 }];
    assignSlot(s, 0, 0, 'trung_ga');
    s.shelves[0][0].qty = 4;
    s.shelves[0][0].lots = [{ qty: 4, exp: 10 }];
    s.warehouse = [{ productId: 'trung_ga', qty: 10, exp: 12 }];
    expect(refillSlot(s, 0, 0)).toBe(6);
    expect(s.shelves[0][0].lots).toEqual([{ qty: 4, exp: 10 }, { qty: 6, exp: 12 }]);
  });
});
