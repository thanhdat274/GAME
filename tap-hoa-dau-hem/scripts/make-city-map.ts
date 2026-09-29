/**
 * Sinh `src/data/cityMap.json` (định dạng Tiled JSON, mở/sửa được bằng Tiled).
 * Chạy: npm run city-map
 * Bản đồ 40×30 ô 16px: đường ngang ở giữa, cửa hàng hai bên, ao và cây làm cảnh.
 * Ô tileset (gid): 1 cỏ, 2 cỏ 2, 3 hoa, 4 vỉa hè, 5 mặt đường, 6 vạch đường, 7 nước, 8 cây, 9 bụi, 10 đèn, 11 lối đất.
 */
import { writeFileSync } from 'node:fs';

const COLS = 40;
const ROWS = 30;
const T = 16;

const GRASS = 1, GRASS2 = 2, FLOWERS = 3, PAVEMENT = 4, ROAD = 5, ROAD_LINE = 6, WATER = 7, TREE = 8, BUSH = 9, LAMP = 10, DIRT = 11;
const BLOCKED = [WATER, TREE, BUSH, LAMP];
/** Ô người đi bộ hay dạo: dân trong phố chọn điểm đến trên các ô này. */
const PROMENADE = [PAVEMENT, DIRT];
/** Ô phát sáng ban đêm. */
const LIGHTS = [LAMP];

interface Lot { name: string; storeId: string; x: number; y: number; w: number; h: number; door: [number, number] }

const LOTS: Lot[] = [
  { name: 'Tiệm chính', storeId: 'main', x: 3, y: 8, w: 6, h: 5, door: [6, 13] },
  { name: 'Tiệm xôi', storeId: 'xoi', x: 11, y: 8, w: 5, h: 5, door: [13, 13] },
  { name: 'Chi nhánh Chợ', storeId: 'market', x: 18, y: 8, w: 7, h: 5, door: [21, 13] },
  { name: 'Chi nhánh Cổng trường', storeId: 'school', x: 27, y: 8, w: 7, h: 5, door: [30, 13] },
  { name: 'Chi nhánh Khu công nghiệp', storeId: 'industrial', x: 3, y: 17, w: 8, h: 6, door: [7, 16] },
  { name: 'Tiệm rau củ', storeId: 'veg', x: 14, y: 17, w: 6, h: 5, door: [17, 16] },
  { name: 'Quầy giải khát', storeId: 'drink', x: 23, y: 17, w: 6, h: 5, door: [26, 16] },
  { name: 'Cửa hàng gia dụng', storeId: 'home', x: 32, y: 17, w: 5, h: 5, door: [34, 16] },
  // Đất trống chờ khu mới, cửa nhìn ra bãi cỏ giữa hai hàng nhà (nối với lối đất).
  { name: 'Tiệm trà sữa', storeId: 'tea', x: 14, y: 24, w: 6, h: 5, door: [17, 23] },
  { name: 'Tiệm bánh kẹo', storeId: 'bakery', x: 23, y: 24, w: 6, h: 5, door: [26, 23] },
  { name: 'Siêu thị mini', storeId: 'mart', x: 3, y: 24, w: 8, h: 5, door: [7, 23] },
  { name: 'Đất trống', storeId: '', x: 32, y: 24, w: 5, h: 5, door: [34, 23] },
];

let seed = 20260929;
const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const ground = new Array<number>(COLS * ROWS).fill(GRASS);
const objects = new Array<number>(COLS * ROWS).fill(0);
const at = (x: number, y: number): number => y * COLS + x;

for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
  const r = rand();
  ground[at(x, y)] = r < 0.18 ? GRASS2 : r < 0.24 ? FLOWERS : GRASS;
}
// Đường ngang (hàng 14–15) với vạch giữa, vỉa hè hàng 13 và 16.
for (let x = 0; x < COLS; x++) {
  ground[at(x, 13)] = PAVEMENT;
  ground[at(x, 14)] = ROAD;
  ground[at(x, 15)] = x % 4 < 2 ? ROAD_LINE : ROAD;
  ground[at(x, 16)] = PAVEMENT;
}
// Lối đất dọc nối tới đất trống phía dưới và tới ao.
for (let y = 17; y < 27; y++) ground[at(12, y)] = DIRT;
// Ao ở góc trên phải.
for (let y = 2; y < 6; y++) for (let x = 33; x < 38; x++) ground[at(x, y)] = WATER;

const inLot = (x: number, y: number): boolean => LOTS.some((l) => x >= l.x - 1 && x < l.x + l.w + 1 && y >= l.y - 1 && y < l.y + l.h + 1);
const free = (x: number, y: number): boolean => ground[at(x, y)] !== WATER && ground[at(x, y)] !== ROAD && ground[at(x, y)] !== ROAD_LINE && ground[at(x, y)] !== PAVEMENT && ground[at(x, y)] !== DIRT && !inLot(x, y);

for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
  if (!free(x, y)) continue;
  const border = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
  const r = rand();
  if (border && r < 0.6) objects[at(x, y)] = TREE;
  else if (r < 0.05) objects[at(x, y)] = TREE;
  else if (r < 0.09) objects[at(x, y)] = BUSH;
}
// Đèn đường dọc vỉa hè.
for (let x = 2; x < COLS; x += 8) objects[at(x, 13)] = LAMP;
for (let x = 6; x < COLS; x += 8) objects[at(x, 16)] = LAMP;

const int = (name: string, value: number) => ({ name, type: 'int', value });
const map = {
  compressionlevel: -1,
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: COLS,
  height: ROWS,
  tilewidth: T,
  tileheight: T,
  nextlayerid: 4,
  nextobjectid: LOTS.length + 1,
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', x: 0, y: 0, width: COLS, height: ROWS, opacity: 1, visible: true, data: ground },
    { id: 2, name: 'objects', type: 'tilelayer', x: 0, y: 0, width: COLS, height: ROWS, opacity: 1, visible: true, data: objects },
    {
      id: 3, name: 'lots', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown',
      objects: LOTS.map((l, i) => ({
        id: i + 1, name: l.name, type: '', x: l.x * T, y: l.y * T, width: l.w * T, height: l.h * T, rotation: 0, visible: true,
        properties: [{ name: 'storeId', type: 'string', value: l.storeId }, int('doorX', l.door[0]), int('doorY', l.door[1])],
      })),
    },
  ],
  tilesets: [{
    firstgid: 1, name: 'city', tilewidth: T, tileheight: T, tilecount: 11, columns: 11, margin: 0, spacing: 0,
    image: 'city-tiles.png', imagewidth: 11 * T, imageheight: T,
    tiles: [
      ...LIGHTS.map((gid) => ({ id: gid - 1, properties: [{ name: 'light', type: 'bool', value: true }] })),
      ...PROMENADE.map((gid) => ({ id: gid - 1, properties: [{ name: 'promenade', type: 'bool', value: true }] })),
      ...BLOCKED.map((gid) => ({ id: gid - 1, properties: [{ name: 'blocked', type: 'bool', value: true }] })),
    ],
  }],
};

// Mỗi mảng `data` gọn trên một dòng để diff ngắn.
const json = JSON.stringify(map, (key, value) => (key === 'data' ? `@@${(value as number[]).join(',')}@@` : value), 1)
  .replace(/"@@([\d,]+)@@"/g, (_m, list: string) => `[${list}]`);
writeFileSync(new URL('../src/data/cityMap.json', import.meta.url), json + '\n');
console.log(`cityMap.json: ${COLS}×${ROWS} ô, ${LOTS.length} lô đất.`);
