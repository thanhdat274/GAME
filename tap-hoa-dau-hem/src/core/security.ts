import { DATA, hasFeature, product } from './data';
import { equipmentBroken } from './maintenance';
import { Rng, daySeed } from './rng';
import { formatMoney, usableShelves, type GameState } from './state';
import { takeOneFromSlot } from './stock';

const sec = () => DATA.balance.security;

/** Tiệm có báo công an không (cài đặt của từng tiệm chơi; mặc định có). */
export function callsPolice(state: GameState): boolean {
  return state.settings.callPolice !== false;
}

/**
 * Trộm đột nhập ban đêm khi tiệm đã đóng cửa: lấy tiền trong két (một phần doanh thu hôm trước) hoặc hàng trên kệ.
 * Bảo vệ (không xin nghỉ) trực đêm thì đuổi được; camera làm kẻ trộm ngại hơn; đèn hỏng thì tiệm tối, dễ bị nhắm hơn.
 * Tiệm báo công an thì mở hồ sơ, vài ngày sau có kết quả (xem `resolvePoliceCases`).
 * `yesterdayRevenue` = doanh thu ngày vừa đóng (tiền còn trong két qua đêm). Trả về thông báo buổi sáng.
 */
export function nightBurglary(state: GameState, yesterdayRevenue = 0): string[] {
  if (!hasFeature(state.level, 'thief')) return [];
  const cfg = sec();
  const rng = new Rng(daySeed(state.day, 0x6e1647));
  let chance = cfg.nightChance;
  if (state.camera && hasFeature(state.level, 'camera')) chance *= cfg.nightCameraMul;
  if (equipmentBroken(state, 'light')) chance *= 1.5;
  if (rng.next() >= chance) return [];
  const guard = state.staff.find((s) => s.role === 'guard' && !s.quitting);
  if (guard) return [`💂 Đêm qua có kẻ lạ cạy cửa tiệm, bảo vệ ${guard.name} trực đêm đã đuổi đi. Không mất gì!`];

  let lost: string;
  let value = 0;
  const drawer = Math.min(Math.max(0, state.money), yesterdayRevenue);
  if (drawer > 0 && rng.next() < cfg.nightCashChance) {
    value = Math.round((drawer * (cfg.nightCashMin + rng.next() * (cfg.nightCashMax - cfg.nightCashMin))) / 1000) * 1000;
    value = Math.max(1000, Math.min(value, state.money));
    state.money -= value;
    lost = `mất ${formatMoney(value)} tiền trong két`;
  } else {
    const slots: { productId: string; slot: GameState['shelves'][number][number] }[] = [];
    for (const r of usableShelves(state)) {
      for (const slot of state.shelves[r]) if (slot.productId && slot.qty > 0) slots.push({ productId: slot.productId, slot });
    }
    const total = slots.reduce((n, s) => n + s.slot.qty, 0);
    if (!total) return ['🌙 Đêm qua có trộm cạy cửa nhưng két và kệ trống trơn, không lấy được gì.'];
    const want = Math.min(cfg.nightMaxItems, Math.max(1, Math.round(total * (cfg.nightStealMin + rng.next() * (cfg.nightStealMax - cfg.nightStealMin)))));
    let taken = 0;
    for (let loop = 0; taken < want && loop < want * 4; loop++) {
      const pick = slots[rng.int(0, slots.length - 1)];
      if (takeOneFromSlot(pick.slot) === undefined) continue;
      taken++;
      value += product(pick.productId).cost;
    }
    lost = `mất ${taken} món trên kệ (giá vốn ${formatMoney(value)})`;
  }
  state.today.theftCost += value;
  state.today.thefts++;
  state.today.journal.push({ m: DATA.balance.openMinute, t: `Đêm qua bị trộm đột nhập: ${lost}` });
  const notes = [`🌙 Đêm qua tiệm bị trộm đột nhập, ${lost}. Thuê 💂 bảo vệ trực đêm hoặc lắp camera để phòng.`];
  if (callsPolice(state)) {
    const camera = state.camera && hasFeature(state.level, 'camera');
    const catchChance = Math.min(0.95, cfg.policeCatch + (camera ? cfg.policeCameraBonus : 0));
    state.policeCases ??= [];
    state.policeCases.push({
      day: state.day, value,
      resolveDay: state.day + rng.int(cfg.policeDaysMin, cfg.policeDaysMax),
      caught: rng.next() < catchChance,
    });
    notes.push(`🚓 Đã báo công an phường${camera ? ', nộp kèm hình camera' : ''}. Có kết quả điều tra trong vài ngày.`);
  }
  return notes;
}

/** Hồ sơ trộm tới hạn: công an bắt được thì trả lại tiền / tiền hàng bị mất. Trả về thông báo buổi sáng. */
export function resolvePoliceCases(state: GameState): string[] {
  const notes: string[] = [];
  const open = state.policeCases ?? [];
  for (const c of open.filter((item) => item.resolveDay <= state.day)) {
    const ago = state.day - c.day;
    if (c.caught) {
      state.money += c.value;
      state.today.policeRecovered = (state.today.policeRecovered ?? 0) + c.value;
      state.today.journal.push({ m: DATA.balance.openMinute, t: `Công an trả lại ${formatMoney(c.value)} từ vụ trộm` });
      notes.push(`🚓 Công an đã bắt được kẻ trộm đột nhập ${ago} ngày trước, trả lại tiệm ${formatMoney(c.value)}!`);
    } else {
      notes.push(`🚓 Công an chưa tìm ra kẻ trộm đột nhập ${ago} ngày trước, hồ sơ tạm đóng.`);
    }
  }
  state.policeCases = open.filter((item) => item.resolveDay > state.day);
  return notes;
}
