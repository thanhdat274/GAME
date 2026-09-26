import { avgSold } from './analytics';
import { DATA, hasFeature, product, supplier } from './data';
import { counterQty, formatMoney, shelfQty, usableShelves, warehouseQty, type GameState, type RestockRule } from './state';
import { assignSlot, buyStock, checkCart, placeError, refillSlot, shelfCapacity, supplierUnlocked, type Cart } from './stock';

export function autoRestockUnlocked(state: GameState): boolean {
  return hasFeature(state.level, 'autorestock');
}

/** Tồn hiện có của một món: kho + kệ + quầy + hàng đang chờ giao. */
export function stockLevel(state: GameState, productId: string): number {
  const pending = state.deliveries.reduce((sum, d) => sum + (d.items[productId] ?? 0), 0);
  return warehouseQty(state, productId) + shelfQty(state, productId) + counterQty(state, productId) + pending;
}

export type RuleError = 'locked' | 'product' | 'supplier' | 'qty';

export function addRule(state: GameState, rule: RestockRule): RuleError | null {
  if (!autoRestockUnlocked(state)) return 'locked';
  try {
    product(rule.productId);
    supplier(rule.supplierId);
  } catch {
    return 'product';
  }
  if (!supplierUnlocked(state, rule.supplierId)) return 'supplier';
  if (rule.qty <= 0 || rule.threshold < 0) return 'qty';
  const existing = state.rules.findIndex((r) => r.productId === rule.productId);
  if (existing >= 0) state.rules[existing] = { ...rule };
  else state.rules.push({ ...rule });
  return null;
}

export function removeRule(state: GameState, productId: string): void {
  state.rules = state.rules.filter((r) => r.productId !== productId);
}

/** Đổi thứ tự ưu tiên của quy tắc (lên/xuống một bậc). */
export function moveRule(state: GameState, productId: string, delta: -1 | 1): void {
  const i = state.rules.findIndex((r) => r.productId === productId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.rules.length) return;
  [state.rules[i], state.rules[j]] = [state.rules[j], state.rules[i]];
}

/** Gợi ý quy tắc theo trung bình bán 7 ngày: "dưới [TB] thì nhập [2·TB]". */
export function suggestRule(state: GameState, productId: string): { threshold: number; qty: number; avg: number } {
  const cfg = DATA.balance.restock;
  const avg = avgSold(state, productId, 7);
  const base = avg > 0 ? avg : Math.max(1, state.yesterdaySold[productId] ?? 5);
  return { threshold: Math.max(1, Math.ceil(base * cfg.suggestThresholdDays)), qty: Math.max(5, Math.ceil((base * cfg.suggestQtyDays) / 5) * 5), avg };
}

export interface RestockReport {
  bought: { productId: string; qty: number; supplierId: string }[];
  /** Món không nhập được vì thiếu tiền. */
  short: string[];
  /** Món không nhập vì kho đầy. */
  noSpace: string[];
  /** Mối sỉ không đạt đơn tối thiểu. */
  belowMin: string[];
  messages: string[];
}

/**
 * Chạy quy tắc mỗi buổi sáng theo thứ tự ưu tiên. Mối giao ngay nhập từng món; mối có đơn tối thiểu
 * gom thành một đơn. Thiếu tiền thì dừng món đó và báo "Thiếu tiền nhập: ...".
 */
export function runRestockRules(state: GameState): RestockReport {
  const report: RestockReport = { bought: [], short: [], noSpace: [], belowMin: [], messages: [] };
  if (!autoRestockUnlocked(state) || !state.rules.length) return report;
  const grouped = new Map<string, Cart>();
  let reserved = 0;
  for (const rule of state.rules) {
    if (!supplierUnlocked(state, rule.supplierId)) continue;
    if (stockLevel(state, rule.productId) >= rule.threshold) continue;
    const s = supplier(rule.supplierId);
    if (s.minOrder > 0) {
      const cart = grouped.get(s.id) ?? {};
      const next = { ...cart, [rule.productId]: (cart[rule.productId] ?? 0) + rule.qty };
      const cost = checkCart(state, next, s.id).total - checkCart(state, cart, s.id).total;
      if (state.money - reserved < cost) {
        report.short.push(rule.productId);
        continue;
      }
      reserved += cost;
      grouped.set(s.id, next);
      continue;
    }
    const cart = { [rule.productId]: rule.qty };
    const check = checkCart(state, cart, s.id);
    // Tiền đã giữ cho đơn gom (quy tắc ưu tiên cao hơn) không được dùng cho món sau.
    if (check.ok && state.money - reserved < check.total) report.short.push(rule.productId);
    else if (check.ok && buyStock(state, cart, s.id).ok) report.bought.push({ productId: rule.productId, qty: rule.qty, supplierId: s.id });
    else if (!check.ok && check.reason === 'space') report.noSpace.push(rule.productId);
    else if (!check.ok && check.reason === 'money') report.short.push(rule.productId);
  }
  for (const [supplierId, cart] of grouped) {
    const result = buyStock(state, cart, supplierId);
    if (result.ok) for (const [productId, qty] of Object.entries(cart)) report.bought.push({ productId, qty, supplierId });
    else if (result.reason === 'min-order') report.belowMin.push(supplierId);
    else for (const id of Object.keys(cart)) report.short.push(id);
  }
  for (const b of report.bought) report.messages.push(`Tự nhập: ${b.qty} ${product(b.productId).name.toLowerCase()}${b.supplierId === 'co_tu' ? '' : ` (${supplier(b.supplierId).name}, giao sau)`}`);
  if (report.short.length) report.messages.push(`Thiếu tiền nhập: ${report.short.map((id) => product(id).name.toLowerCase()).join(', ')}`);
  if (report.noSpace.length) report.messages.push(`Kho đầy, chưa nhập: ${report.noSpace.map((id) => product(id).name.toLowerCase()).join(', ')}`);
  for (const id of report.belowMin) report.messages.push(`Đơn ${supplier(id).name} chưa đủ tối thiểu ${formatMoney(supplier(id).minOrder)}`);
  return report;
}

// ---------- Sơ đồ kệ ----------

/** Chốt sơ đồ kệ từ cách bày hiện tại. */
export function lockPlanogram(state: GameState): void {
  state.planogram = state.shelves.map((row) => row.map((s) => s.productId));
}

export function planogramProduct(state: GameState, shelf: number, slot: number): string | null {
  return state.planogram?.[shelf]?.[slot] ?? null;
}

/** Bày kệ theo sơ đồ: gán món vào ô trống theo sơ đồ rồi nạp đầy. Trả về số đơn vị đã bày. */
export function applyPlanogram(state: GameState): number {
  let placed = 0;
  for (const r of usableShelves(state)) {
    state.shelves[r].forEach((s, c) => {
      const want = planogramProduct(state, r, c);
      if (want && s.productId !== want && s.qty === 0 && !placeError(state, r, want) && warehouseQty(state, want) > 0) {
        try {
          placed += assignSlot(state, r, c, want);
        } catch {
          /* ô không hợp: bỏ qua */
        }
        return;
      }
      if (s.productId && s.qty < shelfCapacity(state, r)) placed += refillSlot(state, r, c);
    });
  }
  return placed;
}
