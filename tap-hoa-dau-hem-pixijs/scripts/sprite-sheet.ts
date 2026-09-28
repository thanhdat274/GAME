/** Xuất bảng xem thử sprite mặt hàng ra PNG: `vite-node scripts/sprite-sheet.ts out.png [id...]`. */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PALETTE, PRODUCT_SPRITES } from '../src/ui/pixelart';

const [out = 'sprites.png', ...only] = process.argv.slice(2);
const ids = only.length ? only : Object.keys(PRODUCT_SPRITES);
const SCALE = 6, CELL = 16 * SCALE + 12, COLS = 8;
const rows = Math.ceil(ids.length / COLS);
const w = COLS * CELL, h = rows * CELL;
const px = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) px.writeUInt32BE(0xf3ead8ff, i * 4);
ids.forEach((id, n) => {
  const ox = (n % COLS) * CELL + 6, oy = Math.floor(n / COLS) * CELL + 6;
  PRODUCT_SPRITES[id].forEach((row, y) => [...row].forEach((ch, x) => {
    const c = ch === '.' ? ((x + y) % 2 ? 0xe6dcc6 : 0xece3cf) : PALETTE[ch];
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) {
      const o = ((oy + y * SCALE + dy) * w + ox + x * SCALE + dx) * 4;
      px[o] = c >> 16; px[o + 1] = (c >> 8) & 255; px[o + 2] = c & 255; px[o + 3] = 255;
    }
  }));
});
const raw = Buffer.alloc((w * 4 + 1) * h);
for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${out}: ${ids.length} sprite`);
