import productsJson from '../data/products.json';
import levelsJson from '../data/levels.json';
import customersJson from '../data/customers.json';
import balanceJson from '../data/balance.json';
import landJson from '../data/land.json';
import furnitureJson from '../data/furniture.json';
import suppliersJson from '../data/suppliers.json';
import questsJson from '../data/quests.json';
import decorJson from '../data/decor.json';
import staffJson from '../data/staff.json';
import recipesJson from '../data/recipes.json';
import branchesJson from '../data/branches.json';
import storyJson from '../data/story.json';
import titlesJson from '../data/titles.json';
import weeklyQuestsJson from '../data/weeklyQuests.json';
import partyOrdersJson from '../data/partyOrders.json';

export type Category = 'dry' | 'snack' | 'household' | 'drink' | 'fresh' | 'frozen' | 'counter' | 'food' | 'beverage';
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
  /** Số ngày dùng được kể từ ngày nhập (HSD); không có = không hết hạn. */
  shelfLifeDays?: number;
  requiresCold?: ColdKind;
  /** Bán được ở kệ thường nhưng khách thích mua lạnh hơn. */
  prefersCold?: boolean;
  /** Chỉ nhập trong sự kiện theo lịch. */
  eventOnly?: string;
  /** Thành phẩm do bếp/quầy nước chế biến, không nhập từ mối sỉ. */
  recipeOnly?: boolean;
}

export interface LevelDef {
  level: number;
  exp: number;
  categories: Category[];
  shelves: number;
  label: string;
  counterUnlock?: boolean;
  /** Hệ số lượng khách từ level này (mặc định 1). */
  traffic?: number;
  /** Số chỗ nhân viên tối đa từ level này. */
  staffSlots?: number;
  /** Hệ thống mở ở level này (land, fridge, quests, pricing, anh_ba, fresh, credit, warehouse, decor, freezer, bargain). */
  features?: string[];
}

export interface LevelTable {
  maxLevel: number;
  prestigeExpPerStar: number;
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
  /** Góc nhìn trên xuống (người chơi tự đi lại). */
  topDown: {
    /** Tốc độ đi của người chơi (ô/giây). */
    playerTilesPerSecond: number;
    /** Hệ số mất kiên nhẫn của khách ở quầy người chơi khi người chơi đang đi nạp kệ. */
    awayPatienceRate: number;
  };
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
  suggest: { buffer: number; newCheap: number; newPricey: number; cheapPrice: number; freshFactor: number; newFresh: number; perishableMaxDays: number };
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
  staff: StaffBalance;
  security: { thiefChance: number; catchWindowSeconds: number; fineMul: number; refillDetect: number; cameraDetect: number; cameraCost: number };
  delivery: {
    ringChancePerSecond: number; minItems: number; maxItems: number; answerSeconds: number; feeBase: number; feePerDistance: number;
    deadlineMin: number; deadlineMax: number; secondsPerDistance: number; onTimeStars: number; lateStars: number;
    addresses: { name: string; place: string; distance: number }[];
  };
  manager: { speeds: number[]; skipMaxTicks: number };
  offline: { maxHours: number; efficiency: number; realMinutesPerDay: number; historyDays: number };
  cart: { chance: number; minItems: number; maxItems: number; patienceMul: number; types: string[] };
  analytics: { historyDays: number; topCount: number; slowDays: number };
  restock: { suggestThresholdDays: number; suggestQtyDays: number };
  dining: { mealSeconds: number; extraOrderSeconds: number; maxExtraOrders: number };
}

export interface StaffBalance {
  candidateMin: number;
  candidateMax: number;
  refreshDays: number;
  wageBase: number;
  wagePerStat: number;
  wageStep: number;
  timeBase: number;
  timePerSpeed: number;
  tiredSpeedMul: number;
  lowMoodThreshold: number;
  lowMoodSpeedMul: number;
  errorBase: number;
  errorPerAccuracy: number;
  errorMin: number;
  friendlyStarPerPoint: number;
  friendlyTipPerPoint: number;
  tipChance: number;
  staminaBaseHours: number;
  staminaPerPoint: number;
  expPerJob: number;
  expPerLevel: number;
  levelWageMul: number;
  mood: {
    start: number; dayOff: number; overworkDays: number; overworkPenalty: number; doubleShift: number; scold: number; bonus: number;
    unpaid: number; wageWeight: number; wageCap: number; lowThreshold: number; quitThreshold: number; quitDays: number;
    retainRaise: number; retainMood: number; tiredBubbleDays: number;
  };
  bonusAmount: number;
  scoldAccuracy: number;
  severanceDays: number;
  scanSecondsPerItem: number;
  counterSeconds: number;
  changeSeconds: number;
  bargainAcceptMax: number;
  wrongChangeValues: number[];
  refillWalkSeconds: number;
  refillThreshold: number;
  refillCheckSeconds: number;
  managerExpMul: number;
  shifts: { name: string; from: number; to: number }[];
}

export type StaffRole = 'cashier' | 'refill' | 'stocker' | 'delivery' | 'chef' | 'barista' | 'branch_manager';
export type StatKey = 'speed' | 'accuracy' | 'friendly' | 'stamina';
export type StaffStats = Record<StatKey, number>;
export interface Look { shirt: string; pants: string; hair: string; skin: string }

export interface StaffData {
  roles: { id: StaffRole; name: string; icon: string; unlockFeature: string; mainStat: StatKey }[];
  personalities: { id: string; name: string; note: string; overworkMul: number; scoldMul: number; gainMul: number; accuracyMod: number; dailyMood: number }[];
  fixedCandidate: { id: string; name: string; personality: string; role: StaffRole; stats: StaffStats; wage: number; look: Look };
  names: string[];
  looks: Look[];
  statRange: { min: number; max: number };
}

export interface Rect { x: number; y: number; w: number; h: number }

export interface LandPlot {
  id: string;
  name: string;
  level: number;
  cost: number;
  queueBonus: number;
  storageOnly?: boolean;
  /** Số khách duyệt hàng cùng lúc tăng thêm. */
  shopperBonus?: number;
  /** Mở mảnh này thì tiệm thành Mini Mart (đổi mặt tiền, có xe đẩy). */
  miniMart?: boolean;
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

export type FurnitureKind = 'shelf' | 'fridge' | 'freezer' | 'storage' | 'counter' | 'decor' | 'food' | 'drink' | 'seating' | 'generator';

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
  /** Hệ số sức chứa mỗi ô (kệ đôi = 2). */
  capacityMul?: number;
  /** Số cái tối đa được đặt. */
  limit?: number;
  /** Chỉ mua được khi đã mở mảnh đất này. */
  requiresPlot?: string;
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

export interface WeeklyQuestDef {
  id: string;
  text: string;
  metric: 'soldCategory' | 'soldTotal' | 'served' | 'revenue';
  arg?: string;
  target: number;
  money: number;
  exp: number;
}

export interface PartyOrderTemplate { id: string; customer: string; items: Record<string, number>; deadlineDays: number }

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
  weeklyQuests: WeeklyQuestDef[];
  partyOrders: PartyOrderTemplate[];
  achievements: AchievementDef[];
  decor: DecorDef[];
  staff: StaffData;
  recipes: RecipeDef[];
  branches: BranchDef[];
  story: StoryChapter[];
  titles: PrestigeTitle[];
}

export interface PrestigeTitle { id: string; name: string; stars: number }

export interface StoryChapter {
  id: string;
  chapter: number;
  title: string;
  unlockLevel: number;
  portrait: string;
  dialog: string[];
  goal: string;
  rewardMoney: number;
  rewardExp: number;
  rivalDays?: number;
}

export interface BranchDef {
  id: string;
  name: string;
  kind: 'market' | 'school' | 'industrial';
  icon: string;
  unlockLevel: number;
  cost: number;
  efficiency: number;
  traffic: number;
  demand: Record<string, number>;
  description: string;
  defaultLayout: { type: string; x: number; y: number; rot?: 0 | 1; shelf?: number }[];
}

export interface RecipeDef {
  id: string;
  name: string;
  category: 'food' | 'beverage';
  output: string;
  ingredients: Record<string, number>;
  station: string;
  unlockLevel: number;
  prepSeconds: number;
  shelfLifeDays: number;
  steps: string[];
  variants?: RecipeVariant[];
}

export interface RecipeVariant {
  id: string;
  name: string;
  priceDelta: number;
  qualityDelta: number;
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
  if (!Number.isInteger(table.prestigeExpPerStar) || table.prestigeExpPerStar <= 0) errors.push('prestigeExpPerStar phải là số nguyên dương');
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
  weeklyQuests: weeklyQuestsJson as WeeklyQuestDef[],
  partyOrders: partyOrdersJson as unknown as PartyOrderTemplate[],
  achievements: questsJson.achievements as AchievementDef[],
  decor: decorJson as DecorDef[],
  staff: staffJson as StaffData,
  recipes: recipesJson as unknown as RecipeDef[],
  branches: branchesJson as unknown as BranchDef[],
  story: storyJson as unknown as StoryChapter[],
  titles: titlesJson as unknown as PrestigeTitle[],
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
