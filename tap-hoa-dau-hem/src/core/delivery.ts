import { DATA, hasFeature, product } from './data';
import type { Rng } from './rng';
import { priceOf, shelfQty, unlockedProducts, usableShelves, warehouseQty, type GameState } from './state';
import { takeLots, takeOneFromSlot } from './stock';

export type PhoneOrderStatus = 'ringing' | 'accepted' | 'out' | 'done' | 'declined' | 'missed';

/** Đơn giao hàng qua điện thoại bàn (chỉ sống trong phiên bán). */
export interface PhoneOrder {
  id: number;
  name: string;
  place: string;
  distance: number;
  items: Record<string, number>;
  /** Tiền hàng theo giá bán hiện tại. */
  value: number;
  fee: number;
  /** Hạn giao (phút trong ngày). */
  deadline: number;
  status: PhoneOrderStatus;
  /** Giây còn lại để nghe máy. */
  answerLeft: number;
  /** Người đi giao: id nhân viên hoặc "player". */
  courier: string | null;
  /** Giây còn lại của chuyến đi (tính cả đường về). */
  tripLeft: number;
  tripTotal: number;
  /** Giá vốn hàng đã giữ. */
  cost: number;
  delivered: boolean;
  onTime: boolean | null;
}

export function deliveryUnlocked(state: GameState): boolean {
  return hasFeature(state.level, 'delivery');
}

/** Sinh đơn 3–8 món, địa chỉ trong hẻm, phí ship theo khoảng cách, hạn 1–2 giờ game. */
export function createPhoneOrder(state: GameState, rng: Rng, id: number, minute: number): PhoneOrder {
  const cfg = DATA.balance.delivery;
  const address = rng.pick(cfg.addresses);
  const pool = unlockedProducts(state.level, state).filter((p) => !p.behindCounter);
  // Ưu tiên món đang có hàng để phần lớn đơn nhận được.
  const inStock = pool.filter((p) => warehouseQty(state, p.id) + shelfQty(state, p.id) > 0);
  const source = inStock.length >= 2 && rng.next() < 0.85 ? inStock : pool;
  const units = rng.int(cfg.minItems, cfg.maxItems);
  const items: Record<string, number> = {};
  const lines = Math.min(source.length, rng.int(1, 3));
  const picks: string[] = [];
  while (picks.length < lines) {
    const p = rng.pick(source).id;
    if (!picks.includes(p)) picks.push(p);
  }
  for (let i = 0; i < units; i++) {
    const id2 = picks[i % picks.length];
    items[id2] = (items[id2] ?? 0) + 1;
  }
  const value = Object.entries(items).reduce((sum, [pid, q]) => sum + priceOf(pid, state) * q, 0);
  return {
    id,
    name: address.name,
    place: address.place,
    distance: address.distance,
    items,
    value,
    fee: cfg.feeBase + cfg.feePerDistance * address.distance,
    deadline: minute + rng.int(cfg.deadlineMin, cfg.deadlineMax),
    status: 'ringing',
    answerLeft: cfg.answerSeconds,
    courier: null,
    tripLeft: 0,
    tripTotal: 0,
    cost: 0,
    delivered: false,
    onTime: null,
  };
}

/** Các món thiếu (kho + kệ không đủ) — nút "Nhận" bị vô hiệu khi còn thiếu. */
export function orderShortfall(state: GameState, items: Record<string, number>): { productId: string; missing: number }[] {
  return Object.entries(items)
    .map(([productId, qty]) => ({ productId, missing: qty - warehouseQty(state, productId) - shelfQty(state, productId) }))
    .filter((x) => x.missing > 0);
}

/** Giữ hàng cho đơn: lấy từ kho trước (FEFO), thiếu thì lấy trên kệ. Trả về giá vốn. */
export function reserveItems(state: GameState, items: Record<string, number>): number {
  let cost = 0;
  for (const [productId, qty] of Object.entries(items)) {
    let left = qty;
    for (const lot of takeLots(state, productId, left)) left -= lot.qty;
    for (const r of usableShelves(state)) {
      for (const slot of state.shelves[r]) {
        while (left > 0 && slot.productId === productId && slot.qty > 0) {
          takeOneFromSlot(slot);
          left--;
        }
      }
    }
    cost += product(productId).cost * (qty - left);
  }
  return cost;
}

/** Thời gian một chuyến giao (đi + về) theo khoảng cách và hệ số tốc độ người giao. */
export function tripSeconds(distance: number, timeFactor = 1): number {
  return distance * DATA.balance.delivery.secondsPerDistance * 2 * timeFactor;
}

export function orderUnits(order: PhoneOrder): number {
  return Object.values(order.items).reduce((a, b) => a + b, 0);
}
