import { DATA, recipeById, shopTypeById, type BranchDef, type Category, type Product, type ShopTypeDef } from './data';
import type { GameState, ShopTypeId, StoreSnapshot } from './state';

const PRODUCT_CATEGORIES: Category[] = ['dry', 'snack', 'household', 'drink', 'fresh', 'frozen', 'counter'];

/**
 * Khác biệt giữa các loại cửa hàng gom vào một chỗ, để scene và core chỉ hỏi qua giao diện này
 * thay vì rải `if (shopType === 'xoi')`.
 */
export interface ShopTypeBehavior {
  def: ShopTypeDef;
  allowsFixture(fixtureId: string): boolean;
  /** Mặt hàng được nhập/bày ở loại tiệm này. */
  allowsProduct(productId: string): boolean;
  allowsRecipe(recipeId: string): boolean;
  /** Hệ số mật độ khách theo giờ; null nghĩa là dùng `balance.density` mặc định. */
  densityAt(minute: number): number | null;
}

export function shopTypeDef(id: ShopTypeId): ShopTypeDef {
  const def = shopTypeById(id);
  if (!def) throw new Error(`Không có loại cửa hàng ${id}`);
  return def;
}

const behaviors = new Map<ShopTypeDef, ShopTypeBehavior>();

/** Loại cửa hàng của một tiệm; snapshot cũ thiếu trường được coi là tạp hóa. Được gọi rất dày (mỗi khách, mỗi lần lọc hàng) nên cache theo định nghĩa. */
export function shopTypeOf(store: Pick<StoreSnapshot, 'shopType'> | undefined): ShopTypeBehavior {
  const def = shopTypeDef(store?.shopType ?? 'grocery');
  let cached = behaviors.get(def);
  if (!cached) { cached = behavior(def); behaviors.set(def, cached); }
  return cached;
}

/** Loại cửa hàng của tiệm người chơi đang đứng. */
export function activeShopType(state: Pick<GameState, 'stores' | 'activeStoreId'>): ShopTypeBehavior {
  return shopTypeOf(state.stores.find((store) => store.id === state.activeStoreId));
}

function behavior(def: ShopTypeDef): ShopTypeBehavior {
  const fixtures = new Set(def.fixtures);
  const recipes = new Set(def.recipes);
  const outputs = new Set(def.recipes.map((id) => recipeById(id)?.output).filter(Boolean));
  const extras = new Set([...def.ingredients, ...def.addOns.map((a) => a.productId)]);
  return {
    def,
    allowsFixture: (id) => fixtures.has(id),
    allowsRecipe: (id) => recipes.has(id),
    allowsProduct: (id) => {
      if (extras.has(id) || outputs.has(id)) return true;
      const p = DATA.products.find((item) => item.id === id);
      if (!p) return false;
      // Thành phẩm chế biến chỉ thuộc về loại tiệm có công thức làm ra nó.
      if (p.recipeOnly) return false;
      return def.categories.includes(p.category);
    },
    densityAt: (minute) => {
      if (!def.densityCurve) return null;
      return def.densityCurve.find((seg) => minute >= seg.from && minute < seg.to)?.mul ?? 1;
    },
  };
}

/** Lọc danh sách mặt hàng theo loại tiệm (dùng ở màn Nhập hàng, Kệ). */
export function productsForShop(shop: ShopTypeBehavior, list: Product[]): Product[] {
  return list.filter((p) => shop.allowsProduct(p.id));
}

/** Kiểm tra shopTypes.json và tham chiếu `shopType` trong branches.json. Trả danh sách lỗi (rỗng = hợp lệ). */
export function validateShopTypes(types: ShopTypeDef[] = DATA.shopTypes, branches: BranchDef[] = DATA.branches): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const furniture = new Set(DATA.furniture.map((f) => f.id));
  const customers = new Set(DATA.customers.map((c) => c.id));
  const recipes = new Set(DATA.recipes.map((r) => r.id));
  const products = new Set(DATA.products.map((p) => p.id));
  for (const t of types) {
    const at = `shopTypes.${t.id || '?'}`;
    if (!t.id || !t.name || !t.icon) errors.push(`${at}: thiếu id, tên hoặc biểu tượng`);
    if (ids.has(t.id)) errors.push(`${at}: trùng id`);
    ids.add(t.id);
    for (const c of t.categories ?? []) if (!PRODUCT_CATEGORIES.includes(c)) errors.push(`${at}: nhóm hàng "${c}" không tồn tại`);
    for (const f of t.fixtures ?? []) if (!furniture.has(f)) errors.push(`${at}: nội thất "${f}" không có trong furniture.json`);
    if (!t.fixtures?.some((f) => DATA.furniture.find((item) => item.id === f)?.kind === 'counter')) errors.push(`${at}: cần ít nhất một quầy thu ngân`);
    for (const c of t.customers ?? []) if (!customers.has(c)) errors.push(`${at}: loại khách "${c}" không có trong customers.json`);
    if (!t.customers?.length) errors.push(`${at}: cần ít nhất một loại khách`);
    for (const r of t.recipes ?? []) {
      if (!recipes.has(r)) errors.push(`${at}: công thức "${r}" không có trong recipes.json`);
      const station = DATA.recipes.find((item) => item.id === r)?.station;
      if (station && !t.fixtures.includes(station)) errors.push(`${at}: công thức "${r}" cần trạm "${station}" chưa được phép đặt`);
    }
    for (const key of ['ingredients', 'supplies', 'sourcesFrom'] as const) {
      for (const id of t[key] ?? []) if (!products.has(id)) errors.push(`${at}: ${key} có mặt hàng "${id}" không tồn tại`);
    }
    for (const a of t.addOns ?? []) {
      if (!products.has(a.productId)) errors.push(`${at}: addOns có mặt hàng "${a.productId}" không tồn tại`);
      if (!(a.chance >= 0 && a.chance <= 1)) errors.push(`${at}: addOns ${a.productId} có xác suất ngoài 0..1`);
    }
    if (t.sim !== 'profit_average' && t.sim !== 'production') errors.push(`${at}: sim phải là profit_average hoặc production`);
    if (!(t.dineInChance >= 0 && t.dineInChance <= 1)) errors.push(`${at}: dineInChance phải trong 0..1`);
    if (t.sourcedRequestChance !== undefined && !(t.sourcedRequestChance >= 0 && t.sourcedRequestChance <= 1)) errors.push(`${at}: sourcedRequestChance phải trong 0..1`);
    if (t.densityCurve !== null) {
      if (!Array.isArray(t.densityCurve) || !t.densityCurve.length) errors.push(`${at}: densityCurve phải là null hoặc danh sách khoảng giờ`);
      else t.densityCurve.forEach((seg, i) => {
        if (!(seg.from < seg.to) || !(seg.mul > 0)) errors.push(`${at}: densityCurve[${i}] không hợp lệ`);
        if (i > 0 && seg.from < t.densityCurve![i - 1].to) errors.push(`${at}: densityCurve[${i}] chồng lên khoảng trước`);
      });
    }
  }
  if (!ids.has('grocery')) errors.push('shopTypes: thiếu loại "grocery"');
  for (const b of branches) {
    if (b.shopType && !ids.has(b.shopType)) errors.push(`branches.${b.id}: loại cửa hàng "${b.shopType}" không có trong shopTypes.json`);
    const type = types.find((t) => t.id === (b.shopType ?? 'grocery'));
    for (const f of b.defaultLayout) {
      if (!furniture.has(f.type)) errors.push(`branches.${b.id}: layout có nội thất "${f.type}" không tồn tại`);
      else if (type && !type.fixtures.includes(f.type)) errors.push(`branches.${b.id}: layout có "${f.type}" mà loại ${type.id} không cho đặt`);
    }
  }
  return errors;
}

