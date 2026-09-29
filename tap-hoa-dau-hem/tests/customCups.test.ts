import { describe, expect, it } from 'vitest';
import { openBranch } from '../src/core/branches';
import {
  BASE_ORDER_WEIGHT, BASE_VARIANT, addCup, counterSlotLabel, counterStockText, cupFit, cupPrice, cupsBy, isCustomRecipe, orderLineName, orderVariantFor, pickServed, removeCupRecord,
} from '../src/core/customCups';
import { generateCounterOrder } from '../src/core/customers';
import { DATA, recipeById, type RecipeDef } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless } from '../src/core/day';
import { Rng } from '../src/core/rng';
import { prepareRecipe } from '../src/core/recipes';
import { createNewGame, unlockedProducts, type GameState, type Slot } from '../src/core/state';
import { addLot, buyStock, checkCart } from '../src/core/stock';

const recipe = (id: string): RecipeDef => recipeById(id)!;
const slotOf = (qty: number, variants?: Record<string, number>): Slot => ({ productId: 'tra_sua_tran_chau_tp', qty, variants }) as Slot;
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; };

function teaShop(level = 47): GameState {
  const state = createNewGame();
  state.level = level;
  state.money = 60_000_000;
  expect(openBranch(state, 'tea').ok).toBe(true);
  return state;
}

/** Thêm nguyên liệu vào kho và bật thực đơn. */
function stockTea(state: GameState): void {
  const cart: Record<string, number> = {};
  for (const p of unlockedProducts(state.level, state)) {
    cart[p.id] = 10;
    if (!checkCart(state, cart).ok) delete cart[p.id];
  }
  buyStock(state, cart);
  for (const p of DATA.products.filter((x) => x.shopOnly || x.id === 'sua_tuoi' || x.id === 'nuoc_da')) addLot(state, p.id, 300, state.day + 60);
  state.activeRecipes = DATA.recipes.filter((r) => r.minigame === 'tea' && r.unlockLevel <= state.level && r.station === 'tea_bar').map((r) => r.id);
}

describe('đếm ly theo tùy chọn (cupsBy)', () => {
  it('không có thông tin tùy chọn thì toàn bộ là ly thường', () => {
    expect(cupsBy(slotOf(3))).toEqual({ [BASE_VARIANT]: 3 });
    expect(cupsBy(slotOf(0))).toEqual({});
  });

  it('luôn khớp tổng với qty: thiếu tính là ly thường, thừa bớt từ loại thêm vào sau cùng', () => {
    expect(cupsBy(slotOf(5, { size_l: 2 }))).toEqual({ size_l: 2, [BASE_VARIANT]: 3 });
    expect(cupsBy(slotOf(2, { size_l: 2, them_thach: 3 }))).toEqual({ size_l: 2 });
    expect(cupsBy(slotOf(3, { [BASE_VARIANT]: 5 }))).toEqual({ [BASE_VARIANT]: 3 });
    expect(cupsBy(slotOf(1, { size_l: 0, them_thach: 1 }))).toEqual({ them_thach: 1 });
  });

  it('addCup và removeCupRecord giữ tổng khớp; số ly đổi ở nơi khác vẫn tự chữa', () => {
    const slot = slotOf(0);
    addCup(slot, BASE_VARIANT);
    addCup(slot, 'size_l');
    addCup(slot, 'size_l');
    expect(slot.qty).toBe(3);
    expect(cupsBy(slot)).toEqual({ [BASE_VARIANT]: 1, size_l: 2 });
    removeCupRecord(slot, 'size_l');
    slot.qty--;
    expect(cupsBy(slot)).toEqual({ [BASE_VARIANT]: 1, size_l: 1 });
    // Nơi khác bán bớt hai ly mà không biết loại: vẫn khớp.
    slot.qty -= 2;
    expect(Object.values(cupsBy(slot)).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe('phục vụ ly: khớp, tốt hơn, kém hơn, giá', () => {
  const r = recipe('tra_sua_tran_chau');
  const delta = (id: string) => r.variants!.find((v) => v.id === id)!.priceDelta;

  it('cupFit theo phụ thu', () => {
    expect(cupFit(r, 'size_l', 'size_l')).toBe('exact');
    expect(cupFit(r, BASE_VARIANT, 'size_l')).toBe('better');
    expect(cupFit(r, 'size_l', BASE_VARIANT)).toBe('worse');
    expect(cupFit(r, 'size_l', 'them_thach')).toBe(delta('them_thach') > delta('size_l') ? 'better' : 'worse');
  });

  it('pickServed: đúng loại nếu có; không thì loại tốt hơn gần nhất trước, rồi loại kém hơn; null nếu hết ly', () => {
    const both = slotOf(3, { [BASE_VARIANT]: 1, size_l: 1, them_thach: 1 });
    expect(pickServed(both, r, 'size_l')).toEqual({ key: 'size_l', fit: 'exact' });
    const onlyBase = slotOf(2);
    expect(pickServed(onlyBase, r, 'size_l')).toEqual({ key: BASE_VARIANT, fit: 'worse' });
    const onlyL = slotOf(1, { size_l: 1 });
    expect(pickServed(onlyL, r, BASE_VARIANT)).toEqual({ key: 'size_l', fit: 'better' });
    expect(pickServed(slotOf(0), r, BASE_VARIANT)).toBeNull();
    // Chỉ có loại kém hơn: chọn loại gần nhất (phụ thu gần ly khách gọi nhất).
    const mix = slotOf(2, { [BASE_VARIANT]: 1, them_thach: 1 });
    expect(delta('them_thach')).toBeLessThan(delta('size_l'));
    expect(pickServed(mix, r, 'size_l')).toEqual({ key: 'them_thach', fit: 'worse' });
    // Có nhiều loại tốt hơn: chọn loại tốt hơn có phụ thu thấp nhất.
    const better = slotOf(2, { size_l: 1, them_thach: 1 });
    expect(pickServed(better, r, BASE_VARIANT)).toEqual({ key: 'them_thach', fit: 'better' });
    // Có cả tốt hơn và kém hơn: ưu tiên tốt hơn.
    const both2 = slotOf(2, { [BASE_VARIANT]: 1, size_l: 1 });
    expect(pickServed(both2, r, 'them_thach')).toEqual({ key: 'size_l', fit: 'better' });
  });

  it('cupPrice: giá món + phụ thu ly đưa, nhưng không cao hơn ly khách gọi', () => {
    expect(cupPrice(r, 40000, 'size_l', 'size_l')).toBe(40000 + delta('size_l'));
    expect(cupPrice(r, 40000, 'size_l', BASE_VARIANT)).toBe(40000);
    expect(cupPrice(r, 40000, BASE_VARIANT, 'size_l')).toBe(40000);
    expect(cupPrice(r, 40000, BASE_VARIANT, BASE_VARIANT)).toBe(40000);
  });
});

describe('khách gọi tùy chọn', () => {
  it('chỉ món trà có tùy chọn; món không thuộc mini-game trà thì luôn ly thường', () => {
    expect(isCustomRecipe(recipe('tra_sua_tran_chau'))).toBe(true);
    expect(isCustomRecipe(recipe('xoi_man'))).toBe(false);
    expect(orderVariantFor(recipe('xoi_man'), () => 0.5)).toBe(BASE_VARIANT);
    expect(isCustomRecipe(undefined)).toBe(false);
  });

  it('phân bố theo trọng số: ly thường và từng tùy chọn, khớp trọng số trong dữ liệu', () => {
    const r = recipe('hong_tra_sua');
    const next = seeded(5);
    const counts: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) { const k = orderVariantFor(r, next); counts[k] = (counts[k] ?? 0) + 1; }
    const weights: Record<string, number> = { [BASE_VARIANT]: BASE_ORDER_WEIGHT };
    for (const v of r.variants!) weights[v.id] = v.orderWeight ?? 0.2;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [k, w] of Object.entries(weights)) expect(Math.abs((counts[k] ?? 0) / N - w / total), k).toBeLessThan(0.02);
    expect(counts[BASE_VARIANT]).toBeGreaterThan(0);
  });

  it('đơn ở tiệm trà sữa có tùy chọn; đơn ở tiệm xôi không', () => {
    const tea = teaShop();
    stockTea(tea);
    const rng = new Rng(3);
    const type = DATA.customers.find((c) => c.id === 'hoc_sinh')!;
    const withVariant = new Set<string>();
    for (let i = 0; i < 200; i++) for (const line of generateCounterOrder(type, rng, tea)) if (line.variantId) withVariant.add(line.variantId);
    expect(withVariant.size).toBeGreaterThanOrEqual(2);
    for (const id of withVariant) expect(DATA.recipes.some((x) => x.variants?.some((v) => v.id === id))).toBe(true);

    const xoi = createNewGame();
    xoi.level = 35;
    xoi.money = 60_000_000;
    expect(openBranch(xoi, 'xoi').ok).toBe(true);
    xoi.activeRecipes = DATA.recipes.filter((x) => x.station === 'quay_xoi' && !x.packaged).map((x) => x.id);
    for (let i = 0; i < 100; i++) for (const line of generateCounterOrder(type, rng, xoi)) expect(line.variantId).toBeUndefined();
  });
});

describe('pha ly đếm theo loại', () => {
  it('pha ly thường và ly Size L cùng món: ô quầy có 2 ly, giá chung không cộng phụ thu', () => {
    const state = teaShop(40);
    stockTea(state);
    expect(prepareRecipe(state, 'tra_sua_tran_chau', 1).ok).toBe(true);
    const basePrice = state.prices.tra_sua_tran_chau_tp;
    expect(prepareRecipe(state, 'tra_sua_tran_chau', 1, 'size_l').ok).toBe(true);
    const slot = state.counter.find((s) => s.productId === 'tra_sua_tran_chau_tp')!;
    expect(slot.qty).toBe(2);
    expect(cupsBy(slot)).toEqual({ [BASE_VARIANT]: 1, size_l: 1 });
    expect(state.prices.tra_sua_tran_chau_tp).toBe(basePrice);
  });

  it('món khác (xôi có "thêm topping") giữ nguyên cách tính giá cũ', () => {
    const state = createNewGame();
    state.level = 35;
    state.money = 60_000_000;
    expect(openBranch(state, 'xoi').ok).toBe(true);
    const xoi = recipe('xoi_dua');
    expect(isCustomRecipe(xoi)).toBe(false);
  });
});

describe('nhãn hiển thị', () => {
  it('tên món trong đơn nêu tùy chọn; nhãn ô quầy nêu số ly theo loại; tồn quầy theo loại', () => {
    expect(orderLineName({ productId: 'tra_sua_tran_chau_tp' })).toBe('Trà sữa trân châu');
    expect(orderLineName({ productId: 'tra_sua_tran_chau_tp', variantId: 'size_l' })).toBe('Trà sữa trân châu · Size L');
    const slot = slotOf(4, { size_l: 1, them_thach: 1 });
    expect(counterSlotLabel(slot)).toBe('Trà sữa trân châu\n×4 L1+TD1');
    expect(counterSlotLabel(slotOf(2))).toBe('Trà sữa trân châu\n×2');
    expect(counterSlotLabel({ productId: null, qty: 0 } as Slot)).toBe('Trống');
    expect(counterStockText([slot, slotOf(1, { size_l: 1 })], 'tra_sua_tran_chau_tp')).toBe('Mặc định 2 · Size L 2 · + Thạch dừa 1');
  });
});

/** Chạy một ngày bán ở quầy với ly `cups` (loại → số ly mỗi món) và đếm kết quả phục vụ. */
function runDay(seed: number, cups: string[]): { served: number; fits: Record<string, number>; revenue: number; stars: number } {
  const state = teaShop(40);
  stockTea(state);
  state.counter = state.counter.map(() => ({ productId: null, qty: 0, lots: [] } as never));
  const menu = state.activeRecipes.slice(0, state.counter.length);
  state.activeRecipes = menu;
  for (const id of menu) for (const key of cups) for (let i = 0; i < 8; i++) prepareRecipe(state, id, 1, key === BASE_VARIANT ? undefined : key);
  openShop(state);
  const session = new DaySession(state, seed);
  const fits: Record<string, number> = {};
  session.events.on('counterVariant', (e) => { fits[e.fit] = (fits[e.fit] ?? 0) + 1; });
  runDayHeadless(session);
  const summary = endDay(state);
  return { served: state.today.served ?? 0, fits, revenue: summary.revenue, stars: summary.avgRating ?? 0 };
}

describe('một ngày bán ly tùy biến', () => {
  const allKeys = [BASE_VARIANT, 'size_l', 'them_tran_chau', 'them_thach'];

  it('chỉ có ly thường: nhiều khách gọi tùy chọn bị đưa ly kém hơn; có đủ loại thì hầu hết được đưa đúng ly', () => {
    const onlyBase = runDay(11, [BASE_VARIANT]);
    const full = runDay(11, allKeys);
    const total = (f: Record<string, number>) => Object.values(f).reduce((a, b) => a + b, 0);
    expect(total(onlyBase.fits)).toBeGreaterThan(5);
    expect(total(full.fits)).toBeGreaterThan(5);
    const worseRateBase = (onlyBase.fits.worse ?? 0) / total(onlyBase.fits);
    const worseRateFull = (full.fits.worse ?? 0) / total(full.fits);
    expect(worseRateBase).toBeGreaterThan(0.3);
    expect(worseRateFull).toBeLessThan(worseRateBase);
    expect((full.fits.exact ?? 0) / total(full.fits)).toBeGreaterThan(0.6);
  });

  it('pha đủ loại bán được giá cao hơn mỗi khách so với chỉ ly thường', () => {
    const onlyBase = runDay(19, [BASE_VARIANT]);
    const full = runDay(19, allKeys);
    expect(onlyBase.served).toBeGreaterThan(0);
    expect(full.served).toBeGreaterThan(0);
    expect(full.revenue / full.served).toBeGreaterThan(onlyBase.revenue / onlyBase.served);
  });
});
