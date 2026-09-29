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
import shopTypesJson from '../data/shopTypes.json';

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
  /** Chỉ các loại tiệm liệt kê mặt hàng này trong `ingredients` mới nhập/bán; tạp hóa và tiệm khác không thấy nó. */
  shopOnly?: boolean;
  /** Nhóm quầy pha chế (`cup`, `tea`, `syrup`, `topping`, `foam`, `mix`) của nguyên liệu, dùng để xếp ô trong mini-game pha ly. */
  barGroup?: string;
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
  /** Giây người đứng quầy kiểm kho khi khách hỏi món hết trên kệ. */
  askStockSeconds: number;
  shopBudgetFactor: number;
  zoneLowThreshold: number;
  zoneCriticalThreshold: number;
  zoneRefillSecondsPerSlot: number;
  scanComboSeconds: number;
  scanTipBonus: number;
  /** Tỉ lệ khách trả thẻ/chuyển khoản (không cần thối tiền, không tip). */
  cashlessChance: number;
  /** Mỗi món trong đơn: xác suất khách tìm món tiệm chưa bán (nhắc người chơi nhập thêm). */
  uncarriedAskChance: number;
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
  security: {
    thiefChance: number; catchWindowSeconds: number; fineMul: number; refillDetect: number; cameraDetect: number; cameraCost: number;
    /** Bảo vệ đang trong ca bắt được bao nhiêu phần kẻ trộm vặt. */
    guardDetect: number;
    /** Trộm đột nhập ban đêm: xác suất mỗi đêm, hệ số khi có camera, phần hàng trên kệ bị lấy, số món tối đa. */
    nightChance: number; nightCameraMul: number; nightStealMin: number; nightStealMax: number; nightMaxItems: number;
    /** Trộm đêm lấy tiền trong két (thay vì hàng): xác suất, phần doanh thu hôm trước bị lấy. */
    nightCashChance: number; nightCashMin: number; nightCashMax: number;
    /** Công an điều tra vụ trộm: xác suất bắt được (cộng thêm nếu có camera), số ngày có kết quả. */
    policeCatch: number; policeCameraBonus: number; policeDaysMin: number; policeDaysMax: number;
    /** Tiền giả: xác suất khách trả tiền mặt bằng tờ giả, mệnh giá, khả năng phát hiện (chủ tiệm / thu ngân theo độ chính xác),
     * phần khách chịu đổi tờ thật khi bị trả lại, EXP khi báo công an. */
    counterfeitChance: number; counterfeitBills: number[]; playerDetect: number; staffDetectBase: number; staffDetectPerAccuracy: number;
    counterfeitRepay: number; counterfeitReportExp: number;
  };
  /** Hàng chờ tính tiền: khách chen hàng, khách phá phách. */
  queue: { cutChance: number; cutNoticeSeconds: number; cutSkipPatience: number; rowdyChance: number; rowdyAnnoySeconds: number };
  /** Hao mòn và sửa chữa nội thất / thiết bị. */
  maintenance: {
    wearMin: number; wearMax: number; breakFrom: number; breakPerWear: number; majorWear: number; majorChance: number;
    repairPct: number; repairMin: number; repairWear: number; lightTrafficMul: number; fanPatienceMul: number;
    equipment: { id: string; name: string; icon: string; cost: number }[];
  };
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
  /** Giới hạn số cửa hàng trong chuỗi (tính cả tiệm chính). */
  chain: { maxStores: number };
  /** Tiệm xôi: phút game ngâm tối thiểu/tối đa, kg mỗi thùng, phần mỗi kg, phút giữ nóng, trần chất lượng nếp nguội. */
  stickyRice: {
    soakMinMinutes: number;
    soakMaxMinutes: number;
    kgPerSoakTank: number;
    portionsPerKg: number;
    warmMinutes: number;
    coldQualityCap: number;
    steamSeconds: number;
    /** Giờ xe chở xôi gói tới tiệm đặt (phút trong ngày). */
    orderDueMinute: number;
    /** Đơn định kỳ tự tạm dừng sau số lần giao thiếu liên tiếp này. */
    recurringShortLimit: number;
    /** Đơn đã xong/hủy được dọn sau số ngày này. */
    orderKeepDays: number;
    /** Mô phỏng vắng chủ: phần/giờ của một thợ (nhân thêm 10%/điểm tốc độ), số giờ làm, khách bán lẻ/ngày, lượt quay bàn/ngày, phần tối thiểu tự ngâm. */
    cookPortionsPerHour: number;
    workHours: number;
    simRetailPerDay: number;
    tableTurnsPerDay: number;
    minSimPortions: number;
  };
  tax: TaxBalance;
}

export type TaxKind = 'goods' | 'food' | 'service';

/** Thuế hộ kinh doanh: miễn dưới ngưỡng doanh thu năm, vượt ngưỡng thì nộp VAT + TNCN theo % doanh thu. */
export interface TaxBalance {
  /** Ngưỡng doanh thu mỗi năm game được miễn thuế. */
  yearlyThreshold: number;
  rates: Record<TaxKind, { vat: number; pit: number }>;
  /** Hạn nộp: số ngày tính từ ngày đầu tháng mới. */
  dueDays: number;
  /** Nhắc trước hạn bao nhiêu ngày. */
  remindDays: number;
  /** Tiền chậm nộp mỗi ngày quá hạn (tỉ lệ trên số thuế còn nợ). */
  lateInterestPerDay: number;
  /** Quá hạn bấy nhiêu ngày thì bị cưỡng chế trừ thẳng vào tiền mặt. */
  enforceAfterDays: number;
  /** Tiền phạt khi bị cưỡng chế (tỉ lệ trên số thuế). */
  enforceFine: number;
  /** Số tờ thuế đã xong giữ lại để xem lịch sử. */
  historyBills: number;
  /** Khai bớt doanh thu: giảm bao nhiêu phần số thuế phải nộp (rủi ro bị thanh tra truy thu). */
  underDeclarePct: number;
  audit: {
    /** Xác suất thanh tra mỗi lần chốt tháng. */
    chance: number;
    /** Cộng thêm khi doanh thu đã tới mức bắt buộc máy tính tiền mà chưa lắp. */
    noMachineExtraChance: number;
    /** Xác suất khi đã lắp máy tính tiền (sổ sách minh bạch). */
    withMachineChance: number;
    /** Phạt trốn thuế = số thuế khai thiếu × hệ số này (ngoài phần truy thu). */
    evasionFineMul: number;
    evasionStars: number;
    /** Phạt hàng nhập không hóa đơn: tỉ lệ trên giá trị hàng. */
    marketFineRate: number;
    noMachineFine: number;
    cleanStars: number;
  };
  invoiceMachine: { cost: number; requiredYearRevenue: number };
  invoiceCustomer: { type: string; chance: number; companyChance: number; bonusExp: number; noInvoiceMaxStars: number };
  /** Khấu trừ thuế TNCN của nhân viên có lương ngày vượt mức. */
  staffPit: { dailyThreshold: number; rate: number };
  company: { setupCost: number; vatRate: number; citRate: number; supplierDiscount: number; partyRewardMul: number };
  /** EXP thưởng khi quyết toán năm không trễ hạn, không bị truy thu. */
  settlementExp: number;
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

export type StaffRole = 'cashier' | 'refill' | 'stocker' | 'delivery' | 'chef' | 'barista' | 'branch_manager' | 'xoi_cook' | 'guard';
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
  /** Ô kỹ thuật riêng chỉ dành cho máy phát điện. */
  generatorOnly?: boolean;
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
  /** Hệ số sức chứa trên mỗi ô cho nội thất dùng cấu hình cũ; kệ nhiều tầng khai báo thêm slots. */
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
  /** Mối có xuất hóa đơn (doanh nghiệp được khấu trừ VAT đầu vào; thanh tra không phạt). */
  invoice?: boolean;
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
  metric: 'sold' | 'served' | 'landsOpened' | 'debtsCollected' | 'loveStreak' | 'taxOnTime';
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
  shopTypes: ShopTypeDef[];
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

/** Một khoảng giờ và hệ số mật độ khách (giống `balance.density`). */
export interface DensitySegment { from: number; to: number; mul: number }

/** Loại cửa hàng (shopTypes.json): quyết định hàng, nội thất, khách, giờ cao điểm và mô phỏng khi vắng chủ. */
/**
 * Cơ chế riêng của một loại cửa hàng (tất cả tùy chọn; thiếu = 1, tức không đổi so với tạp hóa).
 */
export interface ShopMechanics {
  /** Nhân hạn dùng của hàng nhập vào theo nhóm hàng (vd. hàng tươi hỏng nhanh hơn). */
  shelfLifeMul?: Partial<Record<Category, number>>;
  /** Nhân nhu cầu của khách theo nhóm hàng. */
  demandMul?: Partial<Record<Category, number>>;
  /** Số mũ áp lên nhu cầu theo mùa/sự kiện: >1 nhạy mùa hơn, <1 ít nhạy hơn. */
  seasonSensitivity?: number;
  /** Nhân số lượng mỗi dòng hàng khách mua (bán sỉ). */
  qtyMul?: number;
  /** Nhân lượng khách chung của tiệm. */
  trafficMul?: number;
}

/** Id loại cửa hàng (khóa trong shopTypes.json); `validateContent` kiểm tra mọi tham chiếu. */
export type ShopTypeId = string;

export interface ShopTypeDef {
  id: ShopTypeId;
  name: string;
  icon: string;
  /** Nhóm hàng được bày bán trên kệ/quầy. */
  categories: Category[];
  /** Mặt hàng nhập thêm ngoài các nhóm trên (nguyên liệu, bao gói, đồ uống kèm). */
  ingredients: string[];
  /** Nội thất và trạm nấu được đặt. */
  fixtures: string[];
  /** Loại khách ghé tiệm. */
  customers: string[];
  /** null = dùng `balance.density` như tạp hóa. */
  densityCurve: DensitySegment[] | null;
  sim: 'profit_average' | 'production';
  /** Công thức được nấu ở loại tiệm này. */
  recipes: string[];
  /** Mặt hàng loại tiệm này cung cấp cho tiệm khác trong chuỗi. */
  supplies: string[];
  /** Mặt hàng ưu tiên lấy từ tiệm nội bộ khi chuỗi có tiệm cung cấp. */
  sourcesFrom: string[];
  /** Tỉ lệ mỗi khách hỏi thêm một món `sourcesFrom` đang có ở quầy (khách mua xôi gói ăn sáng). Thiếu = 0. */
  sourcedRequestChance?: number;
  dineInChance: number;
  addOns: { productId: string; chance: number }[];
  /** `shelves`: khách tự lấy hàng trên kệ; `counter`: khách chỉ gọi món ở quầy (tiệm xôi). */
  service: 'shelves' | 'counter';
  /** Có dùng các mảnh đất mở rộng (land.json) và điều kiện `requiresPlot` của nội thất không. */
  landPlots: boolean;
  /** Cơ chế riêng của loại tiệm (xem `ShopMechanics`). */
  mechanics?: ShopMechanics;
}

export interface BranchDef {
  id: string;
  name: string;
  /** Kiểu khu/địa điểm (quyết định ngoại hình tòa nhà trên bản đồ phố). */
  kind: string;
  /** Loại cửa hàng khi mở (mặc định grocery). */
  shopType?: ShopTypeId;
  /** Tính năng level cần có để thấy và mở khu này (ngoài unlockLevel). */
  feature?: string;
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
  /** Đầu ra đóng gói để bán qua tiệm khác (xôi gói); khách tại tiệm không gọi món này. */
  packaged?: boolean;
  /** Mini-game pha chế riêng (`tea`: pha ly trà sữa nhiều quầy); thiếu = mini-game mặc định của màn Cook. */
  minigame?: 'tea';
}

export interface RecipeVariant {
  id: string;
  name: string;
  priceDelta: number;
  qualityDelta: number;
  /** Nguyên liệu tốn thêm khi chọn biến thể (vd. "Thêm topping"). */
  extraIngredients?: Record<string, number>;
  /** Trọng số khách gọi tùy chọn này ở món `minigame: 'tea'` (ly thường có trọng số riêng trong `customCups.ts`); thiếu = 0.2. */
  orderWeight?: number;
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
  shopTypes: shopTypesJson as unknown as ShopTypeDef[],
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

const supplierIndex = new Map(DATA.suppliers.map((s) => [s.id, s]));
const recipeIndex = new Map(DATA.recipes.map((r) => [r.id, r]));
// Giữ công thức đầu tiên cho mỗi đầu ra, đúng như `find` trước đây.
const recipeByOutputIndex = new Map<string, RecipeDef>();
for (const r of DATA.recipes) if (!recipeByOutputIndex.has(r.output)) recipeByOutputIndex.set(r.output, r);
const shopTypeIndex = new Map<string, ShopTypeDef>(DATA.shopTypes.map((t) => [t.id, t]));

/** Công thức theo id (O(1)); undefined nếu không có. */
export function recipeById(id: string): RecipeDef | undefined {
  return recipeIndex.get(id);
}

/** Công thức làm ra mặt hàng `output` (O(1)); undefined nếu không có. */
export function recipeByOutput(output: string): RecipeDef | undefined {
  return recipeByOutputIndex.get(output);
}

export function shopTypeById(id: string): ShopTypeDef | undefined {
  return shopTypeIndex.get(id);
}

export function supplier(id: string): SupplierDef {
  const s = supplierIndex.get(id);
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
