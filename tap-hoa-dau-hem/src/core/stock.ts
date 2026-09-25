import { DATA, product, type Product } from './data';
import { shelfCount, totalQty, unlockedProducts, type GameState } from './state';

export type Cart = Record<string, number>;

/** Số ô kho một món chiếm: size cho mỗi 10 đơn vị, làm tròn lên. */
export function cellsFor(productId: string, qty: number): number {
  if (qty <= 0) return 0;
  return Math.ceil(qty / 10) * product(productId).size;
}

export function warehouseCellsUsed(warehouse: Record<string, number>): number {
  return Object.entries(warehouse).reduce((sum, [id, qty]) => sum + cellsFor(id, qty), 0);
}

export function warehouseCapacity(): number {
  return DATA.balance.warehouseCells;
}

export function cartTotal(cart: Cart): number {
  return Object.entries(cart).reduce((sum, [id, qty]) => sum + product(id).cost * qty, 0);
}

/** Kho sau khi nhập giỏ hàng (không đổi state). */
export function warehouseAfter(state: GameState, cart: Cart): Record<string, number> {
  const next = { ...state.warehouse };
  for (const [id, qty] of Object.entries(cart)) if (qty > 0) next[id] = (next[id] ?? 0) + qty;
  return next;
}

export type BuyCheck =
  | { ok: true; total: number; cells: number }
  | { ok: false; reason: 'empty' | 'money' | 'space' | 'locked'; total: number; cells: number; missing: number };

export function checkCart(state: GameState, cart: Cart): BuyCheck {
  const total = cartTotal(cart);
  const cells = warehouseCellsUsed(warehouseAfter(state, cart));
  const unlocked = new Set(unlockedProducts(state.level).map((p) => p.id));
  const items = Object.entries(cart).filter(([, q]) => q > 0);
  if (items.length === 0) return { ok: false, reason: 'empty', total, cells, missing: 0 };
  if (items.some(([id]) => !unlocked.has(id))) return { ok: false, reason: 'locked', total, cells, missing: 0 };
  if (cells > warehouseCapacity()) return { ok: false, reason: 'space', total, cells, missing: 0 };
  if (total > state.money) return { ok: false, reason: 'money', total, cells, missing: total - state.money };
  return { ok: true, total, cells };
}

/** Nhập hàng: trừ tiền, cộng kho. Trả về kết quả kiểm tra. */
export function buyStock(state: GameState, cart: Cart): BuyCheck {
  const check = checkCart(state, cart);
  if (!check.ok) return check;
  state.money -= check.total;
  state.warehouse = warehouseAfter(state, cart);
  return check;
}

/** Số lượng nên có của một món: bán + thiếu hôm qua (có dự phòng); món chưa có số liệu dùng mức ước tính. */
export function suggestedTarget(state: GameState, p: Product): number {
  const cfg = DATA.balance.suggest;
  const demand = (state.yesterdaySold[p.id] ?? 0) + (state.yesterdayMissed[p.id] ?? 0);
  const base = demand > 0 ? demand : p.price <= cfg.cheapPrice ? cfg.newCheap : cfg.newPricey;
  return Math.ceil(base * cfg.buffer) + 1;
}

/**
 * Giỏ hàng gợi ý: bù mỗi món lên mức suggestedTarget. Khi thiếu tiền hoặc chỗ kho thì chia đều theo
 * tỉ lệ còn thiếu của từng món, để không món nào bị bỏ trống hoàn toàn.
 */
export function suggestCart(state: GameState): Cart {
  const items = unlockedProducts(state.level).map((p) => {
    const target = suggestedTarget(state, p);
    return { p, target, want: Math.max(0, target - totalQty(state, p.id)), blocked: false };
  });
  const cart: Cart = {};
  for (;;) {
    let best: (typeof items)[number] | null = null;
    for (const it of items) {
      if (it.blocked || it.want <= (cart[it.p.id] ?? 0)) continue;
      const missing = (it.want - (cart[it.p.id] ?? 0)) / it.target;
      if (!best || missing > (best.want - (cart[best.p.id] ?? 0)) / best.target) best = it;
    }
    if (!best) break;
    cart[best.p.id] = (cart[best.p.id] ?? 0) + 1;
    if (!checkCart(state, cart).ok) {
      cart[best.p.id]--;
      if (cart[best.p.id] === 0) delete cart[best.p.id];
      best.blocked = true;
    }
  }
  return cart;
}

function takeFromWarehouse(state: GameState, productId: string, want: number): number {
  const have = state.warehouse[productId] ?? 0;
  const got = Math.min(have, want);
  if (got <= 0) return 0;
  const left = have - got;
  if (left > 0) state.warehouse[productId] = left;
  else delete state.warehouse[productId];
  return got;
}

function slotAt(state: GameState, shelf: number, slot: number) {
  if (shelf >= shelfCount(state.level)) throw new Error('Kệ chưa mở khóa');
  return state.shelves[shelf][slot];
}

/** Trả toàn bộ hàng của ô về kho. */
export function clearSlot(state: GameState, shelf: number, slot: number): void {
  const s = slotAt(state, shelf, slot);
  if (s.productId && s.qty > 0) state.warehouse[s.productId] = (state.warehouse[s.productId] ?? 0) + s.qty;
  s.productId = null;
  s.qty = 0;
}

/** Gán ô cho một món và nạp từ kho. Ô đang chứa món khác thì trả về kho trước. */
export function assignSlot(state: GameState, shelf: number, slot: number, productId: string): number {
  const s = slotAt(state, shelf, slot);
  if (s.productId !== productId) clearSlot(state, shelf, slot);
  s.productId = productId;
  return refillSlot(state, shelf, slot);
}

/** Nạp đầy ô từ kho; trả về số đơn vị đã nạp. */
export function refillSlot(state: GameState, shelf: number, slot: number): number {
  const s = slotAt(state, shelf, slot);
  if (!s.productId) return 0;
  const got = takeFromWarehouse(state, s.productId, DATA.balance.slotCapacity - s.qty);
  s.qty += got;
  return got;
}

export function canRefill(state: GameState, shelf: number, slot: number): boolean {
  const s = state.shelves[shelf]?.[slot];
  if (!s || !s.productId || shelf >= shelfCount(state.level)) return false;
  return s.qty < DATA.balance.slotCapacity && (state.warehouse[s.productId] ?? 0) > 0;
}

/**
 * Tự bày: nạp các ô đang có hàng; mỗi món còn trong kho mà chưa có ô thì được một ô
 * (dùng ô trống, hết ô trống thì lấy lại một ô của món đang chiếm nhiều ô); ô trống còn lại
 * chia cho món bán chạy (bán + thiếu hôm qua) nhiều nhất.
 */
export function autoArrange(state: GameState): void {
  const rows = shelfCount(state.level);
  const slots: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < state.shelves[r].length; c++) slots.push({ r, c });
  const at = (p: { r: number; c: number }) => state.shelves[p.r][p.c];
  const demand = (id: string) => (state.yesterdaySold[id] ?? 0) + (state.yesterdayMissed[id] ?? 0);

  // Ô đã hết hàng mà kho cũng hết thì dọn đi để dùng cho món khác.
  for (const p of slots) {
    const s = at(p);
    if (s.productId && s.qty === 0 && (state.warehouse[s.productId] ?? 0) === 0) clearSlot(state, p.r, p.c);
  }
  for (const p of slots) refillSlot(state, p.r, p.c);

  const slotsOf = (id: string) => slots.filter((p) => at(p).productId === id);
  const inWarehouse = () =>
    Object.keys(state.warehouse)
      .filter((id) => (state.warehouse[id] ?? 0) > 0)
      .sort((a, b) => demand(b) - demand(a));

  // 1) Mỗi món có hàng đều phải có ít nhất một ô.
  for (const id of inWarehouse()) {
    if (slotsOf(id).length > 0) continue;
    let target = slots.find((p) => !at(p).productId);
    if (!target) {
      // Lấy ô ít hàng nhất của món đang chiếm nhiều ô nhất.
      const counts = new Map<string, number>();
      for (const p of slots) {
        const pid = at(p).productId;
        if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
      target = slots
        .filter((p) => (counts.get(at(p).productId!) ?? 0) >= 2)
        .sort((a, b) => (counts.get(at(b).productId!)! - counts.get(at(a).productId!)!) || at(a).qty - at(b).qty)[0];
    }
    if (!target) break;
    assignSlot(state, target.r, target.c, id);
  }

  // 2) Ô trống còn lại: ưu tiên món còn nhiều trong kho và bán chạy.
  for (const p of slots) {
    if (at(p).productId) continue;
    const next = inWarehouse().sort((a, b) => slotsOf(a).length - slotsOf(b).length || demand(b) - demand(a))[0];
    if (!next) return;
    assignSlot(state, p.r, p.c, next);
  }
}

/** Ô kệ đầu tiên đang có món này (để lấy hàng cho khách). */
export function findSlotWith(state: GameState, productId: string): { shelf: number; slot: number } | null {
  const rows = shelfCount(state.level);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < state.shelves[r].length; c++) {
      const s = state.shelves[r][c];
      if (s.productId === productId && s.qty > 0) return { shelf: r, slot: c };
    }
  }
  return null;
}
