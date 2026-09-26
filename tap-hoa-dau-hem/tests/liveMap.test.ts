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
