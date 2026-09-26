import { DATA, hasFeature } from './data';
import { shelfQty, unlockedProducts, warehouseQty, type DayRecord, type DaySummary, type GameState, type StaffDayPerf } from './state';

export function analyticsUnlocked(state: GameState): boolean {
  return hasFeature(state.level, 'analytics');
}

/** Ghi số liệu ngày vừa xong vào lịch sử, giữ `historyDays` ngày gần nhất. */
export function recordDay(state: GameState, summary: DaySummary): DayRecord {
  const t = state.today;
  const record: DayRecord = {
    day: summary.day,
    revenue: summary.revenue,
    profit: summary.netProfit ?? summary.grossProfit,
    cogs: summary.cogs,
    wages: (summary.wages ?? 0) + (summary.bonuses ?? 0),
    electricity: summary.electricity ?? 0,
    spoiled: summary.spoiledCost ?? 0,
    theft: summary.theftCost ?? 0,
    customers: summary.served + summary.left,
    avgRating: summary.avgRating,
    sold: { ...t.sold },
    hourly: [...t.hourly],
    staff: structuredClone(t.staffPerf),
    manager: t.managerDay,
  };
  state.analytics.push(record);
  const keep = DATA.balance.analytics.historyDays;
  if (state.analytics.length > keep) state.analytics.splice(0, state.analytics.length - keep);
  return record;
}

export function lastDays(state: GameState, n: number): DayRecord[] {
  return state.analytics.slice(-n);
}

/** Trung bình bán mỗi ngày của một món trong `days` ngày gần nhất (0 nếu chưa có số liệu). */
export function avgSold(state: GameState, productId: string, days = 7): number {
  const recs = lastDays(state, days);
  if (!recs.length) return 0;
  return recs.reduce((sum, r) => sum + (r.sold[productId] ?? 0), 0) / recs.length;
}

export function soldTotals(state: GameState, days: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of lastDays(state, days)) for (const [id, q] of Object.entries(r.sold)) out[id] = (out[id] ?? 0) + q;
  return out;
}

export function topSellers(state: GameState, days = 7, n = DATA.balance.analytics.topCount): { productId: string; qty: number }[] {
  return Object.entries(soldTotals(state, days))
    .map(([productId, qty]) => ({ productId, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, n);
}

/**
 * Món ế: đang có hàng (kệ hoặc kho) mà không bán được cái nào trong `slowDays` ngày gần nhất.
 * Cần đủ `slowDays` ngày lịch sử.
 */
export function slowMovers(state: GameState, n = DATA.balance.analytics.topCount): { productId: string; stock: number; hint: string }[] {
  const days = DATA.balance.analytics.slowDays;
  if (state.analytics.length < days) return [];
  const sold = soldTotals(state, days);
  return unlockedProducts(state.level, state)
    .filter((p) => !p.behindCounter && !sold[p.id])
    .map((p) => ({ productId: p.id, stock: shelfQty(state, p.id) + warehouseQty(state, p.id), hint: 'Giảm giá hoặc ngừng nhập' }))
    .filter((x) => x.stock > 0)
    .sort((a, b) => b.stock - a.stock)
    .slice(0, n);
}

/** Khách trung bình theo giờ mở cửa trong `days` ngày gần nhất. */
export function hourlyAverage(state: GameState, days = 7): number[] {
  const recs = lastDays(state, days);
  const out = Array.from({ length: Math.ceil((DATA.balance.closeMinute - DATA.balance.openMinute) / 60) }, () => 0);
  if (!recs.length) return out;
  for (const r of recs) r.hourly.forEach((v, i) => { out[i] += v; });
  return out.map((v) => v / recs.length);
}

export interface StaffRow extends StaffDayPerf {
  id: string;
  avgStars: number;
}

/** Bảng hiệu suất nhân viên cộng dồn `days` ngày gần nhất. */
export function staffTable(state: GameState, days = 7): StaffRow[] {
  const acc = new Map<string, StaffDayPerf>();
  for (const r of lastDays(state, days)) {
    for (const [id, p] of Object.entries(r.staff)) {
      const cur = acc.get(id) ?? { name: p.name, served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 };
      cur.name = p.name;
      cur.served += p.served;
      cur.mistakes += p.mistakes;
      cur.ratingSum += p.ratingSum;
      cur.ratingCount += p.ratingCount;
      cur.jobs += p.jobs;
      acc.set(id, cur);
    }
  }
  return [...acc.entries()]
    .map(([id, p]) => ({ id, ...p, avgStars: p.ratingCount ? p.ratingSum / p.ratingCount : 0 }))
    .sort((a, b) => b.served + b.jobs - (a.served + a.jobs));
}
