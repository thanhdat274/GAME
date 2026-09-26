import { describe, expect, it } from 'vitest';
import { visitStore } from '../src/core/branches';
import { DaySession, endDay, openShop, runDayHeadless, startNextDay } from '../src/core/day';
import { createMaxLevelSimulation } from '../src/core/simulation';
import { syncActiveStore, unlockedProducts, warehouseQty, type GameState } from '../src/core/state';
import { autoArrange, buyStock, checkCart } from '../src/core/stock';

const DAYS = 120;

/** Nhập hàng buổi sáng: mỗi món nhắm tồn = bán hôm qua × 1.3 (tối thiểu 10), trong giới hạn tiền và kho. */
function restock(state: GameState): void {
  const cart: Record<string, number> = {};
  for (const item of unlockedProducts(state.level, state).filter((p) => !p.recipeOnly).sort((a, b) => a.cost - b.cost)) {
    const onShelf = state.shelves.flat().filter((slot) => slot.productId === item.id).reduce((n, slot) => n + slot.qty, 0);
    const want = Math.max(10, Math.ceil((state.yesterdaySold[item.id] ?? 0) * 1.3)) - warehouseQty(state, item.id) - onShelf;
    for (let i = 0; i < want; i++) {
      cart[item.id] = (cart[item.id] ?? 0) + 1;
      if (!checkCart(state, cart).ok) {
        cart[item.id]--;
        break;
      }
    }
  }
  buyStock(state, cart);
  autoArrange(state);
}

function saveBytes(state: GameState): number {
  syncActiveStore(state);
  return new TextEncoder().encode(JSON.stringify({ version: 5, savedAt: 0, state })).length;
}

describe('7.1 mô phỏng 1 năm game với 4 tiệm', () => {
  it(`${DAYS} ngày: kinh tế không bùng nổ, bản lưu < 1MB, "Bỏ qua ngày" < 1 giây`, () => {
    const state = createMaxLevelSimulation();
    expect(state.stores).toHaveLength(4);
    const branches = state.stores.filter((store) => store.id !== 'main').map((store) => store.id);
    const gains: number[] = [];
    const skipMs: number[] = [];
    const moneyStart = state.money;

    for (let i = 0; i < DAYS; i++) {
      // Mỗi 10 ngày ghé một chi nhánh để chi nhánh có số liệu thật cho mô phỏng rút gọn.
      const target = i % 10 === 9 ? branches[Math.floor(i / 10) % branches.length] : 'main';
      if (state.activeStoreId !== target) visitStore(state, target);
      const before = state.money;
      restock(state);
      openShop(state);
      const session = new DaySession(state, 1000 + i);
      const t0 = performance.now();
      runDayHeadless(session);
      skipMs.push(performance.now() - t0);
      expect(session.ended).toBe(true);
      endDay(state);
      startNextDay(state);
      expect(Number.isFinite(state.money)).toBe(true);
      expect(state.money).toBeGreaterThan(0);
      // Không ngày nào (kể cả thu nhập chi nhánh) tăng quá 5% tổng tiền.
      expect(state.money - before).toBeLessThan(before * 0.05);
      gains.push(state.money - before);
    }
    visitStore(state, 'main');

    const avg = (list: number[]) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
    const firstMonth = avg(gains.slice(0, 30));
    const lastMonth = avg(gains.slice(-30));
    const bytes = saveBytes(state);
    process.stderr.write(`[7.1] tiền ${moneyStart} → ${state.money}; tăng TB/ngày tháng đầu ${Math.round(firstMonth)}, tháng cuối ${Math.round(lastMonth)}; save ${(bytes / 1024).toFixed(0)}KB; bỏ qua ngày max ${Math.max(...skipMs).toFixed(0)}ms
`);

    // Kinh tế không bùng nổ: cả năm không quá x3 vốn, tốc độ tăng tháng cuối không quá x6 tháng đầu (tuyến tính, không lũy thừa).
    expect(state.money).toBeLessThan(moneyStart * 3);
    expect(lastMonth).toBeLessThan(Math.max(firstMonth, 100_000) * 6);
    expect(bytes).toBeLessThan(1024 * 1024);
    expect(Math.max(...skipMs)).toBeLessThan(1000);
  }, 120_000);
});
