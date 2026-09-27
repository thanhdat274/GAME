/**
 * Chơi thử tự động: nhiều bot với kỹ năng và phong cách nhập hàng khác nhau, mỗi bot chơi N ngày
 * trên nhiều seed. In báo cáo cân bằng: ngày lên level, lãi/ngày, tỉ lệ khách bỏ về theo lý do,
 * số lần phải nhờ "Bà gửi tiền".
 * Chạy: npm run playtest -- [số ngày=10] [số seed=20] [chain = chỉ chạy kịch bản chuỗi tiệm xôi]
 */
import { makeChange } from '../src/core/change';
import { openBranch, visitStore } from '../src/core/branches';
import { DATA, product } from '../src/core/data';
import { DaySession, endDay, openShop, startNextDay, type LeaveReason } from '../src/core/day';
import { internalFee, setRecurringOrder } from '../src/core/internalSupply';
import { lastProductionReport } from '../src/core/production';
import { Rng } from '../src/core/rng';
import { marketWage } from '../src/core/staff';
import { placeAnywhere, plotStatus, sellValue, unlockPlot } from '../src/core/layout';
import { createNewGame, formatMoney, priceOf, storeView, totalQty, unlockedProducts, usableShelves, type GameState, type Staff, warehouseQty } from '../src/core/state';
import { assignCounterSlot, autoArrange, buyStock, checkCart, isPerishable, nextWarehouseTier, stowHolding, suggestCart, upgradeWarehouse } from '../src/core/stock';

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
  expByDay: number[];
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

const placeSomewhere = placeAnywhere;

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
  const stats: RunStats = { levelDay: {}, expByDay: [], profits: [], served: 0, left: { patience: 0, nothing: 0, thief: 0, closed: 0 }, grandma: 0, finalMoney: 0, tips: 0, freshSold: 0, freshSpoiled: 0, netProfits: [] };
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
    stats.expByDay.push(s.exp);
    stats.tips += sum.tips;
    stats.profits.push(sum.grossProfit + sum.tips - sum.overpaid);
    stats.netProfits.push(sum.netProfit ?? 0);
    for (const [id, qty] of Object.entries(s.yesterdaySold)) if (isPerishable(product(id))) stats.freshSold += qty;
    for (const x of sum.spoiled ?? []) if (isPerishable(product(x.productId))) stats.freshSpoiled += x.qty;
    for (const lv of sum.levelUps) stats.levelDay[lv] ??= s.day;
    void before;
    const gift = startNextDay(s);
    if (gift > 0) stats.grandma++;
  }
  stats.finalMoney = s.money;
  return stats;
}

/** Kịch bản chuỗi (6.1): tạp hóa L30 đứng chơi bằng "Gợi ý", tiệm xôi 1 thợ chạy vắng chủ. */
const CHAIN_LEVEL = 30;
/** Tiền mặt giả định khi người chơi vừa lên L30 (sau khi đã mở rộng mặt bằng). */
const CHAIN_START_MONEY = 3_000_000;
const CHAIN_WARMUP_DAYS = 3;
const CHAIN_MEASURE_DAYS = 7;
/** Đơn xôi gói định kỳ tạp hóa đặt từ tiệm xôi mỗi ngày. */
const CHAIN_ORDER: Record<string, number> = { xoi_man_goi: 2, xoi_dau_xanh_goi: 2, xoi_trung_goi: 2 };
/** Mức nguyên liệu tiệm xôi được mối sỉ bù mỗi sáng (người chơi đặt hàng cho tiệm xôi). */
const XOI_STOCK: Record<string, number> = { nep: 14, dau_xanh: 25, hanh_phi: 40, cha_bong: 20, lap_xuong: 20, dua_nao: 15, trung_ga: 20, bao_goi: 20, tra_da: 40, sua_dau_nanh: 15 };

function xoiCook(id: string, day: number): Staff {
  return {
    id, name: id, personality: 'diem_tinh', look: { shirt: '#fff', pants: '#000', hair: '#000', skin: '#fff' }, role: 'xoi_cook',
    stats: { speed: 5, accuracy: 5, friendly: 5, stamina: 5 }, wage: marketWage({ speed: 5, accuracy: 5, friendly: 5, stamina: 5 }), level: 1, exp: 0, mood: 70,
    hiredDay: day - 3, streak: 0, lowMoodDays: 0, quitting: false, scoldedDay: null,
    lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 },
  } as Staff;
}

/** Bù nguyên liệu kho tiệm xôi tới mức XOI_STOCK; trả về tiền mua theo giá vốn (kịch bản tự trừ vào quỹ tiệm xôi). */
function topUpXoi(state: GameState): number {
  const xoi = storeView(state, 'xoi');
  let cost = 0;
  for (const [id, target] of Object.entries(XOI_STOCK)) {
    const need = target - warehouseQty(xoi, id);
    if (need <= 0) continue;
    const life = product(id).shelfLifeDays;
    xoi.warehouse.push({ productId: id, qty: need, exp: life ? state.day + life - 1 : null });
    cost += need * product(id).cost;
  }
  return cost;
}

interface ChainRun {
  /** Lãi ròng tạp hóa từng ngày (tổng kết cuối ngày). */
  nets: number[];
  /** Phí xe đơn xôi gói giao tới tạp hóa, theo ngày giao. */
  fees: number[];
  /** Lãi tiệm xôi từng ngày (doanh thu − giá vốn − lương − hỏng). */
  xoiProfits: number[];
  made: number;
  riceSpoiled: number;
  /** Xôi gói bán được / bị bỏ ở tạp hóa. */
  goiSold: number;
  goiSpoiled: number;
  /** Lãi gộp xôi gói bán được − giá vốn xôi gói bỏ − phí xe, từng ngày (lãi tạp hóa có thêm nhờ đơn định kỳ). */
  goiGain: number[];
  /** Ngày (tính từ 0) đầu tiên còn đủ tiền mở Chợ sau khi nhập hàng Gợi ý; null nếu chưa. */
  marketDay: number | null;
}

function runChain(seed: number, withXoi: boolean): ChainRun {
  const rng = new Rng(seed);
  const s = createNewGame();
  s.level = CHAIN_LEVEL;
  s.day = 40;
  s.money = 8_000_000;
  for (let i = 0; i < 4; i++) expand(s);
  s.money = CHAIN_START_MONEY;
  // Tiền tiệm xôi (phí mở, nguyên liệu, doanh thu, lương) tách khỏi quỹ nhập hàng của tạp hóa để so lãi tạp hóa công bằng;
  // khi xét mở Chợ thì cộng lại vì tiền dùng chung toàn chuỗi.
  let xoiCash = 0;
  const run: ChainRun = { nets: [], fees: [], xoiProfits: [], made: 0, riceSpoiled: 0, goiSold: 0, goiSpoiled: 0, goiGain: [], marketDay: null };
  if (withXoi) {
    if (!openBranch(s, 'xoi').ok) throw new Error('Kịch bản chuỗi: không mở được tiệm xôi.');
    const openCost = DATA.branches.find((b) => b.id === 'xoi')!.cost;
    s.money += openCost;
    xoiCash -= openCost;
    visitStore(s, 'main');
    const xoi = storeView(s, 'xoi');
    xoi.staff = [xoiCook('xoi-a', s.day), xoiCook('xoi-b', s.day)];
    xoi.activeRecipes = ['xoi_man', 'xoi_dau_xanh', 'xoi_trung', 'xoi_dua'];
    xoi.soakBatches = [{ id: `sim-soak-${seed}`, kg: 8, startDay: s.day - 1, startMinute: 1200 }];
    s.stores.find((store) => store.id === 'xoi')!.simDay = s.day - 1;
    xoiCash -= topUpXoi(s);
    if (!setRecurringOrder(s, 'xoi', 'main', CHAIN_ORDER, true)) throw new Error('Kịch bản chuỗi: không tạo được đơn định kỳ.');
  }
  const marketCost = DATA.branches.find((b) => b.id === 'market')!.cost;
  const stats: RunStats = { levelDay: {}, expByDay: [], profits: [], served: 0, left: { patience: 0, nothing: 0, thief: 0, closed: 0 }, grandma: 0, finalMoney: 0, tips: 0, freshSold: 0, freshSpoiled: 0, netProfits: [] };
  const isGoi = (id: string) => CHAIN_ORDER[id] !== undefined;
  for (let d = 0; d < CHAIN_WARMUP_DAYS + CHAIN_MEASURE_DAYS; d++) {
    // Người chơi mở chi nhánh ở màn buổi sáng, trước khi bấm Gợi ý nhập hàng.
    if (run.marketDay === null && s.money + xoiCash >= marketCost) run.marketDay = d;
    stowHolding(s);
    s.holding = [];
    restock(s, BOTS[1]);
    autoArrange(s);
    if (!s.counter.some((slot) => slot.productId && slot.qty > 0)) {
      const counterProduct = unlockedProducts(s.level).find((p) => p.behindCounter && !p.recipeOnly && warehouseQty(s, p.id) > 0);
      if (counterProduct) assignCounterSlot(s, 0, counterProduct.id);
    }
    playDay(s, BOTS[1], rng, stats);
    const summary = endDay(s);
    run.nets.push(summary.netProfit ?? 0);
    const goiSold = Object.entries(s.yesterdaySold).filter(([id]) => isGoi(id));
    const goiSpoiled = (summary.spoiled ?? []).filter((x) => isGoi(x.productId));
    run.goiSold += goiSold.reduce((n, [, q]) => n + q, 0);
    run.goiSpoiled += goiSpoiled.reduce((n, x) => n + x.qty, 0);
    run.goiGain.push(goiSold.reduce((n, [id, q]) => n + q * (priceOf(id, s) - product(id).cost), 0)
      - goiSpoiled.reduce((n, x) => n + x.qty * product(x.productId).cost, 0));
    startNextDay(s);
    if (!withXoi) continue;
    const fee = s.internalOrders
      .filter((o) => o.toStoreId === 'main' && o.dueDay === s.day && (o.status === 'delivered' || o.status === 'short'))
      .reduce((n, o) => n + internalFee(Object.values(o.filled).reduce((m, q) => m + q, 0)), 0);
    run.fees.push(fee);
    run.goiGain[run.goiGain.length - 1] -= fee;
    const report = lastProductionReport(s, 'xoi');
    const record = storeView(s, 'xoi').analytics.at(-1);
    if (report && record) {
      s.money -= report.revenue - report.wages;
      xoiCash += report.revenue - report.wages;
      run.xoiProfits.push(record.profit);
      run.made += report.made;
      run.riceSpoiled += report.spoiled;
    }
    xoiCash -= topUpXoi(s);
  }
  return run;
}

function chainEconomy(seeds: number): {
  xoiProfit: number; marketProfit: number; groceryLiftPct: number; wastePct: number; marketDayBase: number | null; marketDayXoi: number | null; goiSold: number;
} {
  const market = DATA.branches.find((b) => b.id === 'market')!;
  const measured = (xs: number[]) => xs.slice(CHAIN_WARMUP_DAYS);
  const pairs = Array.from({ length: seeds }, (_, i) => ({ base: runChain(20_000 + i, false), xoi: runChain(20_000 + i, true) }));
  const baseNet = avg(pairs.flatMap((p) => measured(p.base.nets)));
  const made = pairs.reduce((n, p) => n + p.xoi.made, 0);
  const wasted = pairs.reduce((n, p) => n + p.xoi.riceSpoiled + p.xoi.goiSpoiled, 0);
  const days = (runs: ChainRun[]) => {
    const got = runs.map((r) => r.marketDay).filter((d): d is number => d !== null);
    return got.length === runs.length ? Math.max(...got) : null;
  };
  return {
    // Chi nhánh Chợ vắng chủ: lãi trung bình của tạp hóa × hiệu suất × lưu lượng khu.
    marketProfit: baseNet * market.efficiency * market.traffic,
    xoiProfit: avg(pairs.flatMap((p) => measured(p.xoi.xoiProfits))),
    groceryLiftPct: (100 * avg(pairs.flatMap((p) => measured(p.xoi.goiGain)))) / Math.max(Math.abs(baseNet), 1),
    wastePct: (100 * wasted) / Math.max(made + pairs.reduce((n, p) => n + p.xoi.riceSpoiled, 0), 1),
    marketDayBase: days(pairs.map((p) => p.base)),
    marketDayXoi: days(pairs.map((p) => p.xoi)),
    goiSold: pairs.reduce((n, p) => n + p.xoi.goiSold, 0) / (seeds * (CHAIN_WARMUP_DAYS + CHAIN_MEASURE_DAYS)),
  };
}

const days = Number(process.argv[2] ?? 10);
const seeds = Number(process.argv[3] ?? 20);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;

function printChain(): void {
  const economy = chainEconomy(Math.max(1, Math.min(seeds, Number(process.env.CHAIN_SEEDS ?? 3))));
  const ratio = (100 * economy.xoiProfit) / Math.max(economy.marketProfit, 1);
  const liftOk = economy.groceryLiftPct >= 5 && economy.groceryLiftPct <= 10;
  const marketOk = economy.marketDayXoi !== null;
  console.log(`▶ Kịch bản chuỗi L${CHAIN_LEVEL}: tạp hóa đứng chơi (Gợi ý) + tiệm xôi 2 thợ vắng chủ + đơn xôi gói định kỳ`);
  console.log(`  Lãi xôi: ${formatMoney(economy.xoiProfit)}/ngày · lãi Chợ (ước tính): ${formatMoney(economy.marketProfit)}/ngày · tỉ lệ: ${ratio.toFixed(1)}%`);
  console.log(`  Đơn định kỳ: bán ${economy.goiSold.toFixed(1)} xôi gói/ngày · lãi tạp hóa tăng ${economy.groceryLiftPct.toFixed(1)}% (lãi gộp xôi gói − gói bỏ − phí xe, so với lãi ròng tạp hóa) · xôi hỏng/bỏ: ${economy.wastePct.toFixed(1)}%`);
  console.log(`  Đủ tiền mở Chợ sau nhập hàng (vốn ${formatMoney(CHAIN_START_MONEY)}): không có xôi ngày ${economy.marketDayBase ?? '—'} · có xôi ngày ${economy.marketDayXoi ?? '—'}`);
  console.log(`  Mục tiêu: xôi 60–80% Chợ ${ratio >= 60 && ratio <= 80 ? 'ĐẠT' : 'CHƯA ĐẠT'} · đơn định kỳ +5–10% ${liftOk ? 'ĐẠT' : 'CHƯA ĐẠT'} · hỏng <10% ${economy.wastePct < 10 ? 'ĐẠT' : 'CHƯA ĐẠT'} · mở được Chợ ${marketOk ? 'ĐẠT' : 'CHƯA ĐẠT'}\n`);
}

const chainOnly = process.argv[4] === "chain";
if (!chainOnly) console.log(`Chơi thử tự động: ${BOTS.length} kiểu người chơi × ${seeds} ván × ${days} ngày\n`);
for (const bot of chainOnly ? [] : BOTS) {
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
  console.log(`  Lên Lv2: ${lv(2)} · Lv3: ${lv(3)} · Lv4: ${lv(4)} · Lv5: ${lv(5)} · Lv10: ${lv(10)} · Lv20: ${lv(20)} · Lv30: ${lv(30)} · Lv35: ${lv(35)}`);
  const expAt = (day: number) => avg(runs.map((r) => r.expByDay[Math.min(day, days) - 1] ?? 0));
  console.log(`  EXP lũy kế TB: ngày 5 ${expAt(5).toFixed(0)} · 10 ${expAt(10).toFixed(0)} · 20 ${expAt(20).toFixed(0)} · 35 ${expAt(35).toFixed(0)} · 60 ${expAt(60).toFixed(0)} · 80 ${expAt(80).toFixed(0)} · 100 ${expAt(100).toFixed(0)}`);
  const fs = runs.reduce((a, r) => a + r.freshSold, 0);
  const fsp = runs.reduce((a, r) => a + r.freshSpoiled, 0);
  if (fs + fsp > 0) console.log(`  Hàng tươi hỏng: ${pct(fsp, fs + fsp)} (${fsp}/${fs + fsp} đơn vị) · lãi ròng 5 ngày cuối: ${formatMoney(avg(runs.flatMap((r) => r.netProfits.slice(-5))))}/ngày`);
  console.log(`  Lãi ngày 1: ${formatMoney(day1)} · lãi 3 ngày cuối: ${formatMoney(late)}/ngày · tip TB: ${formatMoney(avg(runs.map((r) => r.tips / days)))}/ngày`);
  console.log(`  Khách: phục vụ ${pct(served, total)} · bỏ về vì chờ lâu ${pct(pat, total)} · vì hết hàng ${pct(noth, total)}`);
  console.log(`  Tiền cuối: ${formatMoney(avg(runs.map((r) => r.finalMoney)))} · "Bà gửi tiền": ${runs.reduce((a, r) => a + r.grandma, 0)} lần / ${runs.length} ván\n`);
}
printChain();
console.log(`(Vốn đầu ${formatMoney(DATA.balance.startMoney)}, một ngày = ${DATA.balance.daySeconds} giây thật)`);
