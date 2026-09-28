import { DATA, furniture, product, refPrice, type FurnitureKind } from './data';
import { cellsFor, warehouseCapacity } from './stock';
import { slotLots, type Fixture, type GameState, type Lot, type ShelfZone, type Slot } from './state';

/**
 * Phần dữ liệu của một tiệm mà Sơ đồ tiệm cần đọc. Tiệm đang đứng dùng thẳng `GameState`;
 * tiệm khác trong chuỗi đọc từ snapshot `stores[].data` (chỉ đọc, không sửa).
 */
export interface StoreView {
  id: string;
  name: string;
  active: boolean;
  fixtures: Fixture[];
  shelves: Slot[][];
  zones: ShelfZone[];
  counter: Slot[];
  warehouse: Lot[];
  holding: Lot[];
  prices: Record<string, number>;
  activeRecipes: string[];
  warehouseTier: number;
  /** Mảnh đất đã mở của tiệm. */
  land: string[];
}

/** Một dòng hàng hiển thị trong chi tiết kệ / kho. */
export interface ItemLine {
  productId: string;
  name: string;
  qty: number;
  /** Giá khách trả hiện tại (đã trừ bán xả nếu có). */
  price: number;
  /** Giá gợi ý của món. */
  refPrice: number;
  /** Phần trăm giảm khi bán xả. */
  clearance?: number;
  /** Hạn sớm nhất (null: không hạn). */
  exp: number | null;
  /** Số ô kệ đang giữ món này (chỉ dùng cho kệ). */
  slots?: number;
}

export interface FixtureInfo {
  uid: number;
  type: string;
  kind: FurnitureKind;
  name: string;
  icon: string;
  /** Chỉ số kệ trong `shelves` (nếu nội thất có ô bày hàng). */
  shelf?: number;
  zone: ShelfZone;
  lines: ItemLine[];
  /** Ô đã gán món nhưng hết hàng. */
  outSlots: number;
  /** Ô chưa gán món. */
  emptySlots: number;
  totalSlots: number;
  /** Ghi chú cho nội thất không bày hàng (quầy, ghế, máy phát…). */
  note?: string;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Dữ liệu tiệm theo id; null nếu chuỗi không có tiệm đó. */
export function storeView(state: GameState, storeId: string = state.activeStoreId): StoreView | null {
  const store = state.stores.find((s) => s.id === storeId);
  if (storeId === state.activeStoreId) {
    return {
      id: storeId, name: store?.name ?? 'Tiệm chính', active: true,
      fixtures: state.fixtures, shelves: state.shelves, zones: state.zones, counter: state.counter,
      warehouse: state.warehouse, holding: state.holding, prices: state.prices, activeRecipes: state.activeRecipes,
      warehouseTier: state.warehouseTier, land: state.land,
    };
  }
  if (!store) return null;
  const d = store.data;
  return {
    id: store.id, name: store.name, active: false,
    fixtures: arr<Fixture>(d.fixtures), shelves: arr<Slot[]>(d.shelves), zones: arr<ShelfZone>(d.zones), counter: arr<Slot>(d.counter),
    warehouse: arr<Lot>(d.warehouse), holding: arr<Lot>(d.holding),
    prices: (d.prices && typeof d.prices === 'object' ? d.prices : {}) as Record<string, number>,
    activeRecipes: arr<string>(d.activeRecipes),
    warehouseTier: typeof d.warehouseTier === 'number' ? d.warehouseTier : 0,
    land: arr<string>(d.land),
  };
}

/** Giá bán hiện tại của món trong tiệm (người chơi đặt hoặc giá gợi ý). */
export function priceIn(view: Pick<StoreView, 'prices'>, productId: string): number {
  return view.prices[productId] ?? refPrice(product(productId));
}

function known(productId: string | null): productId is string {
  return !!productId && DATA.products.some((p) => p.id === productId);
}

/** Gộp các ô cùng món thành một dòng; giữ thứ tự xuất hiện trên kệ. */
function slotLines(view: StoreView, slots: Slot[]): ItemLine[] {
  const byId = new Map<string, ItemLine>();
  for (const slot of slots) {
    if (!known(slot.productId)) continue;
    const id = slot.productId;
    let line = byId.get(id);
    if (!line) {
      const ref = refPrice(product(id));
      line = { productId: id, name: product(id).name, qty: 0, price: priceIn(view, id), refPrice: ref, exp: null, slots: 0 };
      byId.set(id, line);
    }
    line.slots = (line.slots ?? 0) + 1;
    line.qty += Math.max(0, slot.qty);
    if (slot.clearance && slot.qty > 0) {
      line.clearance = Math.max(line.clearance ?? 0, slot.clearance);
      line.price = Math.round(priceIn(view, id) * (1 - line.clearance / 100));
    }
    const exp = slot.qty > 0 ? slotLots(structuredClone(slot))[0]?.exp ?? null : null;
    if (exp !== null && (line.exp === null || exp < line.exp)) line.exp = exp;
  }
  return [...byId.values()];
}

/** Tổng hợp kho theo món (FEFO: hạn sớm nhất), sắp theo tên. */
export function warehouseLines(view: Pick<StoreView, 'warehouse' | 'prices'>, lots: Lot[] = view.warehouse): ItemLine[] {
  const byId = new Map<string, ItemLine>();
  for (const lot of lots) {
    if (lot.qty <= 0 || !known(lot.productId)) continue;
    let line = byId.get(lot.productId);
    if (!line) {
      const p = product(lot.productId);
      line = { productId: p.id, name: p.name, qty: 0, price: priceIn(view, p.id), refPrice: refPrice(p), exp: null };
      byId.set(p.id, line);
    }
    line.qty += lot.qty;
    if (lot.exp !== null && (line.exp === null || lot.exp < line.exp)) line.exp = lot.exp;
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Ô kho đã dùng / sức chứa của tiệm. */
export function warehouseUsage(view: StoreView): { used: number; capacity: number } {
  const totals: Record<string, number> = {};
  for (const lot of view.warehouse) if (known(lot.productId)) totals[lot.productId] = (totals[lot.productId] ?? 0) + lot.qty;
  const used = Object.entries(totals).reduce((sum, [id, qty]) => sum + cellsFor(id, qty), 0);
  const capacity = warehouseCapacity({ warehouseTier: view.warehouseTier, fixtures: view.fixtures } as GameState);
  return { used, capacity };
}

/** Chi tiết một nội thất: đang bày / bán món gì, bao nhiêu, giá bao nhiêu. */
export function fixtureInfo(view: StoreView, f: Fixture): FixtureInfo {
  const def = furniture(f.type);
  const base: FixtureInfo = {
    uid: f.uid, type: f.type, kind: def.kind, name: def.name, icon: def.icon, zone: null,
    lines: [], outSlots: 0, emptySlots: 0, totalSlots: 0,
  };
  if (f.shelf !== undefined) {
    const slots = view.shelves[f.shelf] ?? [];
    base.shelf = f.shelf;
    base.zone = view.zones[f.shelf] ?? null;
    base.lines = slotLines(view, slots);
    base.totalSlots = slots.length;
    base.emptySlots = slots.filter((s) => !s.productId).length;
    base.outSlots = slots.filter((s) => s.productId && s.qty <= 0).length;
    return base;
  }
  switch (def.kind) {
    case 'counter':
      base.lines = slotLines(view, view.counter);
      base.totalSlots = view.counter.length;
      base.emptySlots = view.counter.filter((s) => !s.productId).length;
      base.outSlots = view.counter.filter((s) => s.productId && s.qty <= 0).length;
      base.note = 'Hàng sau quầy và món bếp làm xong: khách hỏi mới lấy.';
      return base;
    case 'food':
    case 'drink': {
      // Trạm có công thức riêng thì liệt kê món của trạm; quầy phục vụ (vd. Quầy nước) liệt kê mọi món cùng nhóm.
      const own = DATA.recipes.filter((r) => r.station === f.type);
      const category = def.kind === 'food' ? 'food' : 'beverage';
      const recipes = own.length ? own : DATA.recipes.filter((r) => r.category === category);
      base.lines = recipes.filter((r) => view.activeRecipes.includes(r.id) && known(r.output)).map((r) => {
        const out = product(r.output);
        const ready = view.counter.filter((s) => s.productId === out.id).reduce((n, s) => n + Math.max(0, s.qty), 0);
        return { productId: out.id, name: out.name, qty: ready, price: priceIn(view, out.id), refPrice: refPrice(out), exp: null };
      });
      base.note = recipes.length
        ? base.lines.length ? 'Món đang bán (số lượng = đã làm sẵn ở quầy).' : 'Chưa bật món nào của trạm này trong Bếp & quầy nước.'
        : 'Chưa có món nào cho trạm này.';
      return base;
    }
    case 'storage':
      base.note = `Kệ kho: thêm ${def.storageCells ?? 0} ô chứa cho kho của tiệm.`;
      return base;
    case 'seating':
      base.note = 'Bàn ghế cho khách ăn tại chỗ.';
      return base;
    case 'generator':
      base.note = 'Máy phát điện: giữ tủ lạnh/tủ đông chạy khi cúp điện.';
      return base;
    default:
      base.note = 'Đồ trang trí.';
      return base;
  }
}

/** Nội thất có hàng để xem (kệ, tủ, quầy, trạm chế biến). */
export function sellsGoods(kind: FurnitureKind): boolean {
  return kind === 'shelf' || kind === 'fridge' || kind === 'freezer' || kind === 'counter' || kind === 'food' || kind === 'drink';
}

/** Mức đầy của nội thất bày hàng (0..1) để tô màu trên sơ đồ; null nếu không áp dụng. */
export function fixtureStockLevel(info: FixtureInfo): 'ok' | 'low' | 'empty' | null {
  if (!info.totalSlots) return null;
  const assigned = info.totalSlots - info.emptySlots;
  if (!assigned) return 'empty';
  if (info.outSlots >= assigned) return 'empty';
  return info.outSlots > 0 ? 'low' : 'ok';
}
