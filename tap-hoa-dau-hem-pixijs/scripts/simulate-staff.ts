/**
 * Mô phỏng giai đoạn 3 (task 9.1–9.2): bot chơi từ ván mới N ngày với nhiều chiến lược nhân sự.
 * - "Có nhân viên": thuê khi có chỗ, xếp ca tự động, quy tắc tự nhập, sơ đồ kệ, quản lý từ L20.
 * - "Tự bán": không thuê ai (so sánh lãi ròng từ L12).
 * - "Chỉ nhân viên": có nhân viên nhưng người chơi không đứng quầy ở L10–L19 (kiểm tra người chơi không thừa).
 * Chạy: npm run sim:staff -- [số ngày=60] [số seed=4]
 */
import { addRule, lockPlanogram } from '../src/core/autorestock';
import { soldTotals } from '../src/core/analytics';
import { DATA, hasFeature, type StaffRole } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless, setManagerMode, startNextDay } from '../src/core/day';
import { placeAnywhere, plotStatus, unlockPlot } from '../src/core/layout';
import { Rng } from '../src/core/rng';
import { autoSchedule, scheduleEnabled } from '../src/core/schedule';
import { ensureBoard, hire, letGo, retainStaff, roleUnlocked, staffSlots } from '../src/core/staff';
import { createNewGame, formatMoney, unlockedProducts, warehouseQty, type GameState } from '../src/core/state';
import {
  assignCounterSlot, autoArrange, buyStock, nextWarehouseTier, stowHolding, suggestCart, upgradeWarehouse,
} from '../src/core/stock';

type Strategy = 'staff' | 'solo' | 'staffOnly';

interface Result {
  levelDay: Record<number, number>;
  net: { level: number; profit: number; wages: number; revenue: number; gross: number; overpaid: number; left: number; spoiled: number; tips: number; debt: number; quest: number; theft: number }[];
  finalMoney: number;
  staffServed: number;
  playerServed: number;
  thefts: number;
  deliveries: number;
  quits: number;
  msPerDay: number;
  arrived: number;
  left: number;
}

const HIRE_ORDER: StaffRole[] = ['cashier', 'cashier', 'refill', 'delivery', 'cashier', 'stocker'];

/** Chỉ thuê vai trò có ích lúc đó: thu ngân thứ 2 khi có quầy 2, bổ sung kệ khi có trộm (L15). */
function worthHiring(s: GameState, role: StaffRole, nth: number): boolean {
  const counters = s.fixtures.filter((f) => f.type === 'counter' || f.type === 'counter2').length;
  if (role === 'cashier') return nth === 1 || nth <= counters * 2 - 1;
  if (role === 'refill') return hasFeature(s.level, 'thief');
  return true;
}

function expand(s: GameState): void {
  const reserve = 300_000;
  const has = (type: string) => s.fixtures.filter((f) => f.type === type).length;
  for (const p of DATA.land.plots) if (plotStatus(s, p.id) === 'available' && s.money - p.cost > reserve) unlockPlot(s, p.id);
  if (s.level >= 5 && has('fridge') < (s.level >= 7 ? 2 : 1) && s.money > reserve + 120_000) placeAnywhere(s, 'fridge');
  if (s.level >= 9 && has('freezer') < 1 && s.money > reserve + 180_000) placeAnywhere(s, 'freezer');
  if (s.level >= 5 && has('shelf') < 4 && s.money > reserve + 80_000) placeAnywhere(s, 'shelf');
  if (s.level >= 8 && has('shelf') < 5 && s.money > reserve * 2) placeAnywhere(s, 'shelf');
  if (s.land.includes('D') && has('counter2') < 1 && s.money > reserve + 300_000) placeAnywhere(s, 'counter2');
  if (s.land.includes('D') && has('shelf_double') < 2 && s.money > reserve + 160_000) placeAnywhere(s, 'shelf_double');
  if (s.land.includes('D') && has('fridge') < 3 && s.money > reserve + 120_000) placeAnywhere(s, 'fridge');
  const tier = nextWarehouseTier(s);
  if (tier && s.level >= tier.unlockLevel && s.money - tier.cost > reserve) upgradeWarehouse(s);
  if (s.land.includes('C') && has('storage_rack') < 2 && s.money > reserve + 50_000) placeAnywhere(s, 'storage_rack');
  if (hasFeature(s.level, 'camera') && !s.camera && s.money > reserve + DATA.balance.security.cameraCost) {
    s.money -= DATA.balance.security.cameraCost;
    s.camera = true;
  }
}

function manageStaff(s: GameState, strategy: Strategy, result: Result): void {
  if (strategy === 'solo') return;
  for (const st of [...s.staff]) {
    if (!st.quitting) continue;
    result.quits++;
    if (!retainStaff(s, st.id)) letGo(s, st.id);
  }
  const board = ensureBoard(s);
  while (s.staff.length < staffSlots(s.level)) {
    const role = HIRE_ORDER.find((r, i) => {
      const nth = HIRE_ORDER.slice(0, i + 1).filter((y) => y === r).length;
      return roleUnlocked(s, r) && s.staff.filter((x) => x.role === r).length < nth && worthHiring(s, r, nth);
    });
    if (!role) break;
    // Chọn ứng viên có chỉ số chính cao nhất cho vai trò cần.
    const main = DATA.staff.roles.find((r) => r.id === role)!.mainStat;
    const pick = [...board].sort((a, b) => b.stats[main] - a.stats[main] || a.wage - b.wage)[0];
    if (!pick || hire(s, pick.id, role) !== 'ok') break;
    board.splice(board.indexOf(pick), 1);
    if (scheduleEnabled(s)) autoSchedule(s);
  }
  if (scheduleEnabled(s) && !s.scheduleReady) autoSchedule(s);
  // Quy tắc tự nhập cho 12 món bán chạy nhất (7 ngày).
  if (hasFeature(s.level, 'autorestock') && s.rules.length === 0) {
    const top = Object.entries(soldTotals(s, 7)).sort((a, b) => b[1] - a[1]).slice(0, 12);
    for (const [productId, qty] of top) addRule(s, { productId, threshold: Math.ceil(qty / 7), qty: Math.max(10, Math.ceil((qty / 7) * 2)), supplierId: 'co_tu' });
  }
  if (strategy === 'staff' && hasFeature(s.level, 'manager') && s.staff.filter((x) => x.role === 'cashier').length >= 2) setManagerMode(s, true);
}

function run(strategy: Strategy, days: number, seed: number): Result {
  const rng = new Rng(seed);
  const s = createNewGame();
  const result: Result = { levelDay: {}, net: [], finalMoney: 0, staffServed: 0, playerServed: 0, thefts: 0, deliveries: 0, quits: 0, msPerDay: 0, arrived: 0, left: 0 };
  let ms = 0;
  for (let i = 0; i < days; i++) {
    stowHolding(s);
    s.holding = [];
    expand(s);
    manageStaff(s, strategy, result);
    buyStock(s, suggestCart(s));
    autoArrange(s);
    if (hasFeature(s.level, 'stocker') && !s.planogram) lockPlanogram(s);
    if (s.level >= 3) {
      const counterProduct = unlockedProducts(s.level).find((p) => p.behindCounter && warehouseQty(s, p.id) > 0);
      if (counterProduct) assignCounterSlot(s, 0, counterProduct.id);
    }
    const level = s.level;
    openShop(s);
    // "Chỉ nhân viên": người chơi không đứng quầy khi đã có thu ngân (giả lập chế độ quản lý sớm).
    if (strategy === 'staffOnly' && s.staff.some((x) => x.role === 'cashier')) s.today.managerDay = true;
    const d = new DaySession(s, rng.int(1, 1e9));
    d.autoPlayerReact = s.today.managerDay ? 0 : REACT;
    const t0 = performance.now();
    runDayHeadless(d, 40_000);
    ms += performance.now() - t0;
    const perf = Object.values(s.today.staffPerf).reduce((n, p) => n + p.served, 0);
    result.staffServed += perf;
    result.playerServed += s.today.served - perf;
    result.thefts += s.today.thefts;
    result.arrived += s.today.hourly.reduce((a, b) => a + b, 0);
    result.left += s.today.left;
    result.deliveries += s.today.deliveries;
    const sum = endDay(s);
    result.net.push({ level, profit: sum.netProfit ?? 0, wages: sum.wages ?? 0, revenue: sum.revenue, gross: sum.grossProfit, overpaid: sum.overpaid, left: sum.left, spoiled: sum.spoiledCost ?? 0, tips: sum.tips, debt: (sum.debtCollectedAmount ?? 0) - (sum.badDebt ?? 0), quest: s.today.questMoney, theft: sum.theftCost ?? 0 });
    for (const l of sum.levelUps) result.levelDay[l] ??= s.day;
    startNextDay(s);
  }
  result.finalMoney = s.money;
  result.msPerDay = ms / days;
  return result;
}

const days = Number(process.argv[2] ?? 60);
const REACT = Number(process.argv[4] ?? 1.5);
const seeds = Number(process.argv[3] ?? 4);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const results: Record<Strategy, Result[]> = { staff: [], solo: [], staffOnly: [] };
for (const strategy of Object.keys(results) as Strategy[]) {
  for (let i = 0; i < seeds; i++) results[strategy].push(run(strategy, days, 1000 + i * 7919));
}

const label: Record<Strategy, string> = { staff: 'Có nhân viên + người chơi đứng quầy', solo: 'Tự bán (không thuê)', staffOnly: 'Chỉ nhân viên (người chơi không bán)' };
for (const strategy of Object.keys(results) as Strategy[]) {
  const rs = results[strategy];
  console.log(`\n=== ${label[strategy]} (${rs.length} seed × ${days} ngày) ===`);
  for (const lv of [10, 12, 15, 18, 20]) {
    const ds = rs.map((r) => r.levelDay[lv]).filter((x) => x !== undefined);
    console.log(`  Lên L${lv}: ${ds.length ? `ngày ~${avg(ds).toFixed(1)} (${ds.length}/${rs.length} seed)` : 'chưa đạt'}`);
  }
  for (const [from, to] of [[10, 11], [12, 14], [15, 19], [20, 20]]) {
    const xs = rs.flatMap((r) => r.net.filter((n) => n.level >= from && n.level <= to));
    if (!xs.length) continue;
    console.log(`  Lãi ròng/ngày L${from}–L${to}: ${formatMoney(avg(xs.map((x) => x.profit)))} (lương ${formatMoney(avg(xs.map((x) => x.wages)))} · doanh thu ${formatMoney(avg(xs.map((x) => x.revenue)))} · lãi gộp ${formatMoney(avg(xs.map((x) => x.gross)))} · thối dư ${formatMoney(avg(xs.map((x) => x.overpaid)))} · hỏng ${formatMoney(avg(xs.map((x) => x.spoiled)))} · bỏ về ${avg(xs.map((x) => x.left)).toFixed(1)} · tip ${formatMoney(avg(xs.map((x) => x.tips)))} · thu nợ ${formatMoney(avg(xs.map((x) => x.debt)))} · nhiệm vụ ${formatMoney(avg(xs.map((x) => x.quest)))} · trộm ${formatMoney(avg(xs.map((x) => x.theft)))})`);
  }
  console.log(`  Khách: tới ${Math.round(avg(rs.map((r) => r.arrived)))} · bỏ về ${Math.round(avg(rs.map((r) => r.left)))} · người chơi phục vụ ${Math.round(avg(rs.map((r) => r.playerServed)))} · nhân viên ${Math.round(avg(rs.map((r) => r.staffServed)))}`);
  console.log(`  Tiền cuối: ${formatMoney(avg(rs.map((r) => r.finalMoney)))} · mất trộm ${avg(rs.map((r) => r.thefts)).toFixed(1)} lần · giao hàng ${avg(rs.map((r) => r.deliveries)).toFixed(1)} đơn · nghỉ việc ${avg(rs.map((r) => r.quits)).toFixed(1)}`);
  console.log(`  Thời gian mô phỏng: ${avg(rs.map((r) => r.msPerDay)).toFixed(0)} ms/ngày`);
}
