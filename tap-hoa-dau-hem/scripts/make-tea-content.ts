/**
 * Sinh nội dung tiệm trà sữa vào products.json và recipes.json (idempotent: xóa mục đã sinh rồi ghi lại).
 * Chạy: npm run tea-content
 * Giá vốn thành phẩm = tổng giá nguyên liệu (validateRecipes yêu cầu khớp); giá bán = giá vốn × 1.9 làm tròn lên nghìn;
 * `priceDelta` biến thể theo chi phí nguyên liệu thêm. Sửa bảng dưới đây rồi chạy lại để đổi nội dung.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** Nhóm quầy trong mini-game pha ly: quyết định ô nằm ở khu nào và thứ tự thêm vào ly. */
type Bar = 'cup' | 'tea' | 'syrup' | 'topping' | 'foam' | 'mix';
interface Ingredient { id: string; name: string; icon: string; category: 'dry' | 'fresh'; cost: number; price: number; unlock: number; life: number; cold?: 'fridge'; bar: Bar }
interface Drink { id: string; name: string; icon: string; unlock: number; station: 'tea_bar' | 'foam_machine'; ingredients: Record<string, number>; prep: number; serve?: 'order' }

/** Nguyên liệu riêng của tiệm trà sữa (shopOnly). Sữa tươi và nước đá dùng lại mặt hàng có sẵn. */
const INGREDIENTS: Ingredient[] = [
  { id: 'ly_nhua', name: 'Ly nhựa + nắp', icon: '🥤', category: 'dry', cost: 1200, price: 2000, unlock: 36, life: 365, bar: 'cup' },
  { id: 'nuoc_duong', name: 'Nước đường', icon: '🍯', category: 'dry', cost: 2500, price: 4000, unlock: 36, life: 60, bar: 'mix' },
  { id: 'tra_sua_base', name: 'Cốt trà sữa', icon: '🧋', category: 'dry', cost: 5000, price: 8000, unlock: 36, life: 40, bar: 'tea' },
  { id: 'hong_tra', name: 'Hồng trà', icon: '🍵', category: 'dry', cost: 4500, price: 7000, unlock: 36, life: 45, bar: 'tea' },
  { id: 'luc_tra', name: 'Lục trà', icon: '🍃', category: 'dry', cost: 4500, price: 7000, unlock: 37, life: 45, bar: 'tea' },
  { id: 'tra_thai', name: 'Trà thái đỏ', icon: '🧡', category: 'dry', cost: 5500, price: 8500, unlock: 38, life: 45, bar: 'tea' },
  { id: 'olong', name: 'Trà ô long', icon: '🫖', category: 'dry', cost: 5500, price: 8500, unlock: 39, life: 45, bar: 'tea' },
  { id: 'matcha_bot', name: 'Bột matcha', icon: '🌿', category: 'dry', cost: 9000, price: 13000, unlock: 39, life: 60, bar: 'tea' },
  { id: 'siro_vai', name: 'Siro vải', icon: '🍒', category: 'dry', cost: 5000, price: 8000, unlock: 37, life: 90, bar: 'syrup' },
  { id: 'siro_dao', name: 'Siro đào', icon: '🍑', category: 'dry', cost: 5000, price: 8000, unlock: 38, life: 90, bar: 'syrup' },
  { id: 'siro_dau', name: 'Siro dâu', icon: '🍓', category: 'dry', cost: 5000, price: 8000, unlock: 40, life: 90, bar: 'syrup' },
  { id: 'siro_nho', name: 'Siro nho', icon: '🍇', category: 'dry', cost: 5500, price: 8500, unlock: 44, life: 90, bar: 'syrup' },
  { id: 'siro_chanh_day', name: 'Siro chanh dây', icon: '🥭', category: 'dry', cost: 5500, price: 8500, unlock: 46, life: 90, bar: 'syrup' },
  { id: 'tran_chau_den', name: 'Trân châu đen', icon: '⚫', category: 'fresh', cost: 4000, price: 6500, unlock: 36, life: 3, bar: 'topping' },
  { id: 'thach_dua', name: 'Thạch dừa', icon: '🥥', category: 'fresh', cost: 3500, price: 5500, unlock: 36, life: 4, bar: 'topping' },
  { id: 'tran_chau_trang', name: 'Trân châu trắng', icon: '⚪', category: 'fresh', cost: 4500, price: 7000, unlock: 38, life: 3, bar: 'topping' },
  { id: 'thach_trai_cay', name: 'Thạch trái cây', icon: '🍬', category: 'fresh', cost: 3500, price: 5500, unlock: 40, life: 4, bar: 'topping' },
  { id: 'pudding', name: 'Pudding trứng', icon: '🍮', category: 'fresh', cost: 5000, price: 8000, unlock: 42, life: 3, cold: 'fridge', bar: 'topping' },
  { id: 'suong_sao', name: 'Sương sáo', icon: '⬛', category: 'fresh', cost: 3500, price: 5500, unlock: 44, life: 4, bar: 'topping' },
  { id: 'foam_cheese', name: 'Foam phô mai', icon: '🧀', category: 'fresh', cost: 7000, price: 10000, unlock: 41, life: 3, cold: 'fridge', bar: 'foam' },
  { id: 'foam_matcha', name: 'Foam matcha', icon: '🍵', category: 'fresh', cost: 7500, price: 10500, unlock: 43, life: 3, cold: 'fridge', bar: 'foam' },
  { id: 'foam_muoi', name: 'Foam muối', icon: '🧂', category: 'fresh', cost: 7000, price: 10000, unlock: 45, life: 3, cold: 'fridge', bar: 'foam' },
  { id: 'foam_ube', name: 'Foam khoai môn', icon: '🟣', category: 'fresh', cost: 7500, price: 10500, unlock: 47, life: 3, cold: 'fridge', bar: 'foam' },
];

/** Giá của mặt hàng có sẵn dùng trong công thức. */
const EXISTING_COST: Record<string, number> = { sua_tuoi: 9000, nuoc_da: 3000 };

const BASE = { ly_nhua: 1, nuoc_da: 1 };
const DRINKS: Drink[] = [
  { id: 'tra_sua_tran_chau', name: 'Trà sữa trân châu', icon: '🧋', unlock: 36, station: 'tea_bar', prep: 10, ingredients: { ...BASE, tra_sua_base: 1, sua_tuoi: 1, tran_chau_den: 1, nuoc_duong: 1 } },
  { id: 'hong_tra_sua', name: 'Hồng trà sữa', icon: '🧋', unlock: 36, station: 'tea_bar', prep: 9, ingredients: { ...BASE, hong_tra: 1, sua_tuoi: 1, nuoc_duong: 1 } },
  { id: 'luc_tra_vai', name: 'Lục trà vải', icon: '🍹', unlock: 37, station: 'tea_bar', prep: 8, ingredients: { ...BASE, luc_tra: 1, siro_vai: 1 } },
  { id: 'tra_thai_do', name: 'Trà thái đỏ', icon: '🧋', unlock: 38, station: 'tea_bar', prep: 9, ingredients: { ...BASE, tra_thai: 1, sua_tuoi: 1, nuoc_duong: 1 } },
  { id: 'hong_tra_dao', name: 'Hồng trà đào', icon: '🍑', unlock: 38, station: 'tea_bar', prep: 8, ingredients: { ...BASE, hong_tra: 1, siro_dao: 1 } },
  { id: 'olong_sua', name: 'Ô long sữa', icon: '🧋', unlock: 39, station: 'tea_bar', prep: 9, ingredients: { ...BASE, olong: 1, sua_tuoi: 1 } },
  { id: 'matcha_latte', name: 'Matcha latte', icon: '🍵', unlock: 39, station: 'tea_bar', prep: 10, serve: 'order', ingredients: { ...BASE, matcha_bot: 1, sua_tuoi: 1, nuoc_duong: 1 } },
  { id: 'tra_dau', name: 'Trà dâu thạch', icon: '🍓', unlock: 40, station: 'tea_bar', prep: 9, ingredients: { ...BASE, luc_tra: 1, siro_dau: 1, thach_trai_cay: 1 } },
  { id: 'hong_tra_macchiato', name: 'Hồng trà macchiato', icon: '🧀', unlock: 41, station: 'foam_machine', prep: 11, serve: 'order', ingredients: { ...BASE, hong_tra: 1, foam_cheese: 1, nuoc_duong: 1 } },
  { id: 'matcha_foam', name: 'Matcha foam', icon: '🍵', unlock: 43, station: 'foam_machine', prep: 12, serve: 'order', ingredients: { ...BASE, matcha_bot: 1, sua_tuoi: 1, foam_matcha: 1 } },
  { id: 'tra_nho', name: 'Trà nho sương sáo', icon: '🍇', unlock: 44, station: 'tea_bar', prep: 9, ingredients: { ...BASE, luc_tra: 1, siro_nho: 1, suong_sao: 1 } },
  { id: 'olong_foam_muoi', name: 'Ô long foam muối', icon: '🧂', unlock: 45, station: 'foam_machine', prep: 11, serve: 'order', ingredients: { ...BASE, olong: 1, foam_muoi: 1 } },
  { id: 'tra_chanh_day', name: 'Trà chanh dây', icon: '🥭', unlock: 46, station: 'tea_bar', prep: 9, serve: 'order', ingredients: { ...BASE, luc_tra: 1, siro_chanh_day: 1, tran_chau_trang: 1 } },
  { id: 'tra_ube', name: 'Trà sữa khoai môn', icon: '🟣', unlock: 47, station: 'foam_machine', prep: 13, serve: 'order', ingredients: { ...BASE, tra_sua_base: 1, sua_tuoi: 1, foam_ube: 1, pudding: 1 } },
];

const COST: Record<string, number> = { ...EXISTING_COST, ...Object.fromEntries(INGREDIENTS.map((i) => [i.id, i.cost])) };
const roundUp = (n: number, step = 1000): number => Math.ceil(n / step) * step;
const costOf = (ing: Record<string, number>): number => Object.entries(ing).reduce((s, [id, q]) => s + (COST[id] ?? NaN) * q, 0);

/** Biến thể: nguyên liệu thêm và giá cộng thêm (theo chi phí thêm). */
function variantsOf(d: Drink): object[] {
  const list: { id: string; name: string; extra: Record<string, number>; quality: number; weight: number }[] = [
    { id: 'size_l', name: 'Size L', extra: { nuoc_da: 1, nuoc_duong: 1 }, quality: 0, weight: 0.3 },
  ];
  if (!d.ingredients.tran_chau_den) list.push({ id: 'them_tran_chau', name: '+ Trân châu', extra: { tran_chau_den: 1 }, quality: 0.05, weight: 0.2 });
  if (!d.ingredients.thach_dua) list.push({ id: 'them_thach', name: '+ Thạch dừa', extra: { thach_dua: 1 }, quality: 0.05, weight: 0.12 });
  if (!d.ingredients.foam_cheese && d.unlock >= 41) list.push({ id: 'them_foam', name: '+ Foam', extra: { foam_cheese: 1 }, quality: 0.05, weight: 0.15 });
  return list.map((v) => ({ id: v.id, name: v.name, priceDelta: roundUp(costOf(v.extra) * 1.6), qualityDelta: v.quality, extraIngredients: v.extra, orderWeight: v.weight }));
}

function stepsOf(d: Drink): string[] {
  const has = (...ids: string[]): boolean => ids.some((id) => d.ingredients[id]);
  const steps = ['Lấy ly', 'Rót trà'];
  if (has('siro_vai', 'siro_dao', 'siro_dau', 'siro_nho', 'siro_chanh_day')) steps.push('Thêm siro');
  if (has('tran_chau_den', 'tran_chau_trang', 'thach_trai_cay', 'suong_sao', 'pudding')) steps.push('Thêm topping');
  if (has('sua_tuoi')) steps.push('Thêm sữa');
  if (has('foam_cheese', 'foam_matcha', 'foam_muoi', 'foam_ube')) steps.push('Phủ foam');
  steps.push('Thêm đá', 'Đậy nắp và lắc');
  return steps;
}

// ---- Ghi file ---------------------------------------------------------------------------------

const fmtSpaced = (v: unknown): string => Array.isArray(v) ? `[${v.map(fmtSpaced).join(', ')}]`
  : v && typeof v === 'object' ? `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${fmtSpaced(x)}`).join(', ')}}` : JSON.stringify(v);

function rewrite(file: string, generatedIds: Set<string>, added: object[], fmt: (o: unknown) => string): number {
  const url = new URL(`../src/data/${file}`, import.meta.url);
  const raw = readFileSync(url, 'utf8');
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  const list = (JSON.parse(raw) as { id: string }[]).filter((item) => !generatedIds.has(item.id));
  const all = [...list, ...added];
  writeFileSync(url, `[${nl}${all.map((o) => `  ${fmt(o)}`).join(`,${nl}`)}${nl}]${nl}`);
  return added.length;
}

const ingredientProducts = INGREDIENTS.map((i) => ({
  id: i.id, name: i.name, category: i.category, icon: i.icon, color: '#d7ccc8', cost: i.cost, price: i.price, size: 1, unlockLevel: i.unlock,
  shelfLifeDays: i.life, ...(i.cold ? { requiresCold: i.cold } : {}), shopOnly: true, barGroup: i.bar,
}));
const outputProducts = DRINKS.map((d) => {
  const cost = costOf(d.ingredients);
  if (!Number.isFinite(cost)) throw new Error(`${d.id}: có nguyên liệu không có giá`);
  return { id: `${d.id}_tp`, name: d.name, category: 'counter', icon: d.icon, color: '#bcaaa4', cost, price: roundUp(cost * 1.9), size: 1, unlockLevel: d.unlock, behindCounter: true, recipeOnly: true, shelfLifeDays: 1 };
});
const recipes = DRINKS.map((d) => ({
  id: d.id, name: d.name, category: 'beverage', output: `${d.id}_tp`, ingredients: d.ingredients, station: d.station, unlockLevel: d.unlock,
  prepSeconds: d.prep, shelfLifeDays: 1, steps: stepsOf(d), variants: variantsOf(d), minigame: 'tea', ...(d.serve ? { serve: d.serve } : {}),
}));

const productIds = new Set([...ingredientProducts, ...outputProducts].map((p) => p.id));
const nProducts = rewrite('products.json', productIds, [...ingredientProducts, ...outputProducts], fmtSpaced);
const nRecipes = rewrite('recipes.json', new Set(DRINKS.map((d) => d.id)), recipes, (o) => JSON.stringify(o));
console.log(`Trà sữa: ${nProducts} mặt hàng (${ingredientProducts.length} nguyên liệu + ${outputProducts.length} thành phẩm), ${nRecipes} công thức.`);
