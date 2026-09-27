import { DATA, product } from './data';
import type { Rng } from './rng';
import { activeShopType } from './shopTypes';
import { formatMoney, type DiningTableState, type GameState } from './state';
import { takeLots } from './stock';
import { recordTaxableRevenue } from './tax';

const TABLE_TYPES = new Set(['food_table_2', 'food_table_4', 'drink_table_2']);

/** Keep the persisted table state aligned with dining fixtures in the active shop. */
export function ensureDiningTables(state: GameState): DiningTableState[] {
  const existing = new Map(state.diningTables.map((table) => [table.fixtureUid, table]));
  state.diningTables = state.fixtures
    .filter((fixture) => TABLE_TYPES.has(fixture.type))
    .map((fixture) => existing.get(fixture.uid) ?? ({
      fixtureUid: fixture.uid,
      status: 'clean',
      customerId: null,
      productId: null,
      secondsLeft: 0,
      extraOrders: 0,
    }));
  return state.diningTables;
}

/** Seat a customer after a prepared food or drink sale if a clean table is available. */
export function seatDiner(state: GameState, customerId: number, productId: string): DiningTableState | null {
  const recipe = DATA.recipes.find((item) => item.output === productId);
  if (!recipe) return null;
  const table = ensureDiningTables(state).find((item) => item.status === 'clean');
  if (!table) return null;
  table.status = 'occupied';
  table.customerId = customerId;
  table.productId = productId;
  table.secondsLeft = DATA.balance.dining.mealSeconds;
  table.extraOrders = 0;
  return table;
}

/** Advance eating timers; finished customers leave a dirty table for staff/player cleanup. */
export function tickDining(state: GameState, seconds: number): DiningTableState[] {
  const changed: DiningTableState[] = [];
  for (const table of ensureDiningTables(state)) {
    if (table.status !== 'occupied') continue;
    table.secondsLeft = Math.max(0, table.secondsLeft - seconds);
    if (table.secondsLeft === 0) {
      table.status = 'dirty';
      table.customerId = null;
      changed.push(table);
    }
  }
  return changed;
}

/**
 * Khách vừa ngồi gọi thêm đồ uống kèm của loại tiệm (tiệm xôi: trà đá, sữa đậu nành) theo xác suất.
 * Lấy thẳng từ kho; hết hàng thì ghi thiếu. Trả các món đã phục vụ.
 */
export function serveDiningAddOns(state: GameState, table: DiningTableState, rng: Rng): string[] {
  const served: string[] = [];
  for (const addOn of activeShopType(state).def.addOns) {
    if (table.extraOrders >= DATA.balance.dining.maxExtraOrders || rng.next() >= addOn.chance) continue;
    const item = product(addOn.productId);
    if (!takeLots(state, item.id, 1).length) {
      state.today.missed[item.id] = (state.today.missed[item.id] ?? 0) + 1;
      continue;
    }
    const amount = state.prices[item.id] ?? item.price;
    state.money += amount;
    state.today.revenue += amount;
    state.today.cogs += item.cost;
    state.today.sold[item.id] = (state.today.sold[item.id] ?? 0) + 1;
    state.today.itemsScanned++;
    state.exp += DATA.balance.expPerItem;
    state.today.expGained += DATA.balance.expPerItem;
    state.lifetime.sold++;
    table.extraOrders++;
    table.secondsLeft += DATA.balance.dining.extraOrderSeconds;
    recordTaxableRevenue(state, 'goods', amount);
    state.today.journal.push({ m: state.clock, t: `Khách ngồi gọi thêm ${item.name}` });
    served.push(item.id);
  }
  return served;
}

export function cleanDiningTable(state: GameState, fixtureUid: number): boolean {
  const table = ensureDiningTables(state).find((item) => item.fixtureUid === fixtureUid);
  if (!table || table.status !== 'dirty') return false;
  table.status = 'clean';
  table.productId = null;
  table.secondsLeft = 0;
  table.extraOrders = 0;
  return true;
}

/** Fulfill one extra food/drink request from the counter inventory. */
export function serveExtraDiningOrder(state: GameState, fixtureUid: number, counterSlot: number): boolean {
  const table = ensureDiningTables(state).find((item) => item.fixtureUid === fixtureUid);
  const slot = state.counter[counterSlot];
  if (!table || table.status !== 'occupied' || table.extraOrders >= DATA.balance.dining.maxExtraOrders) return false;
  if (!slot?.productId || slot.qty <= 0 || !DATA.recipes.some((recipe) => recipe.output === slot.productId)) return false;
  const item = product(slot.productId);
  const amount = state.prices[item.id] ?? item.price;
  slot.qty--;
  state.money += amount;
  state.today.revenue += amount;
  recordTaxableRevenue(state, 'food', amount);
  state.today.cogs += item.cost;
  state.today.sold[item.id] = (state.today.sold[item.id] ?? 0) + 1;
  state.today.itemsScanned++;
  state.exp += DATA.balance.expPerItem;
  state.today.expGained += DATA.balance.expPerItem;
  state.lifetime.sold++;
  table.extraOrders++;
  table.secondsLeft += DATA.balance.dining.extraOrderSeconds;
  table.productId = item.id;
  state.today.journal.push({ m: state.clock, t: `Phục vụ gọi thêm ${item.name} tại bàn` });
  return true;
}

export function diningTableName(state: GameState, fixtureUid: number): string {
  const fixture = state.fixtures.find((item) => item.uid === fixtureUid);
  return DATA.furniture.find((item) => item.id === fixture?.type)?.name ?? `Bàn ${fixtureUid}`;
}

export function diningTableStatus(table: DiningTableState): string {
  if (table.status === 'clean') return 'Sẵn sàng';
  if (table.status === 'dirty') return 'Cần dọn';
  const dish = table.productId ? product(table.productId).name : 'món đã gọi';
  return `Đang ăn ${dish} · ${Math.ceil(table.secondsLeft)} giây`;
}

export function diningExtraOrderLabel(state: GameState, slotIndex: number): string {
  const productId = state.counter[slotIndex]?.productId;
  return productId && DATA.recipes.some((recipe) => recipe.output === productId)
    ? `${product(productId).icon} ${product(productId).name} · ${formatMoney(state.prices[productId] ?? product(productId).price)}`
    : '';
}
