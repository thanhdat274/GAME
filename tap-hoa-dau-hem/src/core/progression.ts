import { DATA, type LevelDef } from './data';
import type { GameState } from './state';

/** Level tương ứng với tổng EXP (bị giới hạn ở maxLevel). */
export function levelForExp(exp: number): number {
  let level = 1;
  for (const l of DATA.levels.levels) if (exp >= l.exp) level = l.level;
  return Math.min(level, DATA.levels.maxLevel);
}

export function nextLevelDef(level: number): LevelDef | null {
  return DATA.levels.levels.find((l) => l.level === level + 1) ?? null;
}

/** Tiến độ tới level kế tiếp trong [0, 1]; level tối đa thì trả 1. */
export function levelProgress(exp: number, level: number): number {
  const cur = DATA.levels.levels[level - 1];
  const next = nextLevelDef(level);
  if (!next) return 1;
  return Math.min(1, Math.max(0, (exp - cur.exp) / (next.exp - cur.exp)));
}

export function isAtCap(state: GameState): boolean {
  return state.level >= DATA.levels.maxLevel;
}

/** Áp dụng lên level theo EXP; trả về danh sách level vừa đạt được. */
export function applyLevelUps(state: GameState): LevelDef[] {
  const target = levelForExp(state.exp);
  const gained: LevelDef[] = [];
  while (state.level < target) {
    state.level++;
    gained.push(DATA.levels.levels[state.level - 1]);
  }
  return gained;
}

/** Ghi sao của một khách vào cửa sổ trượt. */
export function recordRating(state: GameState, stars: number): void {
  state.ratings.push(stars);
  const w = DATA.balance.ratingWindow;
  if (state.ratings.length > w) state.ratings.splice(0, state.ratings.length - w);
}

/** Sao trung bình; chưa có khách nào thì coi như 4. */
export function averageRating(state: GameState): number {
  if (state.ratings.length === 0) return 4;
  return state.ratings.reduce((a, b) => a + b, 0) / state.ratings.length;
}

/** Hệ số sinh khách theo sao: 0.8 .. 1.2. */
export function ratingSpawnMultiplier(avg: number): number {
  if (avg >= 4.5) return 1.2;
  if (avg >= 3.5) return 1.1;
  if (avg >= 2.5) return 1.0;
  if (avg >= 1.75) return 0.9;
  return 0.8;
}
