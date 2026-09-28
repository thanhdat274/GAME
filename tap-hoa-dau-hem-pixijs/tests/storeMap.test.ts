import { describe, expect, it } from 'vitest';
import { openBranch, visitStore } from '../src/core/branches';
import { refPrice, product } from '../src/core/data';
import { createNewGame, lotsFrom } from '../src/core/state';
import { fixtureInfo, fixtureStockLevel, storeView, warehouseLines, warehouseUsage } from '../src/core/storeMap';

function shelfFixture(state: ReturnType<typeof createNewGame>, shelf = 0) {
  return state.fixtures.find((f) => f.shelf === shelf)!;
}

describe('sơ đồ tiệm', () => {
  it('chi tiết kệ gộp ô cùng món, có số lượng, giá đặt và giá bán xả', () => {
    const s = createNewGame();
    const id = s.shelves[0][0].productId ?? 'mi_goi';
    s.shelves[0][0] = { productId: id, qty: 4, lots: [{ qty: 4, exp: s.day + 1 }] };
    s.shelves[0][1] = { productId: id, qty: 3, lots: [{ qty: 3, exp: null }] };
    s.shelves[0][2] = { productId: 'gao', qty: 0 };
    s.prices[id] = refPrice(product(id)) + 1000;
    const info = fixtureInfo(storeView(s)!, shelfFixture(s));
    const line = info.lines.find((l) => l.productId === id)!;
    expect(line.qty).toBe(7);
    expect(line.slots).toBe(2);
    expect(line.price).toBe(refPrice(product(id)) + 1000);
    expect(line.exp).toBe(s.day + 1);
    expect(info.outSlots).toBe(1);
    expect(fixtureStockLevel(info)).toBe('low');

    s.shelves[0][0].clearance = 50;
    const cleared = fixtureInfo(storeView(s)!, shelfFixture(s)).lines.find((l) => l.productId === id)!;
    expect(cleared.clearance).toBe(50);
    expect(cleared.price).toBe(Math.round((refPrice(product(id)) + 1000) / 2));
  });

  it('không làm thay đổi dữ liệu ô khi đọc', () => {
    const s = createNewGame();
    s.shelves[0][0] = { productId: 'mi_goi', qty: 5 };
    fixtureInfo(storeView(s)!, shelfFixture(s));
    expect(s.shelves[0][0].lots).toBeUndefined();
  });

  it('kho gộp lô theo món và lấy hạn sớm nhất', () => {
    const s = createNewGame();
    s.warehouse = [{ productId: 'mi_goi', qty: 10, exp: null }, { productId: 'mi_goi', qty: 5, exp: s.day + 3 }, { productId: 'gao', qty: 0, exp: null }];
    const lines = warehouseLines(storeView(s)!);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ productId: 'mi_goi', qty: 15, exp: s.day + 3 });
    expect(warehouseUsage(storeView(s)!).used).toBeGreaterThan(0);
  });

  it('xem được kệ và kho của tiệm khác trong chuỗi mà không cần ghé', () => {
    const s = createNewGame();
    s.level = 40;
    s.money = 10_000_000;
    s.warehouse = lotsFrom({ mi_goi: 12 });
    expect(openBranch(s, 'market').ok).toBe(true);
    s.warehouse = lotsFrom({ gao: 7 });
    s.shelves[0][0] = { productId: 'gao', qty: 2 };
    visitStore(s, 'main');

    const market = storeView(s, 'market')!;
    expect(market.active).toBe(false);
    expect(warehouseLines(market).map((l) => [l.productId, l.qty])).toEqual([['gao', 7]]);
    const shelf = market.fixtures.find((f) => f.shelf === 0)!;
    expect(fixtureInfo(market, shelf).lines[0]).toMatchObject({ productId: 'gao', qty: 2 });

    expect(storeView(s, 'main')!.active).toBe(true);
    expect(warehouseLines(storeView(s)!).map((l) => l.productId)).toEqual(['mi_goi']);
    expect(storeView(s, 'khong_co')).toBeNull();
  });

  it('quầy thu ngân liệt kê hàng sau quầy', () => {
    const s = createNewGame();
    const counter = s.fixtures.find((f) => f.type === 'counter')!;
    const id = s.counter[0]?.productId ?? 'the_cao';
    if (!s.counter.length) s.counter.push({ productId: id, qty: 0 });
    s.counter[0] = { productId: id, qty: 3 };
    const info = fixtureInfo(storeView(s)!, counter);
    expect(info.lines[0]).toMatchObject({ productId: id, qty: 3 });
    expect(info.note).toBeTruthy();
  });
});

describe('sơ đồ tiệm: trạm chế biến', () => {
  it('trạm liệt kê món đang bật và số đã làm sẵn ở quầy; quầy nước liệt kê đồ uống', async () => {
    const { DATA } = await import('../src/core/data');
    const s = createNewGame();
    const drink = DATA.recipes.find((r) => r.category === 'beverage')!;
    s.fixtures.push({ uid: 900, type: drink.station, x: 5, y: 0, rot: 0 }, { uid: 901, type: 'drink_counter', x: 5, y: 2, rot: 0 });
    s.activeRecipes = [drink.id];
    s.counter[0] = { productId: drink.output, qty: 2 };
    const station = fixtureInfo(storeView(s)!, s.fixtures.find((f) => f.uid === 900)!);
    expect(station.lines).toEqual([expect.objectContaining({ productId: drink.output, qty: 2 })]);
    const bar = fixtureInfo(storeView(s)!, s.fixtures.find((f) => f.uid === 901)!);
    expect(bar.lines.map((l) => l.productId)).toContain(drink.output);
  });
});
