import {
  DATA, furniture, product, refPrice, type Category, type LevelDef, type Look, type Product, type StaffRole, type StaffStats, type TaxKind,
} from './data';
import type { Review } from './reviews';
import { activeShopType } from './shopTypes';

export type Phase = 'morning' | 'open' | 'summary';

/** Một phần hàng trong ô kệ, cùng hạn dùng. `exp` = ngày hết hạn (null: hàng không hạn). */
export interface SlotLot {
  qty: number;
  exp: number | null;
}

export interface Slot {
  productId: string | null;
  qty: number;
  /** Các lô trong ô, luôn có tổng = qty (thiếu thì coi như hàng không hạn). */
  lots?: SlotLot[];
  /** Bán xả: phần trăm giảm giá (30/50) cho hàng hết hạn hôm nay. */
  clearance?: number;
}

/** Lô hàng trong kho. */
export interface Lot {
  productId: string;
  qty: number;
  exp: number | null;
}

export type ShelfZone = Exclude<Category, 'counter'> | null;

/** Nội thất đặt trên lưới mặt bằng. `shelf` trỏ vào `state.shelves` khi nội thất có ô bày hàng. */
export interface Fixture {
  uid: number;
  type: string;
  x: number;
  y: number;
  rot: 0 | 1;
  shelf?: number;
}

export interface DiningTableState {
  fixtureUid: number;
  status: 'clean' | 'occupied' | 'dirty';
  customerId: number | null;
  productId: string | null;
  secondsLeft: number;
  extraOrders: number;
}

export type DebtFate = 'onTime' | 'late' | 'default';

export interface Debt {
  id: number;
  name: string;
  amount: number;
  day: number;
  dueDay: number;
  fate: DebtFate;
  /** Ngày khách sẽ ghé trả (null: quỵt). */
  repayDay: number | null;
  status: 'open' | 'paid' | 'bad';
  reminded?: boolean;
}

export interface Delivery {
  id: number;
  supplierId: string;
  arriveDay: number;
  arriveMinute: number;
  items: Record<string, number>;
}

/** Nhân viên đang làm cho tiệm. */
export interface Staff {
  id: string;
  name: string;
  personality: string;
  look: Look;
  role: StaffRole;
  stats: StaffStats;
  /** Lương cả ngày (2 ca). */
  wage: number;
  level: number;
  exp: number;
  /** Tâm trạng 0–100. */
  mood: number;
  hiredDay: number;
  /** Số ngày làm liên tục. */
  streak: number;
  /** Số ngày liên tiếp tâm trạng dưới ngưỡng nghỉ việc. */
  lowMoodDays: number;
  /** Đã báo nghỉ, chờ người chơi quyết định sáng nay. */
  quitting: boolean;
  /** Ngày bị nhắc nhở gần nhất (chính xác + tạm thời trong ngày đó). */
  scoldedDay: number | null;
  lifetime: { served: number; mistakes: number; ratingSum: number; ratingCount: number; jobs: number };
}

export interface Candidate {
  id: string;
  name: string;
  personality: string;
  look: Look;
  role: StaffRole;
  stats: StaffStats;
  wage: number;
}

export interface StaffBoard {
  /** Ngày làm mới bảng gần nhất. */
  day: number;
  list: Candidate[];
  /** Số ứng viên ban đầu; bảng không tự tuyển thêm người sau mỗi lần thuê. */
  targetCount?: number;
}

/** Quy tắc "Khi tồn [món] dưới X thì nhập Y từ [mối]". */
export interface RestockRule {
  productId: string;
  threshold: number;
  qty: number;
  supplierId: string;
}

export interface StaffDayPerf { name: string; served: number; mistakes: number; ratingSum: number; ratingCount: number; jobs: number }

/** Số liệu một ngày trong lịch sử phân tích. */
export interface DayRecord {
  day: number;
  revenue: number;
  profit: number;
  cogs: number;
  wages: number;
  electricity: number;
  spoiled: number;
  theft: number;
  customers: number;
  avgRating: number;
  sold: Record<string, number>;
  /** Khách theo giờ, 08:00 → 21:00. */
  hourly: number[];
  staff: Record<string, StaffDayPerf>;
  manager: boolean;
  /** Giá vốn hàng nhận qua đơn nội bộ (ghi chú, không phải tiền mặt bị trừ lần nữa). */
  internalCost?: number;
}

export interface JournalEntry {
  /** Phút trong ngày. */
  m: number;
  t: string;
}

export interface QuestState {
  id: string;
  claimed: boolean;
}

export interface DailyQuests {
  day: number;
  list: QuestState[];
  rerollUsed: boolean;
}

export interface Lifetime {
  sold: number;
  served: number;
  debtsCollected: number;
  landsOpened: number;
  /** Số ngày liên tiếp sao trung bình ≥ loveStreakRating. */
  loveStreak: number;
}

export interface DayStats {
  revenue: number;
  cogs: number;
  tips: number;
  overpaid: number;
  served: number;
  happy: number;
  left: number;
  ratingSum: number;
  ratingCount: number;
  expGained: number;
  /** Player levels reached during this day (also shown in the end-of-day recap). */
  levelUps: number[];
  itemsScanned: number;
  counterServed: number;
  sold: Record<string, number>;
  /** Số món khách hỏi mà kệ đã hết (nhu cầu bị bỏ lỡ). */
  missed: Record<string, number>;
  /** Số lần khách chê giá theo món. */
  priceComplaints: Record<string, number>;
  /** Số món khách bỏ vì không lạnh. */
  notCold: Record<string, number>;
  /** Hàng hỏng/bỏ trong ngày (số lượng theo món) và giá vốn. */
  spoiled: Record<string, number>;
  spoiledCost: number;
  /** Giá vốn hàng nhận từ tiệm khác trong chuỗi (không phải tiền chi thêm; tiền dùng chung). */
  internalCost?: number;
  electricity: number;
  debtCollected: number;
  debtCollectedAmount: number;
  debtGiven: number;
  badDebt: number;
  bargainDiscount: number;
  questMoney: number;
  wages: number;
  bonuses: number;
  /** Giá vốn hàng bị trộm mất. */
  theftCost: number;
  thefts: number;
  thievesCaught: number;
  /** Tiền bồi thường từ kẻ trộm bị bắt. */
  fines: number;
  deliveryFees: number;
  deliveries: number;
  lateDeliveries: number;
  complaints: number;
  /** EXP từ việc nhân viên làm (để giảm 50% trong chế độ quản lý). */
  staffExp: number;
  /** Khách vào tiệm theo giờ (08:00 → 21:00). */
  hourly: number[];
  staffPerf: Record<string, StaffDayPerf>;
  journal: JournalEntry[];
  /** Hôm nay có bật "Để nhân viên lo". */
  managerDay: boolean;
  /** Nhân viên lên cấp hôm nay. */
  staffLevelUps: string[];
  /** Giờ game (phút) chủ tiệm chủ động đóng cửa sớm; không có = mở tới giờ đóng cửa thường. */
  closedEarlyAt?: number;
  /** Số khách đang lựa hàng / chờ vào mà chưa lấy gì, được mời về khi đóng cửa sớm. */
  sentHome?: number;
  /** Thuế phát sinh trên doanh thu hôm nay (nộp gộp cuối tháng). */
  taxAccrued: number;
}

export interface DaySummary {
  day: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  tips: number;
  overpaid: number;
  served: number;
  happy: number;
  left: number;
  avgRating: number;
  expGained: number;
  bestSeller: { productId: string; qty: number } | null;
  /** Các món bị hỏi mà hết hàng, nhiều nhất trước. */
  missed: { productId: string; qty: number }[];
  levelUps: number[];
  capReached: boolean;
  spoiled?: { productId: string; qty: number }[];
  spoiledCost?: number;
  electricity?: number;
  priceComplaints?: { productId: string; qty: number }[];
  debtCollectedAmount?: number;
  debtGiven?: number;
  badDebt?: number;
  netProfit?: number;
  achievements?: string[];
  wages?: number;
  wageDebt?: number;
  bonuses?: number;
  theftCost?: number;
  fines?: number;
  deliveryFees?: number;
  /** Giá vốn hàng nhận qua đơn nội bộ, hiển thị riêng trong báo cáo chuỗi. */
  internalCost?: number;
  /** Nhân viên lên cấp trong ngày (tên). */
  staffLevelUps?: string[];
  journal?: JournalEntry[];
  /** Đóng cửa sớm lúc (phút trong ngày). */
  closedEarlyAt?: number;
  sentHome?: number;
  /** Thuế phát sinh hôm nay (VAT + TNCN/TNDN), nộp gộp theo tháng. */
  tax?: number;
  /** TNCN khấu trừ từ lương nhân viên hôm nay (nộp thay, không phải chi phí). */
  staffPit?: number;
  /** Tiền chuyển vào quỹ thuế hôm nay. */
  taxReserved?: number;
}

/** Hiệu quả những ngày quản lý gần nhất (cho thu nhập offline). */
export interface ManagerDay {
  day: number;
  revenue: number;
  profit: number;
  sold: Record<string, number>;
}

export interface Settings {
  sound: boolean;
  /** Tự động thối tiền (mặc định bật). Tắt để tự thối và có cơ hội nhận tip. */
  autoChange: boolean;
  /** Tự quét toàn bộ giỏ khi khách đến quầy. Mặc định tắt để người chơi làm quen. */
  autoScan: boolean;
  /** Không chạm màn hình bao nhiêu giây thì game chơi hộ quầy (0 = tắt, chưa đặt = 60). */
  idleAutoPlay?: number;
  /** Góc nhìn lúc bán: 'side' = nhìn ngang (mặc định), 'topdown' = sơ đồ trên xuống, tự đi lại. */
  viewMode?: 'side' | 'topdown';
  /** Thợ nấu xôi làm đơn nội bộ trước hàng bán lẻ (mặc định bật). */
  xoiOrderPriority?: boolean;
}

export interface SaveSync {
  baseRevision: number;
  dirty: boolean;
  lastSyncedAt: number | null;
  deviceId: string;
}

export interface SaveSummary {
  level: number;
  day: number;
  money: number;
  playSeconds: number;
}

export interface WeeklyQuestState { id: string; progress: number; claimed: boolean }
export interface WeeklyQuests { week: number; list: WeeklyQuestState[]; giftClaimed: boolean }
export interface PartyOrder {
  id: string;
  week: number;
  customer: string;
  items: Record<string, number>;
  offerDay: number;
  deadlineDay: number;
  rewardMoney: number;
  status: 'offered' | 'accepted' | 'fulfilled' | 'declined' | 'expired';
}

/** Loại cửa hàng (id trong shopTypes.json), tách khỏi `kind` là khu vực. */
export type ShopTypeId = 'grocery' | 'xoi';

export interface StoreSnapshot {
  id: string;
  name: string;
  kind: 'main' | 'market' | 'school' | 'industrial' | 'xoi';
  shopType: ShopTypeId;
  /** Per-store operational state. Shared money/level remain on GameState. */
  data: Record<string, unknown>;
  simDay?: number;
}

/** Mẻ nếp đang ngâm (đồng hồ theo phút game, không phải lô hàng). */
export interface SoakBatch {
  id: string;
  kg: number;
  startDay: number;
  startMinute: number;
}

/** Nếp đã hấp chín, còn `portions` phần; nguội sau `stickyRice.warmMinutes`. */
export interface CookedRice {
  portions: number;
  cookedDay: number;
  cookedMinute: number;
  quality: number;
}

export type InternalOrderStatus = 'pending' | 'made' | 'shipping' | 'delivered' | 'short' | 'cancelled';

/** Đơn đặt hàng giữa hai tiệm trong chuỗi; nằm ở phần chung để cả hai tiệm cùng thấy. */
export interface InternalOrder {
  id: string;
  fromStoreId: string;
  toStoreId: string;
  items: Record<string, number>;
  filled: Record<string, number>;
  createdDay: number;
  dueDay: number;
  dueMinute: number;
  status: InternalOrderStatus;
  shortReason?: string;
  /** Giá vốn phần hàng thực giao, để báo cáo chuỗi theo ngày. */
  internalCost?: number;
  recurringId?: string;
}

/** Đơn định kỳ: mỗi sáng sinh một InternalOrder; tự tạm dừng sau nhiều lần giao thiếu liên tiếp. */
export interface RecurringOrder {
  id: string;
  fromStoreId: string;
  toStoreId: string;
  items: Record<string, number>;
  active: boolean;
  shortStreak: number;
}

export interface BranchShipment {
  id: string;
  fromStoreId: string;
  toStoreId: string;
  productId: string;
  lots: SlotLot[];
  sentDay: number;
  arriveDay: number;
  /** Phút trong ngày hàng tới (xôi gói giao 7h); thiếu = đầu ngày. */
  arriveMinute?: number;
  fee: number;
  /** Chuyến hàng thuộc đơn nội bộ nào (kéo nguyên liệu từ tiệm khác). */
  orderId?: string;
}

/** Tờ thuế một tháng (hoặc tờ truy thu sau thanh tra): nộp trước hạn để khỏi bị tính tiền chậm nộp. */
export interface TaxBill {
  id: number;
  year: number;
  month: number;
  /** 'month': thuế tháng; 'audit': truy thu + phạt sau thanh tra. */
  kind?: 'month' | 'audit';
  /** Hình thức lúc lập tờ: hộ kinh doanh (VAT + TNCN) hay doanh nghiệp (VAT + TNDN). */
  mode?: TaxMode;
  /** Doanh thu tháng theo nhóm ngành (kể cả phần dưới ngưỡng miễn thuế). */
  revenue: Record<TaxKind, number>;
  vat: number;
  /** Hộ kinh doanh: thuế TNCN của chủ hộ; doanh nghiệp: thuế TNDN. */
  pit: number;
  /** Thuế TNCN đã khấu trừ từ lương nhân viên, nộp thay. */
  staffPit?: number;
  /** Số thuế còn phải nộp (chưa gồm tiền chậm nộp tính từ `interestFrom`). */
  amount: number;
  /** Hạn nộp: hết ngày này. */
  dueDay: number;
  /** Tiền chậm nộp tính từ sau ngày này. */
  interestFrom: number;
  status: 'open' | 'paid' | 'enforced';
  /** Đã bị phạt khi cưỡng chế. */
  fined?: boolean;
  paidDay?: number;
  /** Tổng tiền đã nộp cho tờ này (thuế + chậm nộp + phạt). */
  paidTotal?: number;
  /** Khai bớt doanh thu: số thuế đã giấu (thanh tra phát hiện sẽ truy thu + phạt). */
  hidden?: number;
  /** Đã qua thanh tra (không truy thu lại). */
  audited?: boolean;
  /** Tờ truy thu: nội dung vi phạm. */
  note?: string;
}

export type TaxMode = 'household' | 'company';

export interface TaxAudit {
  day: number;
  /** Tổng truy thu + phạt (0: không vi phạm). */
  total: number;
  findings: string[];
}

export interface TaxYear {
  year: number;
  revenue: number;
  paid: number;
  late: number;
  evasion: boolean;
  /** Được khen hộ/doanh nghiệp gương mẫu. */
  exemplary: boolean;
}

export interface TaxState {
  /** Đã đăng ký hộ kinh doanh (mở ở level có tính năng `tax`). */
  registered: boolean;
  registeredDay: number;
  /** Năm lịch đang tính ngưỡng. */
  year: number;
  /** Tháng đang cộng dồn, dạng năm·12 + (tháng − 1). */
  month: number;
  /** Doanh thu cả năm đã ghi nhận (để so với ngưỡng miễn thuế). */
  yearRevenue: number;
  monthRevenue: Record<TaxKind, number>;
  /** VAT phải nộp của tháng (doanh nghiệp: đầu ra − đầu vào, có thể âm = được khấu trừ chuyển kỳ sau). */
  monthVat: number;
  /** Hộ: TNCN; doanh nghiệp: TNDN tạm tính (âm = lỗ, trừ vào tháng sau trong năm). */
  monthPit: number;
  /** TNCN khấu trừ từ lương nhân viên trong tháng. */
  monthStaffPit: number;
  bills: TaxBill[];
  nextBillId: number;
  /** Tổng tiền đã nộp thuế từ trước tới nay. */
  lifetimePaid: number;
  mode: TaxMode;
  companyDay: number;
  /** Quỹ thuế: tự để riêng thuế tạm tính mỗi ngày. */
  reserveOn: boolean;
  reserve: number;
  /** Đã lắp máy tính tiền xuất hóa đơn điện tử. */
  invoiceMachine: boolean;
  /** Giá trị hàng nhập không hóa đơn chưa qua thanh tra. */
  unauditedMarket: number;
  /** Số tháng liên tiếp nộp thuế đúng hạn và kỷ lục. */
  onTimeStreak: number;
  bestOnTimeStreak: number;
  /** Trong năm đang tính: số tờ nộp trễ / bị cưỡng chế, có bị truy thu trốn thuế không, đã nộp bao nhiêu. */
  yearLate: number;
  yearEvasion: boolean;
  yearPaid: number;
  audits: TaxAudit[];
  years: TaxYear[];
  /** Năm đã nhắc bắt buộc lắp máy tính tiền. */
  machineWarnedYear: number;
}

export function emptyTaxState(): TaxState {
  return {
    registered: false, registeredDay: 0, year: 0, month: 0, yearRevenue: 0,
    monthRevenue: { goods: 0, food: 0, service: 0 }, monthVat: 0, monthPit: 0, monthStaffPit: 0, bills: [], nextBillId: 1, lifetimePaid: 0,
    mode: 'household', companyDay: 0, reserveOn: false, reserve: 0, invoiceMachine: false, unauditedMarket: 0,
    onTimeStreak: 0, bestOnTimeStreak: 0, yearLate: 0, yearEvasion: false, yearPaid: 0, audits: [], years: [], machineWarnedYear: 0,
  };
}

export interface ActiveEvent {
  id: string;
  day: number;
  endsDay: number;
  unexpected?: boolean;
  params?: Record<string, string | number>;
}

export interface GameState {
  version: 7;
  day: number;
  phase: Phase;
  /** Phút trong ngày (480 = 08:00) khi đang mở cửa. */
  clock: number;
  money: number;
  exp: number;
  level: number;
  /** Kho: các lô hàng, xuất theo hạn sớm nhất trước (FEFO). */
  warehouse: Lot[];
  /** Hàng giao tới khi kho đầy; phải dọn trước khi mở cửa. */
  holding: Lot[];
  /** Ô bày hàng của từng nội thất có ô (kệ, tủ lạnh 1/2 cánh, tủ đông). 3 kệ đầu là kệ gốc giai đoạn 1. */
  shelves: Slot[][];
  /** Nhóm hàng của từng kệ; null nghĩa là chưa được gán khu. */
  zones: ShelfZone[];
  /** Tồn kho hàng chỉ bán khi khách yêu cầu ở quầy. */
  counter: Slot[];
  fixtures: Fixture[];
  /** Nội thất đã mua nhưng cất khỏi mặt bằng; có thể đặt lại mà không trả tiền. */
  storedFixtures: Fixture[];
  diningTables: DiningTableState[];
  nextUid: number;
  /** Mảnh đất đã mở (id trong land.json). */
  land: string[];
  warehouseTier: number;
  /** Giá bán người chơi đặt; thiếu = giá gợi ý. */
  prices: Record<string, number>;
  deliveries: Delivery[];
  ledger: Debt[];
  /** Số lần ghé của khách quen có tên. */
  regulars: Record<string, number>;
  quests: DailyQuests | null;
  weeklyQuests: WeeklyQuests | null;
  partyOrder: PartyOrder | null;
  partyOrderWeek: number;
  achievements: string[];
  /** Đồ trang trí đang có (tường, biển, quầy). Đồ đặt sàn nằm trong fixtures. */
  decorOwned: string[];
  lifetime: Lifetime;
  /** Hướng dẫn tính năng mới đã xem. */
  tutorialsSeen: string[];
  ratings: number[];
  /** Đánh giá khách viết (mới nhất trước) và phản hồi của chủ tiệm. */
  reviews: Review[];
  yesterdaySold: Record<string, number>;
  yesterdayMissed: Record<string, number>;
  /** Số lần khách chê giá hôm qua theo món (để gợi ý ở màn Giá bán). */
  yesterdayComplaints?: Record<string, number>;
  today: DayStats;
  lastGrandmaDay: number;
  seenIntro: boolean;
  settings: Settings;
  /** Tổng kết ngày vừa xong (để hiện lại nếu người chơi thoát ở màn tổng kết). */
  lastSummary: DaySummary | null;
  /** Level đã được giới thiệu mặt hàng mới (tránh hiện lại popup). */
  announcedLevel: number;
  loginPromptSeen: boolean;
  /** Metadata for optional cloud backup; localStorage remains the source used to play. */
  sync: SaveSync;
  summary: SaveSummary;
  // ---------- Giai đoạn 3 ----------
  staff: Staff[];
  staffBoard: StaffBoard | null;
  /** Ứng viên cố định đã từng được thuê (không hiện lại). */
  fixedCandidateUsed: boolean;
  /** Lịch 7 ngày × 2 ca theo id nhân viên: index = thứ·2 + ca. */
  schedule: Record<string, boolean[]>;
  /** Lịch đã được xếp lần đầu khi mở khóa xếp ca. */
  scheduleReady: boolean;
  rules: RestockRule[];
  /** Sơ đồ kệ đã chốt: món của từng ô (null = để trống). */
  planogram: (string | null)[][] | null;
  analytics: DayRecord[];
  managerStats: ManagerDay[];
  manager: { enabled: boolean; speed: number };
  /** Lương còn nợ nhân viên. */
  wageDebt: number;
  camera: boolean;
  /** Hao mòn / hỏng của nội thất và thiết bị, theo khóa `idTiệm:fUid` hoặc `idTiệm:light` (xem maintenance.ts). */
  maintenance?: Record<string, { wear: number; broken?: 'minor' | 'major' }>;
  /** Thông báo buổi sáng (tự nhập hàng, nhân viên xin nghỉ...). */
  morningNotes: string[];
  /** Thời điểm lưu gần nhất (ms, giờ thực). */
  lastSeen: number;
  /** Version 5: cửa hàng đang mở và các snapshot cửa hàng trong chuỗi. */
  stores: StoreSnapshot[];
  activeStoreId: string;
  /** Ngày 1 của bản lưu cũ được đặt vào tháng 3 để không rơi ngay vào Tết. */
  calendarStartMonth: number;
  calendarStartYear: number;
  activeEvents: ActiveEvent[];
  eventProgress: Record<string, number>;
  eventHistory: string[];
  eventRollDay: number;
  eventRewards: string[];
  /** Công thức đang bán; món chế biến được giữ ở quầy đến hết ngày. */
  activeRecipes: string[];
  branchLastSimDay: Record<string, number>;
  branchShipments: BranchShipment[];
  storyProgress: string[];
  storyStarted: Record<string, number>;
  // ---------- Version 6: tiệm xôi và chuỗi cung ứng nội bộ ----------
  /** Dữ liệu riêng từng tiệm (nằm trong STORE_KEYS). */
  soakBatches: SoakBatch[];
  cookedRice: CookedRice[];
  /** Dữ liệu chung của chuỗi. */
  internalOrders: InternalOrder[];
  recurringOrders: RecurringOrder[];
  /** Thuế hộ kinh doanh: dùng chung cho cả chuỗi tiệm (một hộ, một ngưỡng miễn thuế). */
  tax: TaxState;
}

/** Số kệ gốc của giai đoạn 1 (vẫn khóa theo level). */
export const MAX_SHELVES = 3;

export function emptyStats(): DayStats {
  return {
    revenue: 0, cogs: 0, tips: 0, overpaid: 0, served: 0, happy: 0, left: 0, ratingSum: 0, ratingCount: 0,
    expGained: 0, levelUps: [], itemsScanned: 0, counterServed: 0, sold: {}, missed: {}, priceComplaints: {}, notCold: {},
    spoiled: {}, spoiledCost: 0, electricity: 0, debtCollected: 0, debtCollectedAmount: 0, debtGiven: 0,
    badDebt: 0, bargainDiscount: 0, questMoney: 0,
    wages: 0, bonuses: 0, theftCost: 0, thefts: 0, thievesCaught: 0, fines: 0, deliveryFees: 0, deliveries: 0, lateDeliveries: 0,
    complaints: 0, staffExp: 0, hourly: Array.from({ length: Math.ceil((DATA.balance.closeMinute - DATA.balance.openMinute) / 60) }, () => 0), staffPerf: {}, journal: [], managerDay: false, staffLevelUps: [],
    taxAccrued: 0,
  };
}

export function emptySlots(count: number): Slot[] {
  return Array.from({ length: count }, () => ({ productId: null, qty: 0 }));
}

/** Bố cục mặc định: 3 kệ gốc và quầy theo land.json. */
export function defaultFixtures(): Fixture[] {
  return DATA.land.defaultLayout.map((f, i) => ({ uid: i + 1, type: f.type, x: f.x, y: f.y, rot: (f.rot ? 1 : 0) as 0 | 1, ...(f.shelf !== undefined ? { shelf: f.shelf } : {}) }));
}

export function createNewGame(): GameState {
  const b = DATA.balance;
  const fixtures = defaultFixtures();
  const state: GameState = {
    version: 7,
    day: 1,
    phase: 'morning',
    clock: b.openMinute,
    money: b.startMoney,
    exp: 0,
    level: 1,
    warehouse: [],
    holding: [],
    shelves: Array.from({ length: MAX_SHELVES }, () => emptySlots(b.slotsPerShelf)),
    zones: Array.from({ length: MAX_SHELVES }, () => null),
    counter: emptySlots(DATA.balance.counterSlots),
    fixtures,
    storedFixtures: [],
    diningTables: [],
    nextUid: fixtures.length + 1,
    land: [],
    warehouseTier: 0,
    prices: {},
    deliveries: [],
    ledger: [],
    regulars: {},
    quests: null,
    weeklyQuests: null,
    partyOrder: null,
    partyOrderWeek: -1,
    achievements: [],
    decorOwned: [],
    lifetime: { sold: 0, served: 0, debtsCollected: 0, landsOpened: 0, loveStreak: 0 },
    tutorialsSeen: [],
    ratings: [],
    reviews: [],
    yesterdaySold: {},
    yesterdayMissed: {},
    today: emptyStats(),
    lastGrandmaDay: -99,
    seenIntro: false,
    settings: { sound: true, autoChange: true, autoScan: false },
    lastSummary: null,
    announcedLevel: 1,
    loginPromptSeen: false,
    sync: { baseRevision: 0, dirty: true, lastSyncedAt: null, deviceId: createDeviceId() },
    summary: { level: 1, day: 1, money: b.startMoney, playSeconds: 0 },
    staff: [],
    staffBoard: null,
    fixedCandidateUsed: false,
    schedule: {},
    scheduleReady: false,
    rules: [],
    planogram: null,
    analytics: [],
    managerStats: [],
    manager: { enabled: false, speed: 1 },
    wageDebt: 0,
    camera: false,
    morningNotes: [],
    lastSeen: Date.now(),
    stores: [],
    activeStoreId: 'main',
    calendarStartMonth: 1,
    calendarStartYear: 1,
    activeEvents: [],
    eventProgress: {},
    eventHistory: [],
    eventRollDay: 0,
    eventRewards: [],
    activeRecipes: [],
    branchLastSimDay: {},
    branchShipments: [],
    storyProgress: [],
    storyStarted: {},
    soakBatches: [],
    cookedRice: [],
    internalOrders: [],
    recurringOrders: [],
    tax: emptyTaxState(),
  };
  state.stores = [{ id: 'main', name: 'Tiệm chính', kind: 'main', shopType: 'grocery', data: storeData(state) }];
  return state;
}

const STORE_KEYS = [
  'warehouse', 'holding', 'shelves', 'zones', 'counter', 'fixtures', 'storedFixtures', 'diningTables', 'nextUid', 'land', 'warehouseTier', 'prices',
  'deliveries', 'ledger', 'regulars', 'quests', 'weeklyQuests', 'partyOrder', 'partyOrderWeek', 'decorOwned', 'lifetime', 'tutorialsSeen', 'ratings', 'reviews', 'yesterdaySold', 'yesterdayMissed',
  'yesterdayComplaints', 'today', 'lastGrandmaDay', 'seenIntro', 'lastSummary', 'announcedLevel', 'staff', 'staffBoard',
  'fixedCandidateUsed', 'schedule', 'scheduleReady', 'rules', 'planogram', 'analytics', 'managerStats', 'manager', 'wageDebt',
  'camera', 'morningNotes', 'activeEvents', 'eventProgress', 'eventHistory', 'eventRollDay', 'eventRewards',
  'activeRecipes', 'soakBatches', 'cookedRice',
] as const;

export type StoreKey = (typeof STORE_KEYS)[number];
/** Dữ liệu vận hành của một tiệm (kho, kệ, nhân viên…). GameState cũng là StoreData của tiệm đang đứng. */
export type StoreData = Pick<GameState, StoreKey>;

export function isStoreKey(key: string): key is StoreKey {
  return (STORE_KEYS as readonly string[]).includes(key);
}

/**
 * Truy cập dữ liệu tiệm bất kỳ mà không phải tráo tiệm: tiệm đang đứng trả chính `state`,
 * tiệm khác trả snapshot `stores[i].data` (ghi vào đó được giữ lại khi `activateStore`).
 */
export function storeView(state: GameState, storeId: string): StoreData {
  if (storeId === state.activeStoreId) return state;
  const store = state.stores.find((item) => item.id === storeId);
  if (!store) throw new Error(`Không có cửa hàng ${storeId}`);
  const data = store.data as Partial<StoreData>;
  data.warehouse ??= [];
  data.holding ??= [];
  data.storedFixtures ??= [];
  data.counter ??= [];
  data.soakBatches ??= [];
  data.cookedRice ??= [];
  data.activeRecipes ??= [];
  data.analytics ??= [];
  data.staff ??= [];
  return data as StoreData;
}

function storeData(state: GameState): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of STORE_KEYS) data[key] = structuredClone(state[key]);
  return data;
}

/** Copy the live shop into its snapshot before serializing or switching stores. */
export function syncActiveStore(state: GameState): void {
  const i = state.stores.findIndex((store) => store.id === state.activeStoreId);
  if (i < 0) return;
  state.stores[i] = { ...state.stores[i], data: storeData(state) };
}

/** Add a new shop copied from the current one; shared money/level stay on GameState. */
export function addStoreSnapshot(state: GameState, store: Omit<StoreSnapshot, 'data' | 'shopType'> & { shopType?: ShopTypeId }): boolean {
  if (state.stores.some((item) => item.id === store.id)) return false;
  syncActiveStore(state);
  state.stores.push({ ...store, shopType: store.shopType ?? 'grocery', data: storeData(state) });
  return true;
}

/** Switch the active operational state while keeping shared money, level and settings. */
export function activateStore(state: GameState, id: string): boolean {
  syncActiveStore(state);
  const store = state.stores.find((item) => item.id === id);
  if (!store) return false;
  state.activeStoreId = store.id;
  for (const key of STORE_KEYS) {
    if (key in store.data) (state as unknown as Record<string, unknown>)[key] = structuredClone(store.data[key]);
    else if (key === 'weeklyQuests') state.weeklyQuests = null;
    else if (key === 'partyOrder') state.partyOrder = null;
    else if (key === 'partyOrderWeek') state.partyOrderWeek = -1;
    else if (key === 'reviews') state.reviews = [];
    else if (key === 'storedFixtures') state.storedFixtures = [];
    else if (key === 'soakBatches') state.soakBatches = [];
    else if (key === 'cookedRice') state.cookedRice = [];
  }
  if (state.level >= 21 && DATA.land.plots.some((plot) => plot.id === 'H') && !state.land.includes('H')) {
    state.land.push('H');
    state.lifetime.landsOpened = state.land.filter((plotId) => !DATA.land.plots.find((plot) => plot.id === plotId)?.generatorOnly).length;
  }
  return true;
}

function createDeviceId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } catch {
    return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function levelDef(level: number): LevelDef {
  const levels = DATA.levels.levels;
  return levels[Math.min(level, levels.length) - 1];
}

export function unlockedCategories(level: number): Category[] {
  return levelDef(level).categories;
}

/** Món thường (không theo sự kiện) đã mở theo level và loại tiệm; lọc lại cả danh mục mỗi lần khách tới rất tốn. */
const baseUnlockedCache = new Map<string, Product[]>();

function baseUnlocked(level: number, shop: ReturnType<typeof activeShopType> | null): Product[] {
  const key = `${DATA.products.length}|${level}|${shop?.def.id ?? '*'}`;
  let list = baseUnlockedCache.get(key);
  if (!list) {
    const cats = unlockedCategories(level);
    list = DATA.products.filter((p) => !p.recipeOnly && !p.eventOnly && (!shop || shop.allowsProduct(p.id))
      && p.unlockLevel <= level && (p.behindCounter ? level >= 3 : cats.includes(p.category)));
    baseUnlockedCache.set(key, list);
  }
  return list;
}

export function unlockedProducts(level: number, state?: GameState): Product[] {
  const shop = state ? activeShopType(state) : null;
  const list = [...baseUnlocked(level, shop)];
  if (!state) return list;
  // Món theo sự kiện: bán khi sự kiện đang diễn ra hoặc tiệm còn hàng.
  const cats = unlockedCategories(level);
  for (const p of DATA.products) {
    if (!p.eventOnly || p.recipeOnly || (shop && !shop.allowsProduct(p.id))) continue;
    if (p.unlockLevel > level || !(p.behindCounter ? level >= 3 : cats.includes(p.category))) continue;
    const active = state.activeEvents.some((event) => event.id === p.eventOnly);
    const stored = state.warehouse.some((lot) => lot.productId === p.id && lot.qty > 0)
      || state.shelves.some((row) => row.some((slot) => slot.productId === p.id && slot.qty > 0));
    if (active || stored) list.push(p);
  }
  // Giữ thứ tự danh mục như trước để khách bốc món theo cùng thứ tự (kết quả theo seed không đổi).
  if (list.length > baseUnlocked(level, shop).length) {
    const order = new Map(DATA.products.map((p, index) => [p.id, index]));
    list.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }
  return list;
}

/** Số kệ gốc (giai đoạn 1) dùng được theo level. */
export function shelfCount(level: number): number {
  return levelDef(level).shelves;
}

/** Nội thất đang giữ kệ `shelf`, nếu có. */
export function fixtureOfShelf(state: GameState, shelf: number): Fixture | undefined {
  return state.fixtures.find((f) => f.shelf === shelf);
}

/** Loại ô của kệ: kệ thường, tủ lạnh hay tủ đông. */
export function shelfKind(state: GameState, shelf: number): 'shelf' | 'fridge' | 'freezer' {
  const f = fixtureOfShelf(state, shelf);
  const kind = f ? furniture(f.type).kind : 'shelf';
  return kind === 'fridge' || kind === 'freezer' ? kind : 'shelf';
}

/** Kệ dùng được: có nội thất đang đặt, và 3 kệ gốc vẫn mở theo level. */
export function shelfUsable(state: GameState, shelf: number): boolean {
  const f = fixtureOfShelf(state, shelf);
  if (!state.shelves[shelf] || !f) return false;
  // Kệ / tủ đang hỏng (xem maintenance.ts): không bày, không bán được cho tới khi sửa.
  if (state.maintenance?.[`${state.activeStoreId}:f${f.uid}`]?.broken) return false;
  return shelf >= MAX_SHELVES || shelf < shelfCount(state.level);
}

/** Danh sách chỉ số các kệ dùng được, theo thứ tự. */
export function usableShelves(state: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.shelves.length; i++) if (shelfUsable(state, i)) out.push(i);
  return out;
}

/** Số lượng của một ô, tính theo lô nếu có. */
export function slotLots(slot: Slot): SlotLot[] {
  if (!slot.productId || slot.qty <= 0) return [];
  const lots = slot.lots ?? [];
  const inLots = lots.reduce((sum, l) => sum + l.qty, 0);
  if (inLots === slot.qty) return lots;
  // Bản lưu cũ hoặc ô được sửa trực tiếp: phần chênh lệch coi như hàng không hạn.
  const fixed = lots.filter((l) => l.qty > 0).map((l) => ({ ...l }));
  if (inLots < slot.qty) fixed.push({ qty: slot.qty - inLots, exp: null });
  else {
    let extra = inLots - slot.qty;
    for (let i = fixed.length - 1; i >= 0 && extra > 0; i--) {
      const cut = Math.min(extra, fixed[i].qty);
      fixed[i].qty -= cut;
      extra -= cut;
    }
  }
  slot.lots = sortLots(fixed.filter((l) => l.qty > 0));
  return slot.lots;
}

export function sortLots<T extends { exp: number | null }>(lots: T[]): T[] {
  return lots.sort((a, b) => (a.exp ?? Number.POSITIVE_INFINITY) - (b.exp ?? Number.POSITIVE_INFINITY));
}

/** Hạn sớm nhất của hàng trong ô (null: không hạn hoặc ô trống). */
export function slotEarliestExp(slot: Slot): number | null {
  return slotLots(slot)[0]?.exp ?? null;
}

/** Tồn trong kho của một món. */
export function warehouseQty(state: StoreData, productId: string): number {
  let total = 0;
  for (const lot of state.warehouse) if (lot.productId === productId) total += lot.qty;
  return total;
}

/** Tổng số lượng theo món trong kho. */
export function warehouseTotals(state: StoreData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lot of state.warehouse) if (lot.qty > 0) out[lot.productId] = (out[lot.productId] ?? 0) + lot.qty;
  return out;
}

/** Tồn trên kệ đang dùng được của một món. */
export function shelfQty(state: GameState, productId: string): number {
  let total = 0;
  for (const r of usableShelves(state)) for (const s of state.shelves[r]) if (s.productId === productId) total += s.qty;
  return total;
}

/** Tồn ở quầy (hàng sau quầy). */
export function counterQty(state: GameState, productId: string): number {
  return state.counter.reduce((sum, s) => sum + (s.productId === productId ? s.qty : 0), 0);
}

export function totalQty(state: GameState, productId: string): number {
  return warehouseQty(state, productId) + shelfQty(state, productId);
}

/** Giá bán hiện tại (người chơi đặt hoặc giá gợi ý). */
export function priceOf(productId: string, state?: GameState): number {
  const p = product(productId);
  return state?.prices[productId] ?? refPrice(p);
}

/** Số nguyên có dấu phẩy ngăn hàng nghìn: 2200 → "2,200". */
export function formatNumber(v: number): string {
  const sign = v < 0 ? '-' : '';
  return sign + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  return sign + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

export function formatClock(minute: number): string {
  const m = Math.max(0, Math.floor(minute));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Tạo kho dạng lô (không hạn) từ bảng số lượng theo món — tiện cho test và migrate. */
export function lotsFrom(record: Record<string, number>): Lot[] {
  return Object.entries(record).filter(([, qty]) => qty > 0).map(([productId, qty]) => ({ productId, qty, exp: null }));
}
