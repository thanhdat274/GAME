import productsJson from '../data/products.json';
import levelsJson from '../data/levels.json';
import customersJson from '../data/customers.json';
import balanceJson from '../data/balance.json';

export type Category = 'dry' | 'snack' | 'household';

export interface Product {
  id: string;
  name: string;
  category: Category;
  icon: string;
  color: string;
  cost: number;
  price: number;
  /** Số ô kho cho mỗi 10 đơn vị. */
  size: number;
  unlockLevel: number;
}

export interface LevelDef {
  level: number;
  exp: number;
  categories: Category[];
  shelves: number;
  label: string;
}

export interface LevelTable {
  maxLevel: number;
  nextTeaser: string;
  levels: LevelDef[];
}

export interface CustomerType {
  id: string;
  name: string;
  prefs: Record<Category, number>;
  patience: number;
  maxItems: number;
  tipMul: number;
  weight: number;
  shirt: string;
  pants: string;
  hair: string;
  skin: string;
}

export interface Balance {
  startMoney: number;
  warehouseCells: number;
  slotsPerShelf: number;
  slotCapacity: number;
  daySeconds: number;
  openMinute: number;
  closeMinute: number;
  tickMs: number;
  maxQueue: number;
  baseSpawnSeconds: number;
  queuePatienceRate: number;
  wrongPickPenalty: number;
  refillSeconds: number;
  fastChangeSeconds: number;
  tipMin: number;
  tipMax: number;
  expPerItem: number;
  expPerHappy: number;
  ratingWindow: number;
  /** Hệ số lượng khách những ngày đầu (tiệm mới mở): [ngày 1, ngày 2, ...]. */
  newShopRamp: number[];
  /** Gợi ý nhập hàng: hệ số dự phòng và ước tính cho món chưa có số liệu. */
  suggest: { buffer: number; newCheap: number; newPricey: number; cheapPrice: number };
  /** Xác suất khách mua 1, 2, 3 món khác nhau. */
  orderLineWeights: number[];
  /** Số lượng tối đa mỗi món theo giá (món đắt hơn mọi mốc thì 1). */
  qtyByPrice: { maxPrice: number; maxQty: number }[];
  grandmaGift: number;
  grandmaCooldownDays: number;
  denominations: number[];
  drawer: number[];
  density: { from: number; to: number; mul: number }[];
}

export interface GameData {
  products: Product[];
  levels: LevelTable;
  customers: CustomerType[];
  balance: Balance;
}

const CATEGORIES: Category[] = ['dry', 'snack', 'household'];

/** Kiểm tra dữ liệu mặt hàng; trả về danh sách lỗi (rỗng = hợp lệ). */
export function validateProducts(list: unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  list.forEach((raw, i) => {
    const p = raw as Partial<Product>;
    const id = typeof p.id === 'string' && p.id ? p.id : `#${i}`;
    const need: (keyof Product)[] = ['id', 'name', 'category', 'icon', 'color', 'cost', 'price', 'size', 'unlockLevel'];
    for (const key of need) {
      if (p[key] === undefined || p[key] === null || p[key] === '') errors.push(`${id}: thiếu trường "${key}"`);
    }
    if (p.category && !CATEGORIES.includes(p.category)) errors.push(`${id}: nhóm "${p.category}" không hợp lệ`);
    if (typeof p.cost === 'number' && typeof p.price === 'number' && p.price < p.cost) {
      errors.push(`${id}: giá bán (${p.price}) nhỏ hơn giá nhập (${p.cost})`);
    }
    if (typeof p.cost === 'number' && p.cost <= 0) errors.push(`${id}: giá nhập phải > 0`);
    if (typeof p.size === 'number' && p.size <= 0) errors.push(`${id}: size phải > 0`);
    if (seen.has(id)) errors.push(`${id}: trùng id`);
    seen.add(id);
  });
  return errors;
}

export function validateLevels(table: LevelTable): string[] {
  const errors: string[] = [];
  let prev = -1;
  table.levels.forEach((l, i) => {
    if (l.level !== i + 1) errors.push(`level ${l.level}: phải liên tiếp từ 1`);
    if (l.exp <= prev) errors.push(`level ${l.level}: mốc EXP phải tăng dần`);
    prev = l.exp;
  });
  if (table.levels.length !== table.maxLevel) errors.push('maxLevel không khớp số level');
  return errors;
}

export const DATA: GameData = {
  products: productsJson as Product[],
  levels: levelsJson as LevelTable,
  customers: customersJson as CustomerType[],
  balance: balanceJson as Balance,
};

const productIndex = new Map(DATA.products.map((p) => [p.id, p]));

export function product(id: string): Product {
  const p = productIndex.get(id);
  if (!p) throw new Error(`Không có mặt hàng ${id}`);
  return p;
}
