import { describe, expect, it } from 'vitest';
import { openBranch, visitStore } from '../src/core/branches';
import { shopDensityAt, generateOrder } from '../src/core/customers';
import { DATA, type ShopTypeDef } from '../src/core/data';
import { Rng } from '../src/core/rng';
import { describeMechanics, shopTypeDef, shopTypeOf, validateShopTypes } from '../src/core/shopTypes';
import { createNewGame, unlockedProducts, type GameState } from '../src/core/state';
import { buyStock, expiryFor } from '../src/core/stock';

function chain(level = 35): GameState {
  const state = createNewGame();
  state.level = level;
  state.money = 30_000_000;
  return state;
}

/** Tiệm `branch` đã mở và đang đứng ở đó. */
function inShop(branch: string): GameState {
  const state = chain();
  expect(openBranch(state, branch).ok).toBe(true);
  return state;
}

const shop = (id: string) => shopTypeOf({ shopType: id } as never);

describe('expiryFor với hệ số hạn dùng', () => {
  it('giữ nguyên khi không có hệ số; nhân và làm tròn khi có; tối thiểu 1 ngày', () => {
    expect(expiryFor('mi_goi', 10)).toBe(40);
    expect(expiryFor('mi_goi', 10, 0.6)).toBe(10 + 18);
    expect(expiryFor('mi_goi', 10, 0.001)).toBe(11);
    const noLife = DATA.products.find((p) => !p.shelfLifeDays)!;
    expect(expiryFor(noLife.id, 10, 0.5)).toBeNull();
  });
});

describe('tiệm rau củ: hàng tươi hỏng nhanh, khách chuộng hàng tươi', () => {
  it('hàng tươi nhập vào tiệm rau củ có hạn ngắn hơn ở tạp hóa; hàng khô không đổi', () => {
    const fresh = DATA.products.find((p) => p.category === 'fresh' && p.shelfLifeDays && !p.recipeOnly && !p.eventOnly && p.unlockLevel <= 30)!;
    const dry = DATA.products.find((p) => p.category === 'dry' && p.shelfLifeDays && !p.recipeOnly && !p.eventOnly && p.unlockLevel <= 30)!;
    const main = chain();
    buyStock(main, { [fresh.id]: 2, [dry.id]: 2 });
    const mainExp = (id: string) => main.warehouse.find((l) => l.productId === id)!.exp;
    expect(mainExp(fresh.id)).toBe(main.day + fresh.shelfLifeDays!);

    const veg = inShop('veg');
    buyStock(veg, { [fresh.id]: 2, [dry.id]: 2 });
    const vegExp = (id: string) => veg.warehouse.find((l) => l.productId === id)!.exp;
    expect(vegExp(fresh.id)).toBe(veg.day + Math.max(1, Math.round(fresh.shelfLifeDays! * 0.6)));
    expect(vegExp(fresh.id)!).toBeLessThan(veg.day + fresh.shelfLifeDays!);
    expect(vegExp(dry.id)).toBe(veg.day + dry.shelfLifeDays!);
  });

  it('nhu cầu hàng tươi ×1.4, nhóm khác không đổi', () => {
    const veg = shop('greengrocer');
    expect(veg.demand('fresh', 1)).toBeCloseTo(1.4);
    expect(veg.demand('dry', 1)).toBe(1);
    expect(veg.shelfLifeMul('fresh')).toBe(0.6);
    expect(veg.shelfLifeMul('dry')).toBe(1);
  });
});

describe('quầy giải khát: nhạy mùa', () => {
  it('nhu cầu mùa được lũy thừa: nóng bùng nổ hơn, lạnh vắng hơn, =1 thì không đổi', () => {
    const kiosk = shop('drink_kiosk');
    expect(kiosk.demand('drink', 1.8)).toBeGreaterThan(1.8);
    expect(kiosk.demand('drink', 1.8)).toBeCloseTo(1.8 ** 1.6);
    expect(kiosk.demand('drink', 0.5)).toBeLessThan(0.5);
    expect(kiosk.demand('drink', 1)).toBe(1);
  });

  it('tạp hóa và tiệm xôi không đổi nhu cầu mùa', () => {
    for (const id of ['grocery', 'xoi']) {
      expect(shop(id).demand('drink', 1.8)).toBe(1.8);
      expect(shop(id).qtyMul).toBe(1);
      expect(shop(id).trafficMul).toBe(1);
      expect(shop(id).shelfLifeMul('fresh')).toBe(1);
    }
  });
});

describe('cửa hàng gia dụng: bán sỉ', () => {
  it('mỗi dòng hàng có số lượng chẵn ≥ 2 (gấp đôi), luôn chỉ hàng của loại tiệm', () => {
    const state = inShop('home');
    const rng = new Rng(11);
    const types = DATA.customers.filter((c) => shopTypeDef('household').customers.includes(c.id));
    const allowed = new Set(unlockedProducts(state.level, state).map((p) => p.id));
    let lines = 0;
    for (let i = 0; i < 300; i++) {
      for (const line of generateOrder(types[i % types.length], state.level, rng, state)) {
        if (line.counterLine) continue;
        lines++;
        expect(line.qty % 2).toBe(0);
        expect(line.qty).toBeGreaterThanOrEqual(2);
        expect(allowed.has(line.productId)).toBe(true);
      }
    }
    expect(lines).toBeGreaterThan(100);
  });

  it('lượng khách bằng đường cong giờ × 0.65', () => {
    const home = inShop('home');
    const homeShop = shopTypeOf(home.stores.find((s) => s.id === 'home'));
    for (const minute of [500, 800, 1100]) {
      expect(shopDensityAt(home, minute)).toBeCloseTo((homeShop.densityAt(minute) ?? 1) * 0.65);
    }
  });

  it('tạp hóa: số lượng không bị nhân và mật độ giữ nguyên', () => {
    const main = chain();
    visitStore(main, 'main');
    const rng = new Rng(11);
    const qtys = new Set<number>();
    for (let i = 0; i < 300; i++) for (const line of generateOrder(DATA.customers[i % DATA.customers.length], main.level, rng, main)) qtys.add(line.qty);
    expect([...qtys].some((q) => q % 2 === 1)).toBe(true);
  });
});

describe('mô tả và kiểm tra', () => {
  it('mô tả sinh từ số liệu; tạp hóa và xôi không có mô tả', () => {
    expect(describeMechanics(shopTypeDef('grocery'))).toEqual([]);
    expect(describeMechanics(shopTypeDef('xoi'))).toEqual([]);
    const veg = describeMechanics(shopTypeDef('greengrocer')).join(' | ');
    expect(veg).toContain('Hàng tươi hỏng nhanh hơn (hạn ×0.6)');
    expect(veg).toContain('Khách chuộng hàng tươi (×1.4)');
    expect(describeMechanics(shopTypeDef('drink_kiosk')).join(' | ')).toContain('mùa nóng bùng nổ');
    const home = describeMechanics(shopTypeDef('household')).join(' | ');
    expect(home).toContain('×2 mỗi món');
    expect(home).toContain('Lượng khách ×0.65');
  });

  it('validator bắt hệ số không dương và nhóm hàng không tồn tại', () => {
    const bad = (mechanics: ShopTypeDef['mechanics']): string => {
      const types = DATA.shopTypes.map((t) => (t.id === 'household' ? { ...t, mechanics } : t));
      return validateShopTypes(types).join('\n');
    };
    expect(bad({ qtyMul: 0 })).toContain('mechanics.qtyMul');
    expect(bad({ trafficMul: -1 })).toContain('mechanics.trafficMul');
    expect(bad({ shelfLifeMul: { khong_co: 0.5 } as never })).toContain('nhóm hàng "khong_co"');
    expect(bad({ demandMul: { fresh: 0 } })).toContain('mechanics.demandMul.fresh');
    expect(bad({ qtyMul: 2 })).toBe('');
  });
});
