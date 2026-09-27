import Phaser from 'phaser';
import { DATA, furniture } from '../core/data';
import { footprint, plot, plotAt } from '../core/layout';
import type { Fixture } from '../core/state';
import { furnitureImage } from './art';
import { C, HEX, emoji, txt } from './theme';

/** Vị trí và cỡ ô của một mặt bằng vẽ từ trên xuống. */
export interface FloorGeom { gx: number; gy: number; cell: number }

const KIND_COLOR: Record<string, number> = {
  shelf: 0xa86f3a, fridge: 0xbfe3f7, freezer: 0x8ec5ea, storage: 0x9e9e9e, counter: 0x6b4220,
  decor: 0x7fbf7f, food: 0xc85a32, drink: 0x4e9db5, seating: 0x95603a, generator: 0x6b7680,
};
export const STOCK_COLOR = { ok: C.green, low: C.yellow, empty: C.red } as const;

/** Nền gạch, đất khóa, sân sau và cửa ra vào. */
export function drawFloor(scene: Phaser.Scene, geom: FloorGeom, land: string[]): Phaser.GameObjects.Container {
  const { gx, gy, cell } = geom;
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const { cols, rows, door } = DATA.land;
  const open = new Set(land);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const owner = plotAt(x, y);
    const px = gx + x * cell;
    const py = gy + y * cell;
    if (!owner) { g.fillStyle(0x3a2a20, 1).fillRect(px, py, cell, cell); continue; }
    const isOpen = owner === 'initial' || open.has(owner);
    const storage = owner !== 'initial' && plot(owner).storageOnly;
    if (isOpen) g.fillStyle(storage ? 0x9aa48a : (x + y) % 2 ? C.floorA : C.floorB, 1).fillRect(px, py, cell, cell);
    else g.fillStyle(0x5c4632, 1).fillRect(px, py, cell, cell);
    g.lineStyle(1, 0x000000, 0.12).strokeRect(px, py, cell, cell);
  }
  g.fillStyle(C.red, 1).fillRect(gx + door.x * cell + 4, gy + (door.y + 1) * cell - 5, cell - 8, 5);
  c.add(g);
  c.add(emoji(scene, gx + door.x * cell + cell / 2, gy + door.y * cell + cell / 2, '🚪', Math.round(cell * 0.45)));
  return c;
}

/** Một nội thất trên mặt bằng, kèm nhãn kệ và chấm mức hàng. */
export function drawFixture(
  scene: Phaser.Scene, geom: FloorGeom, f: Fixture,
  o: { selected?: boolean; stock?: keyof typeof STOCK_COLOR | null } = {},
): Phaser.GameObjects.Container {
  const { gx, gy, cell } = geom;
  const def = furniture(f.type);
  const { w, h } = footprint(f.type, f.rot);
  const c = scene.add.container(gx + f.x * cell, gy + f.y * cell);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.2).fillRoundedRect(3, 5, w * cell - 6, h * cell - 6, 6);
  g.fillStyle(KIND_COLOR[def.kind] ?? C.grey, 1).fillRoundedRect(3, 3, w * cell - 6, h * cell - 6, 6);
  g.lineStyle(o.selected ? 3 : 1.5, o.selected ? C.yellow : 0x000000, o.selected ? 1 : 0.35).strokeRoundedRect(3, 3, w * cell - 6, h * cell - 6, 6);
  c.add(g);
  const img = furnitureImage(scene, f.type, (w * cell) / 2, (h * cell) / 2, w * cell - 8, h * cell - 8, f.rot);
  c.add(img ?? emoji(scene, (w * cell) / 2, (h * cell) / 2, def.icon, 16));
  if (f.shelf !== undefined) {
    const tag = txt(scene, (w * cell) / 2, h * cell - 8, `${def.kind === 'shelf' ? 'Kệ' : def.name} ${f.shelf + 1}`, { size: 8, bold: true, color: HEX.white, origin: [0.5, 0.5] });
    c.add(tag.setBackgroundColor('#000000aa').setPadding(3, 0, 3, 0));
  }
  if (o.stock) c.add(scene.add.circle(w * cell - 8, 8, 5, STOCK_COLOR[o.stock]).setStrokeStyle(1.5, 0xffffff));
  return c;
}

/** Ô lưới tại tọa độ màn hình (null nếu ngoài mặt bằng). */
export function cellAt(geom: FloorGeom, worldX: number, worldY: number): { x: number; y: number } | null {
  const x = Math.floor((worldX - geom.gx) / geom.cell);
  const y = Math.floor((worldY - geom.gy) / geom.cell);
  if (x < 0 || y < 0 || x >= DATA.land.cols || y >= DATA.land.rows) return null;
  return { x, y };
}
