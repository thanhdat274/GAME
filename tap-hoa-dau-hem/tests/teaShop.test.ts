import { describe, expect, it } from 'vitest';
import { branchAvailable, maxStores, openBranch } from '../src/core/branches';
import { DATA, validateLevels, type Product } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless } from '../src/core/day';
import { checkPaths } from '../src/core/layout';
import { PRESTIGE_EXP_PER_STAR, currentTitle, prestigeStars } from '../src/core/prestige';
import { prepareRecipe, recipeRequirements, validateRecipes } from '../src/core/recipes';
import { shopTypeDef, shopTypeOf, validateShopTypes } from '../src/core/shopTypes';
import { staffSlots } from '../src/core/staff';
import { createMaxLevelSimulation } from '../src/core/simulation';
import { TEA_BAR_GROUPS, barGroupOf, teaOrder } from '../src/core/teaBar';
import { visitStore } from '../src/core/branches';
import { createNewGame, unlockedProducts, warehouseQty, type GameState } from '../src/core/state';
import { addLot, buyStock, checkCart } from '../src/core/stock';

const TEA_RECIPES = DATA.recipes.filter((r) => r.station === 'tea_bar' || r.station === 'foam_machine');
const TEA_INGREDIENTS = DATA.products.filter((p) => p.shopOnly);

function chain(level: number): GameState {
  const state = createNewGame();
  state.level = level;
  state.money = 60_000_000;
  return state;
}

function teaShop(level: number): GameState {
  const state = chain(level);
  expect(openBranch(state, 'tea').ok).toBe(true);
  return state;
}

describe('dữ liệu tiệm trà sữa', () => {
  it('công thức và loại tiệm hợp lệ, giá vốn thành phẩm khớp nguyên liệu', () => {
    expect(validateRecipes()).toEqual([]);
    expect(validateShopTypes()).toEqual([]);
    expect(TEA_RECIPES).toHaveLength(14);
  });

  it('mỗi món có lãi (giá bán ≥ 1.5× giá vốn) và biến thể có lãi thêm', () => {
    for (const r of TEA_RECIPES) {
      const out = DATA.products.find((p) => p.id === r.output)!;
      expect(out.price, r.id).toBeGreaterThanOrEqual(out.cost * 1.5);
      for (const v of r.variants ?? []) {
        const extra = Object.entries(v.extraIngredients ?? {}).reduce((s, [id, q]) => s + DATA.products.find((p) => p.id === id)!.cost * q, 0);
        expect(v.priceDelta, `${r.id}/${v.id}`).toBeGreaterThan(extra);
        const req = recipeRequirements(r, v);
        for (const [id, q] of Object.entries(r.ingredients)) expect(req[id] ?? 0, `${r.id}/${v.id}:${id}`).toBeGreaterThanOrEqual(q);
      }
    }
  });

  it('nguyên liệu riêng đều nằm trong ingredients của tiệm trà sữa và không đổi giữa các món', () => {
    const listed = new Set(shopTypeDef('tea_shop').ingredients);
    expect(TEA_INGREDIENTS.length).toBeGreaterThanOrEqual(20);
    for (const p of TEA_INGREDIENTS) expect(listed.has(p.id), p.id).toBe(true);
    for (const r of TEA_RECIPES) for (const id of Object.keys(r.ingredients)) expect(listed.has(id), `${r.id}:${id}`).toBe(true);
  });

  it('món nâng cao dùng máy foam; món cơ bản dùng quầy pha trà', () => {
    for (const r of TEA_RECIPES) {
      const needsFoam = Object.keys(r.ingredients).some((id) => id.startsWith('foam_'));
      expect(r.station, r.id).toBe(needsFoam ? 'foam_machine' : 'tea_bar');
    }
  });
});

describe('nguyên liệu riêng (shopOnly)', () => {
  it('tạp hóa và mọi tiệm khác không thấy nguyên liệu trà sữa ở level tối đa', () => {
    const state = chain(DATA.levels.maxLevel);
    const grocery = unlockedProducts(state.level, state).map((p) => p.id);
    for (const p of TEA_INGREDIENTS) expect(grocery, p.id).not.toContain(p.id);
    expect(unlockedProducts(state.level).map((p) => p.id).some((id) => TEA_INGREDIENTS.some((p) => p.id === id))).toBe(false);
    for (const type of ['xoi', 'greengrocer', 'drink_kiosk', 'household', 'bakery', 'supermarket']) {
      const shop = shopTypeOf({ shopType: type } as never);
      for (const p of TEA_INGREDIENTS) expect(shop.allowsProduct(p.id), `${type}:${p.id}`).toBe(false);
    }
  });

  it('tiệm trà sữa bán nguyên liệu theo level mở khóa của từng món', () => {
    const at = (level: number): Set<string> => {
      const state = teaShop(Math.max(level, 36));
      state.level = level;
      return new Set(unlockedProducts(level, state).map((p) => p.id));
    };
    expect(at(36).has('tra_sua_base')).toBe(true);
    expect(at(36).has('foam_cheese')).toBe(false);
    expect(at(41).has('foam_cheese')).toBe(true);
    expect(at(46).has('foam_ube')).toBe(false);
    expect(at(47).has('foam_ube')).toBe(true);
    // Hàng thường (sữa tươi, nước đá) vẫn bán được.
    expect(at(40).has('sua_tuoi')).toBe(true);
    expect(at(40).has('nuoc_da')).toBe(true);
  });
});

describe('mở tiệm trà sữa', () => {
  it('chỉ mở từ level 36 và cần đủ tiền', () => {
    const low = chain(35);
    const def = DATA.branches.find((b) => b.id === 'tea')!;
    expect(def.feature).toBe('shop_tea');
    expect(branchAvailable(low, def)).toBe(false);
    expect(openBranch(low, 'tea')).toEqual({ ok: false, reason: 'locked' });
    const poor = chain(36);
    poor.money = def.cost - 1;
    expect(openBranch(poor, 'tea')).toEqual({ ok: false, reason: 'money' });
    const ok = chain(36);
    expect(openBranch(ok, 'tea').ok).toBe(true);
    expect(ok.money).toBe(60_000_000 - def.cost);
    expect(shopTypeOf(ok.stores.find((s) => s.id === 'tea')).def.id).toBe('tea_shop');
  });

  it('bố cục mặc định thông thoáng, có quầy pha trà và chỉ dùng nội thất được phép', () => {
    const state = teaShop(36);
    expect(checkPaths(state).ok).toBe(true);
    expect(state.fixtures.some((f) => f.type === 'tea_bar')).toBe(true);
    const allowed = new Set(shopTypeDef('tea_shop').fixtures);
    for (const f of state.fixtures) expect(allowed.has(f.type), f.type).toBe(true);
  });

  it('món chỉ pha được khi đủ level; món cần máy foam thì cần có máy', () => {
    const state = teaShop(36);
    expect(prepareRecipe(state, 'tra_sua_tran_chau').ok).toBe(false); // chưa có nguyên liệu
    const late = teaShop(36);
    late.level = 36;
    expect(prepareRecipe(late, 'olong_sua')).toEqual({ ok: false, reason: 'locked' });
    const foam = teaShop(47);
    foam.activeRecipes = ['tra_ube'];
    const r = prepareRecipe(foam, 'hong_tra_macchiato');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['station', 'menu', 'ingredients']).toContain(r.reason);
  });
});

/** Nhập đủ nguyên liệu cho mọi món đã mở rồi pha sẵn lên quầy. */
function stockAndPrepare(state: GameState): void {
  const cart: Record<string, number> = {};
  for (const item of unlockedProducts(state.level, state).filter((p: Product) => p.shopOnly || p.id === 'sua_tuoi' || p.id === 'nuoc_da')) {
    // Kho ban đầu nhỏ (30 ô): mỗi mặt hàng 10 đơn vị = 1 ô.
    for (let i = 0; i < 10; i++) {
      cart[item.id] = (cart[item.id] ?? 0) + 1;
      if (!checkCart(state, cart).ok) { cart[item.id]--; break; }
    }
  }
  buyStock(state, cart);
  const menu = shopTypeDef('tea_shop').recipes.filter((id) => DATA.recipes.find((r) => r.id === id)!.unlockLevel <= state.level);
  state.activeRecipes = menu;
  for (const id of menu) for (let i = 0; i < 2; i++) prepareRecipe(state, id, 1);
}

describe('một ngày bán ở tiệm trà sữa', () => {
  it('nhập nguyên liệu, pha ly lên quầy, chạy ngày có khách và doanh thu', () => {
    const state = teaShop(40);
    // Máy foam chưa có ở level 40 nên món cần máy sẽ không pha được; món cơ bản thì được.
    stockAndPrepare(state);
    const made = state.counter.filter((slot) => slot.productId && slot.qty > 0);
    expect(made.length).toBeGreaterThan(2);
    for (const slot of made) expect(DATA.products.find((p) => p.id === slot.productId)!.recipeOnly).toBe(true);
    expect(warehouseQty(state, 'tra_sua_base')).toBeLessThan(10);
    openShop(state);
    const session = new DaySession(state, 21);
    runDayHeadless(session);
    expect(session.ended).toBe(true);
    expect(state.today.served).toBeGreaterThan(0);
    expect(endDay(state).revenue).toBeGreaterThan(0);
  });
});

describe('thứ tự pha ly (teaBar)', () => {
  const groupIndex = (id: string) => TEA_BAR_GROUPS.findIndex((g) => g.id === barGroupOf(id));

  it('mỗi công thức và mỗi tùy chọn: ly đầu tiên, đá cuối, nhóm quầy không lùi, số lần chạm khớp nguyên liệu', () => {
    for (const r of TEA_RECIPES) {
      for (const v of [undefined, ...(r.variants ?? [])]) {
        const order = teaOrder(r, v);
        const req = recipeRequirements(r, v);
        expect(order[0], `${r.id}/${v?.id}`).toBe('ly_nhua');
        expect(order.length).toBe(Object.values(req).reduce((a, b) => a + b, 0));
        for (const [id, q] of Object.entries(req)) expect(order.filter((x) => x === id).length).toBe(q);
        for (let i = 1; i < order.length; i++) expect(groupIndex(order[i]), `${r.id}/${v?.id}`).toBeGreaterThanOrEqual(groupIndex(order[i - 1]));
        expect(barGroupOf(order.at(-1)!)).toBe('ice');
      }
    }
  });

  it('size L chạm đá hai lần, foam đứng sau sữa và trước đá', () => {
    const matcha = TEA_RECIPES.find((r) => r.id === 'matcha_foam')!;
    const order = teaOrder(matcha, matcha.variants!.find((v) => v.id === 'size_l'));
    expect(order.filter((id) => id === 'nuoc_da')).toHaveLength(2);
    expect(order.indexOf('foam_matcha')).toBeGreaterThan(order.indexOf('sua_tuoi'));
    expect(order.indexOf('foam_matcha')).toBeLessThan(order.indexOf('nuoc_da'));
  });

  it('nguyên liệu chung (sữa tươi, nước đá) có nhóm quầy đúng; nguyên liệu riêng theo barGroup', () => {
    expect(barGroupOf('sua_tuoi')).toBe('mix');
    expect(barGroupOf('nuoc_da')).toBe('ice');
    expect(barGroupOf('tran_chau_den')).toBe('topping');
    expect(barGroupOf('siro_dao')).toBe('syrup');
    expect(barGroupOf('foam_ube')).toBe('foam');
    expect(TEA_INGREDIENTS.every((p) => !!p.barGroup)).toBe(true);
  });
});

describe('hồ sơ max', () => {
  it('tiệm trà sữa có đủ trạm (quầy pha trà và máy foam) và pha được mọi món', () => {
    const state = createMaxLevelSimulation();
    visitStore(state, 'tea');
    expect(state.fixtures.some((f) => f.type === 'tea_bar')).toBe(true);
    expect(state.fixtures.some((f) => f.type === 'foam_machine')).toBe(true);
    // Quầy chỉ có vài ô và kho seed ít hàng (10 mỗi loại): dọn quầy, bổ sung kho để kiểm tra riêng nguyên liệu và trạm.
    for (const id of ['nuoc_da', 'sua_tuoi', ...TEA_INGREDIENTS.map((p) => p.id)]) addLot(state, id, 100, state.day + 30);
    for (const r of TEA_RECIPES) {
      state.counter = state.counter.map(() => ({ productId: null, qty: 0, lots: [] } as never));
      expect(prepareRecipe(state, r.id, 1).ok, r.id).toBe(true);
    }
  });
});

describe('level 36–50', () => {
  const levels = DATA.levels.levels;

  it('bảng level hợp lệ tới 50, EXP tăng dần, chỗ nhân viên không giảm', () => {
    expect(DATA.levels.maxLevel).toBe(50);
    expect(levels).toHaveLength(50);
    expect(validateLevels(DATA.levels)).toEqual([]);
    for (let i = 36; i < 50; i++) {
      expect(levels[i].exp).toBeGreaterThan(levels[i - 1].exp);
      expect(levels[i].staffSlots ?? 0).toBeGreaterThanOrEqual(levels[i - 1].staffSlots ?? 0);
    }
  });

  it('mỗi level 36–50 mở ít nhất một thứ mới (tính năng, chỗ nhân viên, hàng, công thức, nội thất, trang trí)', () => {
    for (let n = 36; n <= 50; n++) {
      const l = levels[n - 1];
      const unlocks = [
        l.features?.length ?? 0,
        (l.staffSlots ?? 0) > (levels[n - 2].staffSlots ?? 0) ? 1 : 0,
        DATA.products.filter((p) => p.unlockLevel === n).length,
        DATA.recipes.filter((r) => r.unlockLevel === n).length,
        DATA.furniture.filter((f) => f.unlockLevel === n).length,
        DATA.decor.filter((d) => d.unlockLevel === n).length,
      ].reduce((a, b) => a + b, 0);
      expect(unlocks, `level ${n}`).toBeGreaterThan(0);
      expect(l.label.length, `level ${n}`).toBeGreaterThan(3);
    }
  });

  it('chỗ nhân viên tăng dần tới 22 ở level 49', () => {
    expect(staffSlots(35)).toBe(16);
    expect(staffSlots(45)).toBe(20);
    expect(staffSlots(49)).toBe(22);
  });

  it('tính năng mở tiệm đúng level', () => {
    const featureLevel = (f: string) => levels.find((l) => l.features?.includes(f))?.level;
    expect(featureLevel('shop_tea')).toBe(36);
    expect(featureLevel('shop_bakery')).toBe(40);
    expect(featureLevel('shop_mart')).toBe(45);
    expect(featureLevel('foam_machine')).toBe(41);
    expect(featureLevel('prestige')).toBe(50);
    expect(DATA.balance.warehouseTiers.at(-1)).toMatchObject({ name: 'Kho trung tâm', unlockLevel: 38 });
  });
});

describe('danh hiệu ở level tối đa', () => {
  it('chưa có sao khi chưa tới level 50; có sao khi vượt mốc EXP level 50', () => {
    const state = chain(49);
    state.exp = DATA.levels.levels[48].exp;
    expect(prestigeStars(state)).toBe(0);
    state.level = 50;
    const cap = DATA.levels.levels[49].exp;
    state.exp = cap + PRESTIGE_EXP_PER_STAR * 3 + 5;
    expect(prestigeStars(state)).toBe(3);
    expect(typeof currentTitle(state)).toBe('string');
  });
});

describe('chuỗi cửa hàng đầy đủ', () => {
  it('mở lần lượt mọi chi nhánh ở level tối đa không bị giới hạn chặn', () => {
    const state = chain(DATA.levels.maxLevel);
    state.money = 500_000_000;
    for (const b of DATA.branches) expect(openBranch(state, b.id).ok, b.id).toBe(true);
    expect(state.stores).toHaveLength(DATA.branches.length + 1);
    expect(state.stores.length).toBeLessThanOrEqual(maxStores());
  });
});
