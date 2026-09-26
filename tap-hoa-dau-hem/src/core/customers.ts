import { DATA, product, type Category, type CustomerType } from './data';
import type { Rng } from './rng';
import { unlockedCategories, unlockedProducts } from './state';

export interface OrderLine {
  productId: string;
  qty: number;
  /** Units physically taken from shelves or served from the counter. */
  picked: number;
  scanned: number;
  missing: number;
  counterLine?: boolean;
  pickedFrom?: { shelf: number; slot: number; qty: number }[];
  counterSlot?: number;
}

export type CustomerStatus = 'entering' | 'browsing' | 'waiting' | 'scanning' | 'paying' | 'done';

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
}

/** Hệ số mật độ khách theo giờ trong ngày. */
export function densityAt(minute: number): number {
  const seg = DATA.balance.density.find((d) => minute >= d.from && minute < d.to);
  return seg ? seg.mul : 1;
}

/** Thời gian trung bình (giây thật) giữa hai khách. */
export function meanSpawnSeconds(minute: number, ratingMul: number, day = 99): number {
  return DATA.balance.baseSpawnSeconds / (densityAt(minute) * ratingMul * newShopMultiplier(day));
}

/** Tiệm mới mở ít người biết: ngày đầu ít khách hơn. */
export function newShopMultiplier(day: number): number {
  return DATA.balance.newShopRamp[day - 1] ?? 1;
}

export function pickCustomerType(rng: Rng, types: CustomerType[] = DATA.customers): CustomerType {
  return types[rng.weightedIndex(types.map((t) => t.weight))];
}

/** Sinh giỏ hàng thông thường; hàng sau quầy được thêm riêng theo xác suất của khách. */
export function generateOrder(type: CustomerType, level: number, rng: Rng): OrderLine[] {
  const cats = unlockedCategories(level);
  const products = unlockedProducts(level).filter((p) => !p.behindCounter);
  const countWeights = DATA.balance.orderLineWeights.slice(0, type.maxItems);
  const count = rng.weightedIndex(countWeights) + 1;
  const lines: OrderLine[] = [];
  for (let i = 0; i < count; i++) {
    const catWeights = cats.map((c: Category) => type.prefs[c] ?? 0);
    const ci = rng.weightedIndex(catWeights);
    if (ci < 0) break;
    const pool = products.filter((p) => p.category === cats[ci] && !lines.some((l) => l.productId === p.id));
    if (pool.length === 0) continue;
    // Món rẻ (mì gói, muối) được mua thường xuyên hơn món đắt (dầu ăn).
    const p = pool[rng.weightedIndex(pool.map((x) => 1 / Math.sqrt(x.price)))];
    // Món rẻ thì hay mua nhiều hơn.
    const maxQty = DATA.balance.qtyByPrice.find((q) => p.price <= q.maxPrice)?.maxQty ?? 1;
    lines.push({ productId: p.id, qty: rng.int(1, maxQty), picked: 0, scanned: 0, missing: 0, pickedFrom: [] });
  }
  if (lines.length === 0) lines.push({ productId: rng.pick(products).id, qty: 1, picked: 0, scanned: 0, missing: 0, pickedFrom: [] });
  const counterUnlockLevel = DATA.levels.levels.find((item) => item.counterUnlock)?.level ?? Number.POSITIVE_INFINITY;
  if (level >= counterUnlockLevel && type.counterRequestChance > 0 && rng.next() < type.counterRequestChance) {
    const counterProducts = unlockedProducts(level).filter((p) => p.behindCounter);
    if (counterProducts.length) {
      const p = rng.pick(counterProducts);
      lines.push({ productId: p.id, qty: 1, picked: 0, scanned: 0, missing: 0, counterLine: true, pickedFrom: [] });
    }
  }
  return lines;
}

export function createCustomer(id: number, level: number, rng: Rng): Customer {
  const type = pickCustomerType(rng);
  const order = generateOrder(type, level, rng);
  const browseLines = order.filter((l) => !l.counterLine).length;
  return {
    id,
    type,
    order,
    patience: type.patience,
    patienceMax: type.patience,
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
  };
}

export function orderTotal(c: Customer): number {
  return c.order.reduce((sum, l) => sum + l.scanned * product(l.productId).price, 0);
}

export function orderComplete(c: Customer): boolean {
  return c.order.filter((l) => !l.counterLine).every((l) => l.picked + l.missing >= l.qty);
}

/** Sao theo phần kiên nhẫn còn lại, trừ phạt; tối thiểu 1. */
export function ratingFor(c: Customer): number {
  const ratio = c.patience / c.patienceMax;
  const base = ratio >= 0.5 ? 5 : ratio >= 0.25 ? 4 : 3;
  return Math.max(1, base - c.penalty);
}
