import { DATA, product } from './data';
import { shelfCount, unlockedProducts, type GameState } from './state';

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

/** Tự bày: nạp các ô đang có hàng, rồi lấp ô trống bằng món còn trong kho (món bán chạy hôm qua trước). */
export function autoArrange(state: GameState): void {
  const rows = shelfCount(state.level);
  for (let r = 0; r < rows; r++) for (let c = 0; c < state.shelves[r].length; c++) refillSlot(state, r, c);
  const onShelf = new Set<string>();
  for (let r = 0; r < rows; r++) for (const s of state.shelves[r]) if (s.productId && s.qty > 0) onShelf.add(s.productId);
  const candidates = Object.keys(state.warehouse)
    .filter((id) => (state.warehouse[id] ?? 0) > 0)
    .sort((a, b) => {
      const aNew = onShelf.has(a) ? 1 : 0;
      const bNew = onShelf.has(b) ? 1 : 0;
      if (aNew !== bNew) return aNew - bNew;
      return (state.yesterdaySold[b] ?? 0) - (state.yesterdaySold[a] ?? 0);
    });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < state.shelves[r].length; c++) {
      const s = state.shelves[r][c];
      if (s.productId && s.qty > 0) continue;
      const next = candidates.find((id) => (state.warehouse[id] ?? 0) > 0);
      if (!next) return;
      assignSlot(state, r, c, next);
      // Đẩy món vừa bày xuống cuối để các món khác cũng có chỗ.
      candidates.splice(candidates.indexOf(next), 1);
      if ((state.warehouse[next] ?? 0) > 0) candidates.push(next);
    }
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
