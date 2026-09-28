import { DATA } from './data';
import type { GameState } from './state';

export const PRESTIGE_EXP_PER_STAR = DATA.levels.prestigeExpPerStar;
const maxLevelExp = DATA.levels.levels[DATA.levels.maxLevel - 1].exp;

export function prestigeStars(state: GameState): number {
  if (state.level < DATA.levels.maxLevel) return 0;
  return Math.min(30, Math.floor(Math.max(0, state.exp - maxLevelExp) / PRESTIGE_EXP_PER_STAR));
}

export function prestigeRevenueMultiplier(state: GameState): number {
  return 1 + prestigeStars(state) * 0.01;
}

export function currentTitle(state: GameState): string {
  const stars = prestigeStars(state);
  return [...DATA.titles].reverse().find((title) => stars >= title.stars)?.name ?? 'Chủ tiệm đầu hẻm';
}
