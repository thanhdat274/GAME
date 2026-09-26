import productsJson from '../data/products.json';
import levelsJson from '../data/levels.json';
import customersJson from '../data/customers.json';
import balanceJson from '../data/balance.json';
import landJson from '../data/land.json';
import furnitureJson from '../data/furniture.json';
import suppliersJson from '../data/suppliers.json';
import questsJson from '../data/quests.json';
import decorJson from '../data/decor.json';

export type Category = 'dry' | 'snack' | 'household' | 'drink' | 'fresh' | 'frozen' | 'counter';
export type ColdKind = 'fridge' | 'freezer';

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
  /** Hàng chỉ bán khi khách gọi ở quầy, không bày trên kệ. */
  behindCounter?: boolean;
  /** Giá gợi ý; mặc định bằng `price`. */
  refPrice?: number;
  /** Số ngày dùng được kể từ ngày nhập; không có = hàng khô. */
  shelfLifeDays?: number;
  requiresCold?: ColdKind;
  /** Bán được ở kệ thường nhưng khách thích mua lạnh hơn. */
  prefersCold?: boolean;
}

export interface LevelDef {
  level: number;
  exp: number;
  categories: Category[];
  shelves: number;
  label: string;
  counterUnlock?: boolean;
  /** Hệ thống mở ở level này (land, fridge, quests, pricing, anh_ba, fresh, credit, warehouse, decor, freezer, bargain). */
  features?: string[];
}

export interface LevelTable {
  maxLevel: number;
  nextTeaser: string;
  levels: LevelDef[];
}

export interface CustomerType {
  id: string;
  name: string;
  prefs: Partial<Record<Category, number>>;
  patience: number;
  maxItems: number;
  tipMul: number;
  counterRequestChance: number;
  /** Hệ số k: xác suất vẫn lấy món = 1 - k·(giá/giá gợi ý - 1). */
  priceSensitivity?: number;
  bargainChance?: number;
  creditChance?: number;
  unlockLevel?: number;
  neighbors?: { name: string; shirt: string; pants: string; hair: string; skin: string }[];
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
  maxShoppers: number;
  baseSpawnSeconds: number;
  queuePatienceRate: number;
  zoneWalkSeconds: number;
  pickSeconds: number;
  shopBudgetFactor: number;
  zoneLowThreshold: number;
  zoneCriticalThreshold: number;
  zoneRefillSecondsPerSlot: number;
  scanComboSeconds: number;
  scanTipBonus: number;
  counterSlots: number;
  counterCapacity: number;
  counterRequestSeconds: number;
  counterWrongPenalty: number;
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
  suggest: { buffer: number; newCheap: number; newPricey: number; cheapPrice: number; freshFactor: number; newFresh: number };
  /** Xác suất khách mua 1, 2, 3 món khác nhau. */
  orderLineWeights: number[];
  /** Số lượng tối đa mỗi món theo giá (món đắt hơn mọi mốc thì 1). */
  qtyByPrice: { maxPrice: number; maxQty: number }[];
  grandmaGift: number;
  grandmaCooldownDays: number;
  denominations: number[];
  drawer: number[];
  density: { from: number; to: number; mul: number }[];
  walkSecondsPerTile: number;
  warehouseTiers: { name: string; cells: number; cost: number; unlockLevel: number }[];
  notColdBuyChance: number;
  pricing: { min: number; max: number; step: number; cheapSpawnMax: number; minKeep: number };
  clearance: { options: number[]; pickWeightMul: number };
  supplier: { volatility: number; bulkQty: number; bulkDiscount: number };
  debt: { limitRatio: number; dueDays: number; badAfterDays: number; onTime: number; late: number; reminderRepay: number; reminderDays: number; wrongReminderStars: number; refuseStars: number };
  bargain: { unlockLevel: number; minPct: number; maxPct: number; declineLeave: number; declineMaxStars: number };
  attraction: { max: number; divisor: number };
  cat: { waitSeconds: number; chance: number; bonusSeconds: number };
  quests: { perDay: number; rerollsPerDay: number; unlockLevel: number };
  loveStreakRating: number;
  sellBackRatio: number;
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface LandPlot {
  id: string;
  name: string;
  level: number;
  cost: number;
  queueBonus: number;
  storageOnly?: boolean;
  rects: Rect[];
}

export interface LandTable {
  cols: number;
  rows: number;
  door: { x: number; y: number };
  initial: Rect[];
  plots: LandPlot[];
  defaultLayout: { type: string; x: number; y: number; rot: number; shelf?: number }[];
}

export type FurnitureKind = 'shelf' | 'fridge' | 'freezer' | 'storage' | 'counter' | 'decor';

export interface FurnitureDef {
  id: string;
  name: string;
  icon: string;
  kind: FurnitureKind;
  w: number;
  h: number;
  slots: number;
  cost: number;
  unlockLevel: number;
  /** Tiền điện mỗi ngày. */
  power: number;
  storageCells?: number;
  fixed?: boolean;
}

export interface SupplierDef {
  id: string;
  name: string;
  icon: string;
  unlockLevel: number;
  discount: number;
  delayDays: number;
  deliverMinute: number;
  minOrder: number;
  note: string;
}

export type QuestMetric =
  | 'soldCategory' | 'soldProduct' | 'soldTotal' | 'served' | 'happy' | 'revenue'
  | 'itemsScanned' | 'counterServed' | 'leftAtMost' | 'noSpoil' | 'debtCollected';

export interface QuestDef {
  id: string;
  text: string;
  metric: QuestMetric;
  arg?: string;
  target: number;
  minLevel: number;
  money: number;
  exp: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  metric: 'sold' | 'served' | 'landsOpened' | 'debtsCollected' | 'loveStreak';
  target: number;
  money?: number;
  decor?: string;
}

export interface DecorDef {
  id: string;
  name: string;
  icon: string;
  slot: 'sign' | 'wall' | 'floor' | 'counter';
  cost: number;
  attraction: number;
  unlockLevel: number;
  exclusive?: boolean;
  cat?: boolean;
}

export interface GameData {
  products: Product[];
  levels: LevelTable;
  customers: CustomerType[];
  balance: Balance;
  land: LandTable;
  furniture: FurnitureDef[];
  suppliers: SupplierDef[];
  quests: QuestDef[];
  achievements: AchievementDef[];
  decor: DecorDef[];
}

const CATEGORIES: Category[] = ['dry', 'snack', 'household', 'drink', 'fresh', 'frozen', 'counter'];

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
    if (p.category === 'counter' && p.behindCounter !== true) errors.push(`${id}: hàng sau quầy phải bật behindCounter`);
    if (p.behindCounter === true && p.category !== 'counter') errors.push(`${id}: hàng sau quầy phải thuộc nhóm counter`);
    if (p.behindCounter === true && typeof p.price === 'number' && typeof p.cost === 'number' && p.price < p.cost) errors.push(`${id}: giá bán hàng sau quầy phải >= giá nhập`);
    if (p.shelfLifeDays !== undefined && !(typeof p.shelfLifeDays === 'number' && p.shelfLifeDays > 0)) errors.push(`${id}: shelfLifeDays phải > 0`);
    if (p.requiresCold !== undefined && p.requiresCold !== 'fridge' && p.requiresCold !== 'freezer') errors.push(`${id}: requiresCold phải là "fridge" hoặc "freezer"`);
    if (p.refPrice !== undefined && !(typeof p.refPrice === 'number' && p.refPrice > 0)) errors.push(`${id}: refPrice phải > 0`);
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
  land: landJson as LandTable,
  furniture: furnitureJson as FurnitureDef[],
  suppliers: suppliersJson as SupplierDef[],
  quests: questsJson.quests as QuestDef[],
  achievements: questsJson.achievements as AchievementDef[],
  decor: decorJson as DecorDef[],
};

const productIndex = new Map(DATA.products.map((p) => [p.id, p]));

export function product(id: string): Product {
  const p = productIndex.get(id);
  if (!p) throw new Error(`Không có mặt hàng ${id}`);
  return p;
}

const furnitureIndex = new Map(DATA.furniture.map((f) => [f.id, f]));
const decorIndex = new Map(DATA.decor.map((d) => [d.id, d]));

/** Nội thất theo id; đồ trang trí đặt sàn được coi là nội thất 1x1. */
export function furniture(id: string): FurnitureDef {
  const f = furnitureIndex.get(id);
  if (f) return f;
  const d = decorIndex.get(id);
  if (d?.slot === 'floor') return { id: d.id, name: d.name, icon: d.icon, kind: 'decor', w: 1, h: 1, slots: 0, cost: d.cost, unlockLevel: d.unlockLevel, power: 0 };
  throw new Error(`Không có nội thất ${id}`);
}

export function decor(id: string): DecorDef {
  const d = decorIndex.get(id);
  if (!d) throw new Error(`Không có đồ trang trí ${id}`);
  return d;
}

export function supplier(id: string): SupplierDef {
  const s = DATA.suppliers.find((item) => item.id === id);
  if (!s) throw new Error(`Không có mối sỉ ${id}`);
  return s;
}

/** Hệ thống `feature` đã mở ở level này chưa. */
export function hasFeature(level: number, feature: string): boolean {
  return DATA.levels.levels.some((l) => l.level <= level && l.features?.includes(feature));
}

export function featureLevel(feature: string): number {
  return DATA.levels.levels.find((l) => l.features?.includes(feature))?.level ?? Number.POSITIVE_INFINITY;
}

export function refPrice(p: Product): number {
  return p.refPrice ?? p.price;
}
