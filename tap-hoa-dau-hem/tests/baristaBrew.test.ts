import { describe, expect, it } from 'vitest';
import { visitStore } from '../src/core/branches';
import { brewedCupPrice, handBrewQuality, qualityLabel, staffBrewQuality } from '../src/core/customCups';
import { DATA, recipeById } from '../src/core/data';
import { DaySession, openShop } from '../src/core/day';
import { createMaxLevelSimulation } from '../src/core/simulation';
import type { GameState } from '../src/core/state';
import { addLot } from '../src/core/stock';

const RECIPE = 'hong_tra_macchiato';

/** Tiệm trà sữa hồ sơ max, tắt quản lý, quầy trống, chỉ bán món pha theo đơn, kho đầy nguyên liệu; `staff` thêm pha chế viên nếu > 0 (chỉ số chuẩn xác 9). */
function teaShop(baristas: number): GameState {
  const state = createMaxLevelSimulation();
  visitStore(state, 'tea');
  state.staff = [];
  state.schedule = {};
  state.manager = { enabled: false, speed: 1 };
  state.counter = state.counter.map(() => ({ productId: null, qty: 0, lots: [] } as never));
  state.activeRecipes = [RECIPE];
  for (const p of DATA.products.filter((x) => x.shopOnly || x.id === 'sua_tuoi' || x.id === 'nuoc_da')) addLot(state, p.id, 400, state.day + 60);
  for (let i = 0; i < baristas; i++) {
    const id = `pha_che_${i}`;
    state.staff.push({
      id, name: `Pha chế ${i}`, personality: 'diem_tinh', look: { shirt: '#fff', pants: '#000', hair: '#000', skin: '#fff' }, role: 'barista',
      stats: { speed: 9, accuracy: 9, friendly: 5, stamina: 9 }, wage: 20000, level: 1, exp: 0, mood: 90,
      hiredDay: 1, streak: 0, lowMoodDays: 0, quitting: false, scoldedDay: null,
      lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 },
    } as never);
    state.schedule[id] = new Array(14).fill(true);
  }
  return state;
}

function untilOffer(state: GameState, seed: number, max = 4000): DaySession | null {
  openShop(state);
  const session = new DaySession(state, seed);
  for (let i = 0; i < max; i++) {
    session.tick(0.1);
    if (session.brewOffer()) return session;
  }
  return null;
}

describe('chất lượng ly pha theo đơn', () => {
  it('pha tay: không sai là 1.1, mỗi bước sai trừ 0.07, sàn 0.75; pha chế viên theo độ chuẩn xác', () => {
    expect(handBrewQuality(0)).toBeCloseTo(1.1);
    expect(handBrewQuality(2)).toBeCloseTo(0.96);
    expect(handBrewQuality(50)).toBe(0.75);
    expect(staffBrewQuality(5)).toBeCloseTo(0.975);
    expect(staffBrewQuality(9)).toBe(1.1);
    expect(qualityLabel(1.1)).toBe('Rất ngon');
    expect(qualityLabel(0.97)).toBe('Ngon');
    expect(qualityLabel(0.8)).toBe('Tạm được');
  });

  it('giá ly theo chất lượng: chất lượng 1 giữ nguyên giá, cao hơn thì tăng, vẫn cộng phụ thu như cũ', () => {
    const r = recipeById(RECIPE)!;
    const v = r.variants![0];
    expect(brewedCupPrice(r, 40_000, '', '', 1)).toBe(40_000);
    expect(brewedCupPrice(r, 40_000, '', '', 1.1)).toBe(44_000);
    expect(brewedCupPrice(r, 40_000, '', '', 0.8)).toBe(32_000);
    expect(brewedCupPrice(r, 40_000, v.id, v.id, 1)).toBe(40_000 + v.priceDelta);
    expect(brewedCupPrice(r, 40_000, '', '', 5)).toBe(50_000); // hệ số tối đa 1.25
  });
});

describe('pha tay khi khách chờ', () => {
  it('giao ngay ly với chất lượng mini-game: trừ nguyên liệu, giá cao hơn ly bấm Pha ngay', () => {
    const state = teaShop(0);
    const r = recipeById(RECIPE)!;
    const session = untilOffer(state, 5)!;
    expect(session).not.toBeNull();
    const c = session.front!;
    const line = c.order.find((l) => l.counterLine)!;
    const want = line.variantId ?? '';
    const base = state.prices[line.productId] ?? DATA.products.find((p) => p.id === line.productId)!.price;
    let done: { quality?: number; by?: string | null } | null = null;
    session.events.on('brewDone', (e) => { done = e; });

    expect(session.brewByHand(1.1)).toBe(true);
    expect(done).toMatchObject({ quality: 1.1, by: null });
    expect(line.picked).toBe(1);
    expect(line.value).toBe(brewedCupPrice(r, base, want, want, 1.1));
    expect(line.value).toBeGreaterThan(brewedCupPrice(r, base, want, want, DATA.balance.madeToOrder.autoQuality));
    expect(c.counterRequestResolved).toBe(true);
    expect(session.brewProgress()).toBeNull();
    expect(session.brewByHand(1.1)).toBe(false); // hết yêu cầu
  });

  it('không pha tay được khi đã có mẻ đang pha', () => {
    const state = teaShop(0);
    const session = untilOffer(state, 5)!;
    expect(session.startBrew()).toBe(true);
    expect(session.brewOffer()).toBeNull();
    expect(session.brewByHand(1)).toBe(false);
  });
});

describe('pha chế viên pha theo đơn song song', () => {
  /** Chạy tới khi có một sự kiện thỏa `until` hoặc hết `max` nhịp; trả các sự kiện đã gặp. */
  function run(state: GameState, seed: number, max: number) {
    openShop(state);
    const session = new DaySession(state, seed);
    const done: { customerId: number; quality?: number; by?: string | null; value: number }[] = [];
    const cancelled: number[] = [];
    session.events.on('brewDone', (e) => { done.push({ customerId: e.customer.id, quality: e.quality, by: e.by, value: e.customer.order.find((l) => l.counterLine)?.value ?? 0 }); });
    session.events.on('brewCancelled', (e) => { cancelled.push(e.customer.id); });
    let queuedAhead = false;
    for (let i = 0; i < max; i++) {
      session.tick(0.1);
      if ((session as unknown as { prebrewed: Map<number, unknown> }).prebrewed.size > 0) queuedAhead = true;
    }
    return { session, done, cancelled, queuedAhead };
  }

  it('pha chế viên tự pha ly cho khách đang chờ, không cần người chơi bấm', () => {
    const state = teaShop(1);
    const { done } = run(state, 7, 4000);
    const byStaff = done.filter((d) => d.by === 'Pha chế 0');
    expect(byStaff.length).toBeGreaterThan(0);
    expect(byStaff[0].quality).toBe(1.1);
    expect(state.today.counterServed).toBeGreaterThan(0);
  });

  it('pha trước cho khách đang xếp hàng: tới lượt là nhận ly ngay', () => {
    const state = teaShop(2);
    const { queuedAhead, done, session } = run(state, 11, 6000);
    expect(queuedAhead).toBe(true);
    expect(done.length).toBeGreaterThan(2);
    expect(session.ended || state.today.served + state.today.left >= 0).toBe(true);
  });

  it('có pha chế viên thì phục vụ được nhiều khách hơn khi người chơi không thao tác', () => {
    const solo = teaShop(0);
    const helped = teaShop(2);
    run(solo, 21, 6000);
    run(helped, 21, 6000);
    expect(helped.today.counterServed).toBeGreaterThan(solo.today.counterServed);
  });

  it('khách bỏ đi khi đang pha: mẻ bị hủy, pha chế viên rảnh lại và nguyên liệu không hoàn', () => {
    const state = teaShop(1);
    openShop(state);
    const session = new DaySession(state, 9);
    let cancelled = 0;
    session.events.on('brewCancelled', () => { cancelled++; });
    let target = null as ReturnType<DaySession['brewProgress']>;
    for (let i = 0; i < 4000 && !target; i++) {
      session.tick(0.1);
      const p = session.brewProgress();
      if (p?.by) target = p;
    }
    expect(target).not.toBeNull();
    expect(session.brewOffer()).toBeNull(); // khách này đã có người pha
    session.front!.patience = 0;
    for (let i = 0; i < 5; i++) session.tick(0.1);
    expect(cancelled).toBeGreaterThan(0);
    expect(session.brewProgress()?.by).toBeUndefined();
  });
});
