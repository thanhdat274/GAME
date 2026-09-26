import { DATA, furniture, type LandPlot, type Rect } from './data';
import { emptySlots, type Fixture, type GameState } from './state';

export interface Cell { x: number; y: number }

export type PlaceError = 'bounds' | 'locked' | 'overlap' | 'door' | 'storage-only';
export type PlotStatus = 'open' | 'available' | 'level' | 'money';

const key = (x: number, y: number) => y * DATA.land.cols + x;

function rectCells(r: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
  return out;
}

export function plotCells(plot: LandPlot): Cell[] {
  return plot.rects.flatMap(rectCells);
}

export function plot(id: string): LandPlot {
  const p = DATA.land.plots.find((item) => item.id === id);
  if (!p) throw new Error(`Không có mảnh đất ${id}`);
  return p;
}

/** Mảnh đất chứa ô (x, y): 'initial', id của mảnh, hoặc null nếu ngoài mọi mảnh. */
export function plotAt(x: number, y: number): string | null {
  if (DATA.land.initial.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) return 'initial';
  return DATA.land.plots.find((p) => p.rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h))?.id ?? null;
}

export function isOpenCell(state: GameState, x: number, y: number): boolean {
  const owner = plotAt(x, y);
  return owner === 'initial' || (owner !== null && state.land.includes(owner));
}

function isStorageOnly(x: number, y: number): boolean {
  const owner = plotAt(x, y);
  return owner !== null && owner !== 'initial' && !!plot(owner).storageOnly;
}

export function plotStatus(state: GameState, id: string): PlotStatus {
  const p = plot(id);
  if (state.land.includes(id)) return 'open';
  if (state.level < p.level) return 'level';
  if (state.money < p.cost) return 'money';
  return 'available';
}

/** Mở mảnh đất: trừ tiền, thêm ô. */
export function unlockPlot(state: GameState, id: string): PlotStatus {
  const status = plotStatus(state, id);
  if (status !== 'available') return status;
  state.money -= plot(id).cost;
  state.land.push(id);
  state.lifetime.landsOpened = state.land.length;
  return 'open';
}

/** Số khách chờ tối đa theo đất đã mở. */
export function maxQueueFor(state: GameState): number {
  return DATA.balance.maxQueue + state.land.reduce((sum, id) => sum + plot(id).queueBonus, 0);
}

export function footprint(type: string, rot: 0 | 1): { w: number; h: number } {
  const f = furniture(type);
  return rot ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}

export function fixtureCells(f: Pick<Fixture, 'type' | 'x' | 'y' | 'rot'>): Cell[] {
  const { w, h } = footprint(f.type, f.rot);
  return rectCells({ x: f.x, y: f.y, w, h });
}

/** Ô -> uid nội thất đang chiếm. */
export function occupancy(state: GameState, ignoreUid?: number): Map<number, number> {
  const map = new Map<number, number>();
  for (const f of state.fixtures) {
    if (f.uid === ignoreUid) continue;
    for (const c of fixtureCells(f)) map.set(key(c.x, c.y), f.uid);
  }
  return map;
}

/** Kiểm tra đặt nội thất; trả về null nếu hợp lệ. */
export function placementError(state: GameState, type: string, x: number, y: number, rot: 0 | 1, ignoreUid?: number): PlaceError | null {
  const occ = occupancy(state, ignoreUid);
  const kind = furniture(type).kind;
  const { door, cols, rows } = DATA.land;
  for (const c of fixtureCells({ type, x, y, rot })) {
    if (c.x < 0 || c.y < 0 || c.x >= cols || c.y >= rows) return 'bounds';
    if (!isOpenCell(state, c.x, c.y)) return 'locked';
    if (c.x === door.x && c.y === door.y) return 'door';
    if (isStorageOnly(c.x, c.y) && kind !== 'storage') return 'storage-only';
    if (occ.has(key(c.x, c.y))) return 'overlap';
  }
  return null;
}

/** Ô khách đi được: đã mở, không bị nội thất chiếm, không thuộc sân sau (chỉ để kho). */
export function walkableGrid(state: GameState): boolean[] {
  const { cols, rows } = DATA.land;
  const occ = occupancy(state);
  const grid: boolean[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    grid[key(x, y)] = isOpenCell(state, x, y) && !occ.has(key(x, y)) && !isStorageOnly(x, y);
  }
  return grid;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Khoảng cách BFS từ `from` tới mọi ô đi được (-1: không tới được). */
export function distancesFrom(state: GameState, from: Cell[], grid = walkableGrid(state)): number[] {
  const { cols, rows } = DATA.land;
  const dist = new Array<number>(cols * rows).fill(-1);
  const queue: Cell[] = [];
  for (const c of from) {
    if (!grid[key(c.x, c.y)] || dist[key(c.x, c.y)] >= 0) continue;
    dist[key(c.x, c.y)] = 0;
    queue.push(c);
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = key(nx, ny);
      if (!grid[k] || dist[k] >= 0) continue;
      dist[k] = dist[key(c.x, c.y)] + 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

/** Các ô đi được sát nội thất (chỗ khách đứng lấy hàng / tính tiền). */
export function accessCells(state: GameState, f: Fixture, grid = walkableGrid(state)): Cell[] {
  const { cols, rows } = DATA.land;
  const own = new Set(fixtureCells(f).map((c) => key(c.x, c.y)));
  const out: Cell[] = [];
  const seen = new Set<number>();
  for (const c of fixtureCells(f)) {
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const k = key(nx, ny);
      if (own.has(k) || seen.has(k) || !grid[k]) continue;
      seen.add(k);
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

export function counterFixture(state: GameState): Fixture | undefined {
  return state.fixtures.find((f) => furniture(f.type).kind === 'counter');
}

/** Mọi quầy thu ngân đang đặt (quầy gốc trước). */
export function counterFixtures(state: GameState): Fixture[] {
  return state.fixtures.filter((f) => furniture(f.type).kind === 'counter');
}

/** Nội thất khách cần tới được: quầy và mọi nội thất bày hàng. */
function needsAccess(f: Fixture): boolean {
  const kind = furniture(f.type).kind;
  return kind === 'counter' || kind === 'shelf' || kind === 'fridge' || kind === 'freezer';
}

/** Kiểm tra lối đi cửa → quầy → từng kệ. Trả về uid các nội thất bị chặn. */
export function checkPaths(state: GameState): { ok: boolean; blocked: number[] } {
  const grid = walkableGrid(state);
  const door = DATA.land.door;
  const dist = distancesFrom(state, [door], grid);
  const blocked = state.fixtures
    .filter(needsAccess)
    .filter((f) => !accessCells(state, f, grid).some((c) => dist[key(c.x, c.y)] >= 0))
    .map((f) => f.uid);
  if (!counterFixture(state)) return { ok: false, blocked };
  return { ok: blocked.length === 0, blocked };
}

/** Đường đi ngắn nhất giữa hai tập ô (bao gồm ô đầu và ô cuối); null nếu không có. */
export function findPath(state: GameState, from: Cell[], to: Cell[], grid = walkableGrid(state)): Cell[] | null {
  const { cols, rows } = DATA.land;
  const goal = new Set(to.map((c) => key(c.x, c.y)));
  const parent = new Map<number, number>();
  const queue: Cell[] = [];
  for (const c of from) {
    const k = key(c.x, c.y);
    if (!grid[k] || parent.has(k)) continue;
    parent.set(k, -1);
    queue.push(c);
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const k = key(c.x, c.y);
    if (goal.has(k)) {
      const path: Cell[] = [];
      for (let p = k; p !== -1; p = parent.get(p)!) path.unshift({ x: p % cols, y: Math.floor(p / cols) });
      return path;
    }
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nk = key(nx, ny);
      if (!grid[nk] || parent.has(nk)) continue;
      parent.set(nk, k);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/** Số ô phải đi giữa hai nội thất (hoặc từ cửa khi `from` null). */
export function walkTiles(state: GameState, from: Fixture | null, to: Fixture | null, grid = walkableGrid(state)): number {
  const start = from ? accessCells(state, from, grid) : [DATA.land.door];
  const end = to ? accessCells(state, to, grid) : [DATA.land.door];
  const path = findPath(state, start, end, grid);
  return path ? path.length - 1 : 0;
}

// ---------- Mua / bán / di chuyển nội thất ----------

export type BuyFixtureResult = 'ok' | 'money' | 'level' | 'limit' | 'plot' | PlaceError;

function freeShelfIndex(state: GameState, slots: number): number {
  for (let i = 3; i < state.shelves.length; i++) {
    if (!state.fixtures.some((f) => f.shelf === i)) {
      state.shelves[i] = emptySlots(slots);
      state.zones[i] = null;
      return i;
    }
  }
  state.shelves.push(emptySlots(slots));
  state.zones.push(null);
  return state.shelves.length - 1;
}

export function buyFixture(state: GameState, type: string, x: number, y: number, rot: 0 | 1 = 0): BuyFixtureResult {
  const def = furniture(type);
  if (def.fixed) return 'level';
  if (state.level < def.unlockLevel) return 'level';
  if (def.requiresPlot && !state.land.includes(def.requiresPlot)) return 'plot';
  if (def.limit !== undefined && state.fixtures.filter((f) => f.type === type).length >= def.limit) return 'limit';
  if (state.money < def.cost) return 'money';
  const error = placementError(state, type, x, y, rot);
  if (error) return error;
  state.money -= def.cost;
  const fixture: Fixture = { uid: state.nextUid++, type, x, y, rot };
  if (def.slots > 0) fixture.shelf = freeShelfIndex(state, def.slots);
  state.fixtures.push(fixture);
  return 'ok';
}

export function moveFixture(state: GameState, uid: number, x: number, y: number, rot: 0 | 1): PlaceError | 'missing' | null {
  const f = state.fixtures.find((item) => item.uid === uid);
  if (!f) return 'missing';
  const error = placementError(state, f.type, x, y, rot, uid);
  if (error) return error;
  f.x = x;
  f.y = y;
  f.rot = rot;
  return null;
}

export function sellValue(type: string): number {
  return Math.floor(furniture(type).cost * DATA.balance.sellBackRatio);
}

/** Mua và đặt nội thất vào chỗ trống đầu tiên hợp lệ mà không chặn lối đi (dùng cho mô phỏng). */
export function placeAnywhere(state: GameState, type: string): boolean {
  for (let y = 0; y < DATA.land.rows; y++) for (let x = 0; x < DATA.land.cols; x++) for (const rot of [0, 1] as const) {
    const money = state.money;
    if (buyFixture(state, type, x, y, rot) !== 'ok') continue;
    if (checkPaths(state).ok) return true;
    // Chặn lối đi: hoàn tác.
    const f = state.fixtures.pop()!;
    if (f.shelf !== undefined) state.shelves[f.shelf] = state.shelves[f.shelf].map(() => ({ productId: null, qty: 0 }));
    state.nextUid--;
    state.money = money;
  }
  return false;
}

/** Số khách duyệt hàng cùng lúc: mặc định + thưởng của mảnh đất lớn (Đất D mini-mart). */
export function maxShoppersFor(state: GameState): number {
  return DATA.balance.maxShoppers + state.land.reduce((sum, id) => sum + (plot(id).shopperBonus ?? 0), 0);
}
