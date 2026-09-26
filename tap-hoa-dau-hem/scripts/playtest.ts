/**
 * Chơi thử tự động: nhiều bot với kỹ năng và phong cách nhập hàng khác nhau, mỗi bot chơi N ngày
 * trên nhiều seed. In báo cáo cân bằng: ngày lên level, lãi/ngày, tỉ lệ khách bỏ về theo lý do,
 * số lần phải nhờ "Bà gửi tiền".
 * Chạy: npm run playtest -- [số ngày=10] [số seed=20]
 */
import { makeChange } from '../src/core/change';
import { DATA, product } from '../src/core/data';
import { DaySession, endDay, openShop, startNextDay, type LeaveReason } from '../src/core/day';
import { Rng } from '../src/core/rng';
import { buyFixture, checkPaths, plotStatus, sellValue, unlockPlot } from '../src/core/layout';
import { createNewGame, formatMoney, totalQty, unlockedProducts, usableShelves, type GameState, warehouseQty } from '../src/core/state';
import { assignCounterSlot, autoArrange, buyStock, checkCart, nextWarehouseTier, stowHolding, suggestCart, upgradeWarehouse } from '../src/core/stock';

interface Bot {
  name: string;
  /** Giây giữa hai thao tác (lấy hàng, bấm nút). */
  react: number;
  /** Tự thối tay (có tip, có thể sai) hay để game tự thối. */
  manualChange: boolean;
  /** Xác suất thối sai khi thối tay. */
  mistake: number;
  /** Nạp kệ khi còn bao nhiêu món (-1 = không bao giờ nạp). */
  refillAt: number;
  /** Hệ số nhập hàng so với bán hôm qua (khi tự nhập). */
  stockFactor: number;
  /** Dùng nút "Gợi ý" để nhập hàng. */
  useSuggest: boolean;
}

const BOTS: Bot[] = [
  { name: 'Người mới (chậm, quên nạp kệ, tự nhập theo "hôm qua bán")', react: 1.1, manualChange: false, mistake: 0, refillAt: -1, stockFactor: 1.0, useSuggest: false },
  { name: 'Bình thường (tự thối, bấm Gợi ý)', react: 0.7, manualChange: false, mistake: 0, refillAt: 1, stockFactor: 1.3, useSuggest: true },
  { name: 'Săn tip (thối tay, bấm Gợi ý)', react: 0.6, manualChange: true, mistake: 0.1, refillAt: 1, stockFactor: 1.3, useSuggest: true },
  { name: 'Cao thủ (bấm Gợi ý)', react: 0.35, manualChange: true, mistake: 0.02, refillAt: 2, stockFactor: 1.5, useSuggest: true },
];

interface RunStats {
  levelDay: Record<number, number>;
  profits: number[];
  served: number;
  left: Record<Exclude<LeaveReason, 'served'>, number>;
  grandma: number;
  finalMoney: number;
  tips: number;
  /** Đơn vị hàng tươi bán được / bị hỏng. */
  freshSold: number;
  freshSpoiled: number;
  netProfits: number[];
}

/** Đặt nội thất vào chỗ trống đầu tiên hợp lệ mà không chặn lối đi. */
function placeSomewhere(s: GameState, type: string): boolean {
  for (let y = 0; y < DATA.land.rows; y++) for (let x = 0; x < DATA.land.cols; x++) for (const rot of [0, 1] as const) {
    const money = s.money;
    if (buyFixture(s, type, x, y, rot) !== 'ok') continue;
    if (checkPaths(s).ok) return true;
    // Chặn lối đi: hoàn tác.
    const f = s.fixtures.pop()!;
    if (f.shelf !== undefined) s.shelves[f.shelf] = s.shelves[f.shelf].map(() => ({ productId: null, qty: 0 }));
    s.nextUid--;
    s.money = money;
  }
  return false;
}

/** Chiến lược mở rộng hợp lý: mở đất khi dư vốn, mua tủ lạnh/tủ đông, thêm kệ, nâng kho. */
function expand(s: GameState): void {
  const reserve = 250_000;
  const has = (type: string) => s.fixtures.filter((f) => f.type === type).length;
  for (const id of ['A', 'B', 'C']) if (plotStatus(s, id) === 'available' && s.money - DATA.land.plots.find((p) => p.id === id)!.cost > reserve) unlockPlot(s, id);
  if (s.level >= 5 && has('fridge') < (s.level >= 7 ? 2 : 1) && s.money > reserve + 120_000) placeSomewhere(s, 'fridge');
  if (s.level >= 9 && has('freezer') < 1 && s.money > reserve + 180_000) placeSomewhere(s, 'freezer');
  if (s.level >= 5 && has('shelf') < 4 && s.money > reserve + 80_000) placeSomewhere(s, 'shelf');
  if (s.level >= 8 && has('shelf') < 5 && s.money > reserve * 2) placeSomewhere(s, 'shelf');
  const tier = nextWarehouseTier(s);
  if (tier && s.level >= tier.unlockLevel && s.money - tier.cost > reserve) upgradeWarehouse(s);
  if (s.land.includes('C') && has('storage_rack') < 2 && s.money > reserve + 50_000) placeSomewhere(s, 'storage_rack');
  void sellValue;
}

function restock(s: GameState, bot: Bot): void {
  if (bot.useSuggest) {
    buyStock(s, suggestCart(s));
    return;
  }
  const products = unlockedProducts(s.level).sort((a, b) => a.cost - b.cost);
  const cart: Record<string, number> = {};
  // Nhập vòng tròn từng món một để tiền được chia đều khi thiếu vốn.
  let progress = true;
  while (progress) {
    progress = false;
    for (const p of products) {
      const demand = s.yesterdaySold[p.id] ?? 0;
      const target = Math.max(6, Math.ceil(demand * bot.stockFactor));
      if (totalQty(s, p.id) + (cart[p.id] ?? 0) >= target) continue;
      cart[p.id] = (cart[p.id] ?? 0) + 1;
      if (checkCart(s, cart).ok) progress = true;
      else cart[p.id]--;
    }
  }
  buyStock(s, cart);
}

function playDay(s: GameState, bot: Bot, rng: Rng, stats: RunStats): void {
  openShop(s);
  s.settings.autoChange = !bot.manualChange;
  const d = new DaySession(s, rng.int(1, 1e9));
  d.events.on('bargainRequested', () => d.resolveBargain(true));
  d.events.on('creditRequested', (e) => d.resolveCredit(e.allowed));
  d.events.on('customerLeft', (e) => {
    if (e.reason !== 'served') stats.left[e.reason]++;
    else stats.served++;
  });
  let cooldown = 0;
  let wait = 0;
  while (!d.ended) {
    d.tick(0.1);
    cooldown -= 0.1;
    if (cooldown > 0) continue;
    if (bot.refillAt >= 0) {
      let did = false;
      for (const r of usableShelves(s)) {
        if (did) break;
        for (let c = 0; c < s.shelves[r].length && !did; c++) if (s.shelves[r][c].qty <= bot.refillAt && d.startRefill(r, c)) did = true;
      }
      if (did) {
        cooldown = bot.react;
        continue;
      }
    }
    const c = d.front;
    if (!c) continue;
    if (c.status === 'scanning') {
      if (!c.counterRequestResolved) {
        const line = c.order.find((item) => item.counterLine && item.missing === 0);
        const slot = line ? s.counter.findIndex((item) => item.productId === line.productId && item.qty > 0) : -1;
        if (slot >= 0) d.serveCounterRequest(slot);
      } else {
        const line = c.order.find((item) => item.picked > item.scanned);
        if (line) d.scanItem(line.productId);
      }
      cooldown = bot.react;
      wait = 0;
    } else if (c.status === 'paying') {
      wait += 0.1;
      if (wait < bot.react * 4) continue;
      const bills = makeChange(c.changeDue);
      if (rng.next() < bot.mistake) bills.pop();
      bills.forEach((b) => d.addBill(b));
      d.giveChange();
      cooldown = bot.react;
    }
  }
}

function run(bot: Bot, days: number, seed: number): RunStats {
  const rng = new Rng(seed);
  const s = createNewGame();
  const stats: RunStats = { levelDay: {}, profits: [], served: 0, left: { patience: 0, nothing: 0 }, grandma: 0, finalMoney: 0, tips: 0, freshSold: 0, freshSpoiled: 0, netProfits: [] };
  for (let i = 0; i < days; i++) {
    const before = s.money;
    stowHolding(s);
    s.holding = [];
    if (bot.useSuggest) expand(s);
    restock(s, bot);
    autoArrange(s);
    if (s.level >= 3) {
      const counterProduct = unlockedProducts(s.level).find((p) => p.behindCounter && warehouseQty(s, p.id) > 0);
      if (counterProduct) assignCounterSlot(s, 0, counterProduct.id);
    }
    playDay(s, bot, rng, stats);
    const sum = endDay(s);
    stats.tips += sum.tips;
    stats.profits.push(sum.grossProfit + sum.tips - sum.overpaid);
    stats.netProfits.push(sum.netProfit ?? 0);
    for (const [id, qty] of Object.entries(s.yesterdaySold)) if (product(id).shelfLifeDays) stats.freshSold += qty;
    for (const x of sum.spoiled ?? []) if (product(x.productId).shelfLifeDays) stats.freshSpoiled += x.qty;
    for (const lv of sum.levelUps) stats.levelDay[lv] ??= s.day;
    void before;
    const gift = startNextDay(s);
    if (gift > 0) stats.grandma++;
  }
  stats.finalMoney = s.money;
  return stats;
}

const days = Number(process.argv[2] ?? 10);
const seeds = Number(process.argv[3] ?? 20);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;

console.log(`Chơi thử tự động: ${BOTS.length} kiểu người chơi × ${seeds} ván × ${days} ngày\n`);
for (const bot of BOTS) {
  const runs = Array.from({ length: seeds }, (_, i) => run(bot, days, 1000 + i));
  const lv = (n: number) => {
    const ds = runs.map((r) => r.levelDay[n]).filter((d) => d !== undefined);
    return ds.length ? `ngày ${avg(ds).toFixed(1)} (${pct(ds.length, runs.length)} ván đạt)` : 'không đạt';
  };
  const served = runs.reduce((a, r) => a + r.served, 0);
  const pat = runs.reduce((a, r) => a + r.left.patience, 0);
  const noth = runs.reduce((a, r) => a + r.left.nothing, 0);
  const total = served + pat + noth;
  const day1 = avg(runs.map((r) => r.profits[0]));
  const late = avg(runs.flatMap((r) => r.profits.slice(-3)));
  console.log(`▶ ${bot.name}`);
  console.log(`  Lên Lv2: ${lv(2)} · Lv3: ${lv(3)} · Lv4: ${lv(4)}`);
  if (days > 10) console.log(`  Lv5: ${lv(5)} · Lv6: ${lv(6)} · Lv7: ${lv(7)} · Lv8: ${lv(8)} · Lv9: ${lv(9)}`);
  const fs = runs.reduce((a, r) => a + r.freshSold, 0);
  const fsp = runs.reduce((a, r) => a + r.freshSpoiled, 0);
  if (fs + fsp > 0) console.log(`  Hàng tươi hỏng: ${pct(fsp, fs + fsp)} (${fsp}/${fs + fsp} đơn vị) · lãi ròng 5 ngày cuối: ${formatMoney(avg(runs.flatMap((r) => r.netProfits.slice(-5))))}/ngày`);
  console.log(`  Lãi ngày 1: ${formatMoney(day1)} · lãi 3 ngày cuối: ${formatMoney(late)}/ngày · tip TB: ${formatMoney(avg(runs.map((r) => r.tips / days)))}/ngày`);
  console.log(`  Khách: phục vụ ${pct(served, total)} · bỏ về vì chờ lâu ${pct(pat, total)} · vì hết hàng ${pct(noth, total)}`);
  console.log(`  Tiền cuối: ${formatMoney(avg(runs.map((r) => r.finalMoney)))} · "Bà gửi tiền": ${runs.reduce((a, r) => a + r.grandma, 0)} lần / ${runs.length} ván\n`);
}
console.log(`(Vốn đầu ${formatMoney(DATA.balance.startMoney)}, một ngày = ${DATA.balance.daySeconds} giây thật)`);
