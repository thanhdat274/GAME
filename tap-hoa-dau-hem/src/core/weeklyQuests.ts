import { DATA, product } from './data';
import { Rng, daySeed } from './rng';
import type { GameState, WeeklyQuestState } from './state';

export function weekIndex(day: number): number { return Math.floor(Math.max(0, day - 1) / 7); }

/** Select a stable set of three weekly goals once per seven-day game week. */
export function ensureWeeklyQuests(state: GameState): void {
  if (state.level < 27) { state.weeklyQuests = null; return; }
  const week = weekIndex(state.day);
  if (state.weeklyQuests?.week === week) return;
  const rng = new Rng(daySeed(week + 1, 0x7ee7));
  const pool = [...DATA.weeklyQuests];
  const list: WeeklyQuestState[] = [];
  while (list.length < 3 && pool.length) list.push({ id: pool.splice(rng.int(0, pool.length - 1), 1)[0].id, progress: 0, claimed: false });
  state.weeklyQuests = { week, list, giftClaimed: false };
}

/** Accumulate today's actual shop results toward the current seven-day bundle. */
export function updateWeeklyQuestProgress(state: GameState): void {
  ensureWeeklyQuests(state);
  const weekly = state.weeklyQuests;
  if (!weekly) return;
  for (const entry of weekly.list) {
    if (entry.claimed) continue;
    const def = DATA.weeklyQuests.find((item) => item.id === entry.id);
    if (!def) continue;
    const amount = def.metric === 'served' ? state.today.served
      : def.metric === 'revenue' ? state.today.revenue
        : Object.entries(state.today.sold).reduce((sum, [id, qty]) => sum + (def.metric === 'soldTotal' || product(id).category === def.arg ? qty : 0), 0);
    entry.progress = Math.min(def.target, entry.progress + amount);
  }
}

export function claimWeeklyQuest(state: GameState, index: number): { ok: true; money: number; exp: number } | { ok: false } {
  const weekly = state.weeklyQuests;
  const entry = weekly?.list[index];
  const def = DATA.weeklyQuests.find((item) => item.id === entry?.id);
  if (!weekly || !entry || !def || entry.claimed || entry.progress < def.target) return { ok: false };
  entry.claimed = true;
  state.money += def.money;
  state.exp += def.exp;
  state.today.questMoney += def.money;
  state.today.expGained += def.exp;
  let giftMoney = 0;
  if (!weekly.giftClaimed && weekly.list.length > 0 && weekly.list.every((item) => item.claimed)) {
    weekly.giftClaimed = true;
    giftMoney = 150_000;
    state.money += giftMoney;
    const pool = DATA.decor.filter((item) => item.slot !== 'floor');
    const reward = pool[new Rng(daySeed(weekly.week + 1, 0x6f6f66)).int(0, Math.max(0, pool.length - 1))];
    if (reward && !state.decorOwned.includes(reward.id)) state.decorOwned.push(reward.id);
    else giftMoney += 25_000;
    if (giftMoney > 150_000) state.money += 25_000;
    state.today.questMoney += giftMoney;
  }
  return { ok: true, money: def.money + giftMoney, exp: def.exp };
}
