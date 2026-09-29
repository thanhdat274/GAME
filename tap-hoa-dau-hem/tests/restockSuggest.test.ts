import { describe, expect, it } from 'vitest';
import { DATA, product } from '../src/core/data';
import { assignSlot, checkCart, recentDailySales, shelfCapacity, suggestCart, suggestedTarget, suggestRestockCart } from '../src/core/stock';
import { createNewGame, lotsFrom, type DayRecord, type GameState } from '../src/core/state';

function shop(money = 2_000_000): GameState {
  const s = createNewGame();
  s.level = 4;
  s.money = money;
  return s;
}

function day(sold: Record<string, number>): DayRecord {
  return { sold } as DayRecord;
}

describe('gợi ý nhập hàng giữa giờ bán', () => {
  it('buổi sáng ưu tiên món dưới 5 và tăng nhu cầu theo đánh giá khách', () => {
    const s = shop();
    s.warehouse = lotsFrom({ mi_goi: 4 });
    s.analytics = [day({ mi_goi: 8 })];
    const before = suggestedTarget(s, product('mi_goi'));
    s.reviews.push({ id: 1, day: s.day, minute: 600, name: 'Khách', stars: 2, issue: 'missing', productId: 'mi_goi', text: 'Hết mì' });
    expect(suggestedTarget(s, product('mi_goi'))).toBeGreaterThan(before);
    expect(suggestCart(s).mi_goi).toBeGreaterThanOrEqual(1);
  });

  it('giữa giờ mua lại món chỉ còn 4 cái', () => {
    const s = shop();
    s.warehouse = lotsFrom({ mi_goi: 4 });
    assignSlot(s, 0, 0, 'mi_goi');
    const sug = suggestRestockCart(s);
    expect(sug.outOfStock).toContain('mi_goi');
    expect(sug.cart.mi_goi).toBeGreaterThan(0);
  });

  it('đánh giá thiếu hàng đưa món lên ưu tiên giữa giờ', () => {
    const s = shop();
    s.reviews.push({ id: 1, day: s.day, minute: 600, name: 'Khách', stars: 2, issue: 'missing', productId: 'gao', text: 'Thiếu gạo' });
    const sug = suggestRestockCart(s);
    expect(sug.outOfStock).toContain('gao');
    expect(sug.cart.gao).toBeGreaterThan(0);
  });
  it('bán trung bình mỗi ngày gồm các ngày gần nhất và hôm nay', () => {
    const s = shop();
    s.analytics = [day({ mi_goi: 10 }), day({ mi_goi: 20, keo: 4 })];
    s.today.sold = { mi_goi: 6 };
    expect(recentDailySales(s)).toEqual({ mi_goi: 12, keo: 4 / 3 });
  });

  it('bù đầy ô của món đang hết trên kệ và món khách hỏi mà không có', () => {
    const s = shop();
    s.warehouse = lotsFrom({ mi_goi: 5 });
    assignSlot(s, 0, 0, 'mi_goi');
    s.shelves[0][0].qty = 0;
    s.shelves[0][0].lots = [];
    s.today.missed = { gao: 3 };
    const sug = suggestRestockCart(s);
    expect(sug.outOfStock).toEqual(expect.arrayContaining(['mi_goi', 'gao']));
    expect(sug.cart.mi_goi).toBe(shelfCapacity(s, 0));
    expect(sug.cart.gao).toBe(DATA.balance.slotCapacity);
  });

  it('nhập thêm món bán chạy nhất, bỏ qua món còn nhiều', () => {
    const s = shop();
    s.analytics = [day({ keo: 30, muoi: 2, duong: 1 })];
    s.warehouse = lotsFrom({ duong: 40 });
    const sug = suggestRestockCart(s, 'co_tu', 2);
    expect(sug.bestSellers).toEqual(['keo', 'muoi']);
    expect(sug.cart.keo).toBeGreaterThanOrEqual(DATA.balance.slotCapacity);
    expect(sug.cart.duong).toBeUndefined();
  });

  it('thiếu tiền thì món sắp bán hết sớm nhất được mua trước món đắt bán chậm', () => {
    const s = shop(80_000);
    s.warehouse = lotsFrom({ mi_goi: 9, dau_an: 7 });
    assignSlot(s, 0, 0, 'mi_goi');
    assignSlot(s, 0, 1, 'dau_an');
    s.analytics = [day({ mi_goi: 25, dau_an: 1 })];
    const sug = suggestRestockCart(s);
    expect(sug.cart.mi_goi).toBeGreaterThanOrEqual(10);
    expect(sug.cart.dau_an ?? 0).toBeLessThanOrEqual(1);
  });

  it('thiếu tiền thì ưu tiên món đang hết trước món bán chạy', () => {
    const s = shop(60_000);
    s.warehouse = lotsFrom({ mi_goi: 5 });
    assignSlot(s, 0, 0, 'mi_goi');
    s.shelves[0][0].qty = 0;
    s.shelves[0][0].lots = [];
    s.analytics = [day({ dau_an: 50 })];
    const sug = suggestRestockCart(s);
    expect(sug.cart.mi_goi).toBeGreaterThan(0);
    expect(sug.cart.dau_an).toBeUndefined();
    const check = checkCart(s, sug.cart);
    expect(check.ok || check.reason === 'min-order').toBe(true);
  });
});
