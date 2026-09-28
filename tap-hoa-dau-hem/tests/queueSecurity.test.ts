import { afterEach, describe, expect, it } from 'vitest';
import type { Customer } from '../src/core/customers';
import { DaySession, insertByTicket, startNextDay } from '../src/core/day';
import { DATA } from '../src/core/data';
import { maintenanceItems, nightBurglary, repairItem, replaceItem, wearOvernight } from '../src/core/maintenance';
import { ensureBoard, hire } from '../src/core/staff';
import { createNewGame, lotsFrom, shelfUsable, type GameState } from '../src/core/state';
import { assignSlot } from '../src/core/stock';

const saved = structuredClone({ queue: DATA.balance.queue, security: DATA.balance.security, maintenance: DATA.balance.maintenance });
afterEach(() => {
  Object.assign(DATA.balance.queue, structuredClone(saved.queue));
  Object.assign(DATA.balance.security, structuredClone(saved.security));
  Object.assign(DATA.balance.maintenance, structuredClone(saved.maintenance));
});

function busyShop(cashiers: number, level = 20): GameState {
  const s = createNewGame();
  s.level = level;
  s.money = 50_000_000;
  s.warehouse = lotsFrom({ mi_goi: 400, gao: 400, snack: 400, keo: 400 });
  assignSlot(s, 0, 0, 'mi_goi');
  assignSlot(s, 0, 1, 'gao');
  for (let i = 0; i < cashiers; i++) {
    const c = ensureBoard(s).find((x) => !s.staff.some((st) => st.name === x.name))!;
    expect(hire(s, c.id, 'cashier')).toBe('ok');
  }
  for (const st of s.staff) s.schedule[st.id] = new Array(14).fill(true);
  s.scheduleReady = true;
  s.phase = 'open';
  s.clock = DATA.balance.openMinute;
  return s;
}

const person = (id: number, ticket?: number) => ({ id, ticket, status: 'waiting' }) as unknown as Customer;

describe('hàng chờ: ai tới trước tính tiền trước', () => {
  it('xếp theo số thứ tự nhưng không chen lên trước người đang tính tiền', () => {
    const q = [person(1, 5), person(2, 7), person(3, 9)];
    insertByTicket(q, person(4, 2), 1);
    expect(q.map((c) => c.id)).toEqual([1, 4, 2, 3]);
    insertByTicket(q, person(5, 10), 1);
    expect(q.map((c) => c.id)).toEqual([1, 4, 2, 3, 5]);
    const ready: Customer[] = [];
    insertByTicket(ready, person(6, 8), 0);
    insertByTicket(ready, person(7, 3), 0);
    expect(ready.map((c) => c.id)).toEqual([7, 6]);
  });

  it('khách không nhảy qua lại giữa các quầy và mỗi hàng giữ đúng thứ tự tới', () => {
    DATA.balance.queue.cutChance = 0;
    const s = busyShop(1);
    const session = new DaySession(s, 21);
    session.autoPlayer = true;
    const lanesOf = new Map<number, Set<number>>();
    const step = DATA.balance.tickMs / 1000;
    let atCounter = true;
    for (let i = 0; i < 12_000 && !session.ended; i++) {
      // Người chơi thỉnh thoảng rời quầy (đi nạp kệ) rồi quay lại.
      if (i % 400 === 0) { atCounter = !atCounter; session.playerAtCounter = atCounter; session.autoPlayer = atCounter; }
      session.tick(step);
      const queues = [session.queue, ...session.lanes.map((l) => l.queue)];
      queues.forEach((q, lane) => {
        for (const c of q) {
          const seen = lanesOf.get(c.id) ?? new Set<number>();
          seen.add(lane === 0 ? 0 : session.lanes[lane - 1].id);
          lanesOf.set(c.id, seen);
        }
        // Sau người đầu hàng, số thứ tự tăng dần.
        const tickets = q.slice(1).map((c) => c.ticket ?? 0);
        expect(tickets).toEqual([...tickets].sort((a, b) => a - b));
      });
    }
    expect(lanesOf.size).toBeGreaterThan(5);
    for (const lanes of lanesOf.values()) expect(lanes.size).toBeLessThanOrEqual(2);
  });

  it('khách chen hàng bị người đứng quầy nhắc ra cuối hàng', () => {
    DATA.balance.queue.cutChance = 1;
    const s = busyShop(0);
    s.settings.autoScan = false;
    const session = new DaySession(s, 9);
    const scolds: { id: number; by: string }[] = [];
    session.events.on('queueScold', ({ customer, by }) => scolds.push({ id: customer.id, by }));
    const step = DATA.balance.tickMs / 1000;
    for (let i = 0; i < 8000 && !scolds.length; i++) session.tick(step);
    expect(scolds.length).toBe(1);
    expect(scolds[0].by).toBe('player');
    const c = session.queue.find((x) => x.id === scolds[0].id)!;
    expect(session.queue[session.queue.length - 1]).toBe(c);
    expect(c.scolded).toBe(true);
  });
});

describe('bảo vệ & trộm ban đêm', () => {
  it('trộm đột nhập ban đêm lấy hàng trên kệ khi không có bảo vệ', () => {
    DATA.balance.security.nightChance = 1;
    const s = busyShop(0);
    const before = s.shelves[0].reduce((n, slot) => n + slot.qty, 0);
    const note = nightBurglary(s);
    expect(note).toContain('trộm đột nhập');
    expect(s.shelves[0].reduce((n, slot) => n + slot.qty, 0)).toBeLessThan(before);
    expect(s.today.theftCost).toBeGreaterThan(0);
  });

  it('bảo vệ trực đêm đuổi được trộm, không mất hàng', () => {
    DATA.balance.security.nightChance = 1;
    const s = busyShop(0);
    const c = ensureBoard(s)[0];
    expect(hire(s, c.id, 'guard')).toBe('ok');
    const before = s.shelves[0].reduce((n, slot) => n + slot.qty, 0);
    expect(nightBurglary(s)).toContain('bảo vệ');
    expect(s.shelves[0].reduce((n, slot) => n + slot.qty, 0)).toBe(before);
  });

  it('chưa tới cấp có trộm thì đêm luôn yên ổn', () => {
    DATA.balance.security.nightChance = 1;
    const s = busyShop(0, 10);
    expect(nightBurglary(s)).toBeNull();
  });

  it('startNextDay đưa tin trộm đêm vào thông báo buổi sáng', () => {
    DATA.balance.security.nightChance = 1;
    const s = busyShop(0);
    s.phase = 'summary';
    startNextDay(s);
    expect(s.morningNotes.some((n) => n.includes('trộm'))).toBe(true);
  });
});

describe('hao mòn & sửa chữa', () => {
  function worn(): GameState {
    return busyShop(0);
  }

  it('đồ mòn dần rồi hỏng; kệ hỏng không bán được cho tới khi sửa', () => {
    DATA.balance.maintenance.breakPerWear = 1;
    DATA.balance.maintenance.majorChance = 0;
    DATA.balance.maintenance.majorWear = 101;
    const s = worn();
    const shelfItem = maintenanceItems(s).find((i) => i.fixtureUid !== undefined)!;
    const uid = shelfItem.fixtureUid!;
    const shelf = s.fixtures.find((f) => f.uid === uid)!.shelf!;
    s.maintenance = { [shelfItem.key]: { wear: 90 } };
    const notes = wearOvernight(s);
    expect(notes.some((n) => n.includes('hỏng'))).toBe(true);
    expect(s.maintenance[shelfItem.key].broken).toBe('minor');
    expect(shelfUsable(s, shelf)).toBe(false);
    const money = s.money;
    expect(repairItem(s, shelfItem.key)).toBe('ok');
    expect(s.money).toBeLessThan(money);
    expect(shelfUsable(s, shelf)).toBe(true);
  });

  it('hỏng nặng thì không sửa được, phải mua mới', () => {
    const s = worn();
    const light = maintenanceItems(s).find((i) => i.key.endsWith(':light'))!;
    s.maintenance = { [light.key]: { wear: 95, broken: 'major' } };
    expect(repairItem(s, light.key)).toBe('major');
    const money = s.money;
    expect(replaceItem(s, light.key)).toBe('ok');
    expect(money - s.money).toBe(light.cost);
    expect(s.maintenance[light.key]).toEqual({ wear: 0 });
  });

  it('đồ còn tốt thì chưa cần sửa', () => {
    const s = worn();
    const fan = maintenanceItems(s).find((i) => i.key.endsWith(':fan'))!;
    expect(repairItem(s, fan.key)).toBe('fine');
  });
});
