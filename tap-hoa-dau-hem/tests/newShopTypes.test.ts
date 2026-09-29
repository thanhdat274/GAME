import { describe, expect, it } from 'vitest';
import { branchAvailable, maxStores, openBranch, visitStore } from '../src/core/branches';
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless } from '../src/core/day';
import { checkPaths } from '../src/core/layout';
import { shopTypeDef, shopTypeOf, validateShopTypes } from '../src/core/shopTypes';
import { createNewGame, unlockedProducts, warehouseQty, type GameState } from '../src/core/state';
import { autoArrange, buyStock, checkCart } from '../src/core/stock';

const NEW = [
  { branch: 'veg', type: 'greengrocer', feature: 'shop_veg', level: 31 },
  { branch: 'drink', type: 'drink_kiosk', feature: 'shop_drink', level: 32 },
  { branch: 'home', type: 'household', feature: 'shop_home', level: 34 },
] as const;

function richState(level: number): GameState {
  const state = createNewGame();
  state.level = level;
  state.money = 20_000_000;
  return state;
}

/** Nhập đủ hàng của loại tiệm đang đứng rồi xếp lên kệ. */
function stock(state: GameState): void {
  const cart: Record<string, number> = {};
  for (const item of unlockedProducts(state.level, state).filter((p) => !p.recipeOnly)) {
    for (let i = 0; i < 12; i++) {
      cart[item.id] = (cart[item.id] ?? 0) + 1;
      if (!checkCart(state, cart).ok) { cart[item.id]--; break; }
    }
  }
  buyStock(state, cart);
  autoArrange(state);
}

describe('loại cửa hàng mới (dữ liệu)', () => {
  it('dữ liệu loại tiệm và chi nhánh hợp lệ', () => {
    expect(validateShopTypes()).toEqual([]);
  });

  it('giới hạn chuỗi đủ chứa mọi chi nhánh', () => {
    expect(maxStores()).toBeGreaterThanOrEqual(DATA.branches.length + 1);
  });

  for (const { branch, type, feature, level } of NEW) {
    describe(`${branch} (${type})`, () => {
      it('chỉ mở khi đủ level và tính năng', () => {
        const low = richState(level - 1);
        expect(openBranch(low, branch)).toEqual({ ok: false, reason: 'locked' });
        const ok = richState(level);
        const def = DATA.branches.find((b) => b.id === branch)!;
        expect(def.feature).toBe(feature);
        expect(branchAvailable(ok, def)).toBe(true);
        const result = openBranch(ok, branch);
        expect(result.ok).toBe(true);
        expect(ok.money).toBe(20_000_000 - def.cost);
        expect(shopTypeOf(ok.stores.find((s) => s.id === branch)).def.id).toBe(type);
      });

      it('bố cục mặc định thông thoáng và chỉ gồm nội thất được phép', () => {
        const state = richState(level);
        openBranch(state, branch);
        expect(checkPaths(state).ok).toBe(true);
        const allowed = new Set(shopTypeDef(type).fixtures);
        for (const fixture of state.fixtures) expect(allowed.has(fixture.type)).toBe(true);
      });

      it('chạy được một ngày bán hàng có khách', () => {
        const state = richState(level);
        openBranch(state, branch);
        stock(state);
        openShop(state);
        const session = new DaySession(state, 7);
        runDayHeadless(session);
        expect(session.ended).toBe(true);
        expect(state.today.served).toBeGreaterThan(0);
        expect(endDay(state).revenue).toBeGreaterThan(0);
      });
    });
  }
});

describe('hàng bán theo loại tiệm', () => {
  const shop = (id: string) => shopTypeOf({ shopType: id } as never);

  it('tiệm rau củ bán hàng tươi/khô, không bán nước ngọt', () => {
    const veg = shop('greengrocer');
    const fresh = DATA.products.find((p) => p.category === 'fresh' && !p.recipeOnly && !p.eventOnly)!;
    const drink = DATA.products.find((p) => p.category === 'drink' && !p.recipeOnly && !p.eventOnly)!;
    expect(veg.allowsProduct(fresh.id)).toBe(true);
    expect(veg.allowsProduct(drink.id)).toBe(false);
  });

  it('quầy giải khát bán nước và nguyên liệu pha chế', () => {
    const kiosk = shop('drink_kiosk');
    const drink = DATA.products.find((p) => p.category === 'drink' && !p.recipeOnly && !p.eventOnly)!;
    expect(kiosk.allowsProduct(drink.id)).toBe(true);
    for (const id of ['tra_tac_base', 'ca_phe_bot', 'mia', 'sua_tuoi', 'trai_cay']) expect(kiosk.allowsProduct(id)).toBe(true);
    expect(kiosk.allowsProduct('gao')).toBe(false);
    expect(kiosk.allowsRecipe('tra_sua')).toBe(true);
    expect(kiosk.allowsProduct('tra_sua_tp')).toBe(true);
  });

  it('cửa hàng gia dụng chỉ bán đồ gia dụng và đồ khô', () => {
    const home = shop('household');
    const household = DATA.products.find((p) => p.category === 'household' && !p.recipeOnly && !p.eventOnly)!;
    const snack = DATA.products.find((p) => p.category === 'snack' && !p.recipeOnly && !p.eventOnly)!;
    expect(home.allowsProduct(household.id)).toBe(true);
    expect(home.allowsProduct(snack.id)).toBe(false);
  });

  it('đường cong khách mỗi loại khác nhau và khác tạp hóa', () => {
    const curves = ['greengrocer', 'drink_kiosk', 'household'].map((id) => [shop(id).densityAt(500), shop(id).densityAt(900), shop(id).densityAt(1100)].join(','));
    expect(new Set(curves).size).toBe(3);
    expect(shop('grocery').densityAt(500)).toBeNull();
  });

  it('ghé lại tiệm chính vẫn là tạp hóa sau khi mở tiệm mới', () => {
    const state = richState(34);
    openBranch(state, 'home');
    visitStore(state, 'main');
    expect(shopTypeOf(state.stores.find((s) => s.id === 'main')).def.id).toBe('grocery');
    expect(warehouseQty(state, 'gao')).toBe(0);
  });
});
