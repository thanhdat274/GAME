import { describe, expect, it } from 'vitest';
import { computeTip, customerPayment, judgeChange, makeChange } from '../src/core/change';
import { generateOrder, meanSpawnSeconds } from '../src/core/customers';
import { DATA } from '../src/core/data';
import { Emitter } from '../src/core/events';
import { applyLevelUps, averageRating, levelForExp, ratingSpawnMultiplier, recordRating } from '../src/core/progression';
import { Rng } from '../src/core/rng';
import { createNewGame, formatClock, formatMoney, unlockedProducts } from '../src/core/state';
import { assignSlot, autoArrange, buyStock, cellsFor, checkCart, clearSlot, refillSlot, warehouseCellsUsed } from '../src/core/stock';

describe('Rng', () => {
  it('cùng seed cho cùng dãy số', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it('int nằm trong khoảng', () => {
    const r = new Rng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});

describe('Emitter', () => {
  it('phát và hủy đăng ký', () => {
    const e = new Emitter<{ ping: number }>();
    const got: number[] = [];
    const off = e.on('ping', (n) => got.push(n));
    e.emit('ping', 1);
    off();
    e.emit('ping', 2);
    expect(got).toEqual([1]);
  });
});

describe('nhập hàng', () => {
  it('mua thành công trừ đúng tiền và cộng kho', () => {
    const s = createNewGame();
    const res = buyStock(s, { mi_goi: 10 });
    expect(res.ok).toBe(true);
    expect(s.money).toBe(300000 - 35000);
    expect(s.warehouse.mi_goi).toBe(10);
  });

  it('không đủ tiền thì báo số còn thiếu', () => {
    const s = createNewGame();
    s.money = 30000;
    const res = checkCart(s, { mi_goi: 10 });
    expect(res).toMatchObject({ ok: false, reason: 'money', missing: 5000 });
  });

  it('kho đầy thì từ chối', () => {
    const s = createNewGame();
    s.money = 10_000_000;
    // Gạo size 2: 110 bao = 11 lần 10 → 22 ô > 20.
    expect(checkCart(s, { gao: 110 })).toMatchObject({ ok: false, reason: 'space' });
    expect(checkCart(s, { gao: 100 }).ok).toBe(true);
  });

  it('không mua được món chưa mở khóa', () => {
    const s = createNewGame();
    expect(checkCart(s, { snack: 5 })).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('tính ô kho làm tròn lên mỗi 10 đơn vị', () => {
    expect(cellsFor('mi_goi', 1)).toBe(1);
    expect(cellsFor('mi_goi', 10)).toBe(1);
    expect(cellsFor('mi_goi', 11)).toBe(2);
    expect(cellsFor('gao', 5)).toBe(2);
    expect(warehouseCellsUsed({ mi_goi: 15, gao: 3 })).toBe(4);
  });
});

describe('kệ hàng', () => {
  it('gán ô nạp tối đa 5 từ kho', () => {
    const s = createNewGame();
    s.warehouse = { mi_goi: 8 };
    assignSlot(s, 0, 0, 'mi_goi');
    expect(s.shelves[0][0]).toEqual({ productId: 'mi_goi', qty: 5 });
    expect(s.warehouse.mi_goi).toBe(3);
  });

  it('thả món khác vào ô đang có hàng thì hàng cũ về kho', () => {
    const s = createNewGame();
    s.warehouse = { mi_goi: 5, muoi: 5 };
    assignSlot(s, 0, 0, 'mi_goi');
    assignSlot(s, 0, 0, 'muoi');
    expect(s.shelves[0][0]).toEqual({ productId: 'muoi', qty: 5 });
    expect(s.warehouse.mi_goi).toBe(5);
    expect(s.warehouse.muoi).toBeUndefined();
  });

  it('nạp lại: ô còn 1, kho 8 → ô 5, kho 4', () => {
    const s = createNewGame();
    s.shelves[0][0] = { productId: 'mi_goi', qty: 1 };
    s.warehouse = { mi_goi: 8 };
    expect(refillSlot(s, 0, 0)).toBe(4);
    expect(s.shelves[0][0].qty).toBe(5);
    expect(s.warehouse.mi_goi).toBe(4);
  });

  it('trả ô về kho', () => {
    const s = createNewGame();
    s.shelves[1][2] = { productId: 'gao', qty: 3 };
    clearSlot(s, 1, 2);
    expect(s.warehouse.gao).toBe(3);
    expect(s.shelves[1][2].productId).toBeNull();
  });

  it('kệ thứ 3 bị khóa ở level 1', () => {
    const s = createNewGame();
    s.warehouse = { mi_goi: 5 };
    expect(() => assignSlot(s, 2, 0, 'mi_goi')).toThrow();
  });

  it('tự bày lấp ô trống bằng hàng trong kho', () => {
    const s = createNewGame();
    s.warehouse = { mi_goi: 12, muoi: 4 };
    autoArrange(s);
    const onShelf = s.shelves.flat().filter((x) => x.productId);
    expect(onShelf.reduce((a, b) => a + b.qty, 0)).toBe(16);
    expect(Object.keys(s.warehouse)).toHaveLength(0);
  });
});

describe('thối tiền', () => {
  it('đơn 13.000đ khách đưa 20.000 hoặc 50.000', () => {
    const r = new Rng(7);
    for (let i = 0; i < 100; i++) expect([20000, 50000]).toContain(customerPayment(13000, r));
  });

  it('đơn lớn hơn 500k dùng nhiều tờ 500k', () => {
    expect(customerPayment(730000, new Rng(1))).toBe(1000000);
  });

  it('phân loại đúng / thiếu / thừa', () => {
    expect(judgeChange(7000, 7000)).toBe('exact');
    expect(judgeChange(5000, 7000)).toBe('short');
    expect(judgeChange(10000, 7000)).toBe('over');
  });

  it('thối ít tờ nhất', () => {
    expect(makeChange(37000)).toEqual([20000, 10000, 5000, 2000]);
    expect(makeChange(0)).toEqual([]);
  });

  it('tip chỉ khi nhanh, không hoàn tác, không thối thiếu, không tự tính', () => {
    const r = new Rng(3);
    const base = { elapsedSec: 2, undos: 0, shortAttempts: 0, tipMul: 1, auto: false };
    const tip = computeTip(base, r);
    expect(tip).toBeGreaterThanOrEqual(1000);
    expect(tip).toBeLessThanOrEqual(3000);
    expect(computeTip({ ...base, elapsedSec: 5 }, r)).toBe(0);
    expect(computeTip({ ...base, undos: 1 }, r)).toBe(0);
    expect(computeTip({ ...base, shortAttempts: 1 }, r)).toBe(0);
    expect(computeTip({ ...base, auto: true }, r)).toBe(0);
  });
});

describe('khách hàng', () => {
  it('giờ cao điểm sinh khách nhanh hơn buổi chiều', () => {
    expect(meanSpawnSeconds(17 * 60 + 30, 1)).toBeLessThan(meanSpawnSeconds(14 * 60 + 30, 1));
  });

  it('chỉ yêu cầu món đã mở khóa', () => {
    const r = new Rng(9);
    const allowed = new Set(unlockedProducts(1).map((p) => p.id));
    for (const type of DATA.customers) {
      for (let i = 0; i < 200; i++) {
        const order = generateOrder(type, 1, r);
        expect(order.length).toBeGreaterThanOrEqual(1);
        expect(order.length).toBeLessThanOrEqual(3);
        for (const l of order) expect(allowed.has(l.productId)).toBe(true);
      }
    }
  });

  it('học sinh ở level 2 hay mua ăn vặt', () => {
    const r = new Rng(11);
    const hs = DATA.customers.find((c) => c.id === 'hoc_sinh')!;
    let snack = 0;
    let total = 0;
    for (let i = 0; i < 300; i++) {
      for (const l of generateOrder(hs, 2, r)) {
        total++;
        if (DATA.products.find((p) => p.id === l.productId)!.category === 'snack') snack++;
      }
    }
    expect(snack / total).toBeGreaterThan(0.6);
  });
});

describe('level và sao', () => {
  it('mốc EXP', () => {
    expect(levelForExp(0)).toBe(1);
    expect(levelForExp(119)).toBe(1);
    expect(levelForExp(120)).toBe(2);
    expect(levelForExp(700)).toBe(4);
    expect(levelForExp(99999)).toBe(4);
  });

  it('lên nhiều level một lúc', () => {
    const s = createNewGame();
    s.exp = 360;
    expect(applyLevelUps(s).map((l) => l.level)).toEqual([2, 3]);
    expect(s.level).toBe(3);
  });

  it('sao trung bình 20 khách gần nhất', () => {
    const s = createNewGame();
    for (let i = 0; i < 20; i++) recordRating(s, 1);
    for (let i = 0; i < 20; i++) recordRating(s, 5);
    expect(s.ratings).toHaveLength(20);
    expect(averageRating(s)).toBe(5);
    expect(ratingSpawnMultiplier(4.6)).toBe(1.2);
  });
});

describe('định dạng', () => {
  it('tiền và giờ', () => {
    expect(formatMoney(150000)).toBe('150.000đ');
    expect(formatMoney(-9000)).toBe('-9.000đ');
    expect(formatClock(17 * 60 + 5)).toBe('17:05');
  });
});
