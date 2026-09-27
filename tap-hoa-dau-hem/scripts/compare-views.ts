/**
 * So sánh cân bằng giữa góc nhìn ngang và góc nhìn trên xuống (người chơi phải đi tới kệ để nạp,
 * rời quầy thì khách đầu hàng phải chờ). Cùng một bot "Bình thường", cùng seed, chạy N ngày.
 * Chạy: npm run compare:views -- [số ngày=10] [số seed=10]
 */
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop, startNextDay } from '../src/core/day';
import { Rng } from '../src/core/rng';
import { placeAnywhere, unlockPlot } from '../src/core/layout';
import { createNewGame, formatMoney, usableShelves, type GameState } from '../src/core/state';
import { autoArrange, buyStock, stowHolding, suggestCart } from '../src/core/stock';
import { playerTripSeconds } from '../src/core/topDown';

type Mode = 'side' | 'topdown';
interface Stats { served: number; patience: number; nothing: number; profit: number; money: number }

const REACT = 0.7;
/** Tham số tùy chọn: [ngày] [seed] [hệ số kiên nhẫn khi vắng chủ] [big]. */
if (process.argv[4]) DATA.balance.topDown.awayPatienceRate = Number(process.argv[4]);
const BIG = process.argv[5] === 'big';
const REFILL_AT = 1;

/** Ô cần nạp đầu tiên (còn ≤ REFILL_AT món và nạp được). */
function wantedRefill(s: GameState, d: DaySession): { shelf: number; slot: number } | null {
  for (const r of usableShelves(s)) for (let c = 0; c < s.shelves[r].length; c++) {
    const slot = s.shelves[r][c];
    if (slot.productId && slot.qty <= REFILL_AT && d.isRefilling(r, c) === null) {
      if ((s.warehouse.some((l) => l.productId === slot.productId && l.qty > 0))) return { shelf: r, slot: c };
    }
  }
  return null;
}

function playDay(s: GameState, mode: Mode, rng: Rng, st: Stats): void {
  openShop(s);
  const d = new DaySession(s, rng.int(1, 1e9));
  d.events.on('bargainRequested', () => d.resolveBargain(true));
  d.events.on('creditRequested', (e) => d.resolveCredit(e.allowed));
  d.events.on('customerLeft', (e) => { if (e.reason === 'served') st.served++; else if (e.reason === 'patience') st.patience++; else if (e.reason === 'nothing') st.nothing++; });
  let cooldown = 0;
  // Góc trên xuống: trạng thái đi lại của người chơi.
  let trip: { phase: 'go' | 'refill' | 'back'; left: number; shelf: number } | null = null;
  while (!d.ended) {
    d.tick(0.1);
    cooldown -= 0.1;
    if (trip) {
      trip.left -= 0.1;
      if (trip.left > 0) continue;
      if (trip.phase === 'back') {
        trip = null;
        d.playerAtCounter = true;
        continue;
      }
      // Tới kệ (hoặc vừa nạp xong một ô): nạp tiếp ô cần nạp của kệ này, hết thì đi về.
      const shelf = trip.shelf;
      trip.phase = 'refill';
      const next = s.shelves[shelf].findIndex((slot, c) => !!slot.productId && slot.qty <= REFILL_AT && d.startRefill(shelf, c));
      if (next >= 0) trip.left = DATA.balance.refillSeconds + REACT;
      else { trip.phase = 'back'; trip.left = playerTripSeconds(s, shelf); }
      continue;
    }
    if (cooldown > 0) continue;
    const want = wantedRefill(s, d);
    const c = d.front;
    const busy = c && (c.status === 'scanning' || c.status === 'paying');
    if (want && mode === 'side') {
      d.startRefill(want.shelf, want.slot);
      cooldown = REACT;
      continue;
    }
    if (want && mode === 'topdown' && !busy && (d.queue.length <= 1 || s.shelves[want.shelf][want.slot].qty === 0)) {
      d.playerAtCounter = false;
      trip = { phase: 'go', left: playerTripSeconds(s, want.shelf), shelf: want.shelf };
      continue;
    }
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
      cooldown = REACT;
    }
  }
}

function run(mode: Mode, days: number, seed: number): Stats {
  const rng = new Rng(seed);
  const s = createNewGame();
  s.settings.autoChange = true;
  if (BIG) {
    // Tiệm lớn: mở đất, thêm kệ/tủ ở xa quầy để đi lại tốn thời gian hơn.
    s.level = 12;
    s.money = 5_000_000;
    for (const id of ['A', 'B', 'C']) unlockPlot(s, id);
    for (const type of ['shelf', 'shelf', 'shelf', 'fridge', 'fridge', 'freezer']) placeAnywhere(s, type);
    s.money = 1_500_000;
  }
  const st: Stats = { served: 0, patience: 0, nothing: 0, profit: 0, money: 0 };
  for (let i = 0; i < days; i++) {
    stowHolding(s);
    s.holding = [];
    buyStock(s, suggestCart(s));
    autoArrange(s);
    playDay(s, mode, rng, st);
    const sum = endDay(s);
    st.profit += sum.grossProfit + sum.tips - sum.overpaid;
    startNextDay(s);
  }
  st.money = s.money;
  return st;
}

function compareViews(days: number, seeds: number): Record<Mode, Stats> {
  const out = {} as Record<Mode, Stats>;
  for (const mode of ['side', 'topdown'] as const) {
    const total: Stats = { served: 0, patience: 0, nothing: 0, profit: 0, money: 0 };
    for (let i = 0; i < seeds; i++) {
      const r = run(mode, days, 2000 + i);
      total.served += r.served; total.patience += r.patience; total.nothing += r.nothing; total.profit += r.profit; total.money += r.money;
    }
    out[mode] = total;
  }
  return out;
}

{
  const days = Number(process.argv[2] ?? 10);
  const seeds = Number(process.argv[3] ?? 10);
  const res = compareViews(days, seeds);
  const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;
  console.log(`So sánh góc nhìn: bot "Bình thường" × ${seeds} ván × ${days} ngày (tốc độ đi ${DATA.balance.topDown.playerTilesPerSecond} ô/s, kiên nhẫn khi vắng chủ ×${DATA.balance.topDown.awayPatienceRate})\n`);
  for (const mode of ['side', 'topdown'] as const) {
    const r = res[mode];
    const total = r.served + r.patience + r.nothing;
    console.log(`▶ ${mode === 'side' ? 'Nhìn ngang' : 'Trên xuống'}: phục vụ ${pct(r.served, total)} · bỏ về vì chờ ${pct(r.patience, total)} · vì hết hàng ${pct(r.nothing, total)} · lãi TB ${formatMoney(r.profit / seeds / days)}/ngày · tiền cuối TB ${formatMoney(r.money / seeds)}`);
  }
  const ratio = res.topdown.profit / Math.max(1, res.side.profit);
  console.log(`\nLãi góc trên xuống / góc ngang: ${(ratio * 100).toFixed(1)}%`);
}
