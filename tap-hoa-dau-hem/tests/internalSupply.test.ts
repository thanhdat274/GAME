import { describe, expect, it } from 'vitest';
import { deliverBranchShipments, openBranch, simulateBranches, visitStore } from '../src/core/branches';
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless, startNextDay } from '../src/core/day';
import {
  assignCounterToOrders, cancelInternalOrder, generateRecurringOrders, internalFee, internalSuppliers, placeInternalOrder, productionCapacity, pruneInternalOrders, resolveDueOrders,
  setRecurringOrder,
} from '../src/core/internalSupply';
import { lastProductionReport, missingCook, simulateProductionDay } from '../src/core/production';
import { prepareRecipe, setRecipeActive } from '../src/core/recipes';
import { payroll } from '../src/core/staff';
import { createNewGame, lotsFrom, storeView, warehouseQty, type GameState, type Staff } from '../src/core/state';

const XOI_STOCK = { nep: 30, dau_xanh: 40, hanh_phi: 40, cha_bong: 40, lap_xuong: 40, dua_nao: 40, trung_ga: 40, bao_goi: 40, tra_da: 40 };

function cook(id = 'tho', hiredDay = 1): Staff {
  return {
    id, name: id, personality: 'diem_tinh', look: { shirt: '#fff', pants: '#000', hair: '#000', skin: '#fff' }, role: 'xoi_cook',
    stats: { speed: 5, accuracy: 5, friendly: 5, stamina: 5 }, wage: 30000, level: 1, exp: 0, mood: 70,
    hiredDay, streak: 0, lowMoodDays: 0, quitting: false, scoldedDay: null,
    lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 },
  } as Staff;
}

/** Chuỗi L30: tạp hóa chính (kho có nguyên liệu xôi) + tiệm xôi có kho riêng; đứng ở tạp hóa. */
function chain(): GameState {
  const state = createNewGame();
  state.level = 30;
  state.money = 10_000_000;
  state.day = 10;
  state.warehouse = lotsFrom({ nep: 12, cha_bong: 6 });
  openBranch(state, 'xoi');
  state.warehouse = lotsFrom(XOI_STOCK);
  state.soakBatches = [];
  for (const id of ['xoi_man', 'xoi_dau_xanh', 'xoi_trung', 'xoi_dua', 'xoi_man_goi', 'xoi_dau_xanh_goi']) setRecipeActive(state, id, true);
  visitStore(state, 'main');
  return state;
}

describe('mối nội bộ', () => {
  it('tạp hóa thấy "Tiệm xôi nhà mình" bán xôi gói; tiệm xôi thấy "Tạp hóa nhà mình" bán nguyên liệu trong kho', () => {
    const state = chain();
    const [xoi] = internalSuppliers(state);
    expect(xoi).toMatchObject({ storeId: 'xoi', name: 'Tiệm xôi nhà mình', kind: 'made' });
    expect(xoi.items.map((i) => i.productId)).toEqual(['xoi_dau_xanh_goi', 'xoi_man_goi', 'xoi_trung_goi', 'xoi_dua_goi']);
    expect(xoi.items.find((i) => i.productId === 'xoi_man_goi')!.available).toBe(40);
    const [grocery] = internalSuppliers(state, 'xoi');
    expect(grocery).toMatchObject({ storeId: 'main', name: 'Tạp hóa nhà mình', kind: 'stock' });
    expect(grocery.items.find((i) => i.productId === 'nep')!.available).toBe(12);
  });

  it('chưa có tiệm xôi thì không có mối nội bộ', () => {
    const state = createNewGame();
    state.level = 35;
    expect(internalSuppliers(state)).toEqual([]);
  });

  it('phân biệt các chi nhánh cùng loại khi có nhiều mối nội bộ', () => {
    const state = chain();
    expect(openBranch(state, 'market').ok).toBe(true);
    visitStore(state, 'xoi');
    expect(internalSuppliers(state).map((supplier) => supplier.name)).toEqual([
      'Tạp hóa nhà mình',
      'Chi nhánh Chợ · Tạp hóa',
    ]);
  });
});

describe('kéo nguyên liệu từ kho tạp hóa', () => {
  it('bốc FEFO, trả phí xe, tới kho tiệm xôi sáng mai giữ hạn dùng', () => {
    const state = chain();
    const main = storeView(state, 'main');
    main.warehouse = [{ productId: 'dua_nao', qty: 3, exp: 12 }, { productId: 'dua_nao', qty: 5, exp: 11 }];
    activate(state, 'xoi');
    const before = state.money;
    const result = placeInternalOrder(state, 'main', 'xoi', { dua_nao: 6 });
    if (!result.ok) throw new Error(result.reason);
    expect(state.money).toBe(before - internalFee(6));
    expect(warehouseQty(storeView(state, 'main'), 'dua_nao')).toBe(2);
    expect(result.order.status).toBe('shipping');
    deliverBranchShipments(state, state.day + 1);
    expect(state.holding.filter((l) => l.productId === 'dua_nao')).toEqual([{ productId: 'dua_nao', qty: 5, exp: 11 }, { productId: 'dua_nao', qty: 1, exp: 12 }]);
    expect(result.order.status).toBe('delivered');
    expect(state.today.internalCost).toBe(6 * 2500);
  });

  it('kho tạp hóa thiếu thì giao phần có, đơn giao thiếu và có ghi chú', () => {
    const state = chain();
    activate(state, 'xoi');
    const result = placeInternalOrder(state, 'main', 'xoi', { cha_bong: 10 });
    if (!result.ok) throw new Error(result.reason);
    deliverBranchShipments(state, state.day + 1);
    expect(result.order.status).toBe('short');
    expect(result.order.filled).toEqual({ cha_bong: 6 });
    expect(state.morningNotes.some((n) => n.includes('6/10'))).toBe(true);
  });
});

describe('đặt xôi gói từ tiệm xôi', () => {
  it('người chơi ở tiệm xôi làm món gói, "Giao cho đơn", sáng mai tạp hóa nhận ở quầy', () => {
    const state = chain();
    const placed = placeInternalOrder(state, 'xoi', 'main', { xoi_man_goi: 2 });
    if (!placed.ok) throw new Error(placed.reason);
    expect(placed.order).toMatchObject({ status: 'pending', dueDay: state.day + 1, dueMinute: 420 });
    activate(state, 'xoi');
    state.cookedRice = [{ portions: 5, cookedDay: state.day, cookedMinute: 480, quality: 1 }];
    for (let i = 0; i < 2; i++) expect(prepareRecipe(state, 'xoi_man_goi').ok).toBe(true);
    expect(assignCounterToOrders(state, 'xoi_man_goi')).toBe(2);
    expect(placed.order.status).toBe('made');
    expect(state.counter.some((s) => s.productId === 'xoi_man_goi')).toBe(false);
    const money = state.money;
    resolveDueOrders(state, state.day + 1);
    expect(placed.order.status).toBe('delivered');
    expect(state.money).toBe(money - internalFee(2));
    const main = storeView(state, 'main');
    expect(main.counter.find((s) => s.productId === 'xoi_man_goi')?.qty).toBe(2);
    expect(main.today.internalCost).toBe(2 * DATA.products.find((p) => p.id === 'xoi_man_goi')!.cost);
    expect(placed.order.internalCost).toBe(2 * DATA.products.find((p) => p.id === 'xoi_man_goi')!.cost);
  });

  it('làm thiếu thì giao phần có và báo ở buổi sáng tiệm nhận; hủy đơn chưa làm không mất tiền', () => {
    const state = chain();
    const a = placeInternalOrder(state, 'xoi', 'main', { xoi_dau_xanh_goi: 20 });
    const b = placeInternalOrder(state, 'xoi', 'main', { xoi_man_goi: 5 });
    if (!a.ok || !b.ok) throw new Error('đặt đơn lỗi');
    a.order.filled = { xoi_dau_xanh_goi: 12 };
    a.order.shortReason = 'thiếu nếp';
    const money = state.money;
    expect(cancelInternalOrder(state, b.order.id)).toBe(true);
    expect(state.money).toBe(money);
    resolveDueOrders(state, state.day + 1);
    expect(a.order.status).toBe('short');
    expect(b.order.status).toBe('cancelled');
    expect(state.morningNotes).toContain('⚠️ Tiệm xôi giao thiếu 8 phần: thiếu nếp.');
  });

  it('đơn định kỳ sinh đơn mỗi sáng, tạm dừng sau 3 lần giao thiếu; đơn cũ được dọn sau 7 ngày', () => {
    const state = chain();
    const rec = setRecurringOrder(state, 'xoi', 'main', { xoi_dau_xanh_goi: 15 }, true)!;
    expect(state.internalOrders.filter((o) => o.recurringId === rec.id)).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      state.day++;
      resolveDueOrders(state, state.day);
      generateRecurringOrders(state);
    }
    expect(rec.active).toBe(false);
    expect(state.morningNotes.some((n) => n.includes('tạm dừng'))).toBe(true);
    state.day += 8;
    pruneInternalOrders(state);
    expect(state.internalOrders).toEqual([]);
  });
});

describe('mô phỏng sản xuất khi vắng chủ', () => {
  it('có thợ: lấp đơn trước, bán lẻ phần còn lại, trừ nguyên liệu, tự ngâm cho mai, trả lương', () => {
    const state = chain();
    storeView(state, 'xoi').staff = [cook('tho', 1)];
    storeView(state, 'xoi').soakBatches = [{ id: 's', kg: 6, startDay: state.day - 1, startMinute: 1200 }];
    const order = placeInternalOrder(state, 'xoi', 'main', { xoi_man_goi: 10 });
    if (!order.ok) throw new Error(order.reason);
    const money = state.money;
    const report = simulateProductionDay(state, 'xoi', state.day);
    expect(order.order.filled.xoi_man_goi).toBe(10);
    expect(report.delivered).toBe(10);
    // 1 thợ tốc độ 5 làm 15 phần/ngày khi vắng chủ (như khi đứng chơi): 10 cho đơn trước, 5 bán lẻ.
    expect(productionCapacity(storeView(state, 'xoi'), 0.7)).toBe(15);
    expect(report.sold).toBe(5);
    const xoi = storeView(state, 'xoi');
    expect(warehouseQty(xoi, 'cha_bong')).toBeLessThan(40 - 10);
    expect(warehouseQty(xoi, 'bao_goi')).toBe(30);
    expect(xoi.soakBatches.length).toBe(1);
    expect(report.wages).toBe(30000);
    expect(state.money).toBe(money + report.revenue - report.wages);
    expect(lastProductionReport(state, 'xoi')).toEqual(report);
  });

  it('tất định: cùng dữ liệu cùng ngày ra cùng kết quả', () => {
    const runs = [chain(), chain()].map((state) => {
      storeView(state, 'xoi').staff = [cook()];
      storeView(state, 'xoi').soakBatches = [{ id: 's', kg: 5, startDay: state.day - 1, startMinute: 1200 }];
      return simulateProductionDay(state, 'xoi', state.day);
    });
    expect(runs[0]).toEqual(runs[1]);
  });

  it('lãi mô phỏng vắng chủ gần với đứng chơi cùng cấu hình và seed', () => {
    const seed = 1_010;
    const base = chain();
    activate(base, 'xoi');
    base.activeRecipes = ['xoi_man', 'xoi_dau_xanh', 'xoi_trung', 'xoi_dua'];
    base.staff = [cook('cook-a', 1), cook('cook-b', 1), cook('cook-c', 1)];
    base.schedule = Object.fromEntries(base.staff.map((s) => [s.id, Array.from({ length: 14 }, () => true)]));
    base.soakBatches = [{ id: 's', kg: 10, startDay: base.day - 1, startMinute: 1200 }];
    const sim = structuredClone(base);
    const live = structuredClone(base);

    simulateProductionDay(sim, 'xoi', sim.day, seed);
    openShop(live);
    const session = new DaySession(live, seed);
    runDayHeadless(session);
    endDay(live);

    const simProfit = lastProductionReport(sim, 'xoi')!.revenue
      - storeView(sim, 'xoi').today.cogs - storeView(sim, 'xoi').today.wages - storeView(sim, 'xoi').today.spoiledCost;
    const liveStore = storeView(live, 'xoi');
    const liveProfit = liveStore.today.revenue - liveStore.today.cogs - liveStore.today.wages - liveStore.today.spoiledCost;
    const error = Math.abs(simProfit - liveProfit) / Math.max(Math.abs(liveProfit), 1);
    expect(simProfit).toBeGreaterThan(0);
    expect(liveProfit).toBeGreaterThan(0);
    expect(error).toBeLessThanOrEqual(0.2);
  });

  it('không có thợ: không sản xuất, đơn tới hạn giao 0 và bản đồ cảnh báo', () => {
    const state = chain();
    const order = placeInternalOrder(state, 'xoi', 'main', { xoi_man_goi: 5 });
    if (!order.ok) throw new Error(order.reason);
    expect(missingCook(state, 'xoi')).toBe(true);
    const report = simulateProductionDay(state, 'xoi', state.day);
    expect(report).toMatchObject({ made: 0, sold: 0, noCook: true });
    resolveDueOrders(state, state.day + 1);
    expect(order.order.status).toBe('short');
    expect(order.order.shortReason).toBe('tiệm xôi không có thợ nấu');
  });

  it('chuỗi hỗn hợp: tiệm xôi sản xuất, tạp hóa vắng chủ tính lãi trung bình và bán bớt xôi gói được giao', () => {
    const state = chain();
    openBranch(state, 'market'); // người chơi đứng ở Chợ; tạp hóa chính và tiệm xôi vắng chủ
    storeView(state, 'xoi').staff = [cook()];
    storeView(state, 'xoi').soakBatches = [{ id: 's', kg: 4, startDay: state.day - 1, startMinute: 1200 }];
    const main = storeView(state, 'main');
    main.analytics = [{ profit: 100000 } as never];
    main.counter[0] = { productId: 'xoi_man_goi', qty: 10, lots: [{ qty: 10, exp: state.day }] };
    for (const id of ['main', 'xoi']) state.stores.find((s) => s.id === id)!.simDay = state.day - 1;
    const result = simulateBranches(state, state.day);
    const eff = Math.min(0.9, DATA.branches.find((b) => b.id === 'main')?.efficiency ?? 0.6);
    const priceMan = DATA.products.find((p) => p.id === 'xoi_man_goi')!.price;
    expect(result.main).toBe(Math.round(100000 * eff) + Math.floor(10 * eff) * priceMan);
    expect(main.counter[0].qty).toBe(0);
    expect(lastProductionReport(state, 'xoi')?.sold).toBeGreaterThan(0);
    expect(result.xoi).toBeGreaterThan(0);
  });

  it('100 ngày × 6 tiệm chạy bù dưới 200 ms', () => {
    const state = chain();
    for (const id of ['market', 'school', 'industrial']) { openBranch(state, id); visitStore(state, 'main'); }
    const xoi = state.stores.find((s) => s.id === 'xoi')!;
    state.stores.push({ ...structuredClone(xoi), id: 'xoi2', name: 'Tiệm xôi 2' });
    for (const id of ['xoi', 'xoi2']) {
      const data = storeView(state, id);
      data.staff = [cook()];
      data.warehouse = lotsFrom({ nep: 400, dau_xanh: 900, hanh_phi: 900, cha_bong: 900, lap_xuong: 900, dua_nao: 900, trung_ga: 900, bao_goi: 900, tra_da: 900 });
    }
    for (const s of state.stores) s.simDay = 0;
    // Lấy lần nhanh nhất trong 3 lần chạy trên bản sao: đo tốc độ mô phỏng, không đo lúc JIT khởi động
    // hay lúc CPU bị các file test khác chạy song song chiếm.
    let best = Infinity;
    let last = state;
    for (let i = 0; i < 3; i++) {
      last = structuredClone(state);
      const start = performance.now();
      simulateBranches(last, 100);
      best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(200);
    expect(lastProductionReport(last, 'xoi2')?.day).toBe(100);
  });
});

describe('chơi tạp hóa nhiều ngày khi tiệm xôi vắng chủ', () => {
  it('3 ngày: tiệm xôi chạy nền, đơn định kỳ giao vào quầy riêng tạp hóa mỗi sáng', () => {
    const state = chain();
    const xoi = storeView(state, 'xoi');
    xoi.staff = [cook('cook-away-a', 1), cook('cook-away-b', 1), cook('cook-away-c', 1)];
    xoi.warehouse = lotsFrom({ nep: 100, dau_xanh: 200, hanh_phi: 200, cha_bong: 200, lap_xuong: 200, dua_nao: 200, trung_ga: 200, bao_goi: 200 });
    xoi.activeRecipes = ['xoi_man', 'xoi_dau_xanh', 'xoi_trung', 'xoi_dua'];
    xoi.soakBatches = [{ id: 'overnight', kg: 10, startDay: state.day - 1, startMinute: 1200 }];
    const recurring = setRecurringOrder(state, 'xoi', 'main', { xoi_man_goi: 3 }, true)!;

    for (let day = 0; day < 3; day++) {
      openShop(state);
      const session = new DaySession(state, 2_000 + day);
      runDayHeadless(session);
      endDay(state);
      startNextDay(state);
    }

    const delivered = state.internalOrders.filter((order) => order.recurringId === recurring.id && order.status === 'delivered');
    expect(delivered).toHaveLength(3);
    expect(storeView(state, 'main').counter.find((slot) => slot.productId === 'xoi_man_goi')?.qty).toBe(3);
    expect(storeView(state, 'xoi').analytics.filter((record) => 'production' in record).slice(-3)).toHaveLength(3);
    expect(recurring.active).toBe(true);
    expect(recurring.shortStreak).toBe(0);
  });
});

describe('Thợ nấu xôi khi đứng chơi', () => {
  it('miễn lương 3 ngày thử việc', () => {
    const state = createNewGame();
    state.day = 5;
    state.staff = [cook('moi', 4)];
    expect(payroll(state).total).toBe(0);
  });

  it('tự hấp, làm đơn nội bộ trước rồi món bán lẻ; cuối ngày tự ngâm cho mai', () => {
    const state = chain();
    const order = placeInternalOrder(state, 'xoi', 'main', { xoi_dau_xanh_goi: 3 });
    if (!order.ok) throw new Error(order.reason);
    activate(state, 'xoi');
    state.staff = [cook()];
    state.soakBatches = [{ id: 's', kg: 3, startDay: state.day - 1, startMinute: 1200 }];
    state.schedule = { tho: Array.from({ length: 14 }, () => true) };
    openShop(state);
    const session = new DaySession(state);
    runDayHeadless(session);
    expect(order.order.filled.xoi_dau_xanh_goi).toBe(3);
    const retail = ['xoi_man_tp', 'xoi_dau_xanh_tp', 'xoi_trung_tp', 'xoi_dua_tp'].reduce((n, id) => n + (state.today.sold[id] ?? 0) + state.counter.filter((s) => s.productId === id).reduce((m, s) => m + s.qty, 0), 0);
    expect(retail).toBeGreaterThan(0);
    endDay(state);
    expect(state.soakBatches.length).toBeGreaterThan(0);
    // Ghi chú buổi sáng không bị ghi đè bởi ghi chú tâm trạng nhân viên cuối ngày.
    expect(state.morningNotes.some((n) => n.includes('Thợ nấu xôi đã ngâm'))).toBe(true);
    startNextDay(state);
    expect(order.order.status).toBe('delivered');
    expect(storeView(state, 'main').counter.find((s) => s.productId === 'xoi_dau_xanh_goi')?.qty).toBe(3);
  });
});

function activate(state: GameState, id: string): void {
  visitStore(state, id);
}
