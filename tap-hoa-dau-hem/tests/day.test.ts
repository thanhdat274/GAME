import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { DaySession, endDay, grandmaHelp, openShop, startNextDay } from '../src/core/day';
import { meanSpawnSeconds, newShopMultiplier, type Customer } from '../src/core/customers';
import { createNewGame, type GameState } from '../src/core/state';
import { makeChange } from '../src/core/change';

function stockedGame(level = 1, autoChange = false): GameState {
  const s = createNewGame();
  s.level = level;
  s.settings.autoChange = autoChange;
  const ids = ['mi_goi', 'gao', 'nuoc_mam', 'dau_an', 'duong', 'muoi'];
  ids.forEach((id, i) => (s.shelves[0][i] = { productId: id, qty: 5 }));
  ids.forEach((id, i) => (s.shelves[1][i] = { productId: id, qty: 5 }));
  s.warehouse = Object.fromEntries(ids.map((id) => [id, 20]));
  openShop(s);
  return s;
}

/** Chạy tới khi có khách đứng ở quầy. */
function untilFront(d: DaySession): Customer {
  for (let i = 0; i < 2000 && d.front?.status !== 'picking'; i++) d.tick(0.1);
  if (!d.front) throw new Error('không có khách');
  return d.front;
}

/** Lấy đủ hàng cho khách đang phục vụ. */
function pickAll(d: DaySession, c: Customer): void {
  for (const line of c.order) {
    while (line.picked < line.qty && c.status === 'picking') {
      const pos = findSlot(d.state, line.productId);
      if (!pos) return;
      d.pick(pos[0], pos[1]);
    }
  }
}

function findSlot(s: GameState, id: string): [number, number] | null {
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) if (s.shelves[r][c].productId === id && s.shelves[r][c].qty > 0) return [r, c];
  return null;
}

describe('phiên bán hàng', () => {
  it('đồng hồ chạy 08:00 → 20:00 trong 180 giây và phát closing', () => {
    const s = stockedGame();
    const d = new DaySession(s, 1);
    let closing = 0;
    d.events.on('closing', () => closing++);
    d.paused = false;
    // Không phục vụ ai: khách sẽ bỏ về, ngày vẫn kết thúc.
    for (let i = 0; i < 1800; i++) d.tick(0.1);
    expect(s.clock).toBe(DATA.balance.closeMinute);
    expect(closing).toBe(1);
  });

  it('tạm dừng thì không có gì thay đổi', () => {
    const s = stockedGame();
    const d = new DaySession(s, 1);
    d.paused = true;
    d.update(10);
    expect(s.clock).toBe(480);
  });

  it('tối đa 3 khách chờ', () => {
    const s = stockedGame();
    const d = new DaySession(s, 5);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      d.tick(0.1);
      max = Math.max(max, d.queue.length);
    }
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBeGreaterThan(0);
  });

  it('phục vụ trọn vẹn: lấy đúng, thối đúng → tiền tăng, có EXP, khách hài lòng', () => {
    const s = stockedGame();
    const d = new DaySession(s, 2);
    const c = untilFront(d);
    const money0 = s.money;
    pickAll(d, c);
    expect(c.status === 'paying' || c.status === 'done').toBe(true);
    if (c.status === 'paying') {
      for (const b of makeChange(c.changeDue)) d.addBill(b);
      expect(d.giveChange()).toBe('exact');
    }
    expect(s.money).toBeGreaterThanOrEqual(money0 + c.total);
    expect(s.today.served).toBe(1);
    expect(s.today.happy).toBe(1);
    expect(s.exp).toBeGreaterThan(0);
  });

  it('lấy sai món: không trừ kệ, trừ 2 giây kiên nhẫn', () => {
    const s = stockedGame();
    const d = new DaySession(s, 3);
    const c = untilFront(d);
    const wanted = new Set(c.order.map((l) => l.productId));
    const wrong = s.shelves[0].findIndex((x) => x.productId && !wanted.has(x.productId));
    const before = c.patience;
    expect(d.pick(0, wrong)).toBe('wrong');
    expect(s.shelves[0][wrong].qty).toBe(5);
    expect(c.patience).toBeCloseTo(before - 2, 5);
  });

  it('thối thiếu: phải thối lại và bị trừ 1 sao', () => {
    const s = stockedGame();
    const d = new DaySession(s, 4);
    let c = untilFront(d);
    // Tìm khách cần thối tiền.
    for (let guard = 0; guard < 50; guard++) {
      pickAll(d, c);
      if (c.status === 'paying') break;
      c = untilFront(d);
    }
    expect(c.status).toBe('paying');
    d.addBill(1000);
    if (c.changeDue > 1000) {
      expect(d.giveChange()).toBe('short');
      expect(c.penalty).toBe(1);
      expect(d.tray).toEqual([]);
      for (const b of makeChange(c.changeDue)) d.addBill(b);
      expect(d.giveChange()).toBe('exact');
      expect(s.today.tips).toBe(0);
    }
  });

  it('thối thừa: mất phần thừa', () => {
    const s = stockedGame();
    const d = new DaySession(s, 6);
    let c = untilFront(d);
    for (let guard = 0; guard < 50; guard++) {
      pickAll(d, c);
      if (c.status === 'paying') break;
      c = untilFront(d);
    }
    const money0 = s.money;
    for (const b of makeChange(c.changeDue)) d.addBill(b);
    d.addBill(5000);
    expect(d.giveChange()).toBe('over');
    expect(s.money).toBe(money0 + c.total - 5000);
    expect(s.today.overpaid).toBe(5000);
  });

  it('hết kiên nhẫn: khách bỏ về, 1 sao, hàng đã lấy trả về kho', () => {
    const s = stockedGame();
    const d = new DaySession(s, 8);
    const c = untilFront(d);
    const line = c.order[0];
    const pos = findSlot(s, line.productId)!;
    const wh0 = s.warehouse[line.productId];
    if (c.order.length > 1 || line.qty > 1) d.pick(pos[0], pos[1]);
    const picked = line.picked;
    let left: { reason: string; stars: number } | null = null;
    d.events.on('customerLeft', (e) => {
      if (e.customer === c) left = e;
    });
    for (let i = 0; i < 400 && c.status !== 'done'; i++) d.tick(0.1);
    expect(left).toMatchObject({ reason: 'patience', stars: 1 });
    expect(s.warehouse[line.productId]).toBe(wh0 + picked);
  });

  it('kệ không có món nào khách cần thì khách bỏ về', () => {
    const s = createNewGame();
    openShop(s);
    const d = new DaySession(s, 9);
    const reasons: string[] = [];
    d.events.on('customerLeft', (e) => reasons.push(e.reason));
    for (let i = 0; i < 200; i++) d.tick(0.1);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((r) => r === 'nothing' || r === 'patience')).toBe(true);
    expect(reasons[0]).toBe('nothing');
  });

  it('thiếu một phần: chỉ trả tiền món đã nhận, trừ 1 sao', () => {
    const s = stockedGame();
    const d = new DaySession(s, 10);
    let c = untilFront(d);
    for (let guard = 0; guard < 80 && !(c.order.length >= 2); guard++) {
      pickAll(d, c);
      if (c.status === 'paying') {
        for (const b of makeChange(c.changeDue)) d.addBill(b);
        d.giveChange();
      }
      c = untilFront(d);
    }
    expect(c.order.length).toBeGreaterThanOrEqual(2);
    const first = c.order[0];
    const pos = findSlot(s, first.productId)!;
    d.pick(pos[0], pos[1]);
    d.checkout();
    expect(c.total).toBe(DATA.products.find((p) => p.id === first.productId)!.price);
    expect(c.penalty).toBe(1);
  });

  it('nạp lại kệ mất 1 giây', () => {
    const s = stockedGame();
    s.shelves[0][0] = { productId: 'mi_goi', qty: 1 };
    const d = new DaySession(s, 11);
    expect(d.startRefill(0, 0)).toBe(true);
    expect(d.startRefill(0, 0)).toBe(false);
    for (let i = 0; i < 5; i++) d.tick(0.1);
    expect(s.shelves[0][0].qty).toBe(1);
    for (let i = 0; i < 6; i++) d.tick(0.1);
    expect(s.shelves[0][0].qty).toBe(5);
  });

  it('nút tự tính dùng được ngay từ level 1 và không có tip', () => {
    for (const level of [1, 3]) {
      const s = stockedGame(level);
      const d = new DaySession(s, 12);
      let c = untilFront(d);
      for (let guard = 0; guard < 50; guard++) {
        pickAll(d, c);
        // Level 3 khách có thể cần ăn vặt không có trên kệ: tính tiền phần đã lấy.
        if (c.status === 'picking') d.checkout();
        if (c.status === 'paying') break;
        c = untilFront(d);
      }
      expect(c.status).toBe('paying');
      const tips0 = s.today.tips;
      expect(d.autoChange()).toBe(true);
      expect(s.today.tips).toBe(tips0);
    }
  });
});

describe('nhu cầu bị bỏ lỡ', () => {
  it('kệ trống: ghi lại món khách hỏi mà hết, sang ngày sau hiện ở "hôm qua"', () => {
    const s = createNewGame();
    openShop(s);
    const d = new DaySession(s, 31);
    let wanted = 0;
    d.events.on('customerLeft', (e) => {
      if (e.reason === 'nothing') wanted += e.customer.order.reduce((a, l) => a + l.qty, 0);
    });
    for (let i = 0; i < 300; i++) d.tick(0.1);
    const total = Object.values(s.today.missed).reduce((a, b) => a + b, 0);
    expect(total).toBe(wanted);
    expect(total).toBeGreaterThan(0);
    const sum = endDay(s);
    expect(sum.missed[0].qty).toBeGreaterThanOrEqual(sum.missed[sum.missed.length - 1].qty);
    expect(s.yesterdayMissed).toEqual(s.today.missed);
  });

  it('tính tiền thiếu món vì kệ hết: ghi phần còn thiếu', () => {
    const s = stockedGame();
    const d = new DaySession(s, 10);
    let c = untilFront(d);
    for (let guard = 0; guard < 80 && !(c.order.length >= 2); guard++) {
      pickAll(d, c);
      c = untilFront(d);
    }
    const [first, second] = c.order;
    // Làm trống món thứ hai trên kệ.
    for (const row of s.shelves) for (const slot of row) if (slot.productId === second.productId) slot.qty = 0;
    const pos = findSlot(s, first.productId)!;
    d.pick(pos[0], pos[1]);
    d.checkout();
    expect(s.today.missed[second.productId]).toBe(second.qty);
  });
});

describe('tiệm mới mở', () => {
  it('ngày 1 và 2 ít khách hơn, từ ngày 3 bình thường', () => {
    expect(newShopMultiplier(1)).toBe(0.6);
    expect(newShopMultiplier(2)).toBe(0.8);
    expect(newShopMultiplier(3)).toBe(1);
    expect(meanSpawnSeconds(600, 1, 1)).toBeGreaterThan(meanSpawnSeconds(600, 1, 3));
  });
});

describe('tự động thối tiền', () => {
  it('bật mặc định: khách trả tiền xong là thối đúng luôn, không cần chọn tờ', () => {
    const s = stockedGame(1, true);
    expect(createNewGame().settings.autoChange).toBe(true);
    const d = new DaySession(s, 21);
    const autos: boolean[] = [];
    d.events.on('changeResult', (e) => autos.push(e.auto));
    let c = untilFront(d);
    for (let guard = 0; guard < 30 && s.today.served < 5; guard++) {
      const money0 = s.money;
      pickAll(d, c);
      if (c.status === 'picking') d.checkout();
      expect(c.status).toBe('done');
      // Có tiền thối thì tự thối, không tip; khách đưa vừa đủ thì vẫn có thể tip như cũ.
      if (c.changeDue > 0) expect(s.money).toBe(money0 + c.total);
      else expect(s.money).toBeGreaterThanOrEqual(money0 + c.total);
      c = untilFront(d);
    }
    expect(s.today.served).toBeGreaterThanOrEqual(5);
    expect(s.today.overpaid).toBe(0);
    expect(autos.every((a) => a)).toBe(true);
  });
});

describe('tổng kết và ngày mới', () => {
  it('tổng kết tính lãi gộp và món bán chạy', () => {
    const s = createNewGame();
    s.today = { ...s.today, revenue: 150000, cogs: 110000, sold: { mi_goi: 12, muoi: 3 } };
    const sum = endDay(s);
    expect(sum.grossProfit).toBe(40000);
    expect(sum.bestSeller).toEqual({ productId: 'mi_goi', qty: 12 });
    expect(s.phase).toBe('summary');
    expect(s.yesterdaySold.mi_goi).toBe(12);
  });

  it('lên level được áp dụng ở tổng kết', () => {
    const s = createNewGame();
    s.exp = 125;
    expect(endDay(s).levelUps).toEqual([2]);
    expect(s.level).toBe(2);
  });

  it('ngày mới tăng số ngày và về buổi sáng', () => {
    const s = createNewGame();
    s.warehouse = { mi_goi: 1 };
    endDay(s);
    startNextDay(s);
    expect(s.day).toBe(2);
    expect(s.phase).toBe('morning');
  });

  it('bà gửi tiền khi kẹt vốn, tối đa mỗi 3 ngày', () => {
    const s = createNewGame();
    s.money = 1000;
    s.day = 5;
    expect(grandmaHelp(s)).toBe(50000);
    s.money = 1000;
    s.day = 6;
    expect(grandmaHelp(s)).toBe(0);
    s.day = 8;
    expect(grandmaHelp(s)).toBe(50000);
  });

  it('không cho tiền khi vẫn còn hàng', () => {
    const s = createNewGame();
    s.money = 0;
    s.shelves[0][0] = { productId: 'mi_goi', qty: 2 };
    expect(grandmaHelp(s)).toBe(0);
  });
});
