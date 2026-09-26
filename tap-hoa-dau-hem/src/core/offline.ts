import { runRestockRules } from './autorestock';
import { DATA, hasFeature, product } from './data';
import { ensureDailyQuests } from './quests';
import { payroll } from './staff';
import { emptyStats, priceOf, usableShelves, type GameState } from './state';
import { electricityCost, expireLots, receiveDeliveries, takeLots, takeOneFromSlot } from './stock';

export interface OfflineReport {
  /** Thời gian vắng được tính (giờ thật, đã giới hạn). */
  hours: number;
  days: number;
  revenue: number;
  cogs: number;
  wages: number;
  electricity: number;
  profit: number;
  sold: Record<string, number>;
  spoiled: Record<string, number>;
  /** Ngày tiệm hết hàng (null nếu đủ hàng suốt thời gian vắng). */
  outOfStockDay: number | null;
  restock: string[];
}

export function offlineUnlocked(state: GameState): boolean {
  return hasFeature(state.level, 'offline');
}

/**
 * Thời gian vắng (ms). Đã đăng nhập thì truyền `serverElapsedMs` (giờ máy chủ − updatedAt trên cloud)
 * để không bị chỉnh đồng hồ máy. Chơi khách: dùng giờ thiết bị; đồng hồ lùi trước `lastSeen` thì bỏ qua.
 */
export function offlineElapsed(state: GameState, now: number, serverElapsedMs?: number | null): number | null {
  if (typeof serverElapsedMs === 'number') return Math.max(0, serverElapsedMs);
  if (!state.lastSeen || now < state.lastSeen) {
    state.lastSeen = now;
    return null;
  }
  return now - state.lastSeen;
}

/** Nhu cầu bán mỗi ngày theo món: trung bình các ngày quản lý gần nhất × hiệu suất 60%. */
export function offlineDemand(state: GameState): Record<string, number> {
  const days = state.managerStats.slice(-DATA.balance.offline.historyDays);
  const out: Record<string, number> = {};
  if (!days.length) return out;
  for (const d of days) for (const [id, q] of Object.entries(d.sold)) out[id] = (out[id] ?? 0) + q;
  for (const id of Object.keys(out)) out[id] = (out[id] / days.length) * DATA.balance.offline.efficiency;
  return out;
}

/** Bán `want` đơn vị: lấy trên kệ trước rồi tới kho. Trả về số đã bán. */
function sellOffline(state: GameState, productId: string, want: number): number {
  let left = want;
  for (const r of usableShelves(state)) {
    for (const slot of state.shelves[r]) {
      while (left > 0 && slot.productId === productId && slot.qty > 0) {
        takeOneFromSlot(slot);
        left--;
      }
    }
  }
  if (left > 0) for (const lot of takeLots(state, productId, left)) left -= lot.qty;
  return want - left;
}

/**
 * Thu nhập offline bằng mô hình rút gọn (không chạy từng tick): mỗi ngày game tương đương,
 * chạy quy tắc tự nhập, bán theo nhu cầu × 60% trong giới hạn tồn kho, trừ lương, điện, hàng hỏng.
 * Chỉ tính khi đã mở chế độ quản lý, đang ở buổi sáng và có ít nhất 1 ngày quản lý làm mẫu.
 */
export function applyOfflineIncome(state: GameState, elapsedMs: number): OfflineReport | null {
  const cfg = DATA.balance.offline;
  if (!offlineUnlocked(state) || state.phase !== 'morning' || !state.managerStats.length) return null;
  const capped = Math.min(elapsedMs, cfg.maxHours * 3_600_000);
  const days = Math.floor(capped / (cfg.realMinutesPerDay * 60_000));
  if (days <= 0) return null;
  const demand = offlineDemand(state);
  const report: OfflineReport = {
    hours: capped / 3_600_000, days: 0, revenue: 0, cogs: 0, wages: 0, electricity: 0, profit: 0,
    sold: {}, spoiled: {}, outOfStockDay: null, restock: [],
  };
  for (let i = 0; i < days; i++) {
    state.today = emptyStats();
    report.restock.push(...runRestockRules(state).messages);
    let soldToday = 0;
    let wantToday = 0;
    for (const [id, perDay] of Object.entries(demand)) {
      const want = Math.round(perDay);
      if (want <= 0) continue;
      wantToday += want;
      const sold = sellOffline(state, id, want);
      if (!sold) continue;
      soldToday += sold;
      const revenue = sold * priceOf(id, state);
      report.sold[id] = (report.sold[id] ?? 0) + sold;
      report.revenue += revenue;
      report.cogs += sold * product(id).cost;
      state.money += revenue;
      state.lifetime.sold += sold;
    }
    if (soldToday === 0 && wantToday > 0) {
      report.outOfStockDay = state.day;
      break;
    }
    if (report.outOfStockDay === null && soldToday < wantToday * 0.5) report.outOfStockDay = state.day;
    report.wages += payroll(state).paid;
    const power = electricityCost(state);
    state.money -= power;
    report.electricity += power;
    receiveDeliveries(state, state.day, DATA.balance.closeMinute);
    for (const [id, q] of Object.entries(expireLots(state, state.day))) report.spoiled[id] = (report.spoiled[id] ?? 0) + q;
    state.day++;
    report.days++;
  }
  state.today = emptyStats();
  state.lastSummary = null;
  ensureDailyQuests(state);
  report.profit = report.revenue - report.cogs - report.wages - report.electricity;
  return report.days > 0 || report.outOfStockDay !== null ? report : null;
}
