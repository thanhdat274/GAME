import { DATA, product, type Category, type LevelDef, type Product } from './data';

export type Phase = 'morning' | 'open' | 'summary';

export interface Slot {
  productId: string | null;
  qty: number;
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
  sold: Record<string, number>;
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
  levelUps: number[];
  capReached: boolean;
}

export interface Settings {
  sound: boolean;
  /** Tự động thối tiền (mặc định bật). Tắt để tự thối và có cơ hội nhận tip. */
  autoChange: boolean;
}

export interface GameState {
  version: 1;
  day: number;
  phase: Phase;
  /** Phút trong ngày (480 = 08:00) khi đang mở cửa. */
  clock: number;
  money: number;
  exp: number;
  level: number;
  warehouse: Record<string, number>;
  /** Luôn có 3 kệ; số kệ dùng được phụ thuộc level. */
  shelves: Slot[][];
  ratings: number[];
  yesterdaySold: Record<string, number>;
  today: DayStats;
  lastGrandmaDay: number;
  seenIntro: boolean;
  settings: Settings;
  /** Tổng kết ngày vừa xong (để hiện lại nếu người chơi thoát ở màn tổng kết). */
  lastSummary: DaySummary | null;
  /** Level đã được giới thiệu mặt hàng mới (tránh hiện lại popup). */
  announcedLevel: number;
}

export const MAX_SHELVES = 3;

export function emptyStats(): DayStats {
  return { revenue: 0, cogs: 0, tips: 0, overpaid: 0, served: 0, happy: 0, left: 0, ratingSum: 0, ratingCount: 0, expGained: 0, sold: {} };
}

export function createNewGame(): GameState {
  const b = DATA.balance;
  return {
    version: 1,
    day: 1,
    phase: 'morning',
    clock: b.openMinute,
    money: b.startMoney,
    exp: 0,
    level: 1,
    warehouse: {},
    shelves: Array.from({ length: MAX_SHELVES }, () =>
      Array.from({ length: b.slotsPerShelf }, () => ({ productId: null, qty: 0 })),
    ),
    ratings: [],
    yesterdaySold: {},
    today: emptyStats(),
    lastGrandmaDay: -99,
    seenIntro: false,
    settings: { sound: true, autoChange: true },
    lastSummary: null,
    announcedLevel: 1,
  };
}

export function levelDef(level: number): LevelDef {
  const levels = DATA.levels.levels;
  return levels[Math.min(level, levels.length) - 1];
}

export function unlockedCategories(level: number): Category[] {
  return levelDef(level).categories;
}

export function unlockedProducts(level: number): Product[] {
  const cats = unlockedCategories(level);
  return DATA.products.filter((p) => p.unlockLevel <= level && cats.includes(p.category));
}

export function shelfCount(level: number): number {
  return levelDef(level).shelves;
}

/** Tồn trên kệ đang dùng được của một món. */
export function shelfQty(state: GameState, productId: string): number {
  let total = 0;
  state.shelves.slice(0, shelfCount(state.level)).forEach((row) =>
    row.forEach((s) => {
      if (s.productId === productId) total += s.qty;
    }),
  );
  return total;
}

export function totalQty(state: GameState, productId: string): number {
  return (state.warehouse[productId] ?? 0) + shelfQty(state, productId);
}

export function priceOf(productId: string): number {
  return product(productId).price;
}

export function formatMoney(v: number): string {
  const sign = v < 0 ? '-' : '';
  return sign + Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

export function formatClock(minute: number): string {
  const m = Math.max(0, Math.floor(minute));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
