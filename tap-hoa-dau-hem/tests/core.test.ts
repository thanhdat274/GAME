import { describe, expect, it } from 'vitest';
import { computeTip, customerPayment, judgeChange, makeChange } from '../src/core/change';
import { generateOrder, meanSpawnSeconds } from '../src/core/customers';
import { DATA } from '../src/core/data';
import { Emitter } from '../src/core/events';
import { applyLevelUps, averageRating, levelForExp, ratingSpawnMultiplier, recordRating } from '../src/core/progression';
import { Rng } from '../src/core/rng';
import { createNewGame, formatClock, formatMoney, unlockedProducts, lotsFrom, warehouseQty } from '../src/core/state';
import { assignCounterSlot, assignSlot, autoArrange, buyStock, cellsFor, checkCart, clearSlot, refillCounterSlot, refillSlot, shelfCapacity, warehouseCellsUsed, zoneFill, zoneOf } from '../src/core/stock';

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
    expect(s.money).toBe(DATA.balance.startMoney - 35000);
    expect(warehouseQty(s, 'mi_goi')).toBe(10);
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
    // Gạo size 2: 160 bao = 16 lần 10 → 32 ô > 30.
    expect(checkCart(s, { gao: 160 })).toMatchObject({ ok: false, reason: 'space' });
    expect(checkCart(s, { gao: 150 }).ok).toBe(true);
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
  it('gán ô nạp tối đa 20 từ kho', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 24 });
    assignSlot(s, 0, 0, 'mi_goi');
    expect(s.shelves[0][0]).toMatchObject({ productId: 'mi_goi', qty: 20 });
    expect(warehouseQty(s, 'mi_goi')).toBe(4);
  });

  it('thả món khác vào ô đang có hàng thì hàng cũ về kho', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 10, muoi: 10 });
    assignSlot(s, 0, 0, 'mi_goi');
    assignSlot(s, 0, 0, 'muoi');
    expect(s.shelves[0][0]).toMatchObject({ productId: 'muoi', qty: 10 });
    expect(warehouseQty(s, 'mi_goi')).toBe(10);
    expect(warehouseQty(s, 'muoi')).toBe(0);
  });

  it('nạp lại: ô còn 1, kho 22 → ô 20, kho 3', () => {
    const s = createNewGame();
    s.shelves[0][0] = { productId: 'mi_goi', qty: 1 };
    s.warehouse = lotsFrom({ mi_goi: 22 });
    expect(refillSlot(s, 0, 0)).toBe(19);
    expect(s.shelves[0][0].qty).toBe(20);
    expect(warehouseQty(s, 'mi_goi')).toBe(3);
  });

  it('trả ô về kho', () => {
    const s = createNewGame();
    s.shelves[1][2] = { productId: 'gao', qty: 3 };
    clearSlot(s, 1, 2);
    expect(warehouseQty(s, 'gao')).toBe(3);
    expect(s.shelves[1][2].productId).toBeNull();
  });

  it('kệ thứ 3 bị khóa ở level 1', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 5 });
    expect(() => assignSlot(s, 2, 0, 'mi_goi')).toThrow();
  });

  it('tự bày: món mới vẫn có ô dù kệ đã kín (lấy ô của món chiếm nhiều ô)', () => {
    const s = createNewGame();
    s.level = 4;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) s.shelves[r][c] = { productId: r === 0 ? 'mi_goi' : 'muoi', qty: 5 };
    s.warehouse = lotsFrom({ pin: 6, xa_phong: 3 });
    autoArrange(s);
    const onShelf = (id: string) => s.shelves.flat().filter((x) => x.productId === id && x.qty > 0).length;
    expect(onShelf('pin')).toBeGreaterThanOrEqual(1);
    expect(onShelf('xa_phong')).toBeGreaterThanOrEqual(1);
    expect(s.shelves.flat().some((x) => x.productId === 'mi_goi') || warehouseQty(s, 'mi_goi') > 0).toBe(true);
    expect(s.shelves.flat().some((x) => x.productId === 'muoi') || warehouseQty(s, 'muoi') > 0).toBe(true);
    // Hàng của ô bị lấy lại quay về kho, không mất.
    const total = (id: string) => s.shelves.flat().filter((x) => x.productId === id).reduce((a, x) => a + x.qty, 0) + warehouseQty(s, id);
    expect(total('mi_goi') + total('muoi')).toBe(90);
  });

  it('tự bày dọn ô đã hết hàng cả trên kệ lẫn trong kho', () => {
    const s = createNewGame();
    s.shelves[0][0] = { productId: 'gao', qty: 0 };
    s.warehouse = lotsFrom({ muoi: 5 });
    autoArrange(s);
    expect(s.shelves.flat().some((x) => x.productId === 'gao')).toBe(false);
  });

  it('tự bày lấp ô trống bằng hàng trong kho, mỗi món chỉ một ô', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 12, muoi: 4 });
    autoArrange(s);
    const slotsOf = (id: string) => s.shelves.flat().filter((x) => x.productId === id);
    expect(slotsOf('mi_goi')).toHaveLength(1);
    expect(slotsOf('muoi')).toHaveLength(1);
    const cap = shelfCapacity(s, 0);
    // Ô đầy tới sức chứa, phần dư nằm lại kho để nạp dần trong giờ bán.
    expect(slotsOf('mi_goi')[0].qty).toBe(Math.min(12, cap));
    expect(warehouseQty(s, 'mi_goi')).toBe(12 - Math.min(12, cap));
    expect(slotsOf('muoi')[0].qty).toBe(4);
  });

  it('tự bày gom món đang nằm nhiều ô về một ô, nhường chỗ cho món khác', () => {
    const s = createNewGame();
    s.zones = s.zones.map((_, i) => (i === 0 ? 'dry' : null));
    s.shelves[0][0] = { productId: 'mi_goi', qty: 3 };
    s.shelves[0][1] = { productId: 'mi_goi', qty: 5 };
    s.shelves[0][2] = { productId: 'mi_goi', qty: 2 };
    s.warehouse = lotsFrom({ muoi: 4, gao: 3 });
    autoArrange(s);
    const slotsOf = (id: string) => s.shelves.flat().filter((x) => x.productId === id);
    expect(slotsOf('mi_goi')).toHaveLength(1);
    expect(slotsOf('muoi')).toHaveLength(1);
    expect(slotsOf('gao')).toHaveLength(1);
    // Không mất hàng: tổng mì gói trên kệ + kho vẫn là 10.
    expect(slotsOf('mi_goi')[0].qty + warehouseQty(s, 'mi_goi')).toBe(10);
  });

  it('kệ tự nhận khu, từ chối hàng sai khu và bỏ khu khi hết hàng', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 5, keo: 5 });
    expect(assignSlot(s, 0, 0, 'mi_goi')).toBe(5);
    expect(zoneOf(s, 0)).toBe('dry');
    expect(() => assignSlot(s, 0, 1, 'keo')).toThrow('wrong-zone');
    clearSlot(s, 0, 0);
    expect(zoneOf(s, 0)).toBeNull();
    expect(assignSlot(s, 1, 0, 'keo')).toBe(5);
    expect(zoneOf(s, 1)).toBe('snack');
  });

  it('tính cảnh báo mức đầy theo khu', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ mi_goi: 20 });
    assignSlot(s, 0, 0, 'mi_goi');
    expect(zoneFill(s, 'dry')).toMatchObject({ fill: 1, alert: 'ok' });
    s.shelves[0][0].qty = 4;
    expect(zoneFill(s, 'dry')).toMatchObject({ fill: 0.2, alert: 'low' });
    s.shelves[0][0].qty = 0;
    expect(zoneFill(s, 'dry')).toMatchObject({ fill: 0, alert: 'critical' });
  });

  it('hàng sau quầy chỉ gán vào khay quầy và nạp theo sức chứa riêng', () => {
    const s = createNewGame();
    s.warehouse = lotsFrom({ the_cao: 8, mi_goi: 3 });
    expect(assignCounterSlot(s, 0, 'the_cao')).toBe(DATA.balance.counterCapacity);
    expect(s.counter[0].qty).toBe(DATA.balance.counterCapacity);
    expect(refillCounterSlot(s, 0)).toBe(0);
    s.warehouse = lotsFrom({ the_cao: 3, mi_goi: 3 });
    s.counter[0].qty = DATA.balance.counterCapacity - 1;
    expect(refillCounterSlot(s, 0)).toBe(1);
    expect(() => assignCounterSlot(s, 1, 'mi_goi')).toThrow('counter-only');
    expect(() => assignSlot(s, 0, 0, 'the_cao')).toThrow('counter-only');
  });

  it('tự bày: mỗi kệ một khu khác nhau, kệ trùng khu nhường cho nhóm hàng khác', () => {
    const s = createNewGame();
    s.level = 4;
    s.zones = s.zones.map((_, i) => (i < 2 ? 'dry' : null));
    for (let c = 0; c < 5; c++) s.shelves[0][c] = { productId: ['mi_goi', 'muoi', 'gao', 'duong', 'nuoc_mam'][c], qty: 3 };
    s.shelves[1][0] = { productId: 'dau_an', qty: 2 };
    s.warehouse = lotsFrom({ keo: 5, pin: 5 });
    autoArrange(s);
    const zones = [0, 1, 2].map((r) => zoneOf(s, r)).filter((z) => z);
    expect(new Set(zones).size).toBe(zones.length);
    // Món ở kệ trùng khu được dồn sang kệ chính của khu, không mất hàng.
    expect(s.shelves[0].some((x) => x.productId === 'dau_an' && x.qty === 2)).toBe(true);
    expect(s.shelves.flat().some((x) => x.productId === 'keo')).toBe(true);
    expect(s.shelves.flat().some((x) => x.productId === 'pin')).toBe(true);
  });

  it('tự bày: khu nhiều món hơn một kệ thì món dư tràn sang kệ trống, sau khi nhóm khác đã có kệ', () => {
    const s = createNewGame();
    s.level = 16;
    const dry = ['mi_goi', 'gao', 'nuoc_mam', 'dau_an', 'duong', 'muoi', 'bot_canh', 'bot_ngot', 'hat_nem', 'nuoc_tuong', 'tuong_ot', 'hu_tieu_goi', 'chao_goi', 'sua_dac'];
    s.warehouse = lotsFrom({ ...Object.fromEntries(dry.map((id) => [id, 3])), nuoc_ngot: 3 });
    const unplaced = autoArrange(s);
    expect(unplaced).toEqual([]);
    const zones = [0, 1, 2].map((r) => zoneOf(s, r));
    expect(zones.filter((z) => z === 'drink')).toHaveLength(1);
    expect(zones.filter((z) => z === 'dry')).toHaveLength(2);
    // Bấm lại vẫn giữ nguyên: món dư không bị đẩy về kho.
    expect(autoArrange(s)).toEqual([]);
    for (const id of dry) expect(s.shelves.flat().some((x) => x.productId === id)).toBe(true);
  });

  it('tự bày đặt mỗi món vào kệ cùng khu', () => {
    const s = createNewGame();
    s.level = 4;
    s.warehouse = lotsFrom({ mi_goi: 10, keo: 10, pin: 10 });
    autoArrange(s);
    for (let r = 0; r < s.shelves.length; r++) {
      for (const slot of s.shelves[r]) {
        if (slot.productId) expect(DATA.products.find((p) => p.id === slot.productId)?.category).toBe(s.zones[r]);
      }
    }
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
    expect(levelForExp(79)).toBe(1);
    expect(levelForExp(80)).toBe(2);
    expect(levelForExp(360)).toBe(4);
    expect(levelForExp(560)).toBe(5);
    expect(levelForExp(1780)).toBe(9);
    expect(levelForExp(10550)).toBe(20);
    expect(levelForExp(9_999_999)).toBe(35);
  });

  it('lên nhiều level một lúc', () => {
    const s = createNewGame();
    s.exp = 200;
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

describe('tiến độ level hiển thị', () => {
  it('số EXP trong level khớp với thanh; định dạng 2,200', async () => {
    const { levelStatus, levelProgress } = await import('../src/core/progression');
    const { formatNumber } = await import('../src/core/state');
    // Lv 9 bắt đầu 1,780; Lv 10 ở 2,200: có 1,963 EXP → 183 / 420 (≈44%).
    const st = levelStatus(1963, 9);
    expect(st).toMatchObject({ next: 10, into: 183, span: 420, remaining: 237, nextExp: 2200 });
    expect(st.pct).toBeCloseTo(levelProgress(1963, 9));
    expect(levelStatus(99999, DATA.levels.maxLevel).next).toBeNull();
    expect(formatNumber(2200)).toBe('2,200');
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatNumber(-980)).toBe('-980');
  });
});
