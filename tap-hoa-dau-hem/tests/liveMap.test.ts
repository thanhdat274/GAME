import { describe, expect, it } from 'vitest';
import { DaySession } from '../src/core/day';
import { DATA } from '../src/core/data';
import { accessCells, counterFixture, walkableGrid } from '../src/core/layout';
import { customerGoal, goalCells, queueLine, staffGoal } from '../src/core/liveMap';
import { createNewGame, lotsFrom } from '../src/core/state';
import { assignSlot } from '../src/core/stock';

function stockedGame() {
  const s = createNewGame();
  s.warehouse = lotsFrom({ mi_goi: 60, gao: 60, snack: 60, keo: 60 });
  assignSlot(s, 0, 0, 'mi_goi');
  assignSlot(s, 0, 1, 'gao');
  s.phase = 'open';
  s.clock = DATA.balance.openMinute;
  return s;
}

describe('sơ đồ trực tiếp', () => {
  it('hàng chờ bắt đầu sát quầy, đi được và nối về phía cửa', () => {
    const s = createNewGame();
    const grid = walkableGrid(s);
    const line = queueLine(s, 0, grid);
    const counter = counterFixture(s)!;
    const access = accessCells(s, counter, grid);
    expect(access.some((c) => c.x === line[0].x && c.y === line[0].y)).toBe(true);
    for (const c of line) expect(grid[c.y * DATA.land.cols + c.x]).toBe(true);
    const door = DATA.land.door;
    expect(line.some((c) => Math.abs(c.x - door.x) + Math.abs(c.y - door.y) === 1)).toBe(true);
    expect(line.some((c) => c.x === door.x && c.y === door.y)).toBe(false);
    expect(new Set(line.map((c) => `${c.x},${c.y}`)).size).toBe(line.length);
    expect(line.length).toBeGreaterThan(2);
  });

  it('khách đang chọn hàng hướng tới kệ, xếp hàng thì tới ô trong hàng chờ', () => {
    const s = stockedGame();
    const session = new DaySession(s, 42);
    const seen = new Set<string>();
    for (let i = 0; i < 4000 && seen.size < 2; i++) {
      session.tick(DATA.balance.tickMs / 1000);
      for (const c of session.customers) {
        const g = customerGoal(session, c);
        if (c.status === 'browsing' && c.at != null) {
          expect(g).toEqual({ kind: 'fixture', uid: c.at });
          const cells = goalCells(s, g, walkableGrid(s), (lane) => queueLine(s, lane, walkableGrid(s)));
          expect(cells?.length).toBeGreaterThan(0);
          seen.add('browse');
        }
        if (session.queue.includes(c)) {
          expect(g).toEqual({ kind: 'queue', lane: 0, index: session.queue.indexOf(c) });
          seen.add('queue');
        }
      }
    }
    expect(seen).toEqual(new Set(['browse', 'queue']));
  });

  it('nhân viên: đứng quầy, nạp kệ, cất hàng, đi giao', () => {
    const s = createNewGame();
    const shelf0 = s.fixtures.find((f) => f.shelf === 0)!;
    expect(staffGoal(s, null, 1)).toEqual({ kind: 'behind', lane: 1 });
    expect(staffGoal(s, 'refill:0:3', null)).toEqual({ kind: 'fixture', uid: shelf0.uid });
    expect(staffGoal(s, 'deliver:5', null)).toEqual({ kind: 'away' });
    expect(staffGoal(s, 'receive', null).kind).toMatch(/fixture|door/);
    expect(staffGoal(s, null, null)).toEqual({ kind: 'fixture', uid: s.fixtures.find((f) => f.shelf !== undefined)!.uid });
  });
});

describe('sơ đồ trực tiếp: nhân viên rảnh', () => {
  it('đứng chờ ở kệ kho nếu tiệm có kệ kho', () => {
    const s = createNewGame();
    s.fixtures.push({ uid: 99, type: 'storage_rack', x: 6, y: 0, rot: 0 });
    expect(staffGoal(s, null, null)).toEqual({ kind: 'fixture', uid: 99 });
    expect(staffGoal(s, 'receive', null)).toEqual({ kind: 'fixture', uid: 99 });
  });
});

describe('người chơi rời quầy (góc nhìn trên xuống)', () => {
  it('khách đầu hàng chờ tới khi người chơi quay lại quầy', () => {
    const s = stockedGame();
    s.settings.autoScan = false;
    const session = new DaySession(s, 7);
    session.playerAtCounter = false;
    const step = DATA.balance.tickMs / 1000;
    let waited = false;
    for (let i = 0; i < 6000 && !waited; i++) {
      session.tick(step);
      if (session.front) {
        expect(session.front.status).toBe('waiting');
        waited = true;
      }
    }
    expect(waited).toBe(true);
    session.playerAtCounter = true;
    session.tick(step);
    expect(['scanning', 'paying']).toContain(session.front?.status);
    expect(session.snapshot().playerAtCounter).toBe(true);
  });
});

describe('góc nhìn trên xuống: có thu ngân và kiên nhẫn khi vắng chủ', () => {
  function withCashier() {
    const s = stockedGame();
    s.level = 20;
    s.money = 10_000_000;
    return s;
  }

  it('rời quầy khi có thu ngân: quầy người chơi đóng, khách sang quầy thu ngân', async () => {
    const { ensureBoard, hire } = await import('../src/core/staff');
    const s = withCashier();
    const candidate = ensureBoard(s)[0];
    expect(hire(s, candidate.id, 'cashier')).toBe('ok');
    const staff = s.staff[0];
    s.schedule[staff.id] = new Array(14).fill(true);
    s.scheduleReady = true;
    const session = new DaySession(s, 11);
    const step = DATA.balance.tickMs / 1000;
    for (let i = 0; i < 50 && !session.lanes.length; i++) session.tick(step);
    expect(session.lanes.length).toBeGreaterThan(0);
    expect(session.playerLaneOpen()).toBe(true);
    session.playerAtCounter = false;
    expect(session.playerLaneOpen()).toBe(false);
    let sawStaffQueue = false;
    for (let i = 0; i < 6000; i++) {
      session.tick(step);
      expect(session.queue.every((c) => c.status !== 'waiting' || c.order.some((l) => l.scanned > 0))).toBe(true);
      if (session.lanes.some((l) => l.queue.length)) sawStaffQueue = true;
    }
    expect(sawStaffQueue).toBe(true);
  });

  it('khách ở quầy người chơi mất kiên nhẫn chậm hơn khi người chơi đang đi nạp kệ', () => {
    const run = (atCounter: boolean) => {
      const s = stockedGame();
      s.settings.autoScan = false;
      const session = new DaySession(s, 5);
      session.playerAtCounter = atCounter;
      const step = DATA.balance.tickMs / 1000;
      for (let i = 0; i < 6000 && !session.front; i++) session.tick(step);
      session.playerAtCounter = false;
      const c = session.front!;
      const start = c.patience;
      for (let i = 0; i < 20; i++) session.tick(step);
      return start - c.patience;
    };
    const lost = run(true);
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeCloseTo(2 * DATA.balance.topDown.awayPatienceRate, 1);
  });
});
