import { DATA, product, type Category, type CustomerType } from './data';
import type { Rng } from './rng';
import { unlockedCategories, unlockedProducts } from './state';

export interface OrderLine {
  productId: string;
  qty: number;
  picked: number;
}

export type CustomerStatus = 'queue' | 'picking' | 'paying' | 'done';

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
}

/** Hệ số mật độ khách theo giờ trong ngày. */
export function densityAt(minute: number): number {
  const seg = DATA.balance.density.find((d) => minute >= d.from && minute < d.to);
  return seg ? seg.mul : 1;
}

/** Thời gian trung bình (giây thật) giữa hai khách. */
export function meanSpawnSeconds(minute: number, ratingMul: number): number {
  return DATA.balance.baseSpawnSeconds / (densityAt(minute) * ratingMul);
}

export function pickCustomerType(rng: Rng, types: CustomerType[] = DATA.customers): CustomerType {
  return types[rng.weightedIndex(types.map((t) => t.weight))];
}

/** Sinh yêu cầu 1–3 món từ các mặt hàng đã mở khóa theo sở thích kiểu khách. */
export function generateOrder(type: CustomerType, level: number, rng: Rng): OrderLine[] {
  const cats = unlockedCategories(level);
  const products = unlockedProducts(level);
  const countWeights = [0.5, 0.35, 0.15].slice(0, type.maxItems);
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
    const maxQty = p.price <= 5000 ? 3 : p.price <= 15000 ? 2 : 1;
    lines.push({ productId: p.id, qty: rng.int(1, maxQty), picked: 0 });
  }
  if (lines.length === 0) lines.push({ productId: rng.pick(products).id, qty: 1, picked: 0 });
  return lines;
}

export function createCustomer(id: number, level: number, rng: Rng): Customer {
  const type = pickCustomerType(rng);
  return {
    id,
    type,
    order: generateOrder(type, level, rng),
    patience: type.patience,
    patienceMax: type.patience,
    status: 'queue',
    bill: 0,
    total: 0,
    changeDue: 0,
    changeStartedAt: 0,
    undos: 0,
    shortAttempts: 0,
    penalty: 0,
  };
}

export function orderTotal(c: Customer): number {
  return c.order.reduce((sum, l) => sum + l.picked * product(l.productId).price, 0);
}

export function orderComplete(c: Customer): boolean {
  return c.order.every((l) => l.picked >= l.qty);
}

/** Sao theo phần kiên nhẫn còn lại, trừ phạt; tối thiểu 1. */
export function ratingFor(c: Customer): number {
  const ratio = c.patience / c.patienceMax;
  const base = ratio >= 0.5 ? 5 : ratio >= 0.25 ? 4 : 3;
  return Math.max(1, base - c.penalty);
}
