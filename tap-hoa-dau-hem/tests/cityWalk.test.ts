import { describe, expect, it } from 'vitest';
import cityMapJson from '../src/data/cityMap.json';
import { parseCityMap, validateCityMap, type CityMap, type TiledMap } from '../src/core/cityMap';
import {
  cellCenter, createWalker, doorCell, findCityPath, isWalkable, nearestWalkable, pickWanderTarget, promenadeCells, stepWalker, unreachableDoors, walkTo, walkableGrid,
} from '../src/core/cityWalk';
import { DATA } from '../src/core/data';

const load = (): CityMap => parseCityMap(structuredClone(cityMapJson) as unknown as TiledMap);
const mainLot = (map: CityMap) => map.lots.find((l) => l.storeId === 'main')!;

describe('cityWalk', () => {
  it('ô trong tòa nhà, nước và cây không đi được; cửa và vỉa hè đi được', () => {
    const map = load();
    const grid = walkableGrid(map);
    const lot = mainLot(map);
    expect(isWalkable(map, grid, { x: lot.x + 1, y: lot.y + 1 })).toBe(false);
    expect(isWalkable(map, grid, doorCell(lot))).toBe(true);
    expect(isWalkable(map, grid, { x: 34, y: 3 })).toBe(false);
    expect(isWalkable(map, grid, { x: -1, y: 0 })).toBe(false);
  });

  it('mọi cửa hàng tới được từ cửa tiệm chính', () => {
    const map = load();
    expect(unreachableDoors(map, mainLot(map).door)).toEqual([]);
  });

  it('đường đi ngắn nhất không đi xuyên ô bị chặn và mỗi bước là một ô kề', () => {
    const map = load();
    const grid = walkableGrid(map);
    const from = doorCell(mainLot(map));
    const to = doorCell(map.lots.find((l) => l.storeId === 'industrial')!);
    const path = findCityPath(map, grid, from, to)!;
    expect(path.length).toBeGreaterThan(0);
    let prev = from;
    for (const c of path) {
      expect(Math.abs(c.x - prev.x) + Math.abs(c.y - prev.y)).toBe(1);
      expect(isWalkable(map, grid, c)).toBe(true);
      prev = c;
    }
    expect(prev).toEqual(to);
  });

  it('đường tới chính ô đang đứng là rỗng, tới ô bị chặn là null', () => {
    const map = load();
    const grid = walkableGrid(map);
    const from = doorCell(mainLot(map));
    expect(findCityPath(map, grid, from, from)).toEqual([]);
    const lot = mainLot(map);
    expect(findCityPath(map, grid, from, { x: lot.x + 1, y: lot.y + 1 })).toBeNull();
  });

  it('ô bị vây kín thì không có đường', () => {
    const map = load();
    const grid = walkableGrid(map);
    const from = doorCell(mainLot(map));
    const target = { x: 20, y: 25 };
    expect(isWalkable(map, grid, target)).toBe(true);
    const walled = [...grid];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) walled[(target.y + dy) * map.cols + target.x + dx] = false;
    expect(findCityPath(map, walled, from, target)).toBeNull();
  });

  it('nearestWalkable tìm ô đi được gần điểm bị chặn', () => {
    const map = load();
    const grid = walkableGrid(map);
    const lot = mainLot(map);
    const cell = nearestWalkable(map, grid, { x: lot.x + 1, y: lot.y + 1 })!;
    expect(isWalkable(map, grid, cell)).toBe(true);
    expect(Math.abs(cell.x - (lot.x + 1)) + Math.abs(cell.y - (lot.y + 1))).toBeLessThanOrEqual(3);
  });

  it('stepWalker đi đúng tốc độ, dừng ở đích và cập nhật hướng nhìn', () => {
    const map = load();
    const grid = walkableGrid(map);
    const start = doorCell(mainLot(map));
    const w = createWalker(map, start);
    const target = { x: start.x + 3, y: start.y };
    expect(walkTo(map, grid, w, target)).toBe(true);
    const speed = 32; // 2 ô/giây với ô 16px
    let t = 0;
    let arrived = false;
    while (!arrived && t < 10) { arrived = stepWalker(map, w, speed, 0.1); t += 0.1; }
    expect(arrived).toBe(true);
    expect(t).toBeGreaterThanOrEqual(1.45);
    expect(t).toBeLessThanOrEqual(1.65);
    expect(w.facing).toBe('right');
    expect({ x: w.x, y: w.y }).toEqual(cellCenter(map, target));
    expect(stepWalker(map, w, speed, 1)).toBe(false);
  });

  it('bước dt lớn vẫn đi hết đường mà không vượt đích', () => {
    const map = load();
    const grid = walkableGrid(map);
    const start = doorCell(mainLot(map));
    const w = createWalker(map, start);
    walkTo(map, grid, w, { x: start.x + 2, y: start.y });
    expect(stepWalker(map, w, 1000, 5)).toBe(true);
    expect(w.x).toBe(cellCenter(map, { x: start.x + 2, y: start.y }).x);
  });

  it('điểm dạo chỉ nằm trên ô promenade và đi được', () => {
    const map = load();
    const grid = walkableGrid(map);
    const cells = promenadeCells(map, grid);
    expect(cells.length).toBeGreaterThan(20);
    for (const c of cells) expect(map.promenade.has(map.ground[c.y * map.cols + c.x])).toBe(true);
    expect(pickWanderTarget(cells, () => 0)).toEqual(cells[0]);
    expect(pickWanderTarget(cells, () => 0.999999)).toEqual(cells[cells.length - 1]);
    expect(pickWanderTarget([], () => 0.5)).toBeNull();
  });

  it('validateCityMap báo cửa không tới được', () => {
    const map = load();
    const lot = map.lots.find((l) => l.storeId === 'market')!;
    // Dựng tường quanh ô cửa bằng ô nước (gid 7) ở lớp objects.
    const water = [...map.blocked][0];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = (lot.door.y + dy) * map.cols + lot.door.x + dx;
      if (!map.blocked.has(map.ground[i]) && !map.lots.some((l) => i === l.door.y * map.cols + l.door.x)) map.objects[i] = water;
    }
    const errors = validateCityMap(map, new Set(['main', ...DATA.branches.map((b) => b.id)]), DATA.branches.map((b) => b.id));
    expect(errors.join('\n')).toContain('không có đường đi tới cửa');
  });
});
