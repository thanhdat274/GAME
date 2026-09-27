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

/**
 * Tiến độ EXP để hiển thị: `into`/`span` là phần đã đi / độ dài của level hiện tại (khớp với thanh),
 * `remaining` là EXP còn thiếu, `nextExp` là mốc tổng EXP của level sau. Level tối đa thì `next` = null.
 */
export function levelStatus(exp: number, level: number): {
  level: number; next: number | null; into: number; span: number; remaining: number; nextExp: number | null; pct: number;
} {
  const cur = DATA.levels.levels[level - 1];
  const next = nextLevelDef(level);
  if (!next) return { level, next: null, into: 0, span: 0, remaining: 0, nextExp: null, pct: 1 };
  const span = next.exp - cur.exp;
  const into = Math.min(span, Math.max(0, exp - cur.exp));
  return { level, next: next.level, into, span, remaining: Math.max(0, next.exp - exp), nextExp: next.exp, pct: span ? into / span : 1 };
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
    if (state.level >= 21 && DATA.land.plots.some((plot) => plot.id === 'H') && !state.land.includes('H')) {
      state.land.push('H');
      state.lifetime.landsOpened = state.land.filter((id) => !DATA.land.plots.find((plot) => plot.id === id)?.generatorOnly).length;
    }
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

/** Hệ số lượng khách theo level (tiệm nổi tiếng dần ở giai đoạn 3); mặc định 1. */
export function trafficMultiplier(level: number): number {
  let mul = 1;
  for (const l of DATA.levels.levels) if (l.level <= level && l.traffic !== undefined) mul = l.traffic;
  return mul;
}
