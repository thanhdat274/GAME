/**
 * Bản đồ phố (Tiled JSON, `src/data/cityMap.json`). Phần thuần, không phụ thuộc Phaser để test bằng Vitest;
 * `CityScene` dùng cùng file JSON qua loader Tiled của Phaser.
 */

export interface TiledProperty { name: string; type?: string; value: string | number | boolean }

export interface TiledTileLayer { name: string; type: 'tilelayer'; width: number; height: number; data: number[] }

export interface TiledObject { id: number; name: string; x: number; y: number; width: number; height: number; properties?: TiledProperty[] }

export interface TiledObjectLayer { name: string; type: 'objectgroup'; objects: TiledObject[] }

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  tiles?: { id: number; properties?: TiledProperty[] }[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: (TiledTileLayer | TiledObjectLayer)[];
  tilesets: TiledTileset[];
}

/** Một lô đất trên phố: tiệm đã có, chi nhánh sắp mở, hoặc đất trống (`storeId` rỗng). */
export interface CityLot {
  id: number;
  name: string;
  /** `main`, id chi nhánh, hoặc '' cho đất trống. */
  storeId: string;
  /** Vùng chiếm, tính bằng ô. */
  x: number;
  y: number;
  w: number;
  h: number;
  door: { x: number; y: number };
}

export interface CityMap {
  cols: number;
  rows: number;
  tile: number;
  ground: number[];
  objects: number[];
  lots: CityLot[];
  /** gid của ô không đi qua được. */
  blocked: Set<number>;
  /** gid tối đa hợp lệ (firstgid + tilecount - 1). */
  maxGid: number;
}

function prop(o: TiledObject, name: string): string | number | boolean | undefined {
  return o.properties?.find((p) => p.name === name)?.value;
}

/** Đọc Tiled JSON thành `CityMap`; ném lỗi nếu thiếu lớp bắt buộc. */
export function parseCityMap(json: TiledMap): CityMap {
  const ground = json.layers.find((l): l is TiledTileLayer => l.type === 'tilelayer' && l.name === 'ground');
  const objects = json.layers.find((l): l is TiledTileLayer => l.type === 'tilelayer' && l.name === 'objects');
  const lots = json.layers.find((l): l is TiledObjectLayer => l.type === 'objectgroup' && l.name === 'lots');
  if (!ground || !objects || !lots) throw new Error('cityMap: thiếu lớp ground, objects hoặc lots');
  const tileset = json.tilesets[0];
  const blocked = new Set<number>();
  for (const t of tileset?.tiles ?? []) {
    if (t.properties?.some((p) => p.name === 'blocked' && p.value === true)) blocked.add(tileset.firstgid + t.id);
  }
  return {
    cols: json.width,
    rows: json.height,
    tile: json.tilewidth,
    ground: ground.data,
    objects: objects.data,
    blocked,
    maxGid: tileset ? tileset.firstgid + tileset.tilecount - 1 : 0,
    lots: lots.objects.map((o) => ({
      id: o.id,
      name: o.name,
      storeId: String(prop(o, 'storeId') ?? ''),
      x: Math.round(o.x / json.tilewidth),
      y: Math.round(o.y / json.tileheight),
      w: Math.round(o.width / json.tilewidth),
      h: Math.round(o.height / json.tileheight),
      door: { x: Number(prop(o, 'doorX') ?? -1), y: Number(prop(o, 'doorY') ?? -1) },
    })),
  };
}

/**
 * Kiểm tra bản đồ. `storeIds` là các id cửa hàng hợp lệ (gồm `main`); `branchIds` là các chi nhánh bắt buộc có lô.
 * Trả danh sách lỗi (rỗng = hợp lệ).
 */
export function validateCityMap(map: CityMap, storeIds: ReadonlySet<string>, branchIds: readonly string[]): string[] {
  const errors: string[] = [];
  const size = map.cols * map.rows;
  if (map.ground.length !== size) errors.push(`cityMap.ground: cần ${size} ô, có ${map.ground.length}`);
  if (map.objects.length !== size) errors.push(`cityMap.objects: cần ${size} ô, có ${map.objects.length}`);
  for (const [name, data] of [['ground', map.ground], ['objects', map.objects]] as const) {
    const bad = data.findIndex((g) => !Number.isInteger(g) || g < 0 || g > map.maxGid);
    if (bad >= 0) errors.push(`cityMap.${name}: ô ${bad} có gid ${data[bad]} ngoài tileset (0..${map.maxGid})`);
  }
  if (map.ground.some((g) => g === 0)) errors.push('cityMap.ground: mọi ô nền phải có gid');
  const usedStores = new Set<string>();
  const taken = new Set<number>();
  for (const lot of map.lots) {
    const at = `cityMap.lots.${lot.name}#${lot.id}`;
    if (lot.w <= 0 || lot.h <= 0 || lot.x < 0 || lot.y < 0 || lot.x + lot.w > map.cols || lot.y + lot.h > map.rows) errors.push(`${at}: vùng nằm ngoài bản đồ`);
    if (lot.storeId) {
      if (!storeIds.has(lot.storeId)) errors.push(`${at}: storeId "${lot.storeId}" không phải tiệm chính hay chi nhánh`);
      if (usedStores.has(lot.storeId)) errors.push(`${at}: storeId "${lot.storeId}" bị dùng cho hai lô`);
      usedStores.add(lot.storeId);
    }
    if (lot.door.x < 0 || lot.door.y < 0 || lot.door.x >= map.cols || lot.door.y >= map.rows) errors.push(`${at}: thiếu hoặc sai ô cửa`);
    else if (map.blocked.has(map.ground[lot.door.y * map.cols + lot.door.x]) || map.blocked.has(map.objects[lot.door.y * map.cols + lot.door.x])) errors.push(`${at}: ô cửa bị chặn`);
    for (let y = lot.y; y < lot.y + lot.h; y++) for (let x = lot.x; x < lot.x + lot.w; x++) {
      const cell = y * map.cols + x;
      if (taken.has(cell)) { errors.push(`${at}: chồng lên lô khác tại (${x},${y})`); y = lot.y + lot.h; break; }
      taken.add(cell);
    }
  }
  for (const id of ['main', ...branchIds]) if (!usedStores.has(id)) errors.push(`cityMap: cửa hàng "${id}" chưa có lô đất`);
  return errors;
}

/** Lô đất chứa ô (x, y), nếu có. */
export function lotAt(map: CityMap, x: number, y: number): CityLot | undefined {
  return map.lots.find((l) => x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h);
}

/** Kẹp vị trí góc trên-trái camera (px thế giới) để khung nhìn không ra ngoài bản đồ; bản đồ nhỏ hơn khung thì căn giữa. */
export function clampScroll(scroll: { x: number; y: number }, view: { w: number; h: number }, world: { w: number; h: number }): { x: number; y: number } {
  const fit = (pos: number, viewSize: number, worldSize: number): number => (viewSize >= worldSize ? (worldSize - viewSize) / 2 : Math.min(Math.max(pos, 0), worldSize - viewSize));
  return { x: fit(scroll.x, view.w, world.w), y: fit(scroll.y, view.h, world.h) };
}
