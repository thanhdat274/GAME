import { DATA } from './data';
import type { Customer } from './customers';
import { accessCells, counterFixtures, findPath, type Cell } from './layout';
import { fixtureOfShelf, type Fixture, type GameState } from './state';

/**
 * Sơ đồ trực tiếp: suy ra mỗi người (khách, nhân viên, người chơi) đang muốn đứng ở đâu trên lưới mặt bằng
 * từ trạng thái của phiên bán. Chỉ để vẽ; không ảnh hưởng mô phỏng hay thời gian đi của khách.
 */
export type Goal =
  | { kind: 'door' }
  /** Đứng cạnh nội thất (kệ, trạm bếp, kệ kho). */
  | { kind: 'fixture'; uid: number }
  /** Xếp hàng ở quầy: `lane` = vị trí quầy (0 = quầy người chơi), `index` = thứ tự trong hàng. */
  | { kind: 'queue'; lane: number; index: number }
  /** Đứng sau quầy thu ngân (người chơi hoặc thu ngân). */
  | { kind: 'behind'; lane: number }
  /** Ra khỏi tiệm (đi giao hàng): đi tới cửa rồi ẩn. */
  | { kind: 'away' }
  /** Đi tới một ô trống (người chơi chạm ô). */
  | { kind: 'cell'; x: number; y: number }
  /** Đứng yên tại chỗ. */
  | { kind: 'stay' };

export function goalKey(g: Goal): string {
  switch (g.kind) {
    case 'fixture': return `f${g.uid}`;
    case 'queue': return `q${g.lane}:${g.index}`;
    case 'behind': return `b${g.lane}`;
    case 'cell': return `c${g.x},${g.y}`;
    default: return g.kind;
  }
}

/** Phần phiên bán mà sơ đồ trực tiếp cần đọc (DaySession thỏa kiểu này). */
export interface LiveSessionView {
  readonly queue: Customer[];
  readonly ready: Customer[];
  readonly entrants: Customer[];
  readonly fleeing: Customer[];
  lanes: { staffId: string; queue: Customer[] }[];
}

/** Khách đang muốn đứng ở đâu. */
export function customerGoal(session: LiveSessionView, c: Customer): Goal {
  if (c.status === 'fleeing' || c.status === 'done') return { kind: 'door' };
  if (c.status === 'entering' || session.entrants.includes(c)) return { kind: 'door' };
  if (c.status === 'browsing') return c.at != null ? { kind: 'fixture', uid: c.at } : { kind: 'stay' };
  const inPlayer = session.queue.indexOf(c);
  if (inPlayer >= 0) return { kind: 'queue', lane: 0, index: inPlayer };
  for (let i = 0; i < session.lanes.length; i++) {
    const index = session.lanes[i].queue.indexOf(c);
    if (index >= 0) return { kind: 'queue', lane: i + 1, index };
  }
  // Đã lấy xong hàng nhưng quầy nào cũng đầy: đứng cuối hàng quầy người chơi.
  const waiting = session.ready.indexOf(c);
  return { kind: 'queue', lane: 0, index: session.queue.length + Math.max(0, waiting) };
}

/** Nhân viên đang muốn đứng ở đâu, theo việc đang làm. `lane` = vị trí quầy nếu đang đứng quầy. */
export function staffGoal(state: GameState, task: string | null, lane: number | null): Goal {
  if (lane !== null) return { kind: 'behind', lane };
  const rack = state.fixtures.find((f) => DATA.furniture.find((d) => d.id === f.type)?.kind === 'storage');
  // Rảnh việc: đứng chờ ở kệ kho, không có thì cạnh kệ hàng đầu tiên, cho khỏi chắn cửa.
  if (!task) {
    const spot = rack ?? state.fixtures.find((f) => f.shelf !== undefined);
    return spot ? { kind: 'fixture', uid: spot.uid } : { kind: 'stay' };
  }
  if (task.startsWith('deliver:')) return { kind: 'away' };
  if (task.startsWith('cook:')) {
    const recipe = DATA.recipes.find((r) => r.id === task.slice(5));
    const station = recipe ? state.fixtures.find((f) => f.type === recipe.station) : undefined;
    return station ? { kind: 'fixture', uid: station.uid } : { kind: 'stay' };
  }
  if (task === 'receive') {
    return rack ? { kind: 'fixture', uid: rack.uid } : { kind: 'door' };
  }
  const parts = task.split(':');
  const shelf = Number(parts[1]);
  if (parts.length === 3 && Number.isInteger(shelf)) {
    const f = fixtureOfShelf(state, shelf);
    if (f) return { kind: 'fixture', uid: f.uid };
  }
  return { kind: 'stay' };
}

/** Quầy thu ngân của một vị trí quầy (nhiều vị trí có thể dùng chung một quầy). */
export function laneCounter(state: GameState, lane: number): { counter: Fixture; variant: number } | null {
  const counters = counterFixtures(state);
  if (!counters.length) return null;
  return { counter: counters[lane % counters.length], variant: Math.floor(lane / counters.length) };
}

const key = (c: Cell) => `${c.x},${c.y}`;

/**
 * Hàng chờ của một vị trí quầy: ô đứng tính tiền rồi nối dài về phía cửa.
 * Vị trí quầy thứ hai trên cùng quầy dùng ô đứng khác (nếu có) để hai hàng không chồng lên nhau.
 */
export function queueLine(state: GameState, lane: number, grid: boolean[]): Cell[] {
  const lc = laneCounter(state, lane);
  if (!lc) return [DATA.land.door];
  const door = DATA.land.door;
  const access = accessCells(state, lc.counter, grid);
  if (!access.length) return [door];
  // Ưu tiên ô đứng gần cửa nhất (khách từ cửa vào tới quầy).
  const ranked = access
    .map((cell) => ({ cell, path: findPath(state, [cell], [door], grid) }))
    .sort((a, b) => (a.path?.length ?? 1e9) - (b.path?.length ?? 1e9));
  const start = ranked[lc.variant % ranked.length];
  const path = start.path ?? [start.cell];
  // Không đứng trên ô cửa (để khách khác còn vào được) trừ khi đó là ô duy nhất.
  const line = path.filter((c, i) => i === 0 || !(c.x === door.x && c.y === door.y));
  const seen = new Set<string>();
  const out = line.filter((c) => (seen.has(key(c)) ? false : (seen.add(key(c)), true)));
  // Tiệm nhỏ, quầy sát cửa: nối dài hàng bằng các ô trống gần nhất để khách không dồn vào một ô.
  const { cols, rows } = DATA.land;
  for (let i = 0; i < out.length && out.length < QUEUE_CELLS; i++) {
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]] as const) {
      const c = { x: out[i].x + dx, y: out[i].y + dy };
      if (c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows || !grid[c.y * cols + c.x]) continue;
      if (seen.has(key(c)) || (c.x === door.x && c.y === door.y)) continue;
      seen.add(key(c));
      out.push(c);
      if (out.length >= QUEUE_CELLS) break;
    }
  }
  return out;
}

/** Số ô tối đa của một hàng chờ vẽ trên sơ đồ (khách dư đứng ở ô cuối). */
const QUEUE_CELLS = 6;

/** Ô đích của một mục tiêu; null nếu đứng yên / không xác định. */
export function goalCells(state: GameState, goal: Goal, grid: boolean[], lines: (lane: number) => Cell[]): Cell[] | null {
  switch (goal.kind) {
    case 'door':
    case 'away':
      return [DATA.land.door];
    case 'fixture': {
      const f = state.fixtures.find((item) => item.uid === goal.uid);
      if (!f) return null;
      const cells = accessCells(state, f, grid);
      return cells.length ? cells : null;
    }
    case 'cell':
      return grid[goal.y * DATA.land.cols + goal.x] ? [{ x: goal.x, y: goal.y }] : null;
    case 'queue': {
      const line = lines(goal.lane);
      return [line[Math.min(goal.index, line.length - 1)]];
    }
    default:
      return null;
  }
}
