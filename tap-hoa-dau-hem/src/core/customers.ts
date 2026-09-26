import { DATA, type Category, type CustomerType } from './data';
import type { Rng } from './rng';
import { priceOf, unlockedCategories, unlockedProducts, usableShelves, type GameState } from './state';
import { EffectStack } from './effects';

export interface OrderLine {
  productId: string;
  qty: number;
  /** Units physically taken from shelves or served from the counter. */
  picked: number;
  scanned: number;
  missing: number;
  counterLine?: boolean;
  pickedFrom?: { shelf: number; slot: number; qty: number; exps?: (number | null)[] }[];
  counterSlot?: number;
  /** Tổng giá của các đơn vị đã lấy (tính giá người chơi đặt và bán xả). */
  value?: number;
  /** Khách bỏ món vì giá đắt hoặc không lạnh. */
  declined?: 'price' | 'cold';
}

export type CustomerStatus = 'entering' | 'browsing' | 'waiting' | 'scanning' | 'bargain' | 'credit' | 'paying' | 'fleeing' | 'done';

export interface Customer {
  id: number;
  type: CustomerType;
  order: OrderLine[];
  patience: number;
  patienceMax: number;
  status: CustomerStatus;
  /** Tờ tiền khách đưa và số cần thối (khi đang trả tiền). */
  bill: number;
  total: number;
  changeDue: number;
  changeStartedAt: number;
  undos: number;
  shortAttempts: number;
  /** Sao bị trừ do thiếu món / thối thiếu... */
  penalty: number;
  browseIndex: number;
  shopBudget: number;
  browseTimer: number;
  browsePicking: boolean;
  basketMissing: number;
  scanStartedAt: number | null;
  autoScanned: boolean;
  comboTipEligible: boolean;
  counterRequestSeconds: number;
  counterRequestLeft: number | null;
  counterRequestResolved: boolean;
  /** Tên khách quen (hàng xóm) và ngoại hình riêng. */
  name?: string;
  look?: { shirt: string; pants: string; hair: string; skin: string };
  /** Phần trăm khách xin bớt khi tính tiền (0: không mặc cả). */
  bargainPct?: number;
  bargainResolved?: boolean;
  /** Khách xin ghi sổ thay vì trả tiền. */
  wantsCredit?: boolean;
  creditResolved?: boolean;
  /** Giảm giá đã đồng ý (%). */
  discountPct?: number;
  /** Sao tối đa (vd khách bị từ chối bớt giá). */
  maxStars?: number;
  waited?: number;
  catChecked?: boolean;
  /** Nội thất khách đang đứng cạnh (uid) — để tính đường đi. */
  at?: number | null;
  /** Quầy khách xếp: 0 = quầy người chơi, số khác = quầy nhân viên. */
  lane?: number;
  /** Sao cộng thêm (thu ngân thân thiện). */
  bonusStars?: number;
  /** Kẻ trộm vặt: lấy hàng rồi đi thẳng ra cửa. */
  thief?: boolean;
  /** Giây còn lại để bắt quả tang. */
  fleeLeft?: number;
  /** Khách lấy xe đẩy (mini-mart): mua 3–6 món. */
  cart?: boolean;
}

/** Hệ số mật độ khách theo giờ trong ngày. */
export function densityAt(minute: number): number {
  const seg = DATA.balance.density.find((d) => minute >= d.from && minute < d.to);
  return seg ? seg.mul : 1;
}

/** Thời gian trung bình (giây thật) giữa hai khách. */
export function meanSpawnSeconds(minute: number, ratingMul: number, day = 99, eventTrafficMul = 1): number {
  return DATA.balance.baseSpawnSeconds / (densityAt(minute) * ratingMul * newShopMultiplier(day) * eventTrafficMul);
}

/** Tiệm mới mở ít người biết: ngày đầu ít khách hơn. */
export function newShopMultiplier(day: number): number {
  return DATA.balance.newShopRamp[day - 1] ?? 1;
}

export function pickCustomerType(rng: Rng, types: CustomerType[] = DATA.customers, level = 99): CustomerType {
  const pool = types.filter((t) => (t.unlockLevel ?? 1) <= level);
  return pool[rng.weightedIndex(pool.map((t) => t.weight))];
}

/** Sinh giỏ hàng thông thường; hàng sau quầy được thêm riêng theo xác suất của khách. */
export function generateOrder(type: CustomerType, level: number, rng: Rng, state?: GameState, cartUnits = 0): OrderLine[] {
  const cats = unlockedCategories(level);
  const products = unlockedProducts(level, state).filter((p) => !p.behindCounter);
  // Món đang bán xả được chọn nhiều hơn.
  const clearance = new Set<string>();
  if (state) for (const r of usableShelves(state)) for (const s of state.shelves[r]) if (s.clearance && s.productId && s.qty > 0) clearance.add(s.productId);
  const effects = state ? EffectStack.forDay(state.day, state.calendarStartMonth, state.calendarStartYear, state.activeEvents) : null;
  const pickWeight = (id: string, price: number, category: string) => (1 / Math.sqrt(price))
    * (clearance.has(id) ? DATA.balance.clearance.pickWeightMul : 1) * (effects?.demand(category, id) ?? 1);
  const countWeights = DATA.balance.orderLineWeights.slice(0, type.maxItems);
  const count = cartUnits > 0 ? cartUnits : rng.weightedIndex(countWeights) + 1;
  const lines: OrderLine[] = [];
  const units = () => lines.reduce((n, l) => n + l.qty, 0);
  for (let i = 0; i < count; i++) {
    if (cartUnits > 0 && units() >= cartUnits) break;
    const catWeights = cats.map((c: Category) => (type.prefs[c] ?? 0) * (effects?.demand(c) ?? 1));
    const ci = rng.weightedIndex(catWeights);
    if (ci < 0) break;
    const pool = products.filter((p) => p.category === cats[ci] && !lines.some((l) => l.productId === p.id));
    if (pool.length === 0) continue;
    // Món rẻ (mì gói, muối) được mua thường xuyên hơn món đắt (dầu ăn).
    const p = pool[rng.weightedIndex(pool.map((x) => pickWeight(x.id, x.price, x.category)))];
    // Món rẻ thì hay mua nhiều hơn.
    const maxQty = DATA.balance.qtyByPrice.find((q) => p.price <= q.maxPrice)?.maxQty ?? 1;
    const qty = cartUnits > 0 ? Math.min(rng.int(1, maxQty), cartUnits - units()) : rng.int(1, maxQty);
    lines.push({ productId: p.id, qty, picked: 0, scanned: 0, missing: 0, pickedFrom: [] });
  }
  if (lines.length === 0) lines.push({ productId: rng.pick(products).id, qty: 1, picked: 0, scanned: 0, missing: 0, pickedFrom: [] });
  const counterUnlockLevel = DATA.levels.levels.find((item) => item.counterUnlock)?.level ?? Number.POSITIVE_INFINITY;
  if (level >= counterUnlockLevel && type.counterRequestChance > 0 && rng.next() < type.counterRequestChance) {
    const counterProducts = unlockedProducts(level, state).filter((p) => p.behindCounter);
    if (state) {
      const prepared = DATA.products.filter((p) => p.recipeOnly && state.activeRecipes.some((id) => DATA.recipes.find((r) => r.id === id)?.output === p.id)
        && state.counter.some((slot) => slot.productId === p.id && slot.qty > 0));
      counterProducts.push(...prepared);
    }
    if (counterProducts.length) {
      const p = rng.pick(counterProducts);
      lines.push({ productId: p.id, qty: 1, picked: 0, scanned: 0, missing: 0, counterLine: true, pickedFrom: [] });
    }
  }
  return lines;
}

/** Tiệm đã thành mini-mart (mở mảnh đất có xe đẩy) và level đã mở xe đẩy. */
export function hasCarts(state: GameState | undefined, level: number): boolean {
  if (!state || !DATA.levels.levels.some((l) => l.level <= level && l.features?.includes('cart'))) return false;
  return state.land.some((id) => DATA.land.plots.find((p) => p.id === id)?.miniMart);
}

export function createCustomer(id: number, level: number, rng: Rng, state?: GameState): Customer {
  const type = pickCustomerType(rng, DATA.customers, level);
  const cartCfg = DATA.balance.cart;
  const cart = hasCarts(state, level) && cartCfg.types.includes(type.id) && rng.next() < cartCfg.chance;
  const order = generateOrder(type, level, rng, state, cart ? rng.int(cartCfg.minItems, cartCfg.maxItems) : 0);
  const browseLines = order.filter((l) => !l.counterLine).length;
  const neighbor = type.neighbors?.length ? type.neighbors[Math.floor(rng.next() * type.neighbors.length)] : undefined;
  const b = DATA.balance;
  const bargainPct = level >= b.bargain.unlockLevel && type.bargainChance && rng.next() < type.bargainChance
    ? rng.int(b.bargain.minPct, b.bargain.maxPct) : 0;
  const wantsCredit = !!type.creditChance && DATA.levels.levels.some((l) => l.level <= level && l.features?.includes('credit')) && rng.next() < type.creditChance;
  const patience = cart ? Math.round(type.patience * cartCfg.patienceMul) : type.patience;
  const customer: Customer = {
    id,
    type,
    order,
    patience,
    patienceMax: patience,
    status: 'entering',
    bill: 0,
    total: 0,
    changeDue: 0,
    changeStartedAt: 0,
    undos: 0,
    shortAttempts: 0,
    penalty: 0,
    browseIndex: 0,
    shopBudget: Math.max(1, browseLines * (DATA.balance.zoneWalkSeconds + DATA.balance.pickSeconds) * 1.6),
    browseTimer: DATA.balance.zoneWalkSeconds,
    browsePicking: false,
    basketMissing: 0,
    scanStartedAt: null,
    autoScanned: false,
    comboTipEligible: false,
    counterRequestSeconds: DATA.balance.counterRequestSeconds,
    counterRequestLeft: null,
    counterRequestResolved: !order.some((l) => l.counterLine),
    waited: 0,
    at: null,
  };
  if (neighbor) {
    customer.name = neighbor.name;
    customer.look = { shirt: neighbor.shirt, pants: neighbor.pants, hair: neighbor.hair, skin: neighbor.skin };
  }
  if (cart) customer.cart = true;
  if (bargainPct) customer.bargainPct = bargainPct;
  if (wantsCredit) customer.wantsCredit = true;
  return customer;
}

/**
 * Tổng tiền các món đã quét, theo giá lúc khách lấy (kể cả bán xả), trừ phần bớt giá.
 * Làm tròn tới 1.000đ như tiệm thật (khay tiền không có tờ 500đ).
 */
export function orderTotal(c: Customer, state?: GameState): number {
  const gross = c.order.reduce((sum, l) => {
    if (l.scanned <= 0) return sum;
    const unit = l.value !== undefined && l.picked > 0 ? l.value / l.picked : priceOf(l.productId, state);
    return sum + Math.round(unit * l.scanned);
  }, 0);
  const net = c.discountPct ? (gross * (100 - c.discountPct)) / 100 : gross;
  return net > 0 ? Math.max(1000, Math.round(net / 1000) * 1000) : 0;
}

export function orderComplete(c: Customer): boolean {
  return c.order.filter((l) => !l.counterLine).every((l) => l.picked + l.missing >= l.qty);
}

/** Sao theo phần kiên nhẫn còn lại, trừ phạt; tối thiểu 1. */
export function ratingFor(c: Customer): number {
  const ratio = c.patience / c.patienceMax;
  const base = ratio >= 0.5 ? 5 : ratio >= 0.25 ? 4 : 3;
  return Math.max(1, Math.min(c.maxStars ?? 5, base - c.penalty + (c.bonusStars ?? 0)));
}
