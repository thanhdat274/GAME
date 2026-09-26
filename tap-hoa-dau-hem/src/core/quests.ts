import { DATA, decor, product, type AchievementDef, type QuestDef } from './data';
import { Rng, daySeed } from './rng';
import type { GameState } from './state';

export function questDef(id: string): QuestDef {
  const q = DATA.quests.find((item) => item.id === id);
  if (!q) throw new Error(`Không có nhiệm vụ ${id}`);
  return q;
}

export function questsUnlocked(state: GameState): boolean {
  return state.level >= DATA.balance.quests.unlockLevel;
}

function eligible(state: GameState): QuestDef[] {
  return DATA.quests.filter((q) => q.minLevel <= state.level);
}

/** Rút 3 nhiệm vụ cho ngày hiện tại nếu chưa có. */
export function ensureDailyQuests(state: GameState): void {
  if (!questsUnlocked(state)) {
    state.quests = null;
    return;
  }
  if (state.quests?.day === state.day) return;
  const rng = new Rng(daySeed(state.day, 0x9e57));
  const pool = [...eligible(state)];
  const list = [];
  while (list.length < DATA.balance.quests.perDay && pool.length) {
    const i = Math.floor(rng.next() * pool.length);
    list.push({ id: pool.splice(i, 1)[0].id, claimed: false });
  }
  state.quests = { day: state.day, list, rerollUsed: false };
}

/** Tiến độ hiện tại của nhiệm vụ, tính từ số liệu trong ngày. */
export function questProgress(state: GameState, q: QuestDef): number {
  const t = state.today;
  const soldIn = (pred: (id: string) => boolean) => Object.entries(t.sold).reduce((sum, [id, qty]) => sum + (pred(id) ? qty : 0), 0);
  switch (q.metric) {
    case 'soldCategory': return soldIn((id) => product(id).category === q.arg);
    case 'soldProduct': return t.sold[q.arg ?? ''] ?? 0;
    case 'soldTotal': return soldIn(() => true);
    case 'served': return t.served;
    case 'happy': return t.happy;
    case 'revenue': return t.revenue;
    case 'itemsScanned': return t.itemsScanned;
    case 'counterServed': return t.counterServed;
    case 'debtCollected': return t.debtCollected;
    // Hai nhiệm vụ "không để..." chỉ xét khi ngày đã kết thúc.
    case 'leftAtMost': return state.phase === 'summary' && t.served > 0 && t.left <= q.target ? q.target : 0;
    case 'noSpoil': return state.phase === 'summary' && Object.keys(t.spoiled).length === 0 ? 1 : 0;
  }
}

export function questDone(state: GameState, q: QuestDef): boolean {
  return questProgress(state, q) >= q.target;
}

export type ClaimResult = { ok: true; money: number; exp: number } | { ok: false; reason: 'missing' | 'claimed' | 'not-done' };

export function claimQuest(state: GameState, index: number): ClaimResult {
  const entry = state.quests?.list[index];
  if (!entry) return { ok: false, reason: 'missing' };
  if (entry.claimed) return { ok: false, reason: 'claimed' };
  const q = questDef(entry.id);
  if (!questDone(state, q)) return { ok: false, reason: 'not-done' };
  entry.claimed = true;
  state.money += q.money;
  state.exp += q.exp;
  state.today.questMoney += q.money;
  state.today.expGained += q.exp;
  return { ok: true, money: q.money, exp: q.exp };
}

/** Tự nhận các nhiệm vụ đã xong mà người chơi quên bấm "Nhận" (gọi trước khi sang ngày). */
export function claimAllDone(state: GameState): number {
  let money = 0;
  state.quests?.list.forEach((_, i) => {
    const r = claimQuest(state, i);
    if (r.ok) money += r.money;
  });
  return money;
}

/** Đổi một nhiệm vụ chưa làm (1 lần/ngày). */
export function rerollQuest(state: GameState, index: number): boolean {
  const qs = state.quests;
  const entry = qs?.list[index];
  if (!qs || !entry || qs.rerollUsed || entry.claimed || questProgress(state, questDef(entry.id)) > 0) return false;
  const taken = new Set(qs.list.map((q) => q.id));
  const pool = eligible(state).filter((q) => !taken.has(q.id));
  if (!pool.length) return false;
  const rng = new Rng(daySeed(state.day, 0x5eed + index));
  qs.list[index] = { id: pool[Math.floor(rng.next() * pool.length)].id, claimed: false };
  qs.rerollUsed = true;
  return true;
}

// ---------- Thành tựu ----------

export function achievementProgress(state: GameState, a: AchievementDef): number {
  return state.lifetime[a.metric] ?? 0;
}

/** Mở khóa thành tựu mới đạt; trả về danh sách vừa mở. */
export function checkAchievements(state: GameState): AchievementDef[] {
  const unlocked: AchievementDef[] = [];
  for (const a of DATA.achievements) {
    if (state.achievements.includes(a.id) || achievementProgress(state, a) < a.target) continue;
    state.achievements.push(a.id);
    if (a.money) state.money += a.money;
    if (a.decor && !state.decorOwned.includes(a.decor) && decor(a.decor).slot !== 'floor') state.decorOwned.push(a.decor);
    unlocked.push(a);
  }
  return unlocked;
}
