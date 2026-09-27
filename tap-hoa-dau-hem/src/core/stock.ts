import { DATA, furniture, hasFeature, product, supplier, type Product } from './data';
import { recordPurchase, supplierTaxFactor } from './tax';
import { Rng, daySeed } from './rng';
import { EffectStack } from './effects';
import { activeShopType } from './shopTypes';
import {
  fixtureOfShelf, shelfKind, shelfUsable, slotEarliestExp, slotLots, sortLots, totalQty, unlockedProducts,
  usableShelves, warehouseTotals, type GameState, type Lot, type ShelfZone, type Slot, type SlotLot, type StoreData,
} from './state';

export type Cart = Record<string, number>;
export type ZoneAlert = 'ok' | 'low' | 'critical';

// ---------- Kho theo lô ----------

/** Số ô kho một món chiếm: size cho mỗi 10 đơn vị, làm tròn lên. */
export function cellsFor(productId: string, qty: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / 10) * product(productId).size;
}

/** Số ô kho đã dùng; nhận kho dạng lô hoặc tổng theo món. */
export function warehouseCellsUsed(warehouse: Lot[] | Record<string, number>): number {
  const totals: Record<string, number> = {};
  if (Array.isArray(warehouse)) for (const lot of warehouse) totals[lot.productId] = (totals[lot.productId] ?? 0) + lot.qty;
  else Object.assign(totals, warehouse);
  return Object.entries(totals).reduce((sum, [id, qty]) => sum + cellsFor(id, qty), 0);
}

/** Sức chứa kho: bậc kho + ô của kệ kho đặt trên mặt bằng. */
export function warehouseCapacity(state?: GameState): number {
  if (!state) return DATA.balance.warehouseTiers[0]?.cells ?? DATA.balance.warehouseCells;
  const tier = DATA.balance.warehouseTiers[state.warehouseTier] ?? DATA.balance.warehouseTiers[0];
  const racks = state.fixtures.reduce((sum, f) => sum + (furniture(f.type).storageCells ?? 0), 0);
  return tier.cells + racks;
}

export type UpgradeResult = 'ok' | 'max' | 'level' | 'money';

export function nextWarehouseTier(state: GameState) {
  return DATA.balance.warehouseTiers[state.warehouseTier + 1] ?? null;
}

export function upgradeWarehouse(state: GameState): UpgradeResult {
  const next = nextWarehouseTier(state);
  if (!next) return 'max';
  if (state.level < next.unlockLevel || !hasFeature(state.level, 'warehouse')) return 'level';
  if (state.money < next.cost) return 'money';
  state.money -= next.cost;
  state.warehouseTier++;
  return 'ok';
}

/** Hàng mau hỏng (HSD ngắn như đồ tươi); hàng khô đóng gói có HSD dài không tính. */
export function isPerishable(p: Product): boolean {
  return !!p.shelfLifeDays && p.shelfLifeDays <= DATA.balance.suggest.perishableMaxDays;
}

/** Hạn dùng cho hàng nhập vào ngày `day`. */
export function expiryFor(productId: string, day: number): number | null {
  const life = product(productId).shelfLifeDays;
  return life ? day + life : null;
}

export function addLot(state: StoreData, productId: string, qty: number, exp: number | null, into: Lot[] = state.warehouse): void {
  if (qty <= 0) return;
  const same = into.find((lot) => lot.productId === productId && lot.exp === exp);
  if (same) same.qty += qty;
  else into.push({ productId, qty, exp });
  sortLots(into);
}

/** Lấy tối đa `want` đơn vị từ kho theo hạn sớm nhất trước. Nhận `storeView` để lấy từ kho tiệm không đứng. */
export function takeLots(state: StoreData, productId: string, want: number): SlotLot[] {
  const taken: SlotLot[] = [];
  let left = want;
  sortLots(state.warehouse);
  for (const lot of state.warehouse) {
    if (left <= 0) break;
    if (lot.productId !== productId || lot.qty <= 0) continue;
    const got = Math.min(lot.qty, left);
    lot.qty -= got;
    left -= got;
    taken.push({ qty: got, exp: lot.exp });
  }
  state.warehouse = state.warehouse.filter((lot) => lot.qty > 0);
  return taken;
}

/** Số ô kho còn trống. */
export function warehouseFree(state: GameState): number {
  return warehouseCapacity(state) - warehouseCellsUsed(state.warehouse);
}

/** Đưa hàng vào kho trong giới hạn sức chứa; trả về số đơn vị vào được. */
export function storeWithinCapacity(state: GameState, productId: string, qty: number, exp: number | null): number {
  const cap = warehouseCapacity(state);
  const totals = warehouseTotals(state);
  let fit = 0;
  while (fit < qty) {
    const next = { ...totals, [productId]: (totals[productId] ?? 0) + fit + 1 };
    if (warehouseCellsUsed(next) > cap) break;
    fit++;
  }
  addLot(state, productId, fit, exp);
  return fit;
}

// ---------- Mối sỉ và giỏ hàng ----------

/** Giá sỉ dao động theo ngày (chỉ khi đã mở chợ sỉ) — tất định theo seed của ngày. */
export function priceFactor(productId: string, day: number): number {
  let hash = 0;
  for (const ch of productId) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  const rng = new Rng(daySeed(day, hash));
  const v = DATA.balance.supplier.volatility;
  return 1 + (rng.next() * 2 - 1) * v;
}

/** Giá nhập một đơn vị hôm nay ở mối sỉ (chưa tính chiết khấu số lượng). */
export function unitCost(state: GameState | null, productId: string, supplierId = 'co_tu', day = state?.day ?? 1): number {
  const base = product(productId).cost;
  if (!state || !hasFeature(state.level, 'anh_ba')) return base;
  const s = supplier(supplierId);
  const effects = state ? EffectStack.forDay(state.day, state.calendarStartMonth, state.calendarStartYear, state.activeEvents) : null;
  const raw = base * priceFactor(productId, day) * (1 - s.discount) * supplierTaxFactor(state, supplierId) * (effects?.multiply('wholesaleMul') ?? 1);
  return Math.max(100, Math.round(raw / 100) * 100);
}

/** Chênh giá hôm nay so với hôm qua: -1 giảm, 0 bằng, 1 tăng. */
export function costTrend(state: GameState, productId: string, supplierId = 'co_tu'): -1 | 0 | 1 {
  if (!hasFeature(state.level, 'anh_ba') || state.day <= 1) return 0;
  const today = unitCost(state, productId, supplierId, state.day);
  const yesterday = unitCost(state, productId, supplierId, state.day - 1);
  return today < yesterday ? -1 : today > yesterday ? 1 : 0;
}

export function bulkDiscounted(qty: number): boolean {
  return qty >= DATA.balance.supplier.bulkQty;
}

export function lineCost(state: GameState | null, productId: string, qty: number, supplierId = 'co_tu'): number {
  const total = unitCost(state, productId, supplierId) * qty;
  return bulkDiscounted(qty) ? Math.round(total * (1 - DATA.balance.supplier.bulkDiscount)) : total;
}

export function cartTotal(cart: Cart, state: GameState | null = null, supplierId = 'co_tu'): number {
  return Object.entries(cart).reduce((sum, [id, qty]) => sum + (qty > 0 ? lineCost(state, id, qty, supplierId) : 0), 0);
}

/** Tổng kho theo món sau khi nhập giỏ hàng (không đổi state). */
export function warehouseAfter(state: GameState, cart: Cart): Record<string, number> {
  const next = warehouseTotals(state);
  for (const [id, qty] of Object.entries(cart)) if (qty > 0) next[id] = (next[id] ?? 0) + qty;
  return next;
}

export type BuyCheck =
  | { ok: true; total: number; cells: number }
  | { ok: false; reason: 'empty' | 'money' | 'space' | 'locked' | 'min-order'; total: number; cells: number; missing: number };

export function supplierUnlocked(state: GameState, supplierId: string): boolean {
  const s = supplier(supplierId);
  return state.level >= s.unlockLevel && (s.unlockLevel <= 1 || hasFeature(state.level, 'anh_ba'));
}

export function checkCart(state: GameState, cart: Cart, supplierId = 'co_tu'): BuyCheck {
  const total = cartTotal(cart, state, supplierId);
  const s = supplier(supplierId);
  const cells = warehouseCellsUsed(warehouseAfter(state, cart));
  const unlocked = new Set(unlockedProducts(state.level, state).map((p) => p.id));
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  if (items.length === 0) return { ok: false, reason: 'empty', total, cells, missing: 0 };
  if (!supplierUnlocked(state, supplierId) || items.some(([id]) => !unlocked.has(id))) return { ok: false, reason: 'locked', total, cells, missing: 0 };
  if (total < s.minOrder) return { ok: false, reason: 'min-order', total, cells, missing: s.minOrder - total };
  // Hàng giao ngay phải vừa kho; hàng giao sau để dư ra "hàng chờ".
  if (s.delayDays === 0 && cells > warehouseCapacity(state)) return { ok: false, reason: 'space', total, cells, missing: 0 };
  if (total > state.money) return { ok: false, reason: 'money', total, cells, missing: total - state.money };
  return { ok: true, total, cells };
}

/** Nhập hàng: trừ tiền; mối giao ngay thì cộng kho, mối giao sau thì tạo đơn chờ giao. */
export function buyStock(state: GameState, cart: Cart, supplierId = 'co_tu'): BuyCheck {
  const check = checkCart(state, cart, supplierId);
  if (!check.ok) return check;
  const s = supplier(supplierId);
  state.money -= check.total;
  recordPurchase(state, supplierId, check.total);
  const items: Cart = {};
  for (const [id, qty] of Object.entries(cart)) if (qty > 0) items[id] = qty;
  if (s.delayDays > 0) {
    const id = state.deliveries.reduce((max, d) => Math.max(max, d.id), 0) + 1;
    state.deliveries.push({ id, supplierId, arriveDay: state.day + s.delayDays, arriveMinute: s.deliverMinute, items });
  } else {
    for (const [id, qty] of Object.entries(items)) addLot(state, id, qty, expiryFor(id, state.day));
  }
  return check;
}

export interface DeliveryResult { id: number; supplierId: string; stored: number; held: number }

/** Nhận các đơn đã tới giờ giao; phần không vừa kho vào "hàng chờ". */
export function receiveDeliveries(state: GameState, day: number, minute: number): DeliveryResult[] {
  const due = state.deliveries.filter((d) => d.arriveDay < day || (d.arriveDay === day && d.arriveMinute <= minute));
  if (!due.length) return [];
  state.deliveries = state.deliveries.filter((d) => !due.includes(d));
  return due.map((d) => {
    let stored = 0;
    let held = 0;
    for (const [id, qty] of Object.entries(d.items)) {
      const exp = expiryFor(id, day);
      const fit = storeWithinCapacity(state, id, qty, exp);
      stored += fit;
      if (qty > fit) {
        addLot(state, id, qty - fit, exp, state.holding);
        held += qty - fit;
      }
    }
    return { id: d.id, supplierId: d.supplierId, stored, held };
  });
}

/** Chuyển hàng chờ vào kho nếu còn chỗ; trả về số đơn vị còn lại ở hàng chờ. */
export function stowHolding(state: GameState): number {
  const rest: Lot[] = [];
  for (const lot of state.holding) {
    const fit = storeWithinCapacity(state, lot.productId, lot.qty, lot.exp);
    if (lot.qty > fit) rest.push({ ...lot, qty: lot.qty - fit });
  }
  state.holding = rest;
  return rest.reduce((sum, lot) => sum + lot.qty, 0);
}

function recordLoss(state: GameState, productId: string, qty: number): void {
  if (qty <= 0) return;
  state.today.spoiled[productId] = (state.today.spoiled[productId] ?? 0) + qty;
  state.today.spoiledCost += product(productId).cost * qty;
}

/** Bỏ một lô trong kho (hoặc hàng chờ); giá vốn ghi là tổn thất. */
export function discardLot(state: GameState, index: number, from: 'warehouse' | 'holding' = 'warehouse'): boolean {
  const list = from === 'warehouse' ? state.warehouse : state.holding;
  const lot = list[index];
  if (!lot) return false;
  list.splice(index, 1);
  recordLoss(state, lot.productId, lot.qty);
  return true;
}

export function cartCanOpen(state: GameState): boolean {
  return state.holding.length === 0;
}

// ---------- Hạn dùng ----------

/** Cuối ngày: loại mọi lô có hạn <= `day` khỏi kho, hàng chờ và kệ. */
export function expireLots(state: GameState, day: number): Record<string, number> {
  const spoiled: Record<string, number> = {};
  const note = (id: string, qty: number) => {
    if (qty <= 0) return;
    spoiled[id] = (spoiled[id] ?? 0) + qty;
    recordLoss(state, id, qty);
  };
  for (const listName of ['warehouse', 'holding'] as const) {
    state[listName] = state[listName].filter((lot) => {
      if (lot.exp === null || lot.exp > day) return true;
      note(lot.productId, lot.qty);
      return false;
    });
  }
  for (const row of state.shelves) {
    for (const slot of row) {
      if (!slot.productId) continue;
      const lots = slotLots(slot);
      const keep = lots.filter((l) => l.exp === null || l.exp > day);
      const lost = slot.qty - keep.reduce((sum, l) => sum + l.qty, 0);
      if (lost > 0) {
        note(slot.productId, lost);
        slot.lots = keep;
        slot.qty -= lost;
      }
      slot.clearance = undefined;
    }
  }
  for (const slot of state.counter) {
    if (!slot.productId) continue;
    const lots = slotLots(slot);
    const keep = lots.filter((l) => l.exp === null || l.exp > day);
    const lost = slot.qty - keep.reduce((sum, l) => sum + l.qty, 0);
    if (lost > 0) {
      note(slot.productId, lost);
      slot.lots = keep;
      slot.qty -= lost;
      if (slot.qty <= 0) { slot.productId = null; slot.lots = []; }
    }
  }
  return spoiled;
}

/** Nhãn hạn cho ô kệ: 'today' hết hạn hôm nay (đỏ), 'soon' hết hạn ngày mai (vàng). */
export function slotFreshness(slot: Slot, day: number): 'today' | 'soon' | null {
  const exp = slotEarliestExp(slot);
  if (exp === null) return null;
  if (exp <= day) return 'today';
  if (exp === day + 1) return 'soon';
  return null;
}

/** Bật/tắt bán xả cho ô chứa hàng hết hạn hôm nay. */
export function setClearance(state: GameState, shelf: number, slot: number, pct: number | null): boolean {
  const s = state.shelves[shelf]?.[slot];
  if (!s?.productId || slotFreshness(s, state.day) !== 'today') return false;
  if (pct !== null && !DATA.balance.clearance.options.includes(pct)) return false;
  s.clearance = pct ?? undefined;
  return true;
}

/** Tiền điện mỗi ngày của các thiết bị đang đặt. */
export function electricityCost(state: GameState): number {
  const effects = EffectStack.forDay(state.day, state.calendarStartMonth, state.calendarStartYear, state.activeEvents);
  if (effects.powerIsOut()) return state.fixtures.some((f) => f.type === 'generator') ? 10_000 : 0;
  return Math.round(state.fixtures.reduce((sum, f) => sum + furniture(f.type).power, 0) * effects.multiply('electricityMul'));
}

/** Cúp điện quá ba giờ làm hỏng hàng đông lạnh, trừ khi máy phát đang hoạt động. */
export function spoilFrozenStock(state: GameState): number {
  if (state.fixtures.some((f) => f.type === 'generator')) return 0;
  let spoiled = 0;
  const remove = (id: string, qty: number) => {
    if (product(id).requiresCold !== 'freezer' || qty <= 0) return;
    spoiled += qty;
    state.today.spoiled[id] = (state.today.spoiled[id] ?? 0) + qty;
    state.today.spoiledCost += product(id).cost * qty;
  };
  state.warehouse = state.warehouse.filter((lot) => {
    if (product(lot.productId).requiresCold !== 'freezer') return true;
    remove(lot.productId, lot.qty);
    return false;
  });
  for (const row of state.shelves) for (const slot of row) {
    if (!slot.productId || product(slot.productId).requiresCold !== 'freezer') continue;
    remove(slot.productId, slot.qty);
    slot.productId = null;
    slot.qty = 0;
    slot.lots = [];
  }
  return spoiled;
}

// ---------- Ô kệ ----------

/** Lấy một đơn vị (hạn sớm nhất) khỏi ô; trả về hạn của đơn vị đó, hoặc undefined nếu ô trống. */
export function takeOneFromSlot(slot: Slot): number | null | undefined {
  if (!slot.productId || slot.qty <= 0) return undefined;
  const lots = slotLots(slot);
  const first = lots[0];
  const exp = first ? first.exp : null;
  if (first) {
    first.qty--;
    if (first.qty <= 0) lots.shift();
    slot.lots = lots;
  }
  slot.qty--;
  return exp;
}

export function putIntoSlot(slot: Slot, qty: number, exp: number | null): void {
  if (qty <= 0) return;
  const lots = slotLots(slot);
  const same = lots.find((l) => l.exp === exp);
  if (same) same.qty += qty;
  else lots.push({ qty, exp });
  slot.lots = sortLots(lots);
  slot.qty += qty;
}

/** Giá khách trả cho một đơn vị lấy từ ô (tính bán xả). */
export function slotUnitPrice(state: GameState, slot: Slot): number {
  if (!slot.productId) return 0;
  const base = state.prices[slot.productId] ?? (product(slot.productId).refPrice ?? product(slot.productId).price);
  return slot.clearance ? Math.round((base * (100 - slot.clearance)) / 100) : base;
}

function slotAt(state: GameState, shelf: number, slot: number) {
  if (!shelfUsable(state, shelf)) throw new Error('Kệ chưa mở khóa');
  const s = state.shelves[shelf][slot];
  if (!s) throw new Error('invalid-slot');
  return s;
}

/** Sức chứa mỗi ô; kệ đôi, kệ 3 và kệ 4 tăng số ô chứ không tăng sức chứa từng ô. */
export function shelfCapacity(state: GameState, shelf: number): number {
  const f = fixtureOfShelf(state, shelf);
  return DATA.balance.slotCapacity * (f ? furniture(f.type).capacityMul ?? 1 : 1);
}

/** Trả toàn bộ hàng của ô về kho (giữ hạn dùng). */
export function clearSlot(state: GameState, shelf: number, slot: number): void {
  const s = slotAt(state, shelf, slot);
  if (s.productId && s.qty > 0) for (const lot of slotLots(s)) addLot(state, s.productId, lot.qty, lot.exp);
  s.productId = null;
  s.qty = 0;
  s.lots = [];
  s.clearance = undefined;
  if (state.shelves[shelf].every((item) => !item.productId)) state.zones[shelf] = null;
}

export function zoneOf(state: GameState, shelf: number): ShelfZone {
  return state.zones[shelf] ?? null;
}

export type PlaceProductError = 'counter-only' | 'wrong-zone' | 'needs-fridge' | 'needs-freezer' | 'cold-only';

/** Kiểm tra loại nội thất (bỏ qua khu) có bày được món này không. */
export function kindAccepts(state: GameState, shelf: number, p: Product): PlaceProductError | null {
  if (p.behindCounter || p.category === 'counter') return 'counter-only';
  const kind = shelfKind(state, shelf);
  if (kind === 'freezer') return p.requiresCold === 'freezer' ? null : 'cold-only';
  if (kind === 'fridge') {
    if (p.requiresCold === 'freezer') return 'needs-freezer';
    return p.requiresCold === 'fridge' || p.category === 'drink' || p.category === 'fresh' ? null : 'cold-only';
  }
  if (p.requiresCold === 'fridge') return 'needs-fridge';
  if (p.requiresCold === 'freezer') return 'needs-freezer';
  return null;
}

/** Kiểm tra đầy đủ (loại nội thất + khu) cho việc gán món vào kệ. */
export function placeError(state: GameState, shelf: number, productId: string): PlaceProductError | null {
  const p = product(productId);
  const kindError = kindAccepts(state, shelf, p);
  if (kindError) return kindError;
  // Tủ lạnh là khu bảo quản theo nhiệt độ, không phải một quầy hàng theo danh mục.
  // Có thể để chung đồ uống, đồ tươi và các mặt hàng yêu cầu bảo quản lạnh.
  if (shelfKind(state, shelf) === 'fridge') return null;
  const zone = zoneOf(state, shelf);
  return zone && zone !== p.category ? 'wrong-zone' : null;
}

export function zoneFill(state: GameState, zone: Exclude<ShelfZone, null>): { fill: number; alert: ZoneAlert; qty: number; capacity: number } {
  let capacity = 0;
  const slots = usableShelves(state).flatMap((index) => {
    if (zoneOf(state, index) !== zone) return [];
    capacity += state.shelves[index].filter((s) => s.productId !== null).length * shelfCapacity(state, index);
    return state.shelves[index];
  });
  const active = slots.filter((s) => s.productId !== null);
  const qty = active.reduce((sum, s) => sum + s.qty, 0);
  const fill = capacity ? qty / capacity : 1;
  const alert: ZoneAlert = fill < DATA.balance.zoneCriticalThreshold ? 'critical' : fill < DATA.balance.zoneLowThreshold ? 'low' : 'ok';
  return { fill, alert, qty, capacity };
}

/** Gán ô cho một món và nạp từ kho. Ô đang chứa món khác thì trả về kho trước. */
export function assignSlot(state: GameState, shelf: number, slot: number, productId: string): number {
  const s = slotAt(state, shelf, slot);
  const error = placeError(state, shelf, productId);
  if (error) throw new Error(error);
  if (s.productId !== productId) clearSlot(state, shelf, slot);
  if (shelfKind(state, shelf) === 'fridge') state.zones[shelf] = null;
  else if (!zoneOf(state, shelf)) state.zones[shelf] = product(productId).category as ShelfZone;
  s.productId = productId;
  return refillSlot(state, shelf, slot);
}

export function assignCounterSlot(state: GameState, slot: number, productId: string): number {
  const next = product(productId);
  if (!next.behindCounter) throw new Error('counter-only');
  const target = state.counter[slot];
  if (!target) throw new Error('invalid-slot');
  if (target.productId === productId) return refillCounterSlot(state, slot);
  if (target.productId && target.qty > 0) addLot(state, target.productId, target.qty, null);
  target.productId = productId;
  target.qty = 0;
  target.lots = [];
  return refillCounterSlot(state, slot);
}

export function refillCounterSlot(state: GameState, slot: number): number {
  const target = state.counter[slot];
  if (!target?.productId || !product(target.productId).behindCounter) return 0;
  let got = 0;
  for (const lot of takeLots(state, target.productId, DATA.balance.counterCapacity - target.qty)) {
    putIntoSlot(target, lot.qty, lot.exp);
    got += lot.qty;
  }
  return got;
}

/** Nạp đầy ô từ kho (FEFO); trả về số đơn vị đã nạp. */
export function refillSlot(state: GameState, shelf: number, slot: number): number {
  const s = slotAt(state, shelf, slot);
  if (!s.productId) return 0;
  let got = 0;
  for (const lot of takeLots(state, s.productId, shelfCapacity(state, shelf) - s.qty)) {
    putIntoSlot(s, lot.qty, lot.exp);
    got += lot.qty;
  }
  return got;
}

export function canRefill(state: GameState, shelf: number, slot: number): boolean {
  const s = state.shelves[shelf]?.[slot];
  if (!s || !s.productId || !shelfUsable(state, shelf)) return false;
  return s.qty < shelfCapacity(state, shelf) && state.warehouse.some((lot) => lot.productId === s.productId && lot.qty > 0);
}

/** Ô kệ còn trống (chưa gán món, hoặc đã bán hết) để bày món mới giữa giờ bán. */
export function slotFreeForNew(state: GameState, shelf: number, slot: number, productId: string): boolean {
  const s = state.shelves[shelf]?.[slot];
  return !!s && s.qty === 0 && s.productId !== productId;
}

/** Ô quầy trống (hoặc đã hết) để đưa món sau quầy mới vào giữa giờ bán. */
export function counterFreeForNew(state: GameState, slot: number, productId: string): boolean {
  const s = state.counter[slot];
  return !!s && s.qty === 0 && s.productId !== productId;
}

/** Khu này đã có kệ khác cùng loại tủ nhận chưa (tự bày: mỗi khu chỉ một kệ). */
function zoneTakenElsewhere(state: GameState, shelf: number, zone: ShelfZone, zoneAt: (r: number) => ShelfZone = (r) => zoneOf(state, r)): boolean {
  const kind = shelfKind(state, shelf);
  return usableShelves(state).some((r) => r !== shelf && zoneAt(r) === zone && shelfKind(state, r) === kind);
}

/**
 * Giữa giờ bán: mỗi món trong kho chưa có ô nào trên kệ được xếp vào một ô trống hợp lệ.
 * Không nạp thêm ô đang bày (việc đó dùng nút + có thời gian nạp ở màn bán).
 * Ô đã bán hết mà kho cũng hết món cũ được dùng lại cho món mới.
 */
export function planNewProducts(state: GameState): { placements: { shelf: number; slot: number; productId: string }[]; unplaced: string[] } {
  const rows = usableShelves(state);
  const taken = new Set<string>();
  const inStock = new Set(state.warehouse.filter((lot) => lot.qty > 0).map((lot) => lot.productId));
  // Ô trống, hoặc ô đã bán hết mà kho cũng hết món đó: dùng lại được cho món mới (như bày tay).
  const free = (s: GameState['shelves'][number][number]) => !s.productId || (s.qty === 0 && s.clearance === undefined && !inStock.has(s.productId));
  const zones = new Map(rows.map((r) => [r, zoneOf(state, r)]));
  const placements: { shelf: number; slot: number; productId: string }[] = [];
  const unplaced: string[] = [];
  const ids = Object.entries(warehouseTotals(state))
    .filter(([id, q]) => q > 0 && !product(id).behindCounter && !rows.some((r) => state.shelves[r].some((s) => s.productId === id)))
    .map(([id]) => id);
  const place = (id: string, spill: boolean): boolean => {
    const p = product(id);
    for (const r of rows) {
      if (kindAccepts(state, r, p)) continue;
      const zone = zones.get(r);
      if (zone && zone !== p.category) continue;
      if (!zone && !spill && zoneTakenElsewhere(state, r, p.category as ShelfZone, (o) => zones.get(o) ?? null)) continue;
      const c = state.shelves[r].findIndex((s, i) => free(s) && !taken.has(`${r}:${i}`));
      if (c < 0) continue;
      if (!zone) zones.set(r, p.category as ShelfZone);
      taken.add(`${r}:${c}`);
      placements.push({ shelf: r, slot: c, productId: id });
      return true;
    }
    return false;
  };
  // Lượt 1: mỗi kệ một khu. Lượt 2: món dư của khu đã kín mới tràn sang kệ còn trống.
  const left = ids.filter((id) => !place(id, false));
  for (const id of left) if (!place(id, true)) unplaced.push(id);
  return { placements, unplaced };
}

/**
 * Tự bày: nạp các ô đang có hàng; mỗi món còn trong kho mà chưa có ô thì được một ô
 * (dùng ô trống, hết ô trống thì lấy lại một ô của món đang chiếm nhiều ô); ô trống còn lại
 * chia cho món bán chạy (bán + thiếu hôm qua) nhiều nhất. Tôn trọng loại tủ (lạnh/đông).
 * Trả về các món còn trong kho mà không có ô (thiếu kệ/tủ phù hợp).
 */
export function autoArrange(state: GameState): string[] {
  const rows = usableShelves(state);
  const slots: { r: number; c: number }[] = [];
  for (const r of rows) for (let c = 0; c < state.shelves[r].length; c++) slots.push({ r, c });
  const at = (p: { r: number; c: number }) => state.shelves[p.r][p.c];
  const demand = (id: string) => (state.yesterdaySold[id] ?? 0) + (state.yesterdayMissed[id] ?? 0);
  const has = (id: string) => state.warehouse.some((lot) => lot.productId === id && lot.qty > 0);
  // Kệ trống chỉ nhận khu chưa có kệ nào cùng loại tủ nhận: mỗi kệ một khu khác nhau.
  const fits = (r: number, id: string) => {
    if (kindAccepts(state, r, product(id))) return false;
    const zone = zoneOf(state, r);
    const category = product(id).category as ShelfZone;
    return zone === category || (zone === null && !zoneTakenElsewhere(state, r, category));
  };

  // Save/test state created before zones existed: infer a zone from the category occupying most slots.
  for (const r of rows) {
    if (zoneOf(state, r)) continue;
    const counts = new Map<string, number>();
    for (const s of state.shelves[r]) if (s.productId && s.qty > 0 && !product(s.productId).behindCounter) {
      const cat = product(s.productId).category;
      counts.set(cat, (counts.get(cat) ?? 0) + s.qty);
    }
    const inferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as ShelfZone | undefined;
    if (inferred) state.zones[r] = inferred;
  }

  // Ô đã hết hàng mà kho cũng hết thì dọn đi để dùng cho món khác.
  for (const p of slots) {
    const s = at(p);
    if (s.productId && s.qty === 0 && !has(s.productId)) clearSlot(state, p.r, p.c);
  }
  const slotsOf = (id: string) => slots.filter((p) => at(p).productId === id);

  // Mỗi món chỉ bày 1 ô: gom các ô trùng về ô đang nhiều hàng nhất, trả phần ô thừa về kho
  // (nếu kho còn chỗ) để nhường chỗ cho món khác. Ô đang bán xả giữ nguyên.
  const capacity = warehouseCapacity(state);
  for (const id of new Set(slots.map((p) => at(p).productId).filter((x): x is string => !!x))) {
    const dup = slotsOf(id).filter((p) => at(p).clearance === undefined).sort((a, b) => at(b).qty - at(a).qty);
    for (const p of dup.slice(1)) {
      const after = warehouseTotals(state);
      after[id] = (after[id] ?? 0) + at(p).qty;
      if (warehouseCellsUsed(after) > capacity) continue;
      clearSlot(state, p.r, p.c);
    }
  }

  // Mỗi khu chỉ một kệ (cùng loại tủ): kệ trùng khu dồn món sang kệ chính của khu nếu còn ô trống,
  // phần còn lại về kho (nếu kho còn chỗ), rồi bỏ khu để nhường kệ cho nhóm hàng khác.
  const filled = (r: number) => state.shelves[r].filter((s) => s.productId).length;
  for (const r of rows) {
    const zone = zoneOf(state, r);
    if (!zone) continue;
    const main = rows
      .filter((o) => zoneOf(state, o) === zone && shelfKind(state, o) === shelfKind(state, r))
      .sort((a, b) => filled(b) - filled(a) || a - b)[0];
    if (main === r || state.shelves[r].some((s) => s.clearance !== undefined)) continue;
    const onMain = new Set(state.shelves[main].map((s) => s.productId));
    let free = state.shelves[main].filter((s) => !s.productId).length;
    const after = warehouseTotals(state);
    const moves: string[] = [];
    for (const s of state.shelves[r]) {
      if (!s.productId) continue;
      after[s.productId] = (after[s.productId] ?? 0) + s.qty;
      if (!onMain.has(s.productId) && free > 0) { free--; onMain.add(s.productId); moves.push(s.productId); }
    }
    for (const id of moves) after[id] = Math.max(0, after[id] - shelfCapacity(state, main));
    if (warehouseCellsUsed(after) > capacity) continue;
    for (let c = 0; c < state.shelves[r].length; c++) clearSlot(state, r, c);
    state.zones[r] = null;
    for (const id of moves) assignSlot(state, main, state.shelves[main].findIndex((s) => !s.productId), id);
  }
  for (const p of slots) refillSlot(state, p.r, p.c);

  const inWarehouse = () => {
    const totals = warehouseTotals(state);
    return Object.keys(totals)
      .filter((id) => !product(id).behindCounter)
      .sort((a, b) => demand(b) - demand(a) || totals[b] - totals[a]);
  };

  // 1) Mỗi món có hàng đều phải có ít nhất một ô trong khu đúng nhóm và đúng loại tủ.
  // Kệ vừa được đổi khu trong lượt này không bị đổi tiếp (tránh tranh kệ qua lại giữa các khu).
  const claimed = new Set<number>();
  for (const id of inWarehouse()) {
    if (slotsOf(id).length > 0) continue;
    const category = product(id).category;
    let target = slots.find((p) => !at(p).productId && fits(p.r, id));
    if (!target) {
      // Lấy ô ít hàng nhất của món đang chiếm nhiều ô nhất.
      const counts = new Map<string, number>();
      for (const p of slots) {
        const pid = at(p).productId;
        if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
      target = slots
        .filter((p) => zoneOf(state, p.r) === category && !kindAccepts(state, p.r, product(id)) && (counts.get(at(p).productId!) ?? 0) >= 2)
        .sort((a, b) => (counts.get(at(b).productId!)! - counts.get(at(a).productId!)!) || at(a).qty - at(b).qty)[0];
    }
    if (!target && !rows.some((r) => zoneOf(state, r) === category && !kindAccepts(state, r, product(id)))) {
      // No shelf has this zone yet: reassign the least useful compatible shelf and return its stock to warehouse.
      const donor = rows
        .filter((r) => !claimed.has(r) && zoneOf(state, r) !== category && !kindAccepts(state, r, product(id)))
        .sort((a, b) => {
          const da = state.shelves[a].reduce((sum, s) => sum + (s.productId ? demand(s.productId) : 0), 0);
          const db = state.shelves[b].reduce((sum, s) => sum + (s.productId ? demand(s.productId) : 0), 0);
          if (da !== db) return da - db;
          // Cùng nhu cầu: nhường kệ đang bày ít hàng nhất (ít phải dọn về kho nhất).
          const qtyA = state.shelves[a].reduce((sum, s) => sum + s.qty, 0);
          const qtyB = state.shelves[b].reduce((sum, s) => sum + s.qty, 0);
          if (qtyA !== qtyB) return qtyA - qtyB;
          const countA = state.shelves[a].reduce((sum, s) => sum + (s.productId ? slotsOf(s.productId).length : 0), 0);
          const countB = state.shelves[b].reduce((sum, s) => sum + (s.productId ? slotsOf(s.productId).length : 0), 0);
          return countB - countA || b - a;
        })[0];
      if (donor !== undefined) {
        claimed.add(donor);
        for (let c = 0; c < state.shelves[donor].length; c++) clearSlot(state, donor, c);
        state.zones[donor] = category as ShelfZone;
        target = { r: donor, c: 0 };
      }
    }
    if (!target) continue;
    assignSlot(state, target.r, target.c, id);
  }

  // 2) Ô trống còn lại: món chưa có ô nào (không bày một món ra nhiều ô cho đỡ tốn chỗ), bán chạy trước.
  for (const p of slots) {
    if (at(p).productId) continue;
    const next = inWarehouse()
      .filter((id) => fits(p.r, id) && slotsOf(id).length === 0)
      .sort((a, b) => demand(b) - demand(a))[0];
    if (!next) continue;
    assignSlot(state, p.r, p.c, next);
  }

  // 3) Món dư của khu đã kín (khu có nhiều món hơn số ô một kệ) tràn sang kệ còn trống,
  // chỉ sau khi mọi nhóm khác đã có kệ; kệ tràn ưu tiên kệ cùng khu đã tràn trước đó.
  for (const id of inWarehouse()) {
    if (slotsOf(id).length > 0) continue;
    const category = product(id).category;
    const open = slots.filter((p) => !at(p).productId && !kindAccepts(state, p.r, product(id)));
    const target = open.find((p) => zoneOf(state, p.r) === category) ?? open.find((p) => zoneOf(state, p.r) === null);
    if (target) assignSlot(state, target.r, target.c, id);
  }
  return inWarehouse().filter((id) => slotsOf(id).length === 0);
}

/** Ô kệ đầu tiên đang có món này (để lấy hàng cho khách). */
export function findSlotWith(state: GameState, productId: string): { shelf: number; slot: number } | null {
  for (const r of usableShelves(state)) {
    for (let c = 0; c < state.shelves[r].length; c++) {
      const s = state.shelves[r][c];
      if (s.productId === productId && s.qty > 0) return { shelf: r, slot: c };
    }
  }
  return null;
}

/** Món này có chỗ bày không (đủ loại tủ). */
export function hasPlaceFor(state: GameState, p: Product): boolean {
  return usableShelves(state).some((r) => !kindAccepts(state, r, p));
}

// ---------- Bán nội thất ----------

export type SellFixtureResult = 'ok' | 'fixed' | 'missing' | 'space';

/** Bán nội thất lấy lại 50% giá; hàng trong nội thất được trả về kho nếu đủ chỗ. */
export function sellFixture(state: GameState, uid: number): SellFixtureResult {
  const f = state.fixtures.find((item) => item.uid === uid);
  if (!f) return 'missing';
  const def = furniture(f.type);
  if (def.fixed) return 'fixed';
  const goods: Record<string, number> = {};
  if (f.shelf !== undefined) for (const s of state.shelves[f.shelf] ?? []) if (s.productId && s.qty > 0) goods[s.productId] = (goods[s.productId] ?? 0) + s.qty;
  const after = warehouseTotals(state);
  for (const [id, qty] of Object.entries(goods)) after[id] = (after[id] ?? 0) + qty;
  const capacityAfter = warehouseCapacity(state) - (def.storageCells ?? 0);
  if (warehouseCellsUsed(after) > capacityAfter) return 'space';
  if (f.shelf !== undefined) {
    const row = state.shelves[f.shelf] ?? [];
    for (const s of row) if (s.productId && s.qty > 0) for (const lot of slotLots(s)) addLot(state, s.productId, lot.qty, lot.exp);
    state.shelves[f.shelf] = row.map(() => ({ productId: null, qty: 0 }));
    state.zones[f.shelf] = null;
  }
  state.fixtures = state.fixtures.filter((item) => item !== f);
  state.money += Math.floor(def.cost * DATA.balance.sellBackRatio);
  return 'ok';
}

// ---------- Gợi ý nhập hàng ----------

/** Số lượng nên có của một món: bán + thiếu hôm qua (có dự phòng); món chưa có số liệu dùng mức ước tính. */
export function suggestedTarget(state: GameState, p: Product): number {
  const cfg = DATA.balance.suggest;
  const demand = (state.yesterdaySold[p.id] ?? 0) + (state.yesterdayMissed[p.id] ?? 0);
  // Hàng mau hỏng: nhập sát nhu cầu (không dự phòng). Món chưa ai hỏi thì không nhập thử (newFresh = 0): khách
  // thỉnh thoảng hỏi món tiệm chưa bán, số "hỏi mà không có" đó thành nhu cầu cho ngày sau. Hàng HSD dài nhập như hàng khô.
  if (isPerishable(p)) return demand > 0 ? Math.max(1, Math.ceil(demand * cfg.freshFactor)) : cfg.newFresh;
  const base = demand > 0 ? demand : p.price <= cfg.cheapPrice ? cfg.newCheap : cfg.newPricey;
  return Math.ceil(base * cfg.buffer) + 1;
}

/** Gợi ý hàng cho tiệm xôi dựa trên nguyên liệu các món đã bán hôm qua. */
function xoiSuggestionTargets(state: GameState): { p: Product; target: number }[] {
  const shop = activeShopType(state).def;
  const recipes = DATA.recipes.filter((r) => shop.recipes.includes(r.id) && r.unlockLevel <= state.level);
  const active = recipes.filter((r) => state.activeRecipes.includes(r.id));
  // Khi chưa chọn món, gợi ý nguyên liệu cho các món xôi bán tại tiệm để người chơi có thể bắt đầu.
  const planned = active.length ? active : recipes.filter((r) => !r.packaged);
  const ingredientDemand = new Map<string, number>();
  let hasRecipeSales = false;
  for (const r of planned) {
    const demand = (state.yesterdaySold[r.output] ?? 0) + (state.yesterdayMissed[r.output] ?? 0);
    if (demand <= 0) continue;
    hasRecipeSales = true;
    for (const [id, qty] of Object.entries(r.ingredients)) {
      ingredientDemand.set(id, (ingredientDemand.get(id) ?? 0) + demand * qty);
    }
  }

  const unlocked = new Set(unlockedProducts(state.level, state).map((p) => p.id));
  const targets = new Map<string, { p: Product; target: number }>();
  const addTarget = (p: Product, target: number) => {
    const current = targets.get(p.id);
    if (!current || target > current.target) targets.set(p.id, { p, target });
  };

  const ingredientIds = hasRecipeSales
    ? [...ingredientDemand.keys()]
    : [...new Set(planned.flatMap((r) => Object.keys(r.ingredients)))];
  const cfg = DATA.balance.suggest;
  const portionsPerKg = DATA.balance.stickyRice.portionsPerKg;
  for (const id of ingredientIds) {
    if (id === 'nep_chin') {
      if (!unlocked.has('nep')) continue;
      const rice = product('nep');
      const portionsNeeded = ingredientDemand.get(id) ?? 0;
      const targetKg = portionsNeeded > 0
        ? Math.ceil((portionsNeeded * cfg.buffer + 1) / portionsPerKg)
        : suggestedTarget(state, rice);
      const otherRicePortions = state.soakBatches.reduce((sum, batch) => sum + batch.kg * portionsPerKg, 0)
        + state.cookedRice.reduce((sum, batch) => sum + batch.portions, 0);
      const availableRicePortions = totalQty(state, 'nep') * portionsPerKg + otherRicePortions;
      const missingKg = Math.max(0, Math.ceil((targetKg * portionsPerKg - availableRicePortions) / portionsPerKg));
      addTarget(rice, totalQty(state, 'nep') + missingKg);
      continue;
    }
    if (!unlocked.has(id)) continue;
    const p = product(id);
    const demand = ingredientDemand.get(id) ?? 0;
    const target = demand > 0
      ? isPerishable(p)
        ? Math.max(1, Math.ceil(demand * cfg.freshFactor))
        : Math.ceil(demand * cfg.buffer) + 1
      : suggestedTarget(state, p);
    addTarget(p, target);
  }

  // Đồ uống kèm được bán trực tiếp, nên vẫn dùng thống kê bán hàng thông thường.
  for (const addOn of shop.addOns) {
    if (unlocked.has(addOn.productId)) {
      const p = product(addOn.productId);
      addTarget(p, suggestedTarget(state, p));
    }
  }
  return [...targets.values()];
}

/**
 * Giỏ hàng gợi ý: bù mỗi món lên mức suggestedTarget. Khi thiếu tiền hoặc chỗ kho thì chia đều theo
 * tỉ lệ còn thiếu của từng món, để không món nào bị bỏ trống hoàn toàn. Tiệm xôi tính nguyên liệu
 * theo món đã bán, vì nguyên liệu được giữ trong kho chứ không bày trên kệ.
 */
export function suggestCart(state: GameState, supplierId = 'co_tu'): Cart {
  const targets = activeShopType(state).def.id === 'xoi'
    ? xoiSuggestionTargets(state)
    : unlockedProducts(state.level, state)
      .filter((p) => !p.behindCounter && hasPlaceFor(state, p))
      .map((p) => ({ p, target: suggestedTarget(state, p) }));
  const items = targets.map(({ p, target }) => ({ p, target, want: Math.max(0, target - totalQty(state, p.id)), blocked: false }));
  const cart: Cart = {};
  for (;;) {
    let best: (typeof items)[number] | null = null;
    for (const it of items) {
      if (it.blocked || it.want <= (cart[it.p.id] ?? 0)) continue;
      const missing = (it.want - (cart[it.p.id] ?? 0)) / it.target;
      if (!best || missing > (best.want - (cart[best.p.id] ?? 0)) / best.target) best = it;
    }
    if (!best) break;
    cart[best.p.id] = (cart[best.p.id] ?? 0) + 1;
    const check = checkCart(state, cart, supplierId);
    if (!check.ok && check.reason !== 'min-order') {
      cart[best.p.id]--;
      if (cart[best.p.id] === 0) delete cart[best.p.id];
      best.blocked = true;
    }
  }
  return cart;
}

/** Số ngày lịch sử dùng để tìm món bán chạy khi nhập giữa giờ. */
const BEST_SELLER_DAYS = 7;

/** Bán trung bình mỗi ngày của từng món: các ngày gần nhất trong analytics cộng hôm nay (tính như một ngày). */
export function recentDailySales(state: GameState, days = BEST_SELLER_DAYS): Record<string, number> {
  const records = state.analytics.slice(-days);
  const total: Record<string, number> = {};
  for (const rec of records) for (const [id, q] of Object.entries(rec.sold)) total[id] = (total[id] ?? 0) + q;
  for (const [id, q] of Object.entries(state.today.sold)) total[id] = (total[id] ?? 0) + q;
  const n = records.length + 1;
  for (const id of Object.keys(total)) total[id] /= n;
  return total;
}

export interface RestockSuggestion {
  cart: Cart;
  /** Món đang hết / sắp hết trên kệ (hoặc khách hỏi mà không có). */
  outOfStock: string[];
  /** Món bán chạy nhất được nhập thêm. */
  bestSellers: string[];
}

/**
 * Gợi ý nhập giữa giờ bán: ưu tiên bù đầy các món đang hết trên kệ (và món khách hỏi mà không có),
 * sau đó nhập thêm `topN` món bán chạy nhất gần đây cho đủ một ô kệ / đủ bán. Thiếu tiền hoặc chỗ kho
 * thì nhóm hết hàng được mua trước, trong nhóm ưu tiên món sẽ bán hết sớm nhất.
 */
export function suggestRestockCart(state: GameState, supplierId = 'co_tu', topN = 5): RestockSuggestion {
  const cfg = DATA.balance.suggest;
  const daily = recentDailySales(state);
  const candidates = unlockedProducts(state.level, state).filter((p) => !p.behindCounter && hasPlaceFor(state, p));
  const slotCap = new Map<string, number>();
  for (const r of usableShelves(state)) {
    for (const s of state.shelves[r]) if (s.productId) slotCap.set(s.productId, (slotCap.get(s.productId) ?? 0) + shelfCapacity(state, r));
  }
  const freshTarget = (p: Product, extra = 0) => Math.max(cfg.newFresh, Math.ceil((daily[p.id] ?? 0) * cfg.freshFactor) + extra);

  const out: { p: Product; target: number }[] = [];
  for (const p of candidates) {
    const cap = slotCap.get(p.id);
    const have = totalQty(state, p.id);
    const missed = state.today.missed[p.id] ?? 0;
    // Sắp hết: tổng trên kệ + kho chưa tới nửa ô.
    const low = cap !== undefined && have < DATA.balance.slotCapacity / 2;
    if (!low && missed === 0) continue;
    const target = isPerishable(p) ? freshTarget(p, missed) : Math.max(cap ?? DATA.balance.slotCapacity, missed * 2);
    if (target > have) out.push({ p, target });
  }
  const outIds = new Set(out.map((it) => it.p.id));
  const best = candidates
    .filter((p) => !outIds.has(p.id) && (daily[p.id] ?? 0) > 0)
    .sort((a, b) => daily[b.id] - daily[a.id])
    .slice(0, topN)
    .map((p) => ({ p, target: isPerishable(p) ? freshTarget(p) : Math.max(DATA.balance.slotCapacity, Math.ceil(daily[p.id] * cfg.buffer)) }))
    .filter((it) => it.target > totalQty(state, it.p.id));

  const cart: Cart = {};
  for (const group of [out, best]) {
    const items = group.map(({ p, target }) => {
      const have = totalQty(state, p.id);
      // Món chưa có số liệu bán coi như bán chậm, để món bán chạy được mua trước khi thiếu tiền.
      return { p, have, rate: Math.max(daily[p.id] ?? 0, 0.3), want: target - have, blocked: false };
    });
    // Mỗi lần thêm 1 món cho món sẽ bán hết sớm nhất (số ngày còn đủ bán ít nhất).
    const cover = (it: (typeof items)[number]) => (it.have + (cart[it.p.id] ?? 0)) / it.rate;
    for (;;) {
      let pick: (typeof items)[number] | null = null;
      for (const it of items) {
        if (it.blocked || it.want <= (cart[it.p.id] ?? 0)) continue;
        if (!pick || cover(it) < cover(pick)) pick = it;
      }
      if (!pick) break;
      cart[pick.p.id] = (cart[pick.p.id] ?? 0) + 1;
      const check = checkCart(state, cart, supplierId);
      if (!check.ok && check.reason !== 'min-order') {
        cart[pick.p.id]--;
        if (cart[pick.p.id] === 0) delete cart[pick.p.id];
        pick.blocked = true;
      }
    }
  }
  return {
    cart,
    outOfStock: out.map((it) => it.p.id).filter((id) => cart[id]),
    bestSellers: best.map((it) => it.p.id).filter((id) => cart[id]),
  };
}
