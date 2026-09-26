import { DATA, product, type RecipeDef } from './data';
import { formatMoney, type GameState } from './state';

export type CookResult = { ok: true; cost: number; output: string } | { ok: false; reason: 'locked' | 'station' | 'ingredients' | 'space' | 'menu' };

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
    }
  }
  return errors;
}

function hasStation(state: GameState, station: string): boolean {
  return state.fixtures.some((f) => f.type === station);
}

export function recipeIngredients(recipe: RecipeDef): Record<string, number> {
  return { ...recipe.ingredients };
}

function consumeWarehouse(state: GameState, requirements: Record<string, number>): boolean {
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

/** Prepare one serving from real warehouse stock and place it in counter inventory. */
export function prepareRecipe(state: GameState, id: string, quality = 1, variantId?: string): CookResult {
  const recipe = DATA.recipes.find((r) => r.id === id);
  if (!recipe || recipe.unlockLevel > state.level) return { ok: false, reason: 'locked' };
  if (!hasStation(state, recipe.station)) return { ok: false, reason: 'station' };
  if (!state.activeRecipes.includes(id)) return { ok: false, reason: 'menu' };
  const variant = variantId ? recipe.variants?.find((item) => item.id === variantId) : undefined;
  if (variantId && !variant) return { ok: false, reason: 'menu' };
  const requirements = recipeIngredients(recipe);
  const slots = state.counter;
  let outputSlot = slots.find((s) => s.productId === recipe.output);
  if (!outputSlot) outputSlot = slots.find((s) => s.productId === null || s.qty <= 0);
  if (!outputSlot) return { ok: false, reason: 'space' };
  if (Object.entries(requirements).some(([item, qty]) => state.warehouse.reduce((n, l) => n + (l.productId === item ? l.qty : 0), 0) < qty)) return { ok: false, reason: 'ingredients' };
  consumeWarehouse(state, requirements);
  const output = product(recipe.output);
  outputSlot.productId = output.id;
  outputSlot.qty++;
  outputSlot.lots = [{ qty: outputSlot.qty, exp: state.day + recipe.shelfLifeDays - 1 }];
  const qualityFactor = Math.max(0.75, Math.min(1.25, quality + (variant?.qualityDelta ?? 0)));
  state.prices[output.id] = Math.max(output.cost, Math.round((output.price * qualityFactor + (variant?.priceDelta ?? 0)) / 500) * 500);
  const variantNote = variant ? ` (${variant.name})` : '';
  state.today.journal.push({ m: state.clock, t: `Đã chế biến ${output.name}${variantNote}; nguyên liệu ${formatMoney(Object.entries(requirements).reduce((sum, [item, qty]) => sum + product(item).cost * qty, 0))}` });
  return { ok: true, cost: Object.entries(requirements).reduce((sum, [item, qty]) => sum + product(item).cost * qty, 0), output: output.id };
}

export function setRecipeActive(state: GameState, id: string, active: boolean): boolean {
  const recipe = DATA.recipes.find((r) => r.id === id);
  if (!recipe || recipe.unlockLevel > state.level) return false;
  state.activeRecipes = active
    ? [...new Set([...state.activeRecipes, id])]
    : state.activeRecipes.filter((item) => item !== id);
  return true;
}

export function expirePreparedFood(state: GameState): number {
  let spoiled = 0;
  for (const slot of state.counter) {
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
