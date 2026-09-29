import { describe, expect, it } from 'vitest';
import { openBranch } from '../src/core/branches';
import { parseCityMap, type TiledMap } from '../src/core/cityMap';
import { cityShops, MIN_STOCK_FACTOR, pickShop, preferenceFit, shopIsOpen, shopWeight, stockRatio, type ShopTarget } from '../src/core/cityShopping';
import cityMapJson from '../src/data/cityMap.json';
import { DATA } from '../src/core/data';
import { createNewGame, type GameState, type Slot } from '../src/core/state';
import { autoArrange, buyStock, checkCart } from '../src/core/stock';
import { unlockedProducts } from '../src/core/state';
import { createMaxLevelSimulation } from '../src/core/simulation';

const map = parseCityMap(structuredClone(cityMapJson) as unknown as TiledMap);
const customer = (id: string) => DATA.customers.find((c) => c.id === id)!;

function shop(over: Partial<ShopTarget> & { id: string }): ShopTarget {
  return { door: { x: 0, y: 0 }, traffic: 1, stock: 1, categories: [], ...over };
}

function chain(level: number): GameState {
  const state = createNewGame();
  state.level = level;
  state.money = 30_000_000;
  return state;
}

describe('shopIsOpen', () => {
  it('mở từ giờ mở cửa tới trước giờ đóng cửa và vòng quanh 24 giờ', () => {
    const { openMinute, closeMinute } = DATA.balance;
    expect(shopIsOpen(openMinute)).toBe(true);
    expect(shopIsOpen(closeMinute - 1)).toBe(true);
    expect(shopIsOpen(closeMinute)).toBe(false);
    expect(shopIsOpen(openMinute - 1)).toBe(false);
    expect(shopIsOpen(openMinute + 1440)).toBe(true);
    expect(shopIsOpen(-60)).toBe(false);
  });
});

describe('stockRatio', () => {
  const slot = (productId: string | null, qty: number): Slot => ({ productId, qty }) as Slot;

  it('tính trên các ô đã gán mặt hàng', () => {
    expect(stockRatio([slot('gao', 5), slot('mi_goi', 0), slot(null, 0), slot('duong', 2)])).toBeCloseTo(2 / 3);
  });

  it('chưa gán ô nào thì 0', () => {
    expect(stockRatio([slot(null, 0)])).toBe(0);
    expect(stockRatio([])).toBe(0);
  });
});

describe('sở thích và trọng số', () => {
  const grocery = shop({ id: 'a', categories: ['dry', 'snack', 'household', 'drink', 'fresh', 'frozen'] });
  const kiosk = shop({ id: 'kiosk', categories: ['drink', 'frozen', 'snack'] });
  const veg = shop({ id: 'veg', categories: ['fresh', 'dry'] });
  const home = shop({ id: 'home', categories: ['household', 'dry'] });

  it('học sinh hợp quầy giải khát hơn tiệm rau củ; nội trợ ngược lại', () => {
    expect(shopWeight(customer('hoc_sinh'), kiosk)).toBeGreaterThan(shopWeight(customer('hoc_sinh'), veg));
    expect(shopWeight(customer('noi_tro'), veg)).toBeGreaterThan(shopWeight(customer('noi_tro'), kiosk));
    expect(shopWeight(customer('noi_tro'), home)).toBeGreaterThan(0);
    expect(preferenceFit(customer('hoc_sinh'), grocery.categories)).toBeGreaterThan(0);
  });

  it('kệ trống giảm trọng số nhưng vẫn lớn hơn 0', () => {
    const full = shopWeight(customer('hoc_sinh'), { ...kiosk, stock: 1 });
    const empty = shopWeight(customer('hoc_sinh'), { ...kiosk, stock: 0 });
    expect(empty).toBeLessThan(full);
    expect(empty).toBeGreaterThan(0);
    expect(empty / full).toBeCloseTo(MIN_STOCK_FACTOR);
  });

  it('khu đông khách hơn có trọng số cao hơn; loại chỉ bán ở quầy dùng độ hợp trung tính', () => {
    expect(shopWeight(customer('hoc_sinh'), { ...kiosk, traffic: 2 })).toBeCloseTo(2 * shopWeight(customer('hoc_sinh'), kiosk));
    expect(shopWeight(customer('hoc_sinh'), shop({ id: 'xoi' }))).toBeGreaterThan(0);
  });
});

describe('pickShop', () => {
  const a = shop({ id: 'a', categories: ['drink'] });
  const b = shop({ id: 'b', categories: ['household'] });

  it('null khi ngoài giờ mở cửa hoặc chưa có tiệm', () => {
    expect(pickShop(customer('hoc_sinh'), [a, b], DATA.balance.closeMinute, () => 0.5)).toBeNull();
    expect(pickShop(customer('hoc_sinh'), [], DATA.balance.openMinute, () => 0.5)).toBeNull();
  });

  it('chọn theo trọng số: số ngẫu nhiên nhỏ ra tiệm đầu, lớn ra tiệm cuối', () => {
    const noon = 720;
    expect(pickShop(customer('hoc_sinh'), [a, b], noon, () => 0)!.id).toBe('a');
    expect(pickShop(customer('hoc_sinh'), [a, b], noon, () => 0.999999)!.id).toBe('b');
  });

  it('phân bố khớp trọng số (seed cố định, sai số nhỏ)', () => {
    let seed = 7;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
    const counts: Record<string, number> = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) counts[pickShop(customer('hoc_sinh'), [a, b], 720, rng)!.id]++;
    const wa = shopWeight(customer('hoc_sinh'), a);
    const wb = shopWeight(customer('hoc_sinh'), b);
    expect(counts.a / 4000).toBeGreaterThan((wa / (wa + wb)) - 0.03);
    expect(counts.a / 4000).toBeLessThan((wa / (wa + wb)) + 0.03);
  });
});

describe('hồ sơ max', () => {
  it('mọi tiệm đều bày hàng, kể cả các loại tiệm bán theo kệ mới', () => {
    const shops = cityShops(createMaxLevelSimulation(), map);
    expect(shops.map((s) => s.id).sort()).toEqual(['main', ...DATA.branches.map((b) => b.id)].sort());
    for (const s of shops) expect(s.stock, s.id).toBeGreaterThan(0.5);
  });
});

describe('cityShops', () => {
  it('chỉ gồm tiệm đã mở có lô đất; cửa lấy từ bản đồ; loại tiệm quyết định nhóm hàng', () => {
    const state = chain(34);
    expect(cityShops(state, map).map((s) => s.id)).toEqual(['main']);
    openBranch(state, 'home');
    const shops = cityShops(state, map);
    expect(shops.map((s) => s.id).sort()).toEqual(['home', 'main']);
    const home = shops.find((s) => s.id === 'home')!;
    const lot = map.lots.find((l) => l.storeId === 'home')!;
    expect(home.door).toEqual({ x: lot.door.x, y: lot.door.y });
    expect(home.categories).toEqual(['household', 'dry']);
    expect(home.traffic).toBe(DATA.branches.find((b) => b.id === 'home')!.traffic);
    expect(shops.find((s) => s.id === 'main')!.traffic).toBe(1);
  });

  it('tỉ lệ còn hàng phản ánh kệ thật và không đổi trạng thái game', () => {
    const state = chain(34);
    openBranch(state, 'home');
    const cart: Record<string, number> = {};
    for (const item of unlockedProducts(state.level, state).filter((p) => !p.recipeOnly)) {
      for (let i = 0; i < 12; i++) { cart[item.id] = (cart[item.id] ?? 0) + 1; if (!checkCart(state, cart).ok) { cart[item.id]--; break; } }
    }
    const emptyRatio = cityShops(state, map).find((s) => s.id === 'home')!.stock;
    buyStock(state, cart);
    autoArrange(state);
    const before = JSON.stringify(state);
    const stocked = cityShops(state, map).find((s) => s.id === 'home')!.stock;
    expect(stocked).toBeGreaterThan(emptyRatio);
    expect(stocked).toBeGreaterThan(0.5);
    expect(JSON.stringify(state)).toBe(before);
  });
});
