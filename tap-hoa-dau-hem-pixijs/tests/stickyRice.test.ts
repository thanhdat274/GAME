import { describe, expect, it } from 'vitest';
import { openBranch, visitStore } from '../src/core/branches';
import { createCustomer, generateCounterOrder, shopDensityAt } from '../src/core/customers';
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless, startNextDay } from '../src/core/day';
import { ensureDiningTables, serveDiningAddOns, seatDiner } from '../src/core/dining';
import { missingIngredients, prepareRecipe, setRecipeActive } from '../src/core/recipes';
import { Rng } from '../src/core/rng';
import {
  cookedPortions, discardSpoiledSoaks, isWarm, soakStatus, spoilRiceEndOfDay, startSoak, steamBatch, suggestSoakKg, takeCookedRice,
} from '../src/core/stickyRice';
import { createNewGame, lotsFrom, warehouseQty, type GameState } from '../src/core/state';

const XOI_STOCK = { nep: 20, dau_xanh: 20, hanh_phi: 20, cha_bong: 20, lap_xuong: 20, dua_nao: 20, trung_ga: 20, bao_goi: 20, tra_da: 20 };

/** Chuỗi L29 vừa mở tiệm xôi, đang đứng ở tiệm xôi với kho đủ nguyên liệu. */
function xoiState(): GameState {
  const state = createNewGame();
  state.level = 29;
  state.money = 5_000_000;
  expect(openBranch(state, 'xoi').ok).toBe(true);
  state.warehouse = lotsFrom(XOI_STOCK);
  state.soakBatches = [];
  return state;
}

function cook(state: GameState, kg = 2, quality = 1): void {
  state.soakBatches.push({ id: 'b1', kg, startDay: state.day - 1, startMinute: 20 * 60 });
  expect(steamBatch(state, state, 'b1', quality).ok).toBe(true);
}

describe('ngâm nếp', () => {
  it('ngâm cuối ngày thì sáng hôm sau sẵn sàng hấp', () => {
    const state = xoiState();
    state.clock = 20 * 60;
    const soak = startSoak(state, state, 5);
    expect(soak.ok).toBe(true);
    expect(warehouseQty(state, 'nep')).toBe(15);
    if (!soak.ok) return;
    expect(soakStatus(soak.batch, state.day + 1, 8 * 60).kind).toBe('ready');
  });

  it('chưa ngâm đủ thì từ chối hấp và báo thời gian còn lại', () => {
    const state = xoiState();
    state.clock = 8 * 60;
    const soak = startSoak(state, state, 2);
    if (!soak.ok) throw new Error(soak.reason);
    state.clock = 10 * 60;
    expect(steamBatch(state, state, soak.batch.id)).toEqual({ ok: false, reason: 'soaking', minutesLeft: 240 });
  });

  it('ngâm quá 24 giờ thì chua, bị loại và ghi hàng hỏng', () => {
    const state = xoiState();
    state.soakBatches.push({ id: 'old', kg: 4, startDay: state.day - 2, startMinute: 7 * 60 });
    expect(soakStatus(state.soakBatches[0], state.day, state.clock).kind).toBe('spoiled');
    expect(steamBatch(state, state, 'old')).toEqual({ ok: false, reason: 'spoiled' });
    expect(discardSpoiledSoaks(state, state)).toBe(4);
    expect(state.soakBatches).toEqual([]);
    expect(state.today.spoiled.nep).toBe(4);
  });

  it('cần thùng ngâm, không vượt sức chứa, không ngâm quá số nếp có', () => {
    const state = xoiState();
    expect(startSoak(state, state, 11)).toEqual({ ok: false, reason: 'capacity' });
    state.warehouse = lotsFrom({ nep: 1 });
    expect(startSoak(state, state, 2)).toEqual({ ok: false, reason: 'rice' });
    state.fixtures = state.fixtures.filter((f) => f.type !== 'thung_ngam');
    expect(startSoak(state, state, 1)).toEqual({ ok: false, reason: 'tank' });
  });
});

describe('hấp và giữ nóng', () => {
  it('mẻ 5 kg ra 25 phần, mẻ cũ dùng trước, nguội sau 5 giờ', () => {
    const state = xoiState();
    state.clock = 7 * 60;
    cook(state, 5, 1.1);
    expect(cookedPortions(state)).toBe(25);
    expect(state.cookedRice[0]).toMatchObject({ portions: 25, quality: 1.1 });
    expect(isWarm(state.cookedRice[0], state.day, 11 * 60 + 59)).toBe(true);
    expect(isWarm(state.cookedRice[0], state.day, 12 * 60)).toBe(false);
    expect(takeCookedRice(state, 2, state.day, 13 * 60)).toEqual({ quality: 1.1, cold: true });
    expect(cookedPortions(state)).toBe(23);
  });

  it('không có xửng hấp thì không hấp được', () => {
    const state = xoiState();
    state.fixtures = state.fixtures.filter((f) => f.type !== 'xung_hap');
    state.soakBatches.push({ id: 'b', kg: 1, startDay: state.day - 1, startMinute: 1200 });
    expect(steamBatch(state, state, 'b')).toEqual({ ok: false, reason: 'steamer' });
  });

  it('cuối ngày nếp chín thừa bị bỏ và ghi hàng hỏng', () => {
    const state = xoiState();
    cook(state, 2);
    expect(spoilRiceEndOfDay(state, state).portions).toBe(10);
    expect(state.cookedRice).toEqual([]);
    expect(state.today.spoiled.nep_chin).toBe(10);
  });
});

describe('món xôi', () => {
  it('làm xôi mặn trừ 1 phần nếp chín và topping, ra quầy', () => {
    const state = xoiState();
    cook(state, 1);
    expect(setRecipeActive(state, 'xoi_man', true)).toBe(true);
    const made = prepareRecipe(state, 'xoi_man', 1);
    expect(made.ok).toBe(true);
    expect(cookedPortions(state)).toBe(4);
    for (const id of ['cha_bong', 'lap_xuong', 'hanh_phi']) expect(warehouseQty(state, id)).toBe(19);
    expect(state.counter.find((slot) => slot.productId === 'xoi_man_tp')?.qty).toBe(1);
  });

  it('thiếu topping hoặc chưa có nếp chín thì báo thiếu nguyên liệu', () => {
    const state = xoiState();
    setRecipeActive(state, 'xoi_man', true);
    expect(prepareRecipe(state, 'xoi_man')).toEqual({ ok: false, reason: 'ingredients' });
    cook(state, 1);
    state.warehouse = state.warehouse.filter((lot) => lot.productId !== 'cha_bong');
    const recipe = DATA.recipes.find((r) => r.id === 'xoi_man')!;
    expect(missingIngredients(state, recipe)).toEqual(['cha_bong']);
    expect(prepareRecipe(state, 'xoi_man')).toEqual({ ok: false, reason: 'ingredients' });
  });

  it('nếp nguội làm món chỉ còn "Tạm được"; thêm topping tốn thêm nguyên liệu', () => {
    const state = xoiState();
    state.clock = 7 * 60;
    cook(state, 2, 1.2);
    setRecipeActive(state, 'xoi_dau_xanh', true);
    const hot = prepareRecipe(state, 'xoi_dau_xanh', 1.2);
    state.clock = 13 * 60;
    const cold = prepareRecipe(state, 'xoi_dau_xanh', 1.2);
    if (!hot.ok || !cold.ok) throw new Error('không làm được');
    expect(hot.quality).toBeGreaterThan(1);
    expect(cold.quality).toBeLessThanOrEqual(DATA.balance.stickyRice.coldQualityCap);
    const before = warehouseQty(state, 'dau_xanh');
    expect(prepareRecipe(state, 'xoi_dau_xanh', 1, 'them_topping').ok).toBe(true);
    expect(warehouseQty(state, 'dau_xanh')).toBe(before - 2);
  });

  it('xôi gói tốn thêm bao gói', () => {
    const state = xoiState();
    cook(state, 1);
    setRecipeActive(state, 'xoi_trung_goi', true);
    expect(prepareRecipe(state, 'xoi_trung_goi').ok).toBe(true);
    expect(warehouseQty(state, 'bao_goi')).toBe(19);
    expect(state.counter.some((slot) => slot.productId === 'xoi_trung_goi' && slot.qty === 1)).toBe(true);
  });

  it('tạp hóa không nấu được xôi', () => {
    const state = xoiState();
    visitStore(state, 'main');
    state.fixtures.push({ uid: state.nextUid++, type: 'quay_xoi', x: 3, y: 5, rot: 0 });
    expect(setRecipeActive(state, 'xoi_man', true)).toBe(false);
    state.activeRecipes.push('xoi_man');
    expect(prepareRecipe(state, 'xoi_man')).toEqual({ ok: false, reason: 'shop' });
  });
});

describe('khách và bàn ở tiệm xôi', () => {
  it('buổi sáng đông khách hơn buổi chiều', () => {
    const state = xoiState();
    expect(shopDensityAt(state, 8 * 60 + 30)).toBeGreaterThan(shopDensityAt(state, 14 * 60) * 2);
    visitStore(state, 'main');
    expect(shopDensityAt(state, 14 * 60)).toBe(0.65); // tạp hóa giữ đường cong cũ
  });

  it('khách chỉ gọi món xôi đang bán ở quầy (không gọi xôi gói), đúng loại khách', () => {
    const state = xoiState();
    const rng = new Rng(7);
    const type = DATA.customers.find((c) => c.id === 'van_phong')!;
    expect(generateCounterOrder(type, rng, state)).toEqual([]);
    for (const id of ['xoi_man', 'xoi_dua', 'xoi_man_goi']) setRecipeActive(state, id, true);
    const allowed = new Set(['xoi_man_tp', 'xoi_dua_tp']);
    for (let i = 0; i < 30; i++) {
      const c = createCustomer(i, state.level, rng, state);
      expect(DATA.shopTypes[1].customers).toContain(c.type.id);
      expect(c.order.length).toBeGreaterThan(0);
      expect(c.order.every((line) => line.counterLine && allowed.has(line.productId))).toBe(true);
    }
  });

  it('khách ngồi ăn gọi thêm trà đá từ kho; bàn bẩn sau khi ăn', () => {
    const state = xoiState();
    const table = seatDiner(state, 1, 'xoi_man_tp')!;
    expect(table).not.toBeNull();
    const rng = { next: () => 0 } as unknown as Rng;
    expect(serveDiningAddOns(state, table, rng)).toContain('tra_da');
    expect(warehouseQty(state, 'tra_da')).toBe(19);
    expect(state.today.sold.tra_da).toBe(1);
    expect(seatDiner(state, 2, 'xoi_man_tp')).toBeNull(); // hết bàn sạch → mang đi
    expect(ensureDiningTables(state)[0].status).toBe('occupied');
  });

  it('một ngày tiệm xôi chạy tự động: bán được món, có khách ngồi, cuối ngày bỏ nếp thừa', () => {
    const state = xoiState();
    cook(state, 4);
    for (const id of ['xoi_man', 'xoi_dau_xanh', 'xoi_trung', 'xoi_dua']) setRecipeActive(state, id, true);
    for (let i = 0; i < 4; i++) for (const id of ['xoi_man', 'xoi_dau_xanh', 'xoi_trung']) prepareRecipe(state, id, 1);
    openShop(state);
    const session = new DaySession(state);
    runDayHeadless(session);
    expect(session.ended).toBe(true);
    const sold = ['xoi_man_tp', 'xoi_dau_xanh_tp', 'xoi_trung_tp'].reduce((n, id) => n + (state.today.sold[id] ?? 0), 0);
    expect(sold).toBeGreaterThan(0);
    endDay(state);
    expect(state.cookedRice).toEqual([]);
    expect(suggestSoakKg(state)).toBeGreaterThanOrEqual(2);
    startNextDay(state);
    expect(state.phase).toBe('morning');
  });
});
