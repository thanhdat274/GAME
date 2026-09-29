import { describe, expect, it } from 'vitest';
import { visitStore } from '../src/core/branches';
import { brewedCupPrice, isMadeToOrder } from '../src/core/customCups';
import { DATA, recipeById, type RecipeDef } from '../src/core/data';
import type { Customer } from '../src/core/customers';
import { DaySession, endDay, openShop, runDayHeadless } from '../src/core/day';
import { prepareRecipe } from '../src/core/recipes';
import { createMaxLevelSimulation } from '../src/core/simulation';
import { warehouseQty, type GameState } from '../src/core/state';
import { addLot } from '../src/core/stock';

const TEA = DATA.recipes.filter((r) => r.minigame === 'tea');

/** Tiệm trà sữa hồ sơ max, tắt nhân viên/quản lý, quầy trống, thực đơn `menu`, kho đầy nguyên liệu. */
function teaShop(menu: string[]): GameState {
  const state = createMaxLevelSimulation();
  visitStore(state, 'tea');
  state.staff = [];
  state.schedule = {};
  state.manager = { enabled: false, speed: 1 };
  state.counter = state.counter.map(() => ({ productId: null, qty: 0, lots: [] } as never));
  state.activeRecipes = menu;
  for (const p of DATA.products.filter((x) => x.shopOnly || x.id === 'sua_tuoi' || x.id === 'nuoc_da')) addLot(state, p.id, 300, state.day + 60);
  return state;
}

const ingredientTotal = (state: GameState, r: RecipeDef): number => Object.keys(r.ingredients).reduce((n, id) => n + warehouseQty(state, id), 0);

/** Chạy phiên tới khi khách đầu hàng có thể pha ngay; trả về phiên hoặc null nếu quá số nhịp. */
function untilOffer(state: GameState, seed: number, max = 4000): DaySession | null {
  openShop(state);
  const session = new DaySession(state, seed);
  for (let i = 0; i < max; i++) {
    session.tick(0.1);
    if (session.brewOffer()) return session;
  }
  return null;
}

describe('kiểu phục vụ trong dữ liệu', () => {
  it('món foam, matcha latte, chanh dây, khoai môn pha theo đơn; món truyền thống pha sẵn', () => {
    const order = TEA.filter((r) => isMadeToOrder(r)).map((r) => r.id).sort();
    expect(order).toEqual(['hong_tra_macchiato', 'matcha_foam', 'matcha_latte', 'olong_foam_muoi', 'tra_chanh_day', 'tra_ube']);
    expect(TEA.filter((r) => !isMadeToOrder(r)).length).toBe(8);
    for (const r of TEA.filter((x) => x.station === 'foam_machine')) expect(r.serve, r.id).toBe('order');
    expect(isMadeToOrder(recipeById('xoi_man'))).toBe(false);
  });

  it('món pha theo đơn bị từ chối pha sẵn và không trừ nguyên liệu', () => {
    const state = teaShop(['hong_tra_macchiato', 'hong_tra_sua']);
    const r = recipeById('hong_tra_macchiato')!;
    const before = ingredientTotal(state, r);
    expect(prepareRecipe(state, r.id, 1)).toEqual({ ok: false, reason: 'order' });
    expect(ingredientTotal(state, r)).toBe(before);
    expect(prepareRecipe(state, 'hong_tra_sua', 1).ok).toBe(true);
  });
});

describe('pha ngay khi khách chờ', () => {
  it('quầy trống: khách gọi món pha theo đơn vẫn được yêu cầu; pha xong khách nhận đúng ly và trả đủ giá', () => {
    const state = teaShop(['hong_tra_macchiato']);
    const r = recipeById('hong_tra_macchiato')!;
    const session = untilOffer(state, 5);
    expect(session).not.toBeNull();
    const c = session!.front!;
    const line = c.order.find((l) => l.counterLine)!;
    const offer = session!.brewOffer()!;
    expect(offer.recipeId).toBe(r.id);
    expect(offer.seconds).toBe(r.prepSeconds);
    // Yêu cầu quầy dài hơn mặc định để kịp bấm Pha ngay.
    expect(c.counterRequestLeft).toBeGreaterThan(DATA.balance.counterRequestSeconds);

    const before = ingredientTotal(state, r);
    expect(session!.startBrew()).toBe(true);
    expect(ingredientTotal(state, r)).toBeLessThan(before); // nguyên liệu trừ ngay
    expect(session!.startBrew()).toBe(false); // một mẻ một lúc
    expect(session!.brewProgress()!.left).toBeCloseTo(r.prepSeconds);

    let done = false;
    session!.events.on('brewDone', () => { done = true; });
    for (let i = 0; i < r.prepSeconds * 10 + 5 && !done; i++) session!.tick(0.1);
    expect(done).toBe(true);
    expect(line.picked).toBe(1);
    expect(line.servedVariant).toBe(line.variantId ?? '');
    const base = state.prices[line.productId] ?? DATA.products.find((p) => p.id === line.productId)!.price;
    const delta = line.variantId ? r.variants!.find((v) => v.id === line.variantId)!.priceDelta : 0;
    // Bấm Pha ngay: chất lượng cố định `autoQuality`, giá theo chất lượng cộng phụ thu.
    const auto = DATA.balance.madeToOrder.autoQuality;
    expect(line.value).toBe(brewedCupPrice(r, base, line.variantId ?? '', line.variantId ?? '', auto));
    expect(line.value).toBeLessThan(base + delta);
    expect(session!.brewProgress()).toBeNull();
    expect(c.counterRequestResolved).toBe(true);
  });

  it('khách hết kiên nhẫn hoặc rời khi đang pha: mẻ bị hủy và nguyên liệu không hoàn lại', () => {
    const state = teaShop(['hong_tra_macchiato']);
    const r = recipeById('hong_tra_macchiato')!;
    const session = untilOffer(state, 8)!;
    const c = session.front!;
    const line = c.order.find((l) => l.counterLine)!;
    session.startBrew();
    const spent = ingredientTotal(state, r);
    let cancelled = false;
    session.events.on('brewCancelled', () => { cancelled = true; });
    c.patience = 0;
    for (let i = 0; i < 5; i++) session.tick(0.1);
    expect(cancelled).toBe(true);
    expect(session.brewProgress()).toBeNull();
    expect(line.picked).toBe(0);
    expect(ingredientTotal(state, r)).toBe(spent);
    expect(state.today.served ?? 0).toBe(0);
  });

  it('thiếu nguyên liệu: không có lời mời pha, khách tính là hết món', () => {
    const state = teaShop(['hong_tra_macchiato']);
    state.warehouse = state.warehouse.filter((l) => l.productId !== 'foam_cheese');
    openShop(state);
    const session = new DaySession(state, 3);
    let offered = false;
    for (let i = 0; i < 3000; i++) { session.tick(0.1); if (session.brewOffer()) offered = true; }
    expect(offered).toBe(false);
    expect(Object.values(state.today.missed).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('món pha sẵn: có ly thường mà khách gọi Size L thì vẫn được mời pha ngay; có đúng ly thì không', () => {
    const state = teaShop(['hong_tra_sua']);
    expect(prepareRecipe(state, 'hong_tra_sua', 1).ok).toBe(true);
    openShop(state);
    const session = new DaySession(state, 12);
    let c: Customer | null = null;
    for (let i = 0; i < 4000; i++) { session.tick(0.1); if (session.front?.status === 'scanning' && !session.front.counterRequestResolved) { c = session.front; break; } }
    expect(c).not.toBeNull();
    const line = c!.order.find((l) => l.counterLine)!;
    line.variantId = 'size_l';
    expect(session.brewOffer()).not.toBeNull(); // chỉ có ly thường trên quầy
    line.variantId = undefined;
    expect(session.brewOffer()).toBeNull(); // có đúng ly thường
  });
});

describe('một ngày chỉ bán món pha theo đơn (tự phục vụ)', () => {
  const runDay = (state: GameState) => {
    openShop(state);
    const session = new DaySession(state, 31);
    runDayHeadless(session);
    return { session, summary: endDay(state) };
  };

  it('quầy trống vẫn có doanh thu nhờ pha ngay và trừ nguyên liệu', () => {
    const state = teaShop(['hong_tra_macchiato', 'matcha_latte']);
    const before = ['hong_tra_macchiato', 'matcha_latte'].reduce((n, id) => n + ingredientTotal(state, recipeById(id)!), 0);
    const { session, summary } = runDay(state);
    expect(session.ended).toBe(true);
    expect(state.today.served).toBeGreaterThan(3);
    expect(summary.revenue).toBeGreaterThan(0);
    expect(['hong_tra_macchiato', 'matcha_latte'].reduce((n, id) => n + ingredientTotal(state, recipeById(id)!), 0)).toBeLessThan(before);
    expect(state.counter.every((s) => !s.productId || s.qty === 0)).toBe(true); // không có ly pha sẵn
  });

  it('không có trạm pha thì không phục vụ được món pha theo đơn', () => {
    const state = teaShop(['hong_tra_macchiato']);
    state.fixtures = state.fixtures.filter((f) => f.type !== 'foam_machine');
    const { summary } = runDay(state);
    expect(state.today.served ?? 0).toBe(0);
    expect(summary.revenue).toBe(0);
  });
});
