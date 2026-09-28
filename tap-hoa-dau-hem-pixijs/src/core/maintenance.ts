import { DATA, furniture, hasFeature, product } from './data';
import { Rng, daySeed } from './rng';
import { formatMoney, usableShelves, type Fixture, type GameState } from './state';
import { takeOneFromSlot } from './stock';

/**
 * Hao mòn & sửa chữa: kệ, tủ lạnh, tủ đông cùng bóng đèn, quạt của tiệm mòn dần theo ngày.
 * Mòn nhiều thì có thể hỏng qua đêm: hỏng nhẹ trả phí sửa, hỏng nặng không sửa được phải mua mới.
 * Đồ hỏng không dùng được (kệ không bày / bán được; đèn hỏng khách ít ghé; quạt hỏng khách nóng ruột).
 */
export interface WearState {
  /** 0..100. */
  wear: number;
  broken?: 'minor' | 'major';
}

export interface MaintenanceItem {
  /** Khóa trong `state.maintenance` (kèm id tiệm). */
  key: string;
  name: string;
  icon: string;
  /** Giá mua mới. */
  cost: number;
  wear: number;
  broken?: 'minor' | 'major';
  fixtureUid?: number;
}

const cfg = () => DATA.balance.maintenance;
/** Loại nội thất có hao mòn (quầy thu ngân và bàn ghế không tính). */
const WEARING = new Set(['shelf', 'fridge', 'freezer']);

export function maintenanceUnlocked(state: GameState): boolean {
  return hasFeature(state.level, 'decor');
}

const keyOf = (state: GameState, id: string) => `${state.activeStoreId}:${id}`;

function entry(state: GameState, key: string): WearState {
  state.maintenance ??= {};
  return (state.maintenance[key] ??= { wear: 0 });
}

/** Danh sách đồ cần bảo trì của tiệm đang đứng. */
export function maintenanceItems(state: GameState): MaintenanceItem[] {
  const out: MaintenanceItem[] = [];
  for (const eq of cfg().equipment) {
    const w = state.maintenance?.[keyOf(state, eq.id)] ?? { wear: 0 };
    out.push({ key: keyOf(state, eq.id), name: eq.name, icon: eq.icon, cost: eq.cost, wear: w.wear, broken: w.broken });
  }
  for (const f of state.fixtures) {
    const def = furniture(f.type);
    if (!WEARING.has(def.kind) || def.cost <= 0) continue;
    const w = state.maintenance?.[keyOf(state, `f${f.uid}`)] ?? { wear: 0 };
    out.push({ key: keyOf(state, `f${f.uid}`), name: def.name, icon: def.icon, cost: def.cost, wear: w.wear, broken: w.broken, fixtureUid: f.uid });
  }
  return out;
}

/** Nội thất đang hỏng (kệ hỏng không bày / bán được). */
export function fixtureBroken(state: GameState, f: Fixture): boolean {
  return !!state.maintenance?.[keyOf(state, `f${f.uid}`)]?.broken;
}

export function equipmentBroken(state: GameState, id: string): boolean {
  return !!state.maintenance?.[keyOf(state, id)]?.broken;
}

/** Hệ số khách ghé: đèn hỏng tiệm tối, khách ngại vào. */
export function maintenanceTrafficMul(state: GameState): number {
  return equipmentBroken(state, 'light') ? cfg().lightTrafficMul : 1;
}

/** Hệ số tốc độ mất kiên nhẫn: quạt hỏng thì nóng, khách chờ kém hơn. */
export function maintenancePatienceRate(state: GameState): number {
  return equipmentBroken(state, 'fan') ? 1 / cfg().fanPatienceMul : 1;
}

/** Phí sửa (hỏng nhẹ) hoặc bảo trì trước khi hỏng. */
export function repairCost(item: Pick<MaintenanceItem, 'cost'>): number {
  return Math.max(cfg().repairMin, Math.round((item.cost * cfg().repairPct) / 1000) * 1000);
}

/** Có đáng bảo trì chưa (mòn quá nửa mức hỏng). */
export function needsService(item: MaintenanceItem): boolean {
  return !item.broken && item.wear >= cfg().breakFrom * 0.7;
}

export type RepairResult = 'ok' | 'money' | 'major' | 'fine' | 'missing';

/** Sửa đồ hỏng nhẹ, hoặc bảo trì đồ đã mòn. Hỏng nặng thì không sửa được. */
export function repairItem(state: GameState, key: string): RepairResult {
  const item = maintenanceItems(state).find((i) => i.key === key);
  if (!item) return 'missing';
  if (item.broken === 'major') return 'major';
  if (!item.broken && !needsService(item)) return 'fine';
  const cost = repairCost(item);
  if (state.money < cost) return 'money';
  state.money -= cost;
  const w = entry(state, key);
  w.wear = Math.min(w.wear, cfg().repairWear);
  delete w.broken;
  return 'ok';
}

/** Mua mới thay đồ hỏng (giữ nguyên chỗ đặt). */
export function replaceItem(state: GameState, key: string): 'ok' | 'money' | 'missing' {
  const item = maintenanceItems(state).find((i) => i.key === key);
  if (!item) return 'missing';
  if (state.money < item.cost) return 'money';
  state.money -= item.cost;
  state.maintenance![key] = { wear: 0 };
  return 'ok';
}

/** Qua một đêm: đồ mòn thêm, đồ mòn nhiều có thể hỏng. Trả về thông báo buổi sáng. */
export function wearOvernight(state: GameState): string[] {
  if (!maintenanceUnlocked(state)) return [];
  const c = cfg();
  const rng = new Rng(daySeed(state.day, 0x3e4a1));
  const notes: string[] = [];
  for (const item of maintenanceItems(state)) {
    const w = entry(state, item.key);
    if (w.broken) continue;
    w.wear = Math.min(100, w.wear + rng.int(c.wearMin, c.wearMax));
    if (w.wear < c.breakFrom || rng.next() >= (w.wear - c.breakFrom) * c.breakPerWear) continue;
    w.broken = w.wear >= c.majorWear || rng.next() < c.majorChance ? 'major' : 'minor';
    notes.push(w.broken === 'major'
      ? `❌ ${item.icon} ${item.name} hỏng nặng, không sửa được: mua mới ${formatMoney(item.cost)} ở ☰ Tiệm → Sửa chữa.`
      : `🔧 ${item.icon} ${item.name} bị hỏng: gọi thợ sửa ${formatMoney(repairCost(item))} ở ☰ Tiệm → Sửa chữa.`);
  }
  // Dọn khóa của nội thất đã bán / cất đi.
  const live = new Set(maintenanceItems(state).map((i) => i.key));
  for (const key of Object.keys(state.maintenance ?? {})) {
    if (key.startsWith(`${state.activeStoreId}:f`) && !live.has(key)) delete state.maintenance![key];
  }
  return notes;
}

/**
 * Trộm đột nhập ban đêm khi tiệm đã đóng cửa. Bảo vệ (không xin nghỉ) trực đêm thì đuổi được;
 * camera làm kẻ trộm ngại hơn; đèn hỏng thì tiệm tối, dễ bị nhắm hơn.
 * Trả về thông báo buổi sáng (null nếu đêm yên ổn).
 */
export function nightBurglary(state: GameState): string | null {
  if (!hasFeature(state.level, 'thief')) return null;
  const sec = DATA.balance.security;
  const rng = new Rng(daySeed(state.day, 0x6e1647));
  let chance = sec.nightChance;
  if (state.camera && hasFeature(state.level, 'camera')) chance *= sec.nightCameraMul;
  if (equipmentBroken(state, 'light')) chance *= 1.5;
  if (rng.next() >= chance) return null;
  const guard = state.staff.find((s) => s.role === 'guard' && !s.quitting);
  if (guard) return `💂 Đêm qua có kẻ lạ cạy cửa tiệm, bảo vệ ${guard.name} trực đêm đã đuổi đi. Không mất gì!`;
  const slots: { productId: string; slot: GameState['shelves'][number][number] }[] = [];
  for (const r of usableShelves(state)) {
    for (const slot of state.shelves[r]) if (slot.productId && slot.qty > 0) slots.push({ productId: slot.productId, slot });
  }
  const total = slots.reduce((n, s) => n + s.slot.qty, 0);
  if (!total) return '🌙 Đêm qua có trộm cạy cửa nhưng kệ trống trơn, không lấy được gì.';
  const want = Math.min(sec.nightMaxItems, Math.max(1, Math.round(total * (sec.nightStealMin + rng.next() * (sec.nightStealMax - sec.nightStealMin)))));
  let taken = 0;
  let cost = 0;
  for (let guardLoop = 0; taken < want && guardLoop < want * 4; guardLoop++) {
    const pick = slots[rng.int(0, slots.length - 1)];
    if (pick.slot.qty <= 0) continue;
    if (takeOneFromSlot(pick.slot) === undefined) continue;
    taken++;
    cost += product(pick.productId).cost;
  }
  state.today.theftCost += cost;
  state.today.thefts++;
  state.today.journal.push({ m: DATA.balance.openMinute, t: `Đêm qua bị trộm đột nhập: mất ${taken} món trên kệ` });
  return `🌙 Đêm qua tiệm bị trộm đột nhập, mất ${taken} món trên kệ (giá vốn ${formatMoney(cost)}). Thuê 💂 bảo vệ trực đêm hoặc lắp camera để phòng.`;
}
