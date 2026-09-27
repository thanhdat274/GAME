import { DATA, product } from './data';
import { fillOrder, orderRemaining, pendingOrdersFrom, productionCapacity } from './internalSupply';
import { makeServing } from './recipes';
import { Rng, daySeed } from './rng';
import { shopTypeOf } from './shopTypes';
import { onProbation } from './staff';
import { emptyStats, storeView, warehouseQty, type DayRecord, type GameState, type StoreData } from './state';
import { COOKED_RICE_ID, cookedPortions, discardSpoiledSoaks, soakCapacity, soakingKg, soakStatus } from './stickyRice';
import { recordTaxableRevenue } from './tax';
import { takeLots } from './stock';

/** Kết quả một ngày mô phỏng sản xuất của tiệm vắng chủ (hiện ở tổng kết chuỗi). */
export interface ProductionReport {
  storeId: string;
  day: number;
  made: number;
  sold: number;
  delivered: number;
  spoiled: number;
  revenue: number;
  wages: number;
  noCook: boolean;
}

const cfg = () => DATA.balance.stickyRice;
const SEATS: Record<string, number> = { food_table_2: 2, food_table_4: 4, drink_table_2: 2 };
const SIM_STEAM_MINUTE = 5 * 60;

function storeSalt(storeId: string): number {
  let h = 0;
  for (const ch of storeId) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Một ngày của tiệm sản xuất (tiệm xôi) khi người chơi không đứng ở đó, tất định theo ngày + tiệm:
 * bỏ mẻ ngâm chua, hấp mẻ đã ngâm, làm đơn nội bộ tới hạn trước, bán lẻ phần còn lại theo năng lực thợ,
 * bán đồ uống kèm theo số chỗ ngồi, bỏ nếp chín thừa, tự ngâm cho hôm sau, trả lương. EXP chỉ 50%.
 * Không có Thợ nấu xôi thì không sản xuất gì.
 * `seed` cho phép so sánh với một phiên chơi có cùng seed; bỏ trống thì seed được suy ra từ ngày và tiệm.
 */
export function simulateProductionDay(state: GameState, storeId: string, day: number, seed = daySeed(day, storeSalt(storeId))): ProductionReport {
  const store = storeView(state, storeId);
  const snapshot = state.stores.find((s) => s.id === storeId)!;
  const type = shopTypeOf(snapshot).def;
  const def = DATA.branches.find((b) => b.id === storeId);
  const efficiency = Math.min(0.9, def?.efficiency ?? 0.6);
  const report: ProductionReport = { storeId, day, made: 0, sold: 0, delivered: 0, spoiled: 0, revenue: 0, wages: 0, noCook: false };
  const cooks = store.staff.filter((s) => s.role === 'xoi_cook' && !s.quitting);
  store.today = emptyStats();
  store.morningNotes = store.morningNotes ?? [];

  // Mẻ ngâm quá hạn bị chua (tính tại 5h sáng ngày mô phỏng).
  discardSpoiledSoaks({ ...state, day, clock: SIM_STEAM_MINUTE } as GameState, store);
  if (!cooks.length) {
    report.noCook = true;
    for (const order of pendingOrdersFrom(state, storeId)) if (order.dueDay <= day + 1) order.shortReason = 'tiệm xôi không có thợ nấu';
    recordDay(store, day, report);
    return report;
  }
  const rng = new Rng(seed);
  const accuracy = cooks.reduce((n, s) => n + s.stats.accuracy, 0) / cooks.length;
  const quality = Math.min(1.2, 0.8 + accuracy * 0.04);

  // Hấp mọi mẻ đã ngâm đủ.
  store.soakBatches = store.soakBatches.filter((batch) => {
    if (soakStatus(batch, day, SIM_STEAM_MINUTE).kind !== 'ready') return true;
    store.cookedRice.push({ portions: batch.kg * cfg().portionsPerKg, cookedDay: day, cookedMinute: SIM_STEAM_MINUTE, quality });
    return false;
  });

  let capacity = productionCapacity(store, efficiency);
  const cookOne = (output: string): boolean => {
    const recipe = DATA.recipes.find((r) => r.output === output);
    if (!recipe || capacity <= 0 || !store.fixtures.some((f) => f.type === recipe.station)) return false;
    if (makeServing(store, recipe, day, SIM_STEAM_MINUTE + 60, quality) === null) return false;
    capacity--;
    report.made++;
    return true;
  };

  // 1) Đơn nội bộ tới hạn sáng mai: làm trước.
  for (const order of pendingOrdersFrom(state, storeId)) {
    if (order.dueDay > day + 1) continue;
    for (const id of Object.keys(order.items)) {
      while (orderRemaining(order, id) > 0 && cookOne(id)) {
        fillOrder(order, id, 1);
        report.delivered++;
      }
      if (orderRemaining(order, id) > 0) {
        const recipe = DATA.recipes.find((r) => r.output === id);
        const lack = recipe ? Object.keys(recipe.ingredients).find((ing) => (ing === COOKED_RICE_ID ? cookedPortions(store) : warehouseQty(store, ing)) < recipe.ingredients[ing]) : undefined;
        order.shortReason = capacity <= 0 ? 'thợ làm không kịp' : lack ? `thiếu ${lack === COOKED_RICE_ID ? 'nếp' : product(lack).name.toLowerCase()}` : 'không làm được';
      }
    }
  }

  // 2) Bán lẻ: khách tới theo lưu lượng khu, mỗi khách một món (xoay vòng các món có thể làm).
  const dishes = DATA.recipes.filter((r) => type.recipes.includes(r.id) && !r.packaged && store.activeRecipes.includes(r.id));
  const menu = dishes.length ? dishes : DATA.recipes.filter((r) => type.recipes.includes(r.id) && !r.packaged);
  const demand = Math.round(cfg().simRetailPerDay * (def?.traffic ?? 1) * efficiency * (0.9 + rng.next() * 0.2));
  let start = rng.int(0, Math.max(0, menu.length - 1));
  let revenue = 0;
  for (let i = 0; i < demand && capacity > 0; i++) {
    let sold = false;
    for (let k = 0; k < menu.length && !sold; k++) {
      const recipe = menu[(start + k) % menu.length];
      if (!cookOne(recipe.output)) continue;
      const price = store.prices[recipe.output] ?? product(recipe.output).price;
      revenue += price;
      store.today.cogs += product(recipe.output).cost;
      store.today.sold[recipe.output] = (store.today.sold[recipe.output] ?? 0) + 1;
      report.sold++;
      sold = true;
      start = (start + k + 1) % menu.length;
    }
    if (!sold) break;
  }

  // 3) Đồ uống kèm cho khách ngồi ăn, không sinh từng khách.
  const seats = store.fixtures.reduce((n, f) => n + (SEATS[f.type] ?? 0), 0);
  const diners = Math.min(Math.floor(report.sold * type.dineInChance), seats * cfg().tableTurnsPerDay);
  for (const addOn of type.addOns) {
    const want = Math.floor(diners * addOn.chance);
    const got = takeLots(store, addOn.productId, Math.min(want, warehouseQty(store, addOn.productId))).reduce((n, l) => n + l.qty, 0);
    if (!got) continue;
    revenue += got * (store.prices[addOn.productId] ?? product(addOn.productId).price);
    store.today.cogs += got * product(addOn.productId).cost;
    store.today.sold[addOn.productId] = (store.today.sold[addOn.productId] ?? 0) + got;
  }
  report.revenue = revenue;
  store.today.revenue = revenue;
  state.money += revenue;
  recordTaxableRevenue(state, 'food', revenue);
  const exp = Math.round(report.sold * DATA.balance.expPerItem * 0.5);
  state.exp += exp;

  // 4) Nếp chín thừa bỏ cuối ngày.
  report.spoiled = cookedPortions(store);
  if (report.spoiled) {
    store.today.spoiled[COOKED_RICE_ID] = report.spoiled;
    store.today.spoiledCost = report.spoiled * product(COOKED_RICE_ID).cost;
  }
  store.cookedRice = [];

  // 5) Thợ tự ngâm cho hôm sau theo lượng bán 3 ngày gần nhất và đơn đang chờ.
  const recent = store.analytics.slice(-2).map((r) => Object.entries(r.sold).reduce((n, [id, q]) => n + (menu.some((m) => m.output === id) ? q : 0), 0));
  const avg = [...recent, report.sold].reduce((a, b) => a + b, 0) / (recent.length + 1);
  const orderNeed = pendingOrdersFrom(state, storeId).reduce((n, o) => n + Object.keys(o.items).reduce((m, id) => m + orderRemaining(o, id), 0), 0);
  const wantKg = Math.ceil(Math.max(cfg().minSimPortions, avg + orderNeed) / cfg().portionsPerKg);
  const kg = Math.max(0, Math.min(wantKg - soakingKg(store), soakCapacity(store) - soakingKg(store), warehouseQty(store, 'nep')));
  if (kg > 0) {
    takeLots(store, 'nep', kg);
    store.soakBatches.push({ id: `soak-sim-${day}`, kg, startDay: day, startMinute: 20 * 60 });
  }

  // 6) Lương.
  for (const s of store.staff) {
    if (s.quitting || onProbation(s, day)) continue;
    report.wages += s.wage;
  }
  state.money -= report.wages;
  store.today.wages = report.wages;
  recordDay(store, day, report);
  return report;
}

function recordDay(store: StoreData, day: number, report: ProductionReport): void {
  const t = store.today;
  const record: DayRecord & { production?: ProductionReport } = {
    day,
    revenue: t.revenue,
    profit: t.revenue - t.cogs - t.wages - (t.spoiledCost ?? 0),
    cogs: t.cogs,
    wages: t.wages,
    electricity: 0,
    spoiled: t.spoiledCost ?? 0,
    theft: 0,
    customers: report.sold,
    avgRating: 0,
    sold: { ...t.sold },
    hourly: [],
    staff: {},
    manager: false,
    production: report,
  };
  store.analytics.push(record);
  if (store.analytics.length > DATA.balance.analytics.historyDays) store.analytics.splice(0, store.analytics.length - DATA.balance.analytics.historyDays);
}

/** Báo cáo sản xuất gần nhất của tiệm (từ lịch sử phân tích). */
export function lastProductionReport(state: GameState, storeId: string): ProductionReport | null {
  const records = storeView(state, storeId).analytics as (DayRecord & { production?: ProductionReport })[];
  return [...records].reverse().find((r) => r.production)?.production ?? null;
}

/** Tiệm sản xuất trong chuỗi không có Thợ nấu xôi (để cảnh báo trên bản đồ). */
export function missingCook(state: GameState, storeId: string): boolean {
  const snapshot = state.stores.find((s) => s.id === storeId);
  if (!snapshot || shopTypeOf(snapshot).def.sim !== 'production') return false;
  return !storeView(state, storeId).staff.some((s) => s.role === 'xoi_cook' && !s.quitting);
}
