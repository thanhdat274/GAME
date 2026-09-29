/**
 * Ly trà tùy biến: khách gọi một tùy chọn (Size L, thêm topping...), ô quầy đếm ly theo tùy chọn, và phục vụ/tính tiền theo ly.
 * Thuần logic (không Phaser) để test bằng Vitest. Chỉ áp dụng cho món có `minigame: 'tea'`; món khác không đổi.
 */
import { product, recipeByOutput, type RecipeDef } from './data';
import type { OrderLine } from './customers';
import type { Slot } from './state';

/** Món pha theo đơn (`serve: 'order'`): không pha sẵn được, khách gọi thì pha ngay. */
export function isMadeToOrder(recipe: RecipeDef | undefined): boolean {
  return !!recipe && recipe.serve === 'order';
}

/** Khóa của ly thường (không tùy chọn). */
export const BASE_VARIANT = '';
/** Trọng số khách gọi ly thường so với `orderWeight` của các tùy chọn. */
export const BASE_ORDER_WEIGHT = 0.4;
const DEFAULT_VARIANT_WEIGHT = 0.2;

/** Món này có gọi tùy chọn không (món trà có tùy chọn). */
export function isCustomRecipe(recipe: RecipeDef | undefined): recipe is RecipeDef {
  return !!recipe && recipe.minigame === 'tea' && !!recipe.variants?.length;
}

const deltaOf = (recipe: RecipeDef, key: string): number => (key === BASE_VARIANT ? 0 : recipe.variants?.find((v) => v.id === key)?.priceDelta ?? 0);

/**
 * Số ly theo tùy chọn của một ô, luôn khớp tổng với `slot.qty`: thừa thì bớt từ loại thêm vào sau cùng,
 * thiếu thì tính là ly thường. Không đổi ô. Nhờ vậy nơi nào đổi `qty` (bán, hết hạn, trả ly) cũng không làm lệch.
 */
export function cupsBy(slot: Pick<Slot, 'qty' | 'variants'>): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const [key, n] of Object.entries(slot.variants ?? {})) {
    const take = Math.min(n, slot.qty - total);
    if (take > 0) { out[key] = take; total += take; }
  }
  if (total < slot.qty) out[BASE_VARIANT] = (out[BASE_VARIANT] ?? 0) + slot.qty - total;
  return out;
}

/** Thêm một ly loại `key` vào ô (thay cho `slot.qty++`). */
export function addCup(slot: Slot, key: string): void {
  const cups = cupsBy(slot);
  slot.qty++;
  cups[key] = (cups[key] ?? 0) + 1;
  slot.variants = cups;
}

/** Bớt một ly loại `key` trong thông tin tùy chọn; người gọi tự giảm `slot.qty` sau đó. */
export function removeCupRecord(slot: Slot, key: string): void {
  const cups = cupsBy(slot);
  if ((cups[key] ?? 0) > 0) cups[key]--;
  else { const any = Object.keys(cups).find((k) => cups[k] > 0); if (any !== undefined) cups[any]--; }
  slot.variants = Object.fromEntries(Object.entries(cups).filter(([, n]) => n > 0));
}

export type CupFit = 'exact' | 'better' | 'worse';

/** Ly `give` so với ly `want` khách gọi: đúng, tốt hơn (phụ thu cao hơn) hay kém hơn (thấp hơn hoặc khác loại cùng mức). */
export function cupFit(recipe: RecipeDef, want: string, give: string): CupFit {
  if (want === give) return 'exact';
  return deltaOf(recipe, give) > deltaOf(recipe, want) ? 'better' : 'worse';
}

/** Chọn ly đưa cho khách: đúng loại nếu có; không thì loại gần nhất (ưu tiên loại tốt hơn). Null nếu ô hết ly. */
export function pickServed(slot: Slot, recipe: RecipeDef, want: string): { key: string; fit: CupFit } | null {
  const cups = cupsBy(slot);
  if ((cups[want] ?? 0) > 0) return { key: want, fit: 'exact' };
  const target = deltaOf(recipe, want);
  const candidates = Object.keys(cups).filter((k) => cups[k] > 0);
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const da = deltaOf(recipe, a) - target;
    const db = deltaOf(recipe, b) - target;
    // Tốt hơn (>= 0) trước, rồi gần nhất.
    return (da < 0 ? 1 : 0) - (db < 0 ? 1 : 0) || Math.abs(da) - Math.abs(db);
  });
  return { key: candidates[0], fit: cupFit(recipe, want, candidates[0]) };
}

/** Giá một ly đưa cho khách: giá món cộng phụ thu của ly được đưa, nhưng không cao hơn giá món khách đã gọi. */
export function cupPrice(recipe: RecipeDef, basePrice: number, want: string, give: string): number {
  return basePrice + Math.min(deltaOf(recipe, give), deltaOf(recipe, want));
}

/** Ô quầy so với yêu cầu của khách: có đúng loại ly khách gọi, chỉ có cùng món (loại khác), hay không liên quan. */
export function slotMatch(slot: Slot, line: Pick<OrderLine, 'productId' | 'variantId'>): 'exact' | 'product' | 'none' {
  if (slot.productId !== line.productId || slot.qty <= 0) return 'none';
  return (cupsBy(slot)[line.variantId ?? BASE_VARIANT] ?? 0) > 0 ? 'exact' : 'product';
}

/** Chọn tùy chọn khách gọi cho một món theo trọng số; trả khóa rỗng (ly thường) nếu món không có tùy chọn. `next` trả số trong [0, 1). */
export function orderVariantFor(recipe: RecipeDef, next: () => number): string {
  if (!isCustomRecipe(recipe)) return BASE_VARIANT;
  const options = [{ key: BASE_VARIANT, weight: BASE_ORDER_WEIGHT }, ...recipe.variants!.map((v) => ({ key: v.id, weight: v.orderWeight ?? DEFAULT_VARIANT_WEIGHT }))];
  let roll = next() * options.reduce((sum, o) => sum + o.weight, 0);
  for (const option of options) {
    roll -= option.weight;
    if (roll < 0) return option.key;
  }
  return options[options.length - 1].key;
}

// ---- Nhãn hiển thị ---------------------------------------------------------------------------

export function variantName(recipe: RecipeDef, key: string): string {
  return key === BASE_VARIANT ? 'Mặc định' : recipe.variants?.find((v) => v.id === key)?.name ?? key;
}

/** Tên ngắn của tùy chọn để ghi trên nhãn nhỏ: "Size L" → "L", "+ Trân châu" → "TC". */
export function variantTag(recipe: RecipeDef, key: string): string {
  const name = variantName(recipe, key);
  if (name.startsWith('Size ')) return name.slice(5);
  return name.replace(/^\+\s*/, '').split(/\s+/).map((w) => w[0]).join('').toUpperCase();
}

/** Tên món trong đơn của khách, kèm tùy chọn nếu có: "Trà sữa trân châu · Size L". */
export function orderLineName(line: Pick<OrderLine, 'productId' | 'variantId'>): string {
  const name = product(line.productId).name;
  const recipe = recipeByOutput(line.productId);
  if (!line.variantId || !recipe) return name;
  return `${name} · ${variantName(recipe, line.variantId)}`;
}

/** Các khóa tùy chọn theo thứ tự hiển thị ổn định: ly thường trước, rồi các tùy chọn theo công thức. */
function orderedKeys(recipe: RecipeDef, cups: Record<string, number>): string[] {
  const known = [BASE_VARIANT, ...(recipe.variants ?? []).map((v) => v.id)];
  return [...known.filter((k) => (cups[k] ?? 0) > 0), ...Object.keys(cups).filter((k) => !known.includes(k) && cups[k] > 0)];
}

/** Nhãn ô quầy: tên món, tổng ly, và số ly theo tùy chọn khi có ly tùy chọn ("×3 L1+TC1"). */
export function counterSlotLabel(slot: Slot): string {
  if (!slot.productId) return 'Trống';
  const name = product(slot.productId).name;
  const recipe = recipeByOutput(slot.productId);
  let tags = '';
  if (isCustomRecipe(recipe)) {
    const cups = cupsBy(slot);
    tags = orderedKeys(recipe, cups).filter((k) => k !== BASE_VARIANT).map((k) => `${variantTag(recipe, k)}${cups[k]}`).join('+');
  }
  return `${name}\n×${slot.qty}${tags ? ` ${tags}` : ''}`;
}

/** Tồn quầy của một món theo tùy chọn, ví dụ "Mặc định 2 · Size L 1" (rỗng nếu không có ly). */
export function counterStockText(counter: readonly Slot[], outputId: string): string {
  const recipe = recipeByOutput(outputId);
  if (!recipe) return '';
  const total: Record<string, number> = {};
  for (const slot of counter) {
    if (slot.productId !== outputId || slot.qty <= 0) continue;
    for (const [k, n] of Object.entries(cupsBy(slot))) total[k] = (total[k] ?? 0) + n;
  }
  return orderedKeys(recipe, total).map((k) => `${variantName(recipe, k)} ${total[k]}`).join(' · ');
}
