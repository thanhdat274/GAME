/**
 * Quầy pha trà sữa: nhóm quầy của nguyên liệu và thứ tự thêm vào ly cho một công thức + tùy chọn.
 * Thuần logic (không Phaser) để test bằng Vitest; `TeaScene` chỉ vẽ và nhận thao tác chạm.
 */
import { product, type RecipeDef, type RecipeVariant } from './data';
import { recipeRequirements } from './recipes';

/** Nhóm quầy theo thứ tự thêm vào ly, kèm nhãn hiển thị. */
export const TEA_BAR_GROUPS: readonly { id: string; label: string }[] = [
  { id: 'cup', label: '🥤 LY' },
  { id: 'tea', label: '🍵 QUẦY TRÀ' },
  { id: 'syrup', label: '🍹 SIRO' },
  { id: 'topping', label: '⚫ TOPPING' },
  { id: 'mix', label: '🥛 SỮA · ĐƯỜNG' },
  { id: 'foam', label: '🧀 FOAM' },
  { id: 'ice', label: '🧊 ĐÁ' },
];

const GROUP_INDEX = new Map(TEA_BAR_GROUPS.map((g, i) => [g.id, i]));

/** Nguyên liệu thuộc nhóm quầy nào: theo `barGroup` trong dữ liệu; nguyên liệu chung như sữa tươi thuộc "sữa · đường", nước đá có quầy riêng. */
export function barGroupOf(productId: string): string {
  return product(productId).barGroup ?? (productId === 'nuoc_da' ? 'ice' : 'mix');
}

/**
 * Thứ tự các lần chạm để pha một ly: nguyên liệu của công thức và của tùy chọn, xếp theo nhóm quầy
 * (ly → trà → siro → topping → sữa/đường → foam → đá), mỗi nguyên liệu lặp lại theo số lượng cần.
 */
export function teaOrder(recipe: RecipeDef, variant?: RecipeVariant): string[] {
  const req = recipeRequirements(recipe, variant);
  const ids = Object.keys(req).sort((a, b) => (GROUP_INDEX.get(barGroupOf(a)) ?? 0) - (GROUP_INDEX.get(barGroupOf(b)) ?? 0));
  return ids.flatMap((id) => Array<string>(req[id]).fill(id));
}
