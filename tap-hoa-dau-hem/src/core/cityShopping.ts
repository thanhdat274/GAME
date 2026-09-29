/**
 * Dân phố chọn tiệm để ghé mua trên bản đồ phố. Thuần logic (không Phaser) để test bằng Vitest.
 * Chỉ là lớp hiển thị: không đọc/ghi doanh thu, kho hay save.
 */
import type { CityMap } from './cityMap';
import type { Cell } from './cityWalk';
import { DATA, product, type Category, type CustomerType } from './data';
import { shopTypeOf } from './shopTypes';
import { storeView, type GameState, type Slot } from './state';

/** Một mặt hàng đang có trên kệ của tiệm, với giá tiệm đang bán. */
export interface StockedItem { productId: string; qty: number; price: number }

/** Một dòng trong danh sách định mua. */
export type PlannedItem = StockedItem;

/** Một tiệm mà dân phố có thể ghé. */
export interface ShopTarget {
  /** `main` hoặc id chi nhánh. */
  id: string;
  /** Ô đứng trước cửa. */
  door: Cell;
  /** Hệ số đông khách của khu (`traffic` của chi nhánh; tiệm chính = 1). */
  traffic: number;
  /** Tỉ lệ ô bày hàng còn hàng trên các ô đã gán mặt hàng (0..1). */
  stock: number;
  /** Nhóm hàng loại tiệm này bán; rỗng với loại chỉ bán ở quầy (tiệm xôi). */
  categories: Category[];
  /** Hàng đang có (gộp theo mặt hàng); dùng để sinh danh sách định mua. */
  items: StockedItem[];
  /** Hệ số số lượng mỗi dòng của loại tiệm (bán sỉ). */
  qtyMul: number;
}

/** Khách còn ghé tiệm hết hàng với xác suất tối thiểu này, để tiệm không "chết hẳn" trên bản đồ. */
export const MIN_STOCK_FACTOR = 0.2;
/** Độ hợp trung tính cho nhóm hàng khách không nói tới, và cho loại tiệm không có nhóm hàng. */
const UNKNOWN_PREF = 0.3;
const NEUTRAL_FIT = 2.5;

/** Tiệm có mở cửa ở phút này không (theo giờ mở/đóng trong balance.json). */
export function shopIsOpen(minute: number): boolean {
  const m = ((minute % 1440) + 1440) % 1440;
  return m >= DATA.balance.openMinute && m < DATA.balance.closeMinute;
}

/** Tỉ lệ ô còn hàng trên các ô đã gán mặt hàng; chưa gán ô nào thì 0. */
export function stockRatio(slots: readonly Slot[]): number {
  const assigned = slots.filter((s) => s.productId);
  if (!assigned.length) return 0;
  return assigned.filter((s) => s.qty > 0).length / assigned.length;
}

/** Các tiệm đã mở và có lô đất trên bản đồ, kèm thông tin để tính mức thu hút. */
export function cityShops(state: GameState, map: CityMap): ShopTarget[] {
  const shops: ShopTarget[] = [];
  for (const store of state.stores) {
    const lot = map.lots.find((l) => l.storeId === store.id);
    if (!lot) continue;
    const view = storeView(state, store.id);
    const def = shopTypeOf(store).def;
    const slots = def.service === 'counter' ? view.counter : view.shelves.flat();
    const prices = (view as { prices?: Record<string, number> }).prices ?? {};
    const totals = new Map<string, number>();
    for (const slot of slots) if (slot.productId && slot.qty > 0) totals.set(slot.productId, (totals.get(slot.productId) ?? 0) + slot.qty);
    shops.push({
      id: store.id,
      door: { x: lot.door.x, y: lot.door.y },
      traffic: DATA.branches.find((b) => b.id === store.id)?.traffic ?? 1,
      stock: stockRatio(slots),
      categories: def.categories,
      items: [...totals].map(([productId, qty]) => ({ productId, qty, price: prices[productId] ?? product(productId).price })),
      qtyMul: shopTypeOf(store).qtyMul,
    });
  }
  return shops;
}

/** Độ hợp giữa sở thích của loại khách và nhóm hàng của tiệm. */
export function preferenceFit(type: CustomerType, categories: readonly Category[]): number {
  if (!categories.length) return NEUTRAL_FIT;
  const sum = categories.reduce((total, c) => total + (type.prefs[c] ?? UNKNOWN_PREF), 0);
  return sum / categories.length;
}

/** Trọng số một loại khách chọn tiệm này: đông khách × còn hàng × hợp sở thích. */
export function shopWeight(type: CustomerType, shop: ShopTarget): number {
  return shop.traffic * (MIN_STOCK_FACTOR + (1 - MIN_STOCK_FACTOR) * shop.stock) * preferenceFit(type, shop.categories);
}

/** Chọn ngẫu nhiên theo trọng số một tiệm đang mở; null nếu không có tiệm nào (đóng cửa hoặc chưa mở tiệm). `next` trả số trong [0, 1). */
export function pickShop(type: CustomerType, shops: readonly ShopTarget[], minute: number, next: () => number): ShopTarget | null {
  if (!shopIsOpen(minute) || !shops.length) return null;
  const weights = shops.map((shop) => shopWeight(type, shop));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = next() * total;
  for (let i = 0; i < shops.length; i++) {
    roll -= weights[i];
    if (roll < 0) return shops[i];
  }
  return shops[shops.length - 1];
}

/** Chọn một chỉ số theo trọng số; -1 nếu tổng bằng 0. `next` trả số trong [0, 1). */
function weightedIndex(weights: readonly number[], next: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let roll = next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** Khách không nói tới nhóm hàng vẫn có chút khả năng chọn món của nhóm đó. */
const PREF_EPSILON = 0.05;

/**
 * Danh sách định mua của một người ở một tiệm, từ hàng đang có trên kệ (không vượt tồn), theo sở thích nhóm hàng,
 * giá (món rẻ hay được chọn hơn), số dòng theo `orderLineWeights` (tối đa `maxItems`) và số lượng theo `qtyByPrice`
 * nhân `qtyMul` của loại tiệm. Chỉ để hiển thị: không trừ kho. Rỗng nếu tiệm hết hàng.
 */
export function planPurchase(type: CustomerType, shop: ShopTarget, next: () => number): PlannedItem[] {
  const pool = shop.items.filter((item) => item.qty > 0);
  if (!pool.length) return [];
  const lineWeights = DATA.balance.orderLineWeights.slice(0, Math.max(1, type.maxItems));
  const lines = Math.min(pool.length, Math.max(1, weightedIndex(lineWeights, next) + 1));
  const plan: PlannedItem[] = [];
  for (let i = 0; i < lines; i++) {
    const weights = pool.map((item) => (plan.some((p) => p.productId === item.productId) ? 0
      : ((type.prefs[product(item.productId).category] ?? 0) + PREF_EPSILON) / Math.sqrt(Math.max(1, item.price))));
    const at = weightedIndex(weights, next);
    if (at < 0) break;
    const item = pool[at];
    const maxQty = DATA.balance.qtyByPrice.find((q) => item.price <= q.maxPrice)?.maxQty ?? 1;
    const qty = Math.min(item.qty, Math.max(1, Math.round((1 + Math.floor(next() * maxQty)) * shop.qtyMul)));
    plan.push({ productId: item.productId, qty, price: item.price });
  }
  return plan;
}

/** Tổng tiền ước tính của danh sách định mua. */
export function planTotal(plan: readonly PlannedItem[]): number {
  return plan.reduce((sum, item) => sum + item.qty * item.price, 0);
}
