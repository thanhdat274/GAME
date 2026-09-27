import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop } from '../src/core/day';
import { applyLiveShopCommand, createLiveShopAggregate } from '../src/core/liveSession';
import { createNewGame, lotsFrom, type GameState } from '../src/core/state';

function stocked(): GameState {
  const s = createNewGame();
  s.settings.autoChange = true;
  s.settings.autoScan = true;
  s.zones = s.zones.map((_, i) => (i < 2 ? 'dry' : null));
  ['mi_goi', 'gao', 'nuoc_mam', 'dau_an', 'duong', 'muoi'].forEach((id, i) => { s.shelves[0][i] = { productId: id, qty: 5 }; });
  s.warehouse = lotsFrom({ mi_goi: 20 });
  openShop(s);
  return s;
}

describe('đóng cửa sớm', () => {
  it('ngừng đón khách, dừng giờ, phục vụ nốt rồi kết thúc ngày', () => {
    const s = stocked();
    const d = new DaySession(s, 7);
    d.autoPlayer = true;
    for (let i = 0; i < 600 && d.customers.length < 2; i++) d.tick(0.1);
    const at = Math.floor(s.clock);
    expect(d.closeEarly()).toBe(true);
    expect(d.closeEarly()).toBe(false);
    expect(d.closed).toBe(true);
    expect(s.today.closedEarlyAt).toBe(at);
    let ended = false;
    d.events.on('dayEnded', () => { ended = true; });
    const arrivals: number[] = [];
    d.events.on('customerArrived', (c) => arrivals.push(c.id));
    for (let i = 0; i < 6000 && !ended; i++) d.tick(0.1);
    expect(ended).toBe(true);
    expect(arrivals).toEqual([]);
    expect(Math.floor(s.clock)).toBe(at);
    expect(s.clock).toBeLessThan(DATA.balance.closeMinute);
    const sum = endDay(s);
    expect(sum.closedEarlyAt).toBe(at);
  });

  it('khách chưa lấy gì được mời về, không bị tính là bỏ về hay chấm sao', () => {
    const s = stocked();
    const d = new DaySession(s, 3);
    for (let i = 0; i < 600 && !d.customers.some((c) => c.status === 'browsing' && c.order.every((l) => l.picked === 0)); i++) d.tick(0.1);
    const ratingCount = s.today.ratingCount;
    const left = s.today.left;
    const reasons: string[] = [];
    d.events.on('customerLeft', ({ reason }) => reasons.push(reason));
    d.closeEarly();
    expect(reasons).toContain('closed');
    expect(s.today.sentHome).toBeGreaterThan(0);
    expect(s.today.ratingCount).toBe(ratingCount);
    expect(s.today.left).toBe(left);
    expect(d.customers.every((c) => c.status !== 'browsing' || c.thief)).toBe(true);
  });

  it('tải lại giữa lúc đang dọn tiệm vẫn giữ trạng thái đóng cửa', () => {
    const s = stocked();
    const d = new DaySession(s, 5);
    for (let i = 0; i < 50; i++) d.tick(0.1);
    d.closeEarly();
    expect(new DaySession(structuredClone(s), 5).closed).toBe(true);
  });

  it('chơi chung (live): lệnh closeEarly đóng tiệm trên trạng thái dùng chung', () => {
    const s = stocked();
    const agg = createLiveShopAggregate(s);
    const { aggregate, result } = applyLiveShopCommand(agg, { type: 'closeEarly' });
    expect(result).toBe(true);
    expect(aggregate.dayRuntime?.closed).toBe(true);
    expect(aggregate.state.today.closedEarlyAt).toBeDefined();
  });
});
