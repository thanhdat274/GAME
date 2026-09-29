import { describe, expect, it } from 'vitest';
import saveV5 from './fixtures/save-v5.json';
import { branchAvailable, openBranch, visitStore } from '../src/core/branches';
import { DATA, type ShopTypeDef } from '../src/core/data';
import { buyFixture, checkPaths } from '../src/core/layout';
import { expirePreparedFood, prepareRecipe } from '../src/core/recipes';
import { CURRENT_VERSION, PRE_MIGRATE_KEY, SAVE_KEY, loadGame, migrate, saveGame, type KeyValueStore } from '../src/core/save';
import { activeShopType, shopTypeOf, validateShopTypes } from '../src/core/shopTypes';
import { activateStore, createNewGame, lotsFrom, storeView, unlockedProducts, warehouseQty, type GameState } from '../src/core/state';
import { addLot, takeLots } from '../src/core/stock';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

function chainState(level = 35): GameState {
  const state = createNewGame();
  state.level = level;
  state.money = 10_000_000;
  return state;
}

describe('storeView: đọc/ghi tiệm không đứng', () => {
  it('tiệm đang đứng trả chính state; tiệm khác trả snapshot sống', () => {
    const state = chainState();
    expect(openBranch(state, 'market').ok).toBe(true);
    expect(storeView(state, 'market')).toBe(state);
    const main = storeView(state, 'main');
    expect(main).not.toBe(state);
    expect(() => storeView(state, 'nowhere')).toThrow();
  });

  it('ghi kho tiệm không đứng rồi activateStore thấy thay đổi', () => {
    const state = chainState();
    state.warehouse = lotsFrom({ mi_goi: 10 });
    openBranch(state, 'market');
    const main = storeView(state, 'main');
    addLot(main, 'trung_ga', 6, state.day + 3);
    const taken = takeLots(main, 'mi_goi', 4);
    expect(taken).toEqual([{ qty: 4, exp: null }]);
    expect(warehouseQty(state, 'mi_goi')).toBe(0); // kho Chợ không bị đụng
    activateStore(state, 'main');
    expect(warehouseQty(state, 'mi_goi')).toBe(6);
    expect(warehouseQty(state, 'trung_ga')).toBe(6);
  });

  it('chế biến và hỏng thành phẩm ở tiệm không đứng', () => {
    const state = chainState();
    state.fixtures.push({ uid: state.nextUid++, type: 'hot_kettle', x: 3, y: 5, rot: 0 });
    state.activeRecipes = ['trung_luoc'];
    state.warehouse = lotsFrom({ trung_ga: 4 });
    openBranch(state, 'market');
    const main = storeView(state, 'main');
    const result = prepareRecipe(state, 'trung_luoc', 1, undefined, main);
    expect(result.ok).toBe(true);
    expect(main.counter.find((slot) => slot.productId === 'trung_luoc_tp')?.qty).toBe(1);
    expect(state.counter.some((slot) => slot.productId === 'trung_luoc_tp')).toBe(false);
    expect(prepareRecipe(state, 'trung_luoc').ok).toBe(false); // Chợ không có bếp
    state.day += 2;
    expect(expirePreparedFood(state, main)).toBe(1);
    visitStore(state, 'main');
    expect(state.counter.some((slot) => slot.productId === 'trung_luoc_tp')).toBe(false);
    expect(warehouseQty(state, 'trung_ga')).toBe(2);
  });
});

describe('shopTypes.json', () => {
  it('dữ liệu hiện tại hợp lệ, có đủ các loại cửa hàng', () => {
    expect(validateShopTypes()).toEqual([]);
    expect(DATA.shopTypes.map((t) => t.id)).toEqual(['grocery', 'xoi', 'greengrocer', 'drink_kiosk', 'household', 'tea_shop', 'bakery', 'supermarket']);
  });

  it('báo lỗi tham chiếu sai, nêu rõ loại tiệm và id', () => {
    const bad = structuredClone(DATA.shopTypes) as ShopTypeDef[];
    bad[1].fixtures.push('xung_hap_2');
    bad[1].customers.push('ma_ca_rong');
    bad[1].recipes.push('xoi_khong_co');
    bad[1].categories.push('banh' as never);
    const errors = validateShopTypes(bad);
    expect(errors).toContain('shopTypes.xoi: nội thất "xung_hap_2" không có trong furniture.json');
    expect(errors.some((e) => e.includes('ma_ca_rong'))).toBe(true);
    expect(errors.some((e) => e.includes('xoi_khong_co'))).toBe(true);
    expect(errors.some((e) => e.includes('"banh"'))).toBe(true);
    const branches = structuredClone(DATA.branches);
    branches[0].shopType = 'tra_sua' as never;
    expect(validateShopTypes(DATA.shopTypes, branches).some((e) => e.includes('tra_sua'))).toBe(true);
  });

  it('snapshot thiếu shopType là tạp hóa; tạp hóa giữ nguyên hàng và nội thất', () => {
    expect(shopTypeOf(undefined).def.id).toBe('grocery');
    const state = createNewGame();
    state.level = 40;
    const grocery = activeShopType(state);
    expect(grocery.def.sim).toBe('profit_average');
    expect(grocery.densityAt(500)).toBeNull();
    const xoiOnly = ['thung_ngam', 'xung_hap', 'quay_xoi'];
    const teaOnly = ['tea_bar', 'foam_machine'];
    expect(DATA.furniture.filter((f) => !xoiOnly.includes(f.id) && !teaOnly.includes(f.id)).every((f) => grocery.allowsFixture(f.id))).toBe(true);
    expect(xoiOnly.some((id) => grocery.allowsFixture(id))).toBe(false);
    expect(teaOnly.some((id) => grocery.allowsFixture(id))).toBe(false);
    const all = unlockedProducts(40, state).map((p) => p.id);
    const unfiltered = DATA.products.filter((p) => !p.recipeOnly && !p.eventOnly && !p.shopOnly && p.unlockLevel <= 40).map((p) => p.id);
    expect(all).toEqual(unfiltered);
  });

  it('tiệm xôi đông khách buổi sáng và mô phỏng kiểu sản xuất', () => {
    const xoi = shopTypeOf({ shopType: 'xoi' });
    expect(xoi.def.sim).toBe('production');
    expect(xoi.densityAt(8 * 60 + 30)!).toBeGreaterThan(xoi.densityAt(14 * 60)!);
    expect(xoi.allowsFixture('freezer')).toBe(false);
    expect(xoi.allowsFixture('food_table_2')).toBe(true);
  });
});

describe('mở tiệm theo loại, giới hạn chuỗi', () => {
  it('Tiệm xôi mở từ L29 nhờ tính năng shop_xoi', () => {
    const state = chainState(28);
    const def = DATA.branches.find((b) => b.id === 'xoi')!;
    expect(branchAvailable(state, def)).toBe(false);
    expect(openBranch(state, 'xoi')).toEqual({ ok: false, reason: 'locked' });
    state.level = 29;
    expect(branchAvailable(state, def)).toBe(true);
    const result = openBranch(state, 'xoi');
    expect(result.ok).toBe(true);
    expect(state.money).toBe(10_000_000 - 700_000);
    const store = state.stores.find((s) => s.id === 'xoi')!;
    expect(store.shopType).toBe('xoi');
    expect(state.stores.find((s) => s.id === 'main')!.shopType).toBe('grocery');
    expect(state.fixtures.map((f) => f.type)).toEqual(['counter', 'thung_ngam', 'xung_hap', 'quay_xoi', 'food_table_2']);
    expect(checkPaths(state).ok).toBe(true);
    expect(state.diningTables).toHaveLength(1);
    expect(state.soakBatches).toEqual([{ id: 'soak-starter', kg: 3, startDay: state.day - 1, startMinute: 1200 }]);
    expect(state.morningNotes.some((note) => note.includes('ngâm sẵn'))).toBe(true);
    expect(activeShopType(state).def.id).toBe('xoi');
  });

  it('ở tiệm xôi: Sắp xếp và Nhập hàng chỉ có món loại tiệm cho phép', () => {
    const state = chainState(35);
    openBranch(state, 'xoi');
    expect(buyFixture(state, 'freezer', 0, 5, 0)).toBe('shop');
    expect(unlockedProducts(state.level, state).map((p) => p.id).sort()).toEqual(
      ['bao_goi', 'cha_bong', 'dau_xanh', 'dua_nao', 'hanh_phi', 'lap_xuong', 'nep', 'sua_dau_nanh', 'tra_da', 'trung_ga'],
    );
    expect(buyFixture(state, 'food_table_2', 3, 6, 0)).not.toBe('plot'); // tiệm xôi không dùng mảnh đất
    visitStore(state, 'main');
    expect(buyFixture(state, 'freezer', 3, 5, 0)).not.toBe('shop');
    expect(unlockedProducts(state.level, state).length).toBeGreaterThan(20);
  });

  it('giới hạn số tiệm đọc từ balance.json › chain.maxStores (mặc định 12)', () => {
    expect(DATA.balance.chain.maxStores).toBe(12);
    const before = DATA.balance.chain.maxStores;
    DATA.balance.chain.maxStores = 2;
    try {
      const state = chainState();
      expect(openBranch(state, 'market').ok).toBe(true);
      expect(openBranch(state, 'school')).toEqual({ ok: false, reason: 'limit' });
    } finally {
      DATA.balance.chain.maxStores = before;
    }
  });
});

describe('bản lưu v6', () => {
  it('migrate v5 có 3 tiệm: đều là tạp hóa, số liệu giữ nguyên', () => {
    const file = structuredClone(saveV5) as unknown as { version: number; state: Record<string, unknown> };
    const v5 = file.state as unknown as GameState;
    const state = migrate(file);
    expect(state.version).toBe(CURRENT_VERSION);
    expect(state.stores.map((s) => [s.id, s.shopType])).toEqual([['main', 'grocery'], ['market', 'grocery'], ['school', 'grocery']]);
    expect(state.money).toBe(v5.money);
    expect(state.level).toBe(v5.level);
    expect(state.internalOrders).toEqual([]);
    expect(state.recurringOrders).toEqual([]);
    expect(state.soakBatches).toEqual([]);
    expect(storeView(state, 'market').soakBatches).toEqual([]);
    expect(warehouseQty(storeView(state, 'market'), 'trung_ga')).toBe(20);
    expect(warehouseQty(state, 'mi_goi')).toBe(30);
    expect(state.staff).toEqual(v5.staff);
  });

  it('tải v5 từ localStorage: ghi lại ở bản mới nhất và giữ bản trước migrate', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, JSON.stringify(saveV5));
    const res = loadGame(store);
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(JSON.parse(store.getItem(PRE_MIGRATE_KEY)!).version).toBe(5);
    saveGame(res.state, store);
    expect(JSON.parse(store.getItem(SAVE_KEY)!).version).toBe(CURRENT_VERSION);
  });

  it('mẻ ngâm, nếp chín và đơn định kỳ được lưu/tải nguyên vẹn; 6 tiệm < 1 MB', () => {
    const state = chainState(40);
    for (const id of ['xoi', 'market', 'school', 'industrial']) { openBranch(state, id); visitStore(state, 'main'); }
    activateStore(state, 'xoi');
    state.soakBatches = [{ id: 'soak-1', kg: 5, startDay: state.day, startMinute: 1200 }];
    state.cookedRice.push({ portions: 18, cookedDay: state.day, cookedMinute: 360, quality: 0.9 });
    state.recurringOrders.push({ id: 'rec-1', fromStoreId: 'xoi', toStoreId: 'main', items: { trung_ga: 10 }, active: true, shortStreak: 0 });
    activateStore(state, 'main');
    // Tiệm thứ 6: nhân bản snapshot để đo kích thước tối đa.
    state.stores.push({ ...structuredClone(state.stores[1]), id: 'extra', name: 'Tiệm thêm' });
    const store = memoryStore();
    saveGame(state, store);
    expect(new TextEncoder().encode(store.getItem(SAVE_KEY)!).length).toBeLessThan(1_000_000);
    const res = loadGame(store);
    if (res.status !== 'ok') throw new Error(res.status);
    const loaded = res.state;
    expect(loaded.stores).toHaveLength(6);
    expect(loaded.recurringOrders[0]).toMatchObject({ id: 'rec-1', active: true });
    const xoi = storeView(loaded, 'xoi');
    expect(xoi.soakBatches).toEqual([{ id: 'soak-1', kg: 5, startDay: state.day, startMinute: 1200 }]);
    expect(xoi.cookedRice[0]).toMatchObject({ portions: 18, cookedMinute: 360 });
    expect(loaded.stores.find((s) => s.id === 'xoi')!.shopType).toBe('xoi');
  });
});
