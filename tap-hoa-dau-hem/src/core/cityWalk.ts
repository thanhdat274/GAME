/**
 * Đi bộ trên bản đồ phố: lưới đi được, tìm đường BFS bốn hướng, di chuyển theo đường và chọn điểm dạo.
 * Thuần logic (không Phaser) để test bằng Vitest; `CityScene` chỉ vẽ kết quả.
 */
import type { CityLot, CityMap } from './cityMap';

export interface Cell { x: number; y: number }

export type Facing = 'up' | 'down' | 'left' | 'right';

/** Người đi bộ: vị trí tính bằng px thế giới (tâm ô), đường còn lại là danh sách ô kế tiếp. */
export interface Walker {
  x: number;
  y: number;
  path: Cell[];
  facing: Facing;
}

const DIRS: readonly Cell[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

/** Ô có đi qua được không: nền/vật thể không bị chặn và không nằm trong tòa nhà hay lô đất có hàng rào. */
export function walkableGrid(map: CityMap): boolean[] {
  const grid = new Array<boolean>(map.cols * map.rows).fill(true);
  for (let i = 0; i < grid.length; i++) {
    if (map.blocked.has(map.ground[i]) || map.blocked.has(map.objects[i])) grid[i] = false;
  }
  for (const lot of map.lots) {
    for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) grid[y * map.cols + x] = false;
  }
  return grid;
}

export function isWalkable(map: CityMap, grid: readonly boolean[], c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < map.cols && c.y < map.rows && grid[c.y * map.cols + c.x];
}

/** Đường ngắn nhất (BFS, bốn hướng) từ `from` đến `to`, không gồm ô xuất phát; null nếu không tới được. */
export function findCityPath(map: CityMap, grid: readonly boolean[], from: Cell, to: Cell): Cell[] | null {
  if (!isWalkable(map, grid, to)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const size = map.cols * map.rows;
  const prev = new Int32Array(size).fill(-2);
  const start = from.y * map.cols + from.x;
  const goal = to.y * map.cols + to.x;
  prev[start] = -1;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const cx = cur % map.cols;
    const cy = (cur - cx) / map.cols;
    for (const d of DIRS) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (nx < 0 || ny < 0 || nx >= map.cols || ny >= map.rows) continue;
      const n = ny * map.cols + nx;
      if (prev[n] !== -2 || !grid[n]) continue;
      prev[n] = cur;
      queue.push(n);
    }
  }
  if (prev[goal] === -2) return null;
  const path: Cell[] = [];
  for (let at = goal; at !== start; at = prev[at]) path.push({ x: at % map.cols, y: Math.floor(at / map.cols) });
  return path.reverse();
}

/** Ô đi được gần `target` nhất (theo khoảng cách Manhattan), dùng khi chạm vào chỗ bị chặn. */
export function nearestWalkable(map: CityMap, grid: readonly boolean[], target: Cell): Cell | null {
  let best: Cell | null = null;
  let bestDist = Infinity;
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    if (!grid[y * map.cols + x]) continue;
    const d = Math.abs(x - target.x) + Math.abs(y - target.y);
    if (d < bestDist) { bestDist = d; best = { x, y }; }
  }
  return best;
}

export function cellCenter(map: CityMap, c: Cell): { x: number; y: number } {
  return { x: c.x * map.tile + map.tile / 2, y: c.y * map.tile + map.tile / 2 };
}

export function cellOf(map: CityMap, px: number, py: number): Cell {
  return { x: Math.floor(px / map.tile), y: Math.floor(py / map.tile) };
}

export function createWalker(map: CityMap, at: Cell): Walker {
  const c = cellCenter(map, at);
  return { x: c.x, y: c.y, path: [], facing: 'down' };
}

/** Đặt đường đi mới cho người đi bộ (tính từ ô hiện tại). Trả false nếu không có đường. */
export function walkTo(map: CityMap, grid: readonly boolean[], w: Walker, target: Cell): boolean {
  const path = findCityPath(map, grid, cellOf(map, w.x, w.y), target);
  if (!path) return false;
  w.path = path;
  return true;
}

/**
 * Tiến `dt` giây với tốc độ `speed` (px/giây), đi qua các ô của `path`; cập nhật hướng nhìn.
 * Trả true nếu vừa đến đích trong bước này.
 */
export function stepWalker(map: CityMap, w: Walker, speed: number, dt: number): boolean {
  let budget = speed * dt;
  let arrived = false;
  while (budget > 0 && w.path.length) {
    const target = cellCenter(map, w.path[0]);
    const dx = target.x - w.x;
    const dy = target.y - w.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.001) w.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (dist <= budget) {
      w.x = target.x;
      w.y = target.y;
      budget -= dist;
      w.path.shift();
      if (!w.path.length) arrived = true;
    } else {
      w.x += (dx / dist) * budget;
      w.y += (dy / dist) * budget;
      budget = 0;
    }
  }
  return arrived;
}

/** Các ô vỉa hè/lối đi (theo thuộc tính `promenade` của tileset) mà người đi bộ có thể tới. */
export function promenadeCells(map: CityMap, grid: readonly boolean[]): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) {
    const i = y * map.cols + x;
    if (grid[i] && map.promenade.has(map.ground[i])) cells.push({ x, y });
  }
  return cells;
}

/** Điểm dạo ngẫu nhiên; `next` là hàm trả số trong [0, 1). */
export function pickWanderTarget(cells: readonly Cell[], next: () => number): Cell | null {
  return cells.length ? cells[Math.floor(next() * cells.length) % cells.length] : null;
}

/** Ô đứng trước cửa của lô (đích khi đi vào tiệm). */
export function doorCell(lot: CityLot): Cell {
  return { x: lot.door.x, y: lot.door.y };
}

/** Các lô có ô cửa không đi tới được từ `from`; dùng để kiểm tra dữ liệu bản đồ. */
export function unreachableDoors(map: CityMap, from: Cell): CityLot[] {
  const grid = walkableGrid(map);
  return map.lots.filter((lot) => !findCityPath(map, grid, from, doorCell(lot)));
}
