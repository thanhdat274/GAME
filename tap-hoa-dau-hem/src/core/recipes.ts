import { DATA, product, recipeById, type RecipeDef, type RecipeVariant } from './data';
import { activeShopType, shopTypeOf } from './shopTypes';
import { COOKED_RICE_ID, cookedPortions, riceDishQuality, takeCookedRice } from './stickyRice';
import { formatMoney, type GameState, type StoreData } from './state';

export type CookResult = { ok: true; cost: number; output: string; quality: number } | { ok: false; reason: 'locked' | 'shop' | 'station' | 'ingredients' | 'space' | 'menu' };

export function validateRecipes(recipes: RecipeDef[] = DATA.recipes): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const r of recipes) {
    if (ids.has(r.id)) errors.push(`${r.id}: trùng id`);
    ids.add(r.id);
    if (!r.id || !r.name || !r.output || !r.station || !r.steps?.length) errors.push(`${r.id || '?'}: thiếu trường bắt buộc`);
    const output = DATA.products.find((p) => p.id === r.output);
    if (!output?.recipeOnly || !output.behindCounter) errors.push(`${r.id}: đầu ra phải là mặt hàng recipeOnly bán ở quầy`);
    if (!DATA.furniture.some((fixture) => fixture.id === r.station)) errors.push(`${r.id}: thiếu thiết bị ${r.station}`);
    const unitCost = Object.entries(r.ingredients).reduce((sum, [id, qty]) => sum + (DATA.products.find((p) => p.id === id)?.cost ?? 0) * qty, 0);
    if (output && unitCost !== output.cost) errors.push(`${r.id}: giá vốn đầu ra (${output.cost}) phải khớp nguyên liệu (${unitCost})`);
    for (const [id, qty] of Object.entries(r.ingredients)) {
      if (!DATA.products.some((p) => p.id === id)) errors.push(`${r.id}: thiếu nguyên liệu ${id}`);
      if (!Number.isInteger(qty) || qty <= 0) errors.push(`${r.id}: lượng nguyên liệu ${id} phải là số nguyên dương`);
    }
    if (r.prepSeconds <= 0 || r.shelfLifeDays <= 0) errors.push(`${r.id}: thời gian chế biến và hạn dùng phải > 0`);
    const variants = new Set<string>();
    for (const variant of r.variants ?? []) {
      if (!variant.id || !variant.name) errors.push(`${r.id}: biến thể thiếu id hoặc tên`);
      if (variants.has(variant.id)) errors.push(`${r.id}: trùng biến thể ${variant.id}`);
      variants.add(variant.id);
      if (!Number.isFinite(variant.priceDelta) || !Number.isFinite(variant.qualityDelta)) errors.push(`${r.id}: biến thể ${variant.id} có điều chỉnh không hợp lệ`);
      if (output && output.price + variant.priceDelta < output.cost) errors.push(`${r.id}: giá biến thể ${variant.id} thấp hơn giá vốn`);
      for (const [id, qty] of Object.entries(variant.extraIngredients ?? {})) {
        if (!DATA.products.some((p) => p.id === id)) errors.push(`${r.id}: biến thể ${variant.id} thiếu nguyên liệu ${id}`);
        if (!Number.isInteger(qty) || qty <= 0) errors.push(`${r.id}: biến thể ${variant.id} có lượng ${id} không hợp lệ`);
      }
    }
  }
  return errors;
}

function hasStation(state: StoreData, station: string): boolean {
  return state.fixtures.some((f) => f.type === station);
}

export function recipeIngredients(recipe: RecipeDef): Record<string, number> {
  return { ...recipe.ingredients };
}

function consumeWarehouse(state: StoreData, requirements: Record<string, number>): boolean {
  if (Object.entries(requirements).some(([id, qty]) => state.warehouse.reduce((n, lot) => n + (lot.productId === id ? lot.qty : 0), 0) < qty)) return false;
  for (const [id, required] of Object.entries(requirements)) {
    let left = required;
    const lots = state.warehouse.filter((lot) => lot.productId === id).sort((a, b) => (a.exp ?? Infinity) - (b.exp ?? Infinity));
    for (const lot of lots) {
      const used = Math.min(lot.qty, left);
      lot.qty -= used;
      left -= used;
      if (!left) break;
    }
  }
  state.warehouse = state.warehouse.filter((lot) => lot.qty > 0);
  return true;
}

/** Loại tiệm của dữ liệu `store` (tiệm đang đứng hoặc một snapshot trong chuỗi). */
function shopOfStore(state: GameState, store: StoreData) {
  if (store === state) return activeShopType(state);
  return shopTypeOf(state.stores.find((item) => item.data === store));
}

/** Nguyên liệu cần cho một phần (kể cả biến thể). `nep_chin` là nếp chín, lấy từ `cookedRice`. */
export function recipeRequirements(recipe: RecipeDef, variant?: RecipeVariant): Record<string, number> {
  const out = recipeIngredients(recipe);
  for (const [id, qty] of Object.entries(variant?.extraIngredients ?? {})) out[id] = (out[id] ?? 0) + qty;
  return out;
}

/** Nguyên liệu còn thiếu để làm một phần ở tiệm `store` (rỗng = đủ). */
export function missingIngredients(store: StoreData, recipe: RecipeDef, variant?: RecipeVariant): string[] {
  return Object.entries(recipeRequirements(recipe, variant)).filter(([id, qty]) => (id === COOKED_RICE_ID
    ? cookedPortions(store)
    : store.warehouse.reduce((n, l) => n + (l.productId === id ? l.qty : 0), 0)) < qty).map(([id]) => id);
}

/** Giá bán món chế biến theo chất lượng (0.75–1.25 × giá gợi ý, làm tròn 500đ, không dưới giá vốn). */
export function qualityPrice(outputId: string, quality: number, priceDelta = 0): number {
  const output = product(outputId);
  const factor = Math.max(0.75, Math.min(1.25, quality));
  return Math.max(output.cost, Math.round((output.price * factor + priceDelta) / 500) * 500);
}

/**
 * Trừ nguyên liệu cho một phần ở tiệm `store` mà không đưa lên quầy (mô phỏng sản xuất khi vắng chủ).
 * Trả chất lượng món, hoặc null nếu thiếu nguyên liệu.
 */
export function makeServing(store: StoreData, recipe: RecipeDef, day: number, minute: number, quality = 1): number | null {
  if (missingIngredients(store, recipe).length) return null;
  const { [COOKED_RICE_ID]: ricePortions, ...stock } = recipeRequirements(recipe);
  const q = ricePortions ? riceDishQuality(quality, takeCookedRice(store, ricePortions, day, minute)!) : quality;
  consumeWarehouse(store, stock);
  return q;
}

/**
 * Prepare one serving from real warehouse stock and place it in counter inventory.
 * `store` mặc định là tiệm đang đứng; truyền `storeView(state, id)` để chế biến ở tiệm khác
 * (level, ngày, giờ vẫn lấy từ phần chung của `state`). Món chỉ làm được ở loại tiệm có công thức đó.
 */
export function prepareRecipe(state: GameState, id: string, quality = 1, variantId?: string, store: StoreData = state): CookResult {
  const recipe = recipeById(id);
  if (!recipe || recipe.unlockLevel > state.level) return { ok: false, reason: 'locked' };
  if (!shopOfStore(state, store).allowsRecipe(id)) return { ok: false, reason: 'shop' };
  if (!hasStation(store, recipe.station)) return { ok: false, reason: 'station' };
  if (!store.activeRecipes.includes(id)) return { ok: false, reason: 'menu' };
  const variant = variantId ? recipe.variants?.find((item) => item.id === variantId) : undefined;
  if (variantId && !variant) return { ok: false, reason: 'menu' };
  const requirements = recipeRequirements(recipe, variant);
  const slots = store.counter;
  let outputSlot = slots.find((s) => s.productId === recipe.output);
  if (!outputSlot) outputSlot = slots.find((s) => s.productId === null || s.qty <= 0);
  if (!outputSlot) return { ok: false, reason: 'space' };
  if (missingIngredients(store, recipe, variant).length) return { ok: false, reason: 'ingredients' };
  const { [COOKED_RICE_ID]: ricePortions, ...stock } = requirements;
  let finalQuality = quality;
  if (ricePortions) finalQuality = riceDishQuality(quality, takeCookedRice(store, ricePortions, state.day, state.clock)!);
  consumeWarehouse(store, stock);
  const output = product(recipe.output);
  outputSlot.productId = output.id;
  outputSlot.qty++;
  outputSlot.lots = [{ qty: outputSlot.qty, exp: state.day + recipe.shelfLifeDays - 1 }];
  const qualityFactor = Math.max(0.75, Math.min(1.25, finalQuality + (variant?.qualityDelta ?? 0)));
  store.prices[output.id] = qualityPrice(output.id, qualityFactor, variant?.priceDelta ?? 0);
  const variantNote = variant ? ` (${variant.name})` : '';
  const cost = Object.entries(requirements).reduce((sum, [item, qty]) => sum + product(item).cost * qty, 0);
  store.today.journal.push({ m: state.clock, t: `Đã chế biến ${output.name}${variantNote}; nguyên liệu ${formatMoney(cost)}` });
  return { ok: true, cost, output: output.id, quality: qualityFactor };
}

export function setRecipeActive(state: GameState, id: string, active: boolean): boolean {
  const recipe = recipeById(id);
  if (!recipe || recipe.unlockLevel > state.level) return false;
  if (active && !activeShopType(state).allowsRecipe(id)) return false;
  state.activeRecipes = active
    ? [...new Set([...state.activeRecipes, id])]
    : state.activeRecipes.filter((item) => item !== id);
  return true;
}

export function expirePreparedFood(state: GameState, store: StoreData = state): number {
  let spoiled = 0;
  for (const slot of store.counter) {
    if (!slot.productId || slot.qty <= 0) continue;
    const p = DATA.products.find((item) => item.id === slot.productId);
    if (!p?.recipeOnly) continue;
    const exp = slot.lots?.[0]?.exp;
    if (exp !== null && exp !== undefined && exp < state.day) {
      spoiled += slot.qty;
      slot.qty = 0;
      slot.productId = null;
      slot.lots = [];
    }
  }
  return spoiled;
}
