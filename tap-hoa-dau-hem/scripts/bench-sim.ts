/**
 * Benchmark lõi mô phỏng không giao diện: thời gian mỗi `DaySession.tick` với hồ sơ max, cùng seed.
 * Chạy: npm run bench:sim -- [số ngày] [số lượt]
 * In p50/p95/max của tick (ms) và một chữ ký kết quả để kiểm tra tối ưu không đổi mô phỏng.
 */
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop, startNextDay } from '../src/core/day';
import { createMaxLevelSimulation } from '../src/core/simulation';
import { CURRENT_VERSION } from '../src/core/save';
import { syncActiveStore, unlockedProducts, warehouseQty, type GameState } from '../src/core/state';
import { autoArrange, buyStock, checkCart } from '../src/core/stock';

const days = Number(process.argv[2] ?? 6);
const rounds = Number(process.argv[3] ?? 3);

function restock(state: GameState): void {
  const cart: Record<string, number> = {};
  for (const item of unlockedProducts(state.level, state).filter((p) => !p.recipeOnly).sort((a, b) => a.cost - b.cost)) {
    const onShelf = state.shelves.flat().filter((slot) => slot.productId === item.id).reduce((n, slot) => n + slot.qty, 0);
    const want = Math.max(10, Math.ceil((state.yesterdaySold[item.id] ?? 0) * 1.3)) - warehouseQty(state, item.id) - onShelf;
    for (let i = 0; i < want; i++) {
      cart[item.id] = (cart[item.id] ?? 0) + 1;
      if (!checkCart(state, cart).ok) { cart[item.id]--; break; }
    }
  }
  buyStock(state, cart);
  autoArrange(state);
}

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const phases: Record<string, number[]> = { restock: [], openShop: [], endDay: [], startNextDay: [], serialize: [] };
const timed = <T>(name: string, fn: () => T): T => { const t0 = performance.now(); const r = fn(); phases[name].push(performance.now() - t0); return r; };

function run(): { ticks: number[]; signature: string } {
  const state = createMaxLevelSimulation();
  const ticks: number[] = [];
  const step = DATA.balance.tickMs / 1000;
  let served = 0;
  for (let d = 0; d < days; d++) {
    timed('restock', () => restock(state));
    timed('openShop', () => openShop(state));
    const session = new DaySession(state, 1000 + d);
    session.autoPlayer = true;
    session.paused = false;
    for (let i = 0; i < DATA.balance.manager.skipMaxTicks && !session.ended; i++) {
      const t0 = performance.now();
      session.tick(step);
      ticks.push(performance.now() - t0);
    }
    served += state.today.served ?? 0;
    timed('endDay', () => endDay(state));
    timed('startNextDay', () => startNextDay(state));
    timed('serialize', () => { syncActiveStore(state); return JSON.stringify({ version: CURRENT_VERSION, savedAt: 0, state }).length; });
  }
  return { ticks, signature: `money=${state.money} level=${state.level} served=${served}` };
}

run(); // khởi động JIT
for (const k of Object.keys(phases)) phases[k].length = 0;
const all: number[] = [];
const sigs = new Set<string>();
for (let r = 0; r < rounds; r++) {
  const { ticks, signature } = run();
  sigs.add(signature);
  all.push(...ticks);
  const s = [...ticks].sort((a, b) => a - b);
  console.log(`lượt ${r + 1}: ${ticks.length} tick · p50 ${pct(s, 0.5).toFixed(3)} · p95 ${pct(s, 0.95).toFixed(3)} · p99 ${pct(s, 0.99).toFixed(3)} · max ${s[s.length - 1].toFixed(2)} ms`);
}
const s = all.sort((a, b) => a - b);
console.log(`tổng: p50 ${pct(s, 0.5).toFixed(3)} · p95 ${pct(s, 0.95).toFixed(3)} · p99 ${pct(s, 0.99).toFixed(3)} · max ${s[s.length - 1].toFixed(2)} ms · tổng ${(s.reduce((a, b) => a + b, 0) / rounds).toFixed(0)} ms/lượt`);
console.log(`chữ ký: ${[...sigs].join(' | ')}${sigs.size > 1 ? '  ⚠ KHÔNG tất định giữa các lượt' : ''}`);
for (const [name, list] of Object.entries(phases)) {
  const v = [...list].sort((a, b) => a - b);
  console.log(`${name.padEnd(13)} p50 ${pct(v, 0.5).toFixed(2)} · max ${v[v.length - 1].toFixed(2)} ms (${v.length} mẫu)`);
}
