import { afterEach, describe, expect, it } from 'vitest';
import { avgSold, slowMovers, staffTable } from '../src/core/analytics';
import { addRule, applyPlanogram, lockPlanogram, runRestockRules, suggestRule } from '../src/core/autorestock';
import { createCustomer } from '../src/core/customers';
import { DATA } from '../src/core/data';
import { DaySession, endDay, openShop, runDayHeadless, setManagerMode, startNextDay } from '../src/core/day';
import { createPhoneOrder, orderShortfall } from '../src/core/delivery';
import { buyFixture, placeAnywhere, plot, plotCells, plotStatus, unlockPlot } from '../src/core/layout';
import { applyOfflineIncome, offlineElapsed } from '../src/core/offline';
import { levelForExp } from '../src/core/progression';
import { Rng } from '../src/core/rng';
import { BACKUP_KEY, PRE_MIGRATE_KEY, SAVE_KEY, loadGame, migrate, saveGame, type KeyValueStore } from '../src/core/save';
import {
  autoSchedule, doubleShift, scheduleGrid, setShift, shiftsWithoutCashier, weekday, worksShift,
} from '../src/core/schedule';
import {
  addStaffExp, bonusStaff, ensureBoard, errorChance, fire, hire, letGo, marketWage, nextSlotLevel, payroll, retainStaff, scoldStaff,
  staffSlots, timeFactor, tiredAfterMinutes, updateMoods,
} from '../src/core/staff';
import { createNewGame, formatMoney, unlockedProducts, warehouseQty, type GameState, type Staff } from '../src/core/state';
import { addLot, autoArrange, shelfCapacity, takeOneFromSlot } from '../src/core/stock';
import { PLAYER, TaskQueue } from '../src/core/tasks';
import saveV3 from './fixtures/save-v3.json';
import type { StaffRole, StaffStats } from '../src/core/data';

const originals = {
  security: { ...DATA.balance.security },
  delivery: { ...DATA.balance.delivery },
  staff: { ...DATA.balance.staff },
};
afterEach(() => {
  Object.assign(DATA.balance.security, originals.security);
  Object.assign(DATA.balance.delivery, originals.delivery);
  Object.assign(DATA.balance.staff, originals.staff);
});

function shop(level: number, money = 5_000_000): GameState {
  const s = createNewGame();
  s.level = level;
  s.exp = DATA.levels.levels[level - 1].exp;
  s.money = money;
  s.settings.autoChange = true;
  return s;
}

/** Tiệm đầy đủ như người chơi giai đoạn 2: đất A–C, tủ lạnh, tủ đông, thêm kệ; mọi món có hàng. */
function fullShop(level: number, perItem = 40): GameState {
  const s = shop(level, 20_000_000);
  s.day = 30; // tiệm đã quen khách (hết hệ số ngày đầu)
  for (const id of ['A', 'B', 'C']) unlockPlot(s, id);
  for (const type of ['fridge', 'fridge', 'freezer', 'shelf', 'shelf', 'shelf']) placeAnywhere(s, type);
  s.warehouseTier = DATA.balance.warehouseTiers.length - 1;
  restockAll(s, perItem);
  s.money = 5_000_000;
  return s;
}

function restockAll(s: GameState, perItem = 40): void {
  for (const p of unlockedProducts(s.level)) if (!p.behindCounter) addLot(s, p.id, perItem, null);
  autoArrange(s);
}

function stockUp(s: GameState, items: Record<string, number>): void {
  for (const [id, qty] of Object.entries(items)) addLot(s, id, qty, null);
  autoArrange(s);
}

let staffSeq = 0;
function addStaff(s: GameState, role: StaffRole, over: Partial<StaffStats> = {}, extra: Partial<Staff> = {}): Staff {
  const id = `t${++staffSeq}`;
  const stats = { speed: 5, accuracy: 6, friendly: 5, stamina: 6, ...over };
  s.staffBoard = { day: s.day, list: [{ id, name: `NV ${staffSeq}`, personality: 'diem_tinh', look: DATA.staff.looks[0], role, stats, wage: 30_000 }] };
  const level = s.level;
  s.level = Math.max(level, 20);
  expect(hire(s, id, role)).toBe('ok');
  s.level = level;
  const staff = s.staff[s.staff.length - 1];
  Object.assign(staff, extra);
  return staff;
}

function runTicks(d: DaySession, seconds: number): void {
  for (let i = 0; i < seconds * 10 && !d.ended; i++) d.tick(0.1);
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('hàng đợi việc (TaskQueue)', () => {
  it('nhận việc ưu tiên cao nhất theo thứ tự loại việc của vai trò', () => {
    const q = new TaskQueue();
    q.upsert('refill:0:1', 'refill', 0.2);
    q.upsert('refill:0:2', 'refill', 0.9);
    q.upsert('receive', 'receive', 1);
    expect(q.claim('a', ['receive', 'refill'])?.key).toBe('receive');
    expect(q.claim('b', ['refill'])?.key).toBe('refill:0:2');
    expect(q.claim('c', ['refill'])?.key).toBe('refill:0:1');
    expect(q.claim('d', ['refill'])).toBeNull();
  });

  it('người chơi nhận việc bằng chạm; không nhận trùng việc của người khác; nhả việc khi hết ca', () => {
    const q = new TaskQueue();
    q.upsert('refill:1:0', 'refill', 1);
    expect(q.claimKey(PLAYER, 'refill:1:0')).toBe(true);
    expect(q.claimKey('staff', 'refill:1:0')).toBe(false);
    q.upsert('refill:1:1', 'refill', 1);
    q.claim('staff', ['refill']);
    q.releaseAgent('staff');
    expect(q.isClaimed('refill:1:1')).toBe(false);
    q.prune('refill', new Set());
    expect(q.get('refill:1:0')).toBeDefined(); // việc đang làm không bị xóa
    expect(q.get('refill:1:1')).toBeUndefined();
  });
});

describe('dữ liệu giai đoạn 3', () => {
  it('level 10–20 và chỗ nhân viên L10: 1, L12: 2, L15: 4, L20: 6', () => {
    expect(DATA.levels.maxLevel).toBe(35);
    expect(levelForExp(5130)).toBe(10);
    expect(levelForExp(18470)).toBe(20);
    expect([9, 10, 11, 12, 14, 15, 19, 20].map(staffSlots)).toEqual([0, 1, 1, 2, 2, 4, 4, 6]);
    expect(nextSlotLevel(10)).toBe(12);
    expect(nextSlotLevel(20)).toBe(21);
    const features = Object.fromEntries(DATA.levels.levels.filter((l) => l.level >= 10).map((l) => [l.level, l.features]));
    expect(features[13]).toContain('schedule');
    expect(features[15]).toEqual(expect.arrayContaining(['mini_mart', 'cart', 'thief']));
    expect(features[20]).toEqual(expect.arrayContaining(['manager', 'offline']));
  });
});

describe('bản lưu v4', () => {
  it('migrate v3 → v4 giữ khu, kho lô, hàng sau quầy; thêm trường nhân viên; lên level theo EXP dư', () => {
    const s = migrate(structuredClone(saveV3) as unknown as { version: number; state: Record<string, unknown> });
    expect(s.version).toBe(5);
    expect(s.level).toBe(11);
    expect(s.staff).toEqual([]);
    expect(s.schedule).toEqual({});
    expect(s.rules).toEqual([]);
    expect(s.analytics).toEqual([]);
    expect(typeof s.lastSeen).toBe('number');
    expect(s.warehouse.find((l) => l.productId === 'rau_muong')).toEqual({ productId: 'rau_muong', qty: 6, exp: 26 });
    expect(s.shelves[0][0].productId).toBe('mi_goi');
    expect(s.counter[0].productId).toBe('the_cao');
    expect(s.fixtures.some((f) => f.type === 'fridge')).toBe(true);
    expect(s.land).toEqual(['A', 'B', 'C']);
    expect(s.today.hourly).toHaveLength(14);
  });

  it('tải bản v3 giữ bản dự phòng; mỗi lần lưu ghi lastSeen', () => {
    const store = memoryStore();
    store.setItem(SAVE_KEY, JSON.stringify(saveV3));
    const res = loadGame(store);
    expect(res.status).toBe('ok');
    expect(JSON.parse(store.getItem(PRE_MIGRATE_KEY)!).version).toBe(3);
    expect(store.getItem(BACKUP_KEY)).toBeNull();
    if (res.status !== 'ok') return;
    res.state.lastSeen = 0;
    saveGame(res.state, store);
    expect(res.state.lastSeen).toBeGreaterThan(0);
  });
});

describe('tuyển dụng', () => {
  it('lần đầu L10 luôn có Bé Lan (thu ngân, 25.000đ/ngày); bảng 3–4 người làm mới sau 2 ngày', () => {
    const s = shop(10);
    const list = ensureBoard(s);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThanOrEqual(4);
    const lan = list.find((c) => c.id === 'be_lan')!;
    expect(lan).toMatchObject({ name: 'Bé Lan', role: 'cashier', wage: 25_000 });
    const others = list.filter((c) => c.id !== 'be_lan').map((c) => c.id);
    s.day += 1;
    expect(ensureBoard(s).map((c) => c.id)).toEqual(list.map((c) => c.id));
    s.day += 1;
    const next = ensureBoard(s);
    expect(next.some((c) => others.includes(c.id))).toBe(false);
    expect(next.some((c) => c.id === 'be_lan')).toBe(true);
    // Ứng viên chỉ có vai trò đã mở (L10: chỉ thu ngân).
    expect(next.every((c) => c.role === 'cashier')).toBe(true);
  });

  it('thuê trong giới hạn chỗ; vai trò chưa mở bị chặn; Bé Lan thuê rồi không quay lại bảng', () => {
    const s = shop(10);
    ensureBoard(s);
    expect(hire(s, 'be_lan', 'refill')).toBe('role');
    expect(hire(s, 'be_lan')).toBe('ok');
    const other = s.staffBoard!.list[0];
    expect(hire(s, other.id)).toBe('full');
    s.day += 2;
    expect(ensureBoard(s).some((c) => c.id === 'be_lan')).toBe(false);
  });

  it('sa thải trả thêm 1 ngày lương và xóa khỏi lịch ca', () => {
    const s = shop(13);
    const a = addStaff(s, 'cashier');
    autoSchedule(s);
    const money = s.money;
    expect(fire(s, a.id)).toBe(30_000);
    expect(s.money).toBe(money - 30_000);
    expect(s.staff).toHaveLength(0);
    expect(s.schedule[a.id]).toBeUndefined();
  });

  it('lương đề nghị tăng theo tổng chỉ số', () => {
    const low = marketWage({ speed: 2, accuracy: 2, friendly: 2, stamina: 2 });
    const high = marketWage({ speed: 9, accuracy: 9, friendly: 9, stamina: 9 });
    expect(high).toBeGreaterThan(low);
    expect(high % 1000).toBe(0);
  });
});

describe('chỉ số và tâm trạng nhân viên', () => {
  it('công thức tốc độ, thối sai, mệt', () => {
    const s = shop(12);
    const a = addStaff(s, 'cashier', { speed: 5, accuracy: 2, stamina: 4 });
    expect(timeFactor(a, false)).toBeCloseTo(1.0);
    expect(timeFactor(a, true)).toBeCloseTo(1 / 0.7);
    expect(errorChance(a, s.day)).toBeCloseTo(0.098);
    expect(tiredAfterMinutes(a)).toBe(300);
    a.stats.accuracy = 10;
    expect(errorChance(a, s.day)).toBeCloseTo(0.01);
  });

  it('thu ngân Chính xác 2: khoảng 9–11% khách bị thối sai', () => {
    const s = fullShop(20);
    s.manager.enabled = true;
    const a = addStaff(s, 'cashier', { accuracy: 2, speed: 9, stamina: 10 });
    DATA.balance.staff.expPerLevel = 1e9; // giữ nguyên chỉ số (không lên cấp) trong phép đo
    let served = 0;
    for (let day = 0; day < 40 && a.lifetime.served < 1200; day++) {
      s.warehouse = [];
      restockAll(s, 60);
      openShop(s);
      const d = new DaySession(s, 1000 + day);
      runDayHeadless(d);
      served += s.today.staffPerf[a.id]?.served ?? 0;
      endDay(s);
      startNextDay(s);
      a.mood = 80;
    }
    const rate = a.lifetime.mistakes / a.lifetime.served;
    expect(a.lifetime.served).toBeGreaterThan(1000);
    expect(rate).toBeGreaterThan(0.085);
    expect(rate).toBeLessThan(0.115);
  });

  it('ngày nghỉ +10; làm quá 6 ngày liền thì trừ tâm trạng và kêu mệt', () => {
    const s = shop(13);
    const a = addStaff(s, 'refill');
    a.mood = 50;
    a.wage = marketWage(a.stats);
    for (let d = 0; d < 7; d++) setShift(s, a.id, d, 0, false), setShift(s, a.id, d, 1, false);
    updateMoods(s);
    expect(a.mood).toBe(60);
    for (let d = 0; d < 7; d++) setShift(s, a.id, d, 0, true);
    let notes: string[] = [];
    for (let i = 0; i < 7; i++) {
      notes = updateMoods(s).map((n) => n.text);
      s.day++;
    }
    expect(a.streak).toBe(7);
    expect(a.mood).toBeLessThan(60);
    expect(notes.join()).toContain('Mệt quá chủ ơi');
  });

  it('dưới 10 hai ngày liền thì xin nghỉ; giữ lại +15% lương, +30 tâm trạng', () => {
    const s = shop(12);
    const a = addStaff(s, 'cashier');
    a.mood = 0;
    a.wage = 10_000;
    updateMoods(s);
    expect(a.quitting).toBe(false);
    const notes = updateMoods(s);
    expect(a.quitting).toBe(true);
    expect(notes[0].text).toContain('xin nghỉ');
    const mood = a.mood;
    expect(retainStaff(s, a.id)).toBe(true);
    expect(a.wage).toBe(12_000);
    expect(a.mood).toBe(mood + 30);
    a.quitting = true;
    expect(letGo(s, a.id)).toBe(true);
    expect(s.staff).toHaveLength(0);
  });

  it('thưởng 20.000đ: tiền −20.000đ, tâm trạng +15; nhắc nhở: −tâm trạng, +2 chính xác trong ngày', () => {
    const s = shop(12);
    const a = addStaff(s, 'cashier', { accuracy: 4 });
    a.mood = 50;
    const money = s.money;
    expect(bonusStaff(s, a.id)).toBe(true);
    expect(s.money).toBe(money - 20_000);
    expect(a.mood).toBe(65);
    const before = errorChance(a, s.day);
    expect(scoldStaff(s, a.id)).toBe(true);
    expect(a.mood).toBe(55);
    expect(errorChance(a, s.day)).toBeCloseTo(before - 0.022);
    expect(errorChance(a, s.day + 1)).toBeCloseTo(before);
    const b = addStaff(s, 'cashier', {}, { personality: 'coc_tinh', mood: 50 });
    scoldStaff(s, b.id);
    expect(b.mood).toBe(30);
  });

  it('Bé Lan lên cấp 2: Chính xác +1, lương 25.000đ → 27.000đ', () => {
    const s = shop(10);
    ensureBoard(s);
    hire(s, 'be_lan');
    const lan = s.staff[0];
    expect(addStaffExp(lan, 39)).toBe(0);
    expect(addStaffExp(lan, 1)).toBe(1);
    expect(lan.level).toBe(2);
    expect(lan.stats.accuracy).toBe(7);
    expect(lan.wage).toBe(27_000);
  });
});

describe('lương', () => {
  it('trả lương người có ca; thiếu tiền thì nợ lương và mọi người −20 tâm trạng', () => {
    const s = shop(13, 45_000);
    const a = addStaff(s, 'cashier');
    const b = addStaff(s, 'refill');
    autoSchedule(s);
    for (let d = 0; d < 7; d++) {
      setShift(s, a.id, d, 0, true); setShift(s, a.id, d, 1, true);
      setShift(s, b.id, d, 0, false); setShift(s, b.id, d, 1, true);
    }
    a.mood = b.mood = 60;
    const res = payroll(s);
    expect(res.total).toBe(45_000);
    expect(res.paid).toBe(45_000);
    expect(s.money).toBe(0);
    const again = payroll(s);
    expect(again.debt).toBe(45_000);
    expect(a.mood).toBe(40);
    expect(b.mood).toBe(40);
  });
});

describe('xếp ca', () => {
  it('trước L13 mọi nhân viên làm cả ngày; L13 xếp theo lịch 7 ngày × 2 ca', () => {
    const s = shop(12);
    const a = addStaff(s, 'cashier');
    expect(worksShift(s, a.id, s.day, 0)).toBe(true);
    s.level = 13;
    for (let d = 0; d < 7; d++) setShift(s, a.id, d, 0, false);
    expect(worksShift(s, a.id, s.day, 0)).toBe(false);
    expect(worksShift(s, a.id, s.day, 1)).toBe(true);
    expect(weekday(8)).toBe(0);
  });

  it('nhân viên chỉ làm ca chiều tới lúc 14:00 và tính nửa ngày lương', () => {
    const s = shop(13);
    const a = addStaff(s, 'cashier');
    for (let d = 0; d < 7; d++) { setShift(s, a.id, d, 0, false); setShift(s, a.id, d, 1, true); }
    stockUp(s, { mi_goi: 60 });
    openShop(s);
    const d = new DaySession(s, 7);
    let arrivedAt = -1;
    d.events.on('staffArrived', () => { arrivedAt = s.clock; });
    runTicks(d, 80);
    expect(arrivedAt).toBe(-1);
    runTicks(d, 20);
    expect(arrivedAt).toBeGreaterThanOrEqual(840);
    expect(arrivedAt).toBeLessThan(850);
    runTicks(d, 200);
    const money = s.money;
    endDay(s);
    expect(s.lastSummary!.wages).toBe(15_000);
    expect(s.money).toBeLessThanOrEqual(money - 15_000);
  });

  it('xếp tự động: 2 thu ngân → mọi ca có thu ngân, mỗi người nghỉ ít nhất 1 ngày; cảnh báo ca đôi/ca trống', () => {
    const s = shop(13);
    const a = addStaff(s, 'cashier');
    const b = addStaff(s, 'cashier');
    const c = addStaff(s, 'refill');
    autoSchedule(s);
    const grid = scheduleGrid(s);
    expect(grid.every((cell) => cell.cashiers >= 1)).toBe(true);
    for (const x of [a, b, c]) {
      const rest = Array.from({ length: 7 }, (_, d) => !s.schedule[x.id][d * 2] && !s.schedule[x.id][d * 2 + 1]);
      expect(rest.some(Boolean)).toBe(true);
    }
    expect([0, 1, 2, 3, 4, 5, 6].some((d) => doubleShift(s, a.id, d) || doubleShift(s, b.id, d))).toBe(true);
    for (let d = 0; d < 7; d++) { setShift(s, a.id, d, 1, false); setShift(s, b.id, d, 1, false); }
    expect(shiftsWithoutCashier(s, s.day)).toEqual([1]);
  });
});

describe('mini-mart, nhiều quầy, xe đẩy', () => {
  it('Đất D L15 giá 1.200.000đ, +12 ô; quầy 2 và kệ đôi cần Đất D', () => {
    const s = shop(15, 3_000_000);
    expect(plot('D').cost).toBe(1_200_000);
    expect(plotCells(plot('D'))).toHaveLength(12);
    expect(buyFixture(s, 'counter2', 0, 0, 0)).toBe('plot');
    expect(plotStatus(s, 'D')).toBe('available');
    unlockPlot(s, 'D');
    expect(buyFixture(s, 'counter2', 0, 0, 0)).toBe('ok');
    expect(buyFixture(s, 'counter2', 2, 0, 0)).toBe('limit');
    expect(buyFixture(s, 'shelf_double', 0, 2, 0)).toBe('ok');
    const shelf = s.fixtures.find((f) => f.type === 'shelf_double')!.shelf!;
    expect(shelfCapacity(s, shelf)).toBe(20);
    expect(shelfCapacity(s, 0)).toBe(10);
  });

  it('khách mới xếp vào quầy ít người chờ nhất', () => {
    const s = shop(15);
    unlockPlot(s, 'D');
    buyFixture(s, 'counter2', 0, 0, 0);
    addStaff(s, 'cashier');
    stockUp(s, { mi_goi: 50 });
    openShop(s);
    const d = new DaySession(s, 3);
    d.tick(0.1);
    expect(d.lanes).toHaveLength(1);
    const choose = () => (d as unknown as { chooseLane(): number | null }).chooseLane();
    const fake = (id: number) => createCustomer(900 + id, s.level, new Rng(id), s);
    d.queue.push(fake(1), fake(2), fake(3));
    d.lanes[0].queue.push(fake(4));
    expect(choose()).toBe(d.lanes[0].id);
    d.queue.splice(0, 3);
    expect(choose()).toBe(0);
  });

  it('có Đất D: khoảng 40% bà nội trợ lấy xe đẩy và mua 3–6 món', () => {
    const s = shop(15);
    unlockPlot(s, 'D');
    const rng = new Rng(42);
    let housewives = 0;
    let carts = 0;
    for (let i = 0; i < 3000; i++) {
      const c = createCustomer(i, s.level, rng, s);
      if (c.type.id !== 'noi_tro') { expect(c.cart).toBeUndefined(); continue; }
      housewives++;
      if (!c.cart) continue;
      carts++;
      const units = c.order.filter((l) => !l.counterLine).reduce((n, l) => n + l.qty, 0);
      expect(units).toBeGreaterThanOrEqual(3);
      expect(units).toBeLessThanOrEqual(6);
    }
    expect(carts / housewives).toBeGreaterThan(0.33);
    expect(carts / housewives).toBeLessThan(0.47);
  });
});

describe('nhân viên làm việc trong ngày', () => {
  it('mô phỏng 1 ngày với thu ngân + bổ sung kệ: phục vụ khách, nạp kệ, ghi hiệu suất', () => {
    const s = fullShop(12, 60);
    const cashier = addStaff(s, 'cashier');
    const refill = addStaff(s, 'refill');
    openShop(s);
    // Vài ô đã vơi dưới 40% để nhân viên bổ sung kệ có việc ngay.
    for (const slot of s.shelves[0].slice(0, 3)) while (slot.qty > 2) takeOneFromSlot(slot);
    const d = new DaySession(s, 11);
    d.autoPlayerReact = 1.2;
    let staffServed = 0;
    let refills = 0;
    d.events.on('staffServed', () => staffServed++);
    d.events.on('staffRefill', () => refills++);
    runDayHeadless(d);
    expect(d.ended).toBe(true);
    expect(staffServed).toBeGreaterThan(5);
    expect(refills).toBeGreaterThan(0);
    expect(s.today.staffPerf[cashier.id].served).toBe(staffServed);
    expect(s.today.staffPerf[refill.id].jobs).toBe(refills);
    const sum = endDay(s);
    expect(sum.wages).toBe(cashier.wage + refill.wage); // lương theo cấp hiện tại (có thể vừa lên cấp)
    expect(sum.journal!.some((j) => j.t.includes('vào ca'))).toBe(true);
    expect(staffTable(s, 7).map((r) => r.id)).toEqual(expect.arrayContaining([cashier.id, refill.id]));
  });

  it('thu ngân chỉ quét món khách tự lấy, không tự lấy hàng khỏi kệ', () => {
    const s = shop(10);
    addStaff(s, 'cashier');
    stockUp(s, { mi_goi: 40 });
    openShop(s);
    const d = new DaySession(s, 5);
    runTicks(d, 30);
    const served = d.lanes.flatMap((l) => l.queue);
    for (const c of served) for (const line of c.order) expect(line.scanned).toBeLessThanOrEqual(line.picked);
  });

  it('nhân viên kho ca sáng bày kệ theo sơ đồ trước giờ mở cửa', () => {
    const s = shop(14);
    stockUp(s, { mi_goi: 40, gao: 20 });
    lockPlanogram(s);
    const want = s.shelves.map((row) => row.map((slot) => slot.productId));
    for (const row of s.shelves) for (const slot of row) { if (slot.productId) addLot(s, slot.productId, slot.qty, null); slot.qty = 0; slot.lots = []; }
    addStaff(s, 'stocker');
    openShop(s);
    expect(s.shelves.map((row) => row.map((slot) => slot.productId))).toEqual(want);
    expect(s.shelves[0].some((slot) => slot.qty > 0)).toBe(true);
    expect(s.today.journal.some((j) => j.t.includes('theo sơ đồ'))).toBe(true);
    expect(applyPlanogram(s)).toBe(0);
  });
});

describe('tổng kết có chi phí nhân sự', () => {
  it('lãi gộp 400.000đ, lương 60.000đ, điện 13.000đ → lãi ròng 327.000đ; nhật ký theo giờ', () => {
    const s = shop(12);
    unlockPlot(s, 'A');
    unlockPlot(s, 'B');
    expect(placeAnywhere(s, 'fridge')).toBe(true);
    expect(placeAnywhere(s, 'freezer')).toBe(true);
    addStaff(s, 'cashier');
    addStaff(s, 'refill');
    openShop(s);
    s.today.revenue = 500_000;
    s.today.cogs = 100_000;
    s.today.journal.push({ m: 615, t: 'Bé Lan thối dư 5.000đ' }, { m: 700, t: 'Tự nhập: 40 mì gói' });
    const sum = endDay(s);
    expect(sum.grossProfit).toBe(400_000);
    expect(sum.wages).toBe(60_000);
    expect(sum.electricity).toBe(13_000);
    expect(sum.netProfit).toBe(327_000);
    expect(sum.journal!.map((j) => j.m)).toEqual([615, 700]);
  });
});

describe('đặt hàng tự động', () => {
  it('buổi sáng: tồn 8 mì gói, quy tắc "dưới 15 thì nhập 40 từ Cô Tư" → tự mua 40 gói', () => {
    const s = shop(16);
    addLot(s, 'mi_goi', 8, null);
    expect(addRule(s, { productId: 'mi_goi', threshold: 15, qty: 40, supplierId: 'co_tu' })).toBeNull();
    s.phase = 'summary';
    startNextDay(s);
    expect(warehouseQty(s, 'mi_goi')).toBe(48);
    expect(s.morningNotes).toContain('Tự nhập: 40 mì gói');
    expect(s.today.journal.some((j) => j.t === 'Tự nhập: 40 mì gói')).toBe(true);
  });

  it('thiếu tiền: làm theo thứ tự ưu tiên tới khi hết tiền và báo "Thiếu tiền nhập"', () => {
    const s = shop(16, 150_000);
    addRule(s, { productId: 'mi_goi', threshold: 10, qty: 30, supplierId: 'co_tu' });
    addRule(s, { productId: 'dau_an', threshold: 10, qty: 30, supplierId: 'co_tu' });
    const report = runRestockRules(s);
    expect(report.bought.map((b) => b.productId)).toEqual(['mi_goi']);
    expect(report.short).toEqual(['dau_an']);
    expect(report.messages.some((m) => m.startsWith('Thiếu tiền nhập:'))).toBe(true);
  });

  it('chưa tới L16 thì không tạo quy tắc; gợi ý "dưới 20 thì nhập 40" khi bán TB 20/ngày', () => {
    const s = shop(15);
    expect(addRule(s, { productId: 'nuoc_suoi', threshold: 1, qty: 1, supplierId: 'co_tu' })).toBe('locked');
    s.level = 16;
    for (let i = 0; i < 7; i++) s.analytics.push({ day: i + 1, revenue: 0, profit: 0, cogs: 0, wages: 0, electricity: 0, spoiled: 0, theft: 0, customers: 0, avgRating: 0, sold: { nuoc_suoi: 20 }, hourly: [], staff: {}, manager: false });
    expect(avgSold(s, 'nuoc_suoi')).toBe(20);
    expect(suggestRule(s, 'nuoc_suoi')).toMatchObject({ threshold: 20, qty: 40 });
  });
});

describe('an ninh', () => {
  function thiefShop(): { s: GameState; d: DaySession } {
    DATA.balance.security.thiefChance = 1;
    const s = shop(15);
    stockUp(s, { mi_goi: 60, snack: 60, keo: 60, banh_quy: 60, gao: 30 });
    openShop(s);
    return { s, d: new DaySession(s, 21) };
  }

  it('chạm vào kẻ trộm trong 3 giây: trả hàng, bồi thường gấp đôi, bỏ đi', () => {
    const { s, d } = thiefShop();
    let caught = false;
    d.events.on('thiefFleeing', (c) => {
      if (caught) return;
      caught = true;
      const value = c.order.reduce((sum, l) => sum + (l.value ?? 0), 0);
      const shelfBefore = s.shelves.flat().reduce((n, slot) => n + slot.qty, 0);
      const money = s.money;
      expect(d.catchThief(c.id)).toBe(true);
      expect(s.money).toBe(money + Math.round(value * 2));
      expect(s.shelves.flat().reduce((n, slot) => n + slot.qty, 0) + warehouseQty(s, 'mi_goi') * 0).toBeGreaterThan(shelfBefore);
      expect(c.status).toBe('done');
    });
    runTicks(d, 30);
    expect(caught).toBe(true);
    expect(s.today.thievesCaught).toBe(1);
  });

  it('để kẻ trộm ra khỏi cửa thì mất hàng và tổng kết ghi "Mất trộm"', () => {
    const { s, d } = thiefShop();
    runTicks(d, 30);
    expect(s.today.thefts).toBeGreaterThan(0);
    expect(s.today.theftCost).toBeGreaterThan(0);
    expect(s.today.journal.some((j) => j.t.startsWith('Mất trộm:'))).toBe(true);
    runDayHeadless(d);
    const sum = endDay(s);
    expect(sum.theftCost).toBe(s.today.theftCost);
  });

  it('camera an ninh báo động và chặn kẻ trộm', () => {
    DATA.balance.security.cameraDetect = 1;
    const { s, d } = thiefShop();
    s.level = 17;
    s.camera = true;
    const by: string[] = [];
    d.events.on('thiefCaught', (e) => by.push(e.by));
    runTicks(d, 30);
    expect(by.length).toBeGreaterThan(0);
    expect(by.every((b) => b === 'camera')).toBe(true);
    expect(s.today.thefts).toBe(0);
  });
});

describe('giao hàng tận nhà', () => {
  it('đơn thiếu hàng thì không nhận được và báo món thiếu', () => {
    const s = shop(18);
    addLot(s, 'mi_goi', 2, null);
    expect(orderShortfall(s, { mi_goi: 3, gao: 1 })).toEqual([{ productId: 'mi_goi', missing: 1 }, { productId: 'gao', missing: 1 }]);
    const o = createPhoneOrder(s, new Rng(1), 1, 600);
    expect(o.value).toBeGreaterThan(0);
    expect(Object.values(o.items).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(3);
    expect(o.deadline - 600).toBeGreaterThanOrEqual(60);
    expect(o.deadline - 600).toBeLessThanOrEqual(120);
  });

  it('nhận đơn giữ hàng khỏi kho; nhân viên giao đúng hạn được tiền + phí ship và 5 sao; giao trễ mất phí, 2 sao', () => {
    DATA.balance.delivery.ringChancePerSecond = 50;
    const s = shop(18);
    const courier = addStaff(s, 'delivery', { speed: 8 });
    stockUp(s, { mi_goi: 80, snack: 80, keo: 80, banh_quy: 80, gao: 60, nuoc_mam: 40, xa_phong: 40 });
    openShop(s);
    const d = new DaySession(s, 4);
    runTicks(d, 0.2);
    const order = d.phoneOrders.find((o) => o.status === 'ringing')!;
    expect(order).toBeDefined();
    DATA.balance.delivery.ringChancePerSecond = 0;
    order.items = { mi_goi: 3, gao: 2 };
    const before = Object.fromEntries(Object.keys(order.items).map((id) => [id, warehouseQty(s, id)]));
    expect(d.acceptOrder(order.id)).toBe('ok');
    for (const [id, q] of Object.entries(order.items)) expect(warehouseQty(s, id)).toBe(before[id] - q);
    const money = s.money;
    runTicks(d, 30);
    expect(order.courier).toBe(courier.id);
    expect(order.delivered).toBe(true);
    expect(order.onTime).toBe(true);
    expect(s.money - money).toBeGreaterThanOrEqual(order.value + order.fee);
    expect(s.today.deliveryFees).toBe(order.fee);

    const late = createPhoneOrder(s, new Rng(9), 99, s.clock);
    late.items = { snack: 4 };
    late.deadline = s.clock - 1;
    d.phoneOrders.push(late);
    expect(d.acceptOrder(late.id)).toBe('ok');
    runTicks(d, 40);
    expect(late.delivered).toBe(true);
    expect(late.onTime).toBe(false);
    expect(s.today.lateDeliveries).toBe(1);
    expect(s.today.deliveryFees).toBe(order.fee);
  });

  it('không có nhân viên giao hàng: chủ tiệm tự giao, quầy tạm không nhận khách', () => {
    const s = shop(18);
    stockUp(s, { mi_goi: 80, gao: 40 });
    openShop(s);
    const d = new DaySession(s, 8);
    const o = createPhoneOrder(s, new Rng(3), 50, s.clock);
    o.items = { mi_goi: 4 };
    d.phoneOrders.push(o);
    d.acceptOrder(o.id);
    expect(d.selfDeliver(o.id)).toBe(true);
    expect(d.playerLaneOpen()).toBe(false);
    runTicks(d, o.tripTotal + 1);
    expect(o.delivered).toBe(true);
    expect(d.playerLaneOpen()).toBe(true);
  });
});

describe('phân tích', () => {
  it('giữ 30 ngày gần nhất; ngày 31 xóa ngày 1', () => {
    const s = shop(19);
    for (let day = 1; day <= 31; day++) {
      s.day = day;
      openShop(s);
      endDay(s);
    }
    expect(s.analytics).toHaveLength(30);
    expect(s.analytics[0].day).toBe(2);
    expect(s.analytics[29].day).toBe(31);
  });

  it('món không bán được 5 ngày vào danh sách ế kèm gợi ý', () => {
    const s = shop(19);
    addLot(s, 'dau_an', 10, null);
    for (let i = 0; i < 5; i++) s.analytics.push({ day: i + 1, revenue: 0, profit: 0, cogs: 0, wages: 0, electricity: 0, spoiled: 0, theft: 0, customers: 0, avgRating: 0, sold: { mi_goi: 5 }, hourly: [], staff: {}, manager: false });
    const slow = slowMovers(s);
    expect(slow.find((x) => x.productId === 'dau_an')).toMatchObject({ hint: 'Giảm giá hoặc ngừng nhập' });
  });
});

describe('chế độ quản lý', () => {
  it('L20 bật "Để nhân viên lo" buổi sáng; bỏ qua ngày chạy hết ngày dưới 1 giây, khách được phục vụ không cần chạm', () => {
    const s = fullShop(20, 60);
    expect(setManagerMode(s, true)).toBe(true);
    addStaff(s, 'cashier', { speed: 8 });
    addStaff(s, 'cashier', { speed: 7 });
    addStaff(s, 'refill');
    openShop(s);
    expect(s.today.managerDay).toBe(true);
    const d = new DaySession(s, 77);
    const start = performance.now();
    runDayHeadless(d);
    const ms = performance.now() - start;
    expect(d.ended).toBe(true);
    expect(ms).toBeLessThan(1000);
    expect(s.today.served).toBeGreaterThan(20);
    expect(s.today.staffExp).toBeGreaterThan(0);
    const sum = endDay(s);
    expect(s.managerStats).toHaveLength(1);
    expect(s.managerStats[0].revenue).toBe(sum.revenue);
  });

  it('dưới L20 không bật được; có thu ngân thì quầy người chơi không nhận khách mới', () => {
    const s = shop(19);
    expect(setManagerMode(s, true)).toBe(false);
    s.level = 20;
    setManagerMode(s, true);
    addStaff(s, 'cashier');
    stockUp(s, { mi_goi: 60 });
    openShop(s);
    const d = new DaySession(s, 2);
    d.tick(0.1);
    expect(d.playerLaneOpen()).toBe(false);
  });

  it('ca không có thu ngân: cảnh báo buổi sáng và sự cố "phải tự đứng quầy"', () => {
    const s = shop(20);
    setManagerMode(s, true);
    addStaff(s, 'refill');
    expect(shiftsWithoutCashier(s, s.day)).toEqual([0, 1]);
    stockUp(s, { mi_goi: 30 });
    openShop(s);
    const d = new DaySession(s, 2);
    d.tick(0.1);
    expect(d.openIncidents().some((i) => i.kind === 'noCashier')).toBe(true);
    expect(d.playerLaneOpen()).toBe(true);
  });

  it('khách phàn nàn thu ngân thối sai: "Xin lỗi + bù tiền"', () => {
    const s = fullShop(20, 60);
    setManagerMode(s, true);
    addStaff(s, 'cashier', { accuracy: 1 });
    s.staff[0].personality = 'hay_quen';
    openShop(s);
    const d = new DaySession(s, 12);
    runDayHeadless(d);
    const complaint = d.incidents.find((i) => i.kind === 'complaint')!;
    expect(complaint).toBeDefined();
    const money = s.money;
    expect(d.resolveIncident(complaint.id, 'apologize')).toBe(true);
    expect(s.money).toBe(money - complaint.amount!);
    expect(d.resolveIncident(complaint.id, 'dismiss')).toBe(false);
  });
});

describe('thu nhập offline', () => {
  function managerShop(): GameState {
    const s = shop(20);
    s.managerStats = [{ day: 1, revenue: 0, profit: 0, sold: { mi_goi: 20 } }];
    return s;
  }

  it('vắng 2 giờ: 2 ngày trôi qua, bán 60% nhu cầu, cộng tiền và trừ lương, điện', () => {
    const s = managerShop();
    addStaff(s, 'cashier');
    addLot(s, 'mi_goi', 100, null);
    const day = s.day;
    const money = s.money;
    const r = applyOfflineIncome(s, 2 * 3_600_000)!;
    expect(r.days).toBe(2);
    expect(r.sold.mi_goi).toBe(24);
    expect(s.day).toBe(day + 2);
    expect(r.wages).toBe(60_000);
    expect(s.money).toBe(money + r.revenue - r.wages - r.electricity);
    expect(r.profit).toBe(r.revenue - r.cogs - r.wages - r.electricity);
    expect(r.outOfStockDay).toBeNull();
  });

  it('hết hàng giữa chừng: chỉ tính tới khi hết và ghi ngày hết hàng', () => {
    const s = managerShop();
    addLot(s, 'mi_goi', 12, null);
    const day = s.day;
    const r = applyOfflineIncome(s, 4 * 3_600_000)!;
    expect(r.sold.mi_goi).toBe(12);
    expect(r.days).toBe(1);
    expect(r.outOfStockDay).toBe(day + 1);
  });

  it('giới hạn 8 giờ; dưới L20 không có thu nhập offline', () => {
    const s = managerShop();
    addLot(s, 'mi_goi', 1000, null);
    expect(applyOfflineIncome(s, 30 * 3_600_000)!.days).toBe(8);
    const low = managerShop();
    low.level = 19;
    addLot(low, 'mi_goi', 100, null);
    expect(applyOfflineIncome(low, 5 * 3_600_000)).toBeNull();
    expect(low.day).toBe(1);
  });

  it('chống chỉnh đồng hồ: lùi đồng hồ thì bỏ qua và cập nhật lastSeen; đã đăng nhập thì dùng giờ máy chủ', () => {
    const s = managerShop();
    s.lastSeen = 10_000_000;
    expect(offlineElapsed(s, 9_000_000)).toBeNull();
    expect(s.lastSeen).toBe(9_000_000);
    expect(offlineElapsed(s, 9_000_000 + 8 * 3_600_000, 3_600_000)).toBe(3_600_000);
    expect(offlineElapsed(s, 9_500_000)).toBe(500_000);
  });
});

it('định dạng tiền dùng trong nhật ký', () => {
  expect(formatMoney(5000)).toBe('5.000đ');
});
