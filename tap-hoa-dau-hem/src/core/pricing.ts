import { DATA, hasFeature, product, refPrice, type CustomerType } from './data';
import { unlockedProducts, type GameState } from './state';

/** Khoảng giá được phép (đã làm tròn theo bước giá). */
export function priceRange(productId: string): { min: number; max: number; ref: number } {
  const { min, max, step } = DATA.balance.pricing;
  const ref = refPrice(product(productId));
  return { min: Math.ceil((ref * min) / step) * step, max: Math.floor((ref * max) / step) * step, ref };
}

/** Làm tròn và kẹp giá vào khoảng cho phép. */
export function clampPrice(productId: string, price: number): number {
  const { step } = DATA.balance.pricing;
  const { min, max } = priceRange(productId);
  return Math.min(max, Math.max(min, Math.round(price / step) * step));
}

export function canSetPrices(state: GameState): boolean {
  return hasFeature(state.level, 'pricing') && state.phase === 'morning';
}

/** Đặt giá bán; trả về giá thực tế áp dụng (đã kẹp). Giá bằng giá gợi ý thì xóa ghi đè. */
export function setPrice(state: GameState, productId: string, price: number): number {
  const value = clampPrice(productId, price);
  if (value === priceRange(productId).ref) delete state.prices[productId];
  else state.prices[productId] = value;
  return value;
}

/** Tỉ lệ giá bán / giá gợi ý. */
export function priceRatio(state: GameState, productId: string): number {
  const ref = refPrice(product(productId));
  return (state.prices[productId] ?? ref) / ref;
}

/** Xác suất khách vẫn lấy món ở mức giá hiện tại. */
export function keepChance(state: GameState, productId: string, type: CustomerType): number {
  const r = priceRatio(state, productId);
  if (r <= 1) return 1;
  const k = type.priceSensitivity ?? 1;
  return Math.min(1, Math.max(DATA.balance.pricing.minKeep, 1 - k * (r - 1)));
}

/** Giá trung bình thấp hơn giá gợi ý thì khách tới nhiều hơn (tối đa +10%). */
export function cheapSpawnMultiplier(state: GameState): number {
  const items = unlockedProducts(state.level).filter((p) => !p.behindCounter);
  if (!items.length) return 1;
  const avg = items.reduce((sum, p) => sum + priceRatio(state, p.id), 0) / items.length;
  if (avg >= 1) return 1;
  const { min, cheapSpawnMax } = DATA.balance.pricing;
  return 1 + Math.min(cheapSpawnMax, ((1 - avg) / (1 - min)) * cheapSpawnMax);
}
