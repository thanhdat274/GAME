import { DATA, product, type RecipeDef } from './data';
import { shopTypeOf } from './shopTypes';
import {
  formatMoney, storeView, warehouseQty, type GameState, type InternalOrder, type RecurringOrder, type StoreData, type StoreSnapshot,
} from './state';
import { COOKED_RICE_ID, cookedPortions, soakingKg } from './stickyRice';
import { addLot, expiryFor, takeLots } from './stock';

/**
 * Đặt hàng giữa các tiệm trong chuỗi. Tiền dùng chung nên hàng nội bộ tính theo giá vốn, không có lãi và không có EXP;
 * chỉ phí xe là tiền thật phải trả. Mối nội bộ sinh từ `supplies`/`sourcesFrom` trong shopTypes.json.
 */

const cfg = () => DATA.balance.stickyRice;
const FEE_BASE = 500;
const FEE_PER_UNIT = 100;

export type InternalSupplierKind = 'made' | 'stock';

export interface InternalSupplierItem {
  productId: string;
  /** Số lượng có thể giao: hàng trong kho (stock) hoặc số phần làm được từ nguyên liệu hiện có (made). */
  available: number;
}

export interface InternalSupplier {
  id: string;
  storeId: string;
  name: string;
  /** `made`: làm theo đơn, giao sáng hôm sau lúc 7h. `stock`: lấy từ kho, xe tới sáng hôm sau. */
  kind: InternalSupplierKind;
  items: InternalSupplierItem[];
  /** Số phần làm được mỗi ngày theo thợ (chỉ với `made`). */
  capacityPerDay?: number;
}

export function internalFee(qty: number): number {
  return qty > 0 ? FEE_BASE + qty * FEE_PER_UNIT : 0;
}

function recipeFor(output: string): RecipeDef | undefined {
  return DATA.recipes.find((r) => r.output === output);
}

/** Số phần tiệm `store` làm được cho một món từ nguyên liệu hiện có (tính cả nếp đang ngâm và nếp sống trong kho). */
export function makeableEstimate(store: StoreData, output: string): number {
  const recipe = recipeFor(output);
  if (!recipe) return 0;
  let best = Infinity;
  for (const [id, qty] of Object.entries(recipe.ingredients)) {
    const have = id === COOKED_RICE_ID
      ? cookedPortions(store) + (soakingKg(store) + warehouseQty(store, 'nep')) * cfg().portionsPerKg
      : warehouseQty(store, id);
    best = Math.min(best, Math.floor(have / qty));
  }
  return Number.isFinite(best) ? best : 0;
}

/** Thợ nấu xôi của tiệm và năng lực (phần/ngày) theo tốc độ. */
export function productionCapacity(store: StoreData, efficiency = 1): number {
  const cooks = store.staff.filter((s) => s.role === 'xoi_cook' && !s.quitting);
  const perDay = cooks.reduce((sum, s) => sum + cfg().cookPortionsPerHour * (1 + 0.1 * (s.stats.speed ?? 0)) * cfg().workHours, 0);
  return Math.floor(perDay * efficiency);
}

/** Các tiệm khác trong chuỗi có thể cung cấp hàng mà tiệm `toStoreId` ưu tiên lấy nội bộ. */
export function internalSuppliers(state: GameState, toStoreId = state.activeStoreId): InternalSupplier[] {
  const to = state.stores.find((s) => s.id === toStoreId);
  if (!to) return [];
  const wants = new Set(shopTypeOf(to).def.sourcesFrom);
  const out: InternalSupplier[] = [];
  for (const store of state.stores) {
    if (store.id === toStoreId) continue;
    const type = shopTypeOf(store).def;
    const ids = type.supplies.filter((id) => wants.has(id) && product(id).unlockLevel <= state.level);
    if (!ids.length) continue;
    const data = storeView(state, store.id);
    const kind: InternalSupplierKind = type.sim === 'production' ? 'made' : 'stock';
    const providerCount = state.stores.filter((candidate) => {
      if (candidate.id === toStoreId) return false;
      const candidateType = shopTypeOf(candidate).def;
      return candidateType.id === type.id && candidateType.supplies.some((id) => wants.has(id) && product(id).unlockLevel <= state.level);
    }).length;
    out.push({
      id: `internal:${store.id}`,
      storeId: store.id,
      name: store.id === 'main' || providerCount === 1
        ? `${type.name} nhà mình`
        : `${store.name} · ${type.name}`,
      kind,
      items: ids.map((productId) => ({ productId, available: kind === 'made' ? makeableEstimate(data, productId) : warehouseQty(data, productId) })),
      ...(kind === 'made' ? { capacityPerDay: productionCapacity(data) } : {}),
    });
  }
  return out;
}

function supplierKind(state: GameState, fromStoreId: string): InternalSupplierKind | null {
  const store = state.stores.find((s) => s.id === fromStoreId);
  if (!store) return null;
  return shopTypeOf(store).def.sim === 'production' ? 'made' : 'stock';
}

function orderQty(record: Record<string, number>): number {
  return Object.values(record).reduce((n, q) => n + q, 0);
}

function notesOf(state: GameState, storeId: string): string[] {
  return storeView(state, storeId).morningNotes;
}

function storeName(state: GameState, storeId: string): string {
  return state.stores.find((s) => s.id === storeId)?.name ?? storeId;
}

export type PlaceOrderResult = { ok: true; order: InternalOrder } | { ok: false; reason: 'supplier' | 'items' | 'money' | 'stock' };

/**
 * Đặt một đơn nội bộ. Hàng làm theo đơn (xôi gói) chờ tiệm cung cấp làm, giao 7h sáng mai.
 * Hàng có sẵn trong kho (nguyên liệu ở tạp hóa) được bốc ngay theo FEFO, trả phí xe, tới sáng mai.
 */
export function placeInternalOrder(state: GameState, fromStoreId: string, toStoreId: string, items: Record<string, number>, recurringId?: string): PlaceOrderResult {
  const kind = supplierKind(state, fromStoreId);
  const supplier = internalSuppliers(state, toStoreId).find((s) => s.storeId === fromStoreId);
  if (!kind || !supplier || fromStoreId === toStoreId) return { ok: false, reason: 'supplier' };
  const clean = Object.fromEntries(Object.entries(items).filter(([id, qty]) => Number.isInteger(qty) && qty > 0 && supplier.items.some((i) => i.productId === id)));
  if (!Object.keys(clean).length) return { ok: false, reason: 'items' };
  const order: InternalOrder = {
    id: `io-${state.day}-${state.internalOrders.length + 1}-${fromStoreId}-${toStoreId}`,
    fromStoreId,
    toStoreId,
    items: clean,
    filled: {},
    createdDay: state.day,
    dueDay: state.day + 1,
    dueMinute: kind === 'made' ? cfg().orderDueMinute : DATA.balance.openMinute,
    status: 'pending',
    ...(recurringId ? { recurringId } : {}),
  };
  if (kind === 'stock') {
    const from = storeView(state, fromStoreId);
    const wanted = orderQty(clean);
    const can = Object.entries(clean).reduce((n, [id, qty]) => n + Math.min(qty, warehouseQty(from, id)), 0);
    if (can <= 0) return { ok: false, reason: 'stock' };
    const fee = internalFee(can);
    if (state.money < fee) return { ok: false, reason: 'money' };
    state.money -= fee;
    for (const [id, qty] of Object.entries(clean)) {
      const lots = takeLots(from, id, Math.min(qty, warehouseQty(from, id)));
      const got = lots.reduce((n, l) => n + l.qty, 0);
      if (!got) continue;
      order.filled[id] = got;
      state.branchShipments.push({
        id: `${order.id}-${id}`, fromStoreId, toStoreId, productId: id, lots, sentDay: state.day, arriveDay: state.day + 1,
        arriveMinute: DATA.balance.openMinute, fee: 0, orderId: order.id,
      });
    }
    order.status = 'shipping';
    if (can < wanted) order.shortReason = `${storeName(state, fromStoreId)} chỉ còn ${can}/${wanted} trong kho`;
  }
  state.internalOrders.push(order);
  return { ok: true, order };
}

/** Hủy đơn chưa làm (chưa lấp phần nào): không mất tiền. */
export function cancelInternalOrder(state: GameState, orderId: string): boolean {
  const order = state.internalOrders.find((o) => o.id === orderId);
  if (!order || order.status !== 'pending' || orderQty(order.filled) > 0) return false;
  order.status = 'cancelled';
  return true;
}

/** Số phần còn thiếu của một món trong đơn. */
export function orderRemaining(order: InternalOrder, productId: string): number {
  return Math.max(0, (order.items[productId] ?? 0) - (order.filled[productId] ?? 0));
}

/** Đơn đang chờ tiệm `storeId` làm, sắp theo hạn. */
export function pendingOrdersFrom(state: GameState, storeId: string): InternalOrder[] {
  return state.internalOrders
    .filter((o) => o.fromStoreId === storeId && (o.status === 'pending' || o.status === 'made'))
    .sort((a, b) => a.dueDay - b.dueDay || a.createdDay - b.createdDay);
}

/** Xếp phần vừa làm vào đơn thay vì bán lẻ (thêm vào `filled`). */
export function fillOrder(order: InternalOrder, productId: string, qty = 1): number {
  const add = Math.min(qty, orderRemaining(order, productId));
  if (add <= 0) return 0;
  order.filled[productId] = (order.filled[productId] ?? 0) + add;
  if (Object.keys(order.items).every((id) => orderRemaining(order, id) === 0)) order.status = 'made';
  return add;
}

/** "Giao cho đơn": lấy 1 phần từ ô quầy của tiệm đang đứng xếp vào đơn nội bộ. */
export function assignCounterToOrder(state: GameState, orderId: string, counterSlot: number): boolean {
  const order = state.internalOrders.find((o) => o.id === orderId);
  const slot = state.counter[counterSlot];
  if (!order || order.fromStoreId !== state.activeStoreId || (order.status !== 'pending' && order.status !== 'made')) return false;
  if (!slot?.productId || slot.qty <= 0 || orderRemaining(order, slot.productId) <= 0) return false;
  const productId = slot.productId;
  slot.qty--;
  if (slot.lots?.length) slot.lots[0].qty = Math.max(0, slot.lots[0].qty - 1);
  if (slot.qty <= 0) { slot.productId = null; slot.lots = []; }
  fillOrder(order, productId, 1);
  return true;
}

/** Chuyển các gói món đang ở quầy của tiệm xôi vào đơn chờ, theo thứ tự đơn cũ trước. */
export function assignCounterToOrders(state: GameState, productId: string): number {
  let assigned = 0;
  for (const order of pendingOrdersFrom(state, state.activeStoreId)) {
    while (orderRemaining(order, productId) > 0) {
      const slot = state.counter.findIndex((item) => item.productId === productId && item.qty > 0);
      if (slot < 0 || !assignCounterToOrder(state, order.id, slot)) return assigned;
      assigned++;
    }
  }
  return assigned;
}

/** Đưa hàng giao tới vào quầy của tiệm nhận (gộp ô cùng món hoặc ô trống); hết ô thì vào kho. */
export function deliverToCounter(store: StoreData, productId: string, qty: number, exp: number | null): void {
  let slot = store.counter.find((s) => s.productId === productId);
  if (!slot) slot = store.counter.find((s) => !s.productId || s.qty <= 0);
  if (!slot) { addLot(store, productId, qty, exp); return; }
  const had = slot.productId === productId ? slot.qty : 0;
  slot.productId = productId;
  slot.qty = had + qty;
  slot.lots = [{ qty: slot.qty, exp }];
}

function recordInternalCost(state: GameState, storeId: string, cost: number): void {
  const today = storeView(state, storeId).today;
  today.internalCost = (today.internalCost ?? 0) + cost;
}

/**
 * Sáng ngày `day`: giao các đơn làm theo đơn đã tới hạn. Đủ thì `delivered`, thiếu thì giao phần có, `short`
 * và ghi chú buổi sáng ở tiệm nhận. Cập nhật chuỗi giao thiếu của đơn định kỳ.
 */
export function resolveDueOrders(state: GameState, day: number, throughMinute = 24 * 60): InternalOrder[] {
  const done: InternalOrder[] = [];
  for (const order of state.internalOrders) {
    if ((order.status !== 'pending' && order.status !== 'made') || order.dueDay > day || (order.dueDay === day && order.dueMinute > throughMinute)) continue;
    if (!state.stores.some((s) => s.id === order.toStoreId)) { order.status = 'cancelled'; continue; }
    const to = storeView(state, order.toStoreId);
    const qty = orderQty(order.filled);
    let cost = 0;
    for (const [id, n] of Object.entries(order.filled)) {
      if (n <= 0) continue;
      deliverToCounter(to, id, n, expiryFor(id, order.dueDay - 1));
      cost += n * product(id).cost;
    }
    order.internalCost = cost;
    const fee = internalFee(qty);
    state.money -= fee;
    if (cost) recordInternalCost(state, order.toStoreId, cost);
    const wanted = orderQty(order.items);
    const fromName = storeName(state, order.fromStoreId);
    if (qty >= wanted) {
      order.status = 'delivered';
      if (fee) notesOf(state, order.toStoreId).push(`🚚 ${fromName} giao đủ ${qty} phần lúc 7h (phí xe ${formatMoney(fee)}), đã lên quầy.`);
    } else {
      order.status = 'short';
      order.shortReason ??= 'chưa làm kịp';
      notesOf(state, order.toStoreId).push(`⚠️ ${fromName} giao thiếu ${wanted - qty} phần: ${order.shortReason}.`);
    }
    updateRecurringStreak(state, order);
    done.push(order);
  }
  return done;
}

/** Hàng kéo từ kho tiệm khác đã tới (gọi khi xe chuyển hàng giao). */
export function markPullDelivered(state: GameState, orderId: string): void {
  const order = state.internalOrders.find((o) => o.id === orderId);
  if (!order || order.status !== 'shipping') return;
  if (state.branchShipments.some((s) => s.orderId === orderId)) return; // còn chuyến chưa tới
  order.status = order.shortReason ? 'short' : 'delivered';
  order.internalCost = Object.entries(order.filled).reduce((n, [id, q]) => n + q * product(id).cost, 0);
  recordInternalCost(state, order.toStoreId, order.internalCost);
  if (order.shortReason) notesOf(state, order.toStoreId).push(`⚠️ ${order.shortReason}.`);
  updateRecurringStreak(state, order);
}

function updateRecurringStreak(state: GameState, order: InternalOrder): void {
  if (!order.recurringId) return;
  const rec = state.recurringOrders.find((r) => r.id === order.recurringId);
  if (!rec) return;
  if (order.status === 'short') rec.shortStreak++;
  else if (order.status === 'delivered') rec.shortStreak = 0;
  if (rec.active && rec.shortStreak >= cfg().recurringShortLimit) {
    rec.active = false;
    notesOf(state, rec.toStoreId).push(`⏸️ Đơn định kỳ từ ${storeName(state, rec.fromStoreId)} tạm dừng sau ${rec.shortStreak} lần giao thiếu. Bật lại ở màn Hàng nhà mình.`);
  }
}

/** Bật/tắt (hoặc đổi số lượng) đơn định kỳ giữa hai tiệm; bật thì đặt luôn đơn cho sáng mai. */
export function setRecurringOrder(state: GameState, fromStoreId: string, toStoreId: string, items: Record<string, number>, active: boolean): RecurringOrder | null {
  const clean = Object.fromEntries(Object.entries(items).filter(([, qty]) => Number.isInteger(qty) && qty > 0));
  let rec = state.recurringOrders.find((r) => r.fromStoreId === fromStoreId && r.toStoreId === toStoreId);
  if (!rec) {
    if (!active || !Object.keys(clean).length) return null;
    rec = { id: `rec-${fromStoreId}-${toStoreId}`, fromStoreId, toStoreId, items: clean, active: true, shortStreak: 0 };
    state.recurringOrders.push(rec);
  } else {
    if (Object.keys(clean).length) rec.items = clean;
    rec.active = active;
    if (active) rec.shortStreak = 0;
  }
  if (active) placeRecurring(state, rec);
  return rec;
}

function placeRecurring(state: GameState, rec: RecurringOrder): void {
  if (state.internalOrders.some((o) => o.recurringId === rec.id && o.createdDay === state.day)) return;
  const result = placeInternalOrder(state, rec.fromStoreId, rec.toStoreId, rec.items, rec.id);
  if (!result.ok && result.reason === 'stock') {
    rec.shortStreak++;
    notesOf(state, rec.toStoreId).push(`⚠️ ${storeName(state, rec.fromStoreId)} hết hàng cho đơn định kỳ hôm nay.`);
    if (rec.shortStreak >= cfg().recurringShortLimit) {
      rec.active = false;
      notesOf(state, rec.toStoreId).push(`⏸️ Đơn định kỳ từ ${storeName(state, rec.fromStoreId)} tạm dừng sau ${rec.shortStreak} lần giao thiếu.`);
    }
  }
}

/** Mỗi sáng: sinh đơn từ các đơn định kỳ đang bật. */
export function generateRecurringOrders(state: GameState): void {
  for (const rec of state.recurringOrders) {
    if (!rec.active) continue;
    if (!state.stores.some((s) => s.id === rec.fromStoreId) || !state.stores.some((s) => s.id === rec.toStoreId)) continue;
    placeRecurring(state, rec);
  }
}

/** Dọn đơn đã xong/hủy quá hạn giữ để bản lưu gọn. */
export function pruneInternalOrders(state: GameState): void {
  const keep = cfg().orderKeepDays;
  state.internalOrders = state.internalOrders.filter((o) => !['delivered', 'short', 'cancelled'].includes(o.status) || o.createdDay >= state.day - keep);
}

/** Một bước buổi sáng cho cả chuỗi: giao đơn tới hạn, sinh đơn định kỳ, dọn đơn cũ. */
export function runInternalSupplyMorning(state: GameState): void {
  resolveDueOrders(state, state.day, DATA.balance.openMinute);
  generateRecurringOrders(state);
  pruneInternalOrders(state);
}

export function orderStatusLabel(order: InternalOrder): string {
  switch (order.status) {
    case 'pending': return 'Chờ làm';
    case 'made': return 'Đã làm đủ';
    case 'shipping': return 'Đang chở';
    case 'delivered': return 'Đã giao';
    case 'short': return 'Giao thiếu';
    default: return 'Đã hủy';
  }
}

export function storeLabel(store: StoreSnapshot | undefined): string {
  return store ? `${shopTypeOf(store).def.icon} ${store.name}` : '?';
}
