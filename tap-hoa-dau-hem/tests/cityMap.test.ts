import { describe, expect, it } from 'vitest';
import cityMapJson from '../src/data/cityMap.json';
import { clampScroll, lotAt, parseCityMap, validateCityMap, type CityMap, type TiledMap } from '../src/core/cityMap';
import { DATA } from '../src/core/data';

const storeIds = new Set(['main', ...DATA.branches.map((b) => b.id)]);
const branchIds = DATA.branches.map((b) => b.id);
const load = (): CityMap => parseCityMap(structuredClone(cityMapJson) as unknown as TiledMap);

describe('cityMap', () => {
  it('bản đồ trong repo hợp lệ', () => {
    expect(validateCityMap(load(), storeIds, branchIds)).toEqual([]);
  });

  it('mỗi cửa hàng có đúng một lô và ô cửa đi được', () => {
    const map = load();
    for (const id of storeIds) expect(map.lots.filter((l) => l.storeId === id)).toHaveLength(1);
  });

  it('bắt lô trỏ tới cửa hàng không tồn tại', () => {
    const map = load();
    map.lots[0].storeId = 'khong_co';
    expect(validateCityMap(map, storeIds, branchIds).join('\n')).toContain('khong_co');
  });

  it('bắt chi nhánh thiếu lô đất', () => {
    const map = load();
    map.lots = map.lots.filter((l) => l.storeId !== 'market');
    expect(validateCityMap(map, storeIds, branchIds).join('\n')).toContain('"market" chưa có lô đất');
  });

  it('bắt lô chồng nhau và lô ngoài bản đồ', () => {
    const map = load();
    map.lots[1] = { ...map.lots[1], x: map.lots[0].x, y: map.lots[0].y };
    expect(validateCityMap(map, storeIds, branchIds).join('\n')).toContain('chồng lên');
    const out = load();
    out.lots[0].x = out.cols;
    expect(validateCityMap(out, storeIds, branchIds).join('\n')).toContain('ngoài bản đồ');
  });

  it('bắt gid ngoài tileset và số ô sai', () => {
    const map = load();
    map.ground[0] = 999;
    expect(validateCityMap(map, storeIds, branchIds).join('\n')).toContain('ngoài tileset');
    const short = load();
    short.objects.pop();
    expect(validateCityMap(short, storeIds, branchIds).join('\n')).toContain('cityMap.objects');
  });

  it('bắt ô cửa bị chặn', () => {
    const map = load();
    const lot = map.lots[0];
    map.objects[lot.door.y * map.cols + lot.door.x] = [...map.blocked][0];
    expect(validateCityMap(map, storeIds, branchIds).join('\n')).toContain('ô cửa bị chặn');
  });

  it('lotAt tìm đúng lô theo ô', () => {
    const map = load();
    const lot = map.lots[0];
    expect(lotAt(map, lot.x, lot.y)).toBe(lot);
    expect(lotAt(map, lot.x + lot.w - 1, lot.y + lot.h - 1)).toBe(lot);
    expect(lotAt(map, lot.x + lot.w, lot.y)).not.toBe(lot);
  });

  it('clampScroll giữ khung nhìn trong bản đồ và căn giữa khi bản đồ nhỏ hơn khung', () => {
    const world = { w: 640, h: 480 };
    expect(clampScroll({ x: -50, y: 900 }, { w: 200, h: 200 }, world)).toEqual({ x: 0, y: 280 });
    expect(clampScroll({ x: 999, y: 0 }, { w: 200, h: 200 }, world)).toEqual({ x: 440, y: 0 });
    expect(clampScroll({ x: 5, y: 5 }, { w: 800, h: 600 }, world)).toEqual({ x: -80, y: -60 });
  });
});
