// Vẽ icon PWA (mặt tiền tiệm tạp hóa) thành PNG, không cần thư viện ngoài.
// Chạy: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#2b1d14');
const WALL = hex('#e9c98f');
const RED = hex('#d84a3a');
const WHITE = hex('#ffffff');
const DARK = hex('#5a3a22');
const WOOD = hex('#a86f3a');
const YELLOW = hex('#f2b632');
const GOODS = ['#f4c542', '#e53935', '#81d4fa', '#66bb6a', '#ffb74d', '#f06292'].map(hex);

// Hình nằm trong vùng an toàn 80% để dùng được làm icon "maskable".
function pixel(u, v) {
  const x = (u - 0.1) / 0.8;
  const y = (v - 0.1) / 0.8;
  if (x < 0 || x > 1 || y < 0 || y > 1) return BG;
  // Biển hiệu
  if (y < 0.2) return x > 0.06 && x < 0.94 && y > 0.04 ? (y < 0.07 || y > 0.17 || x < 0.09 || x > 0.91 ? YELLOW : RED) : BG;
  // Mái hiên sọc có răng cưa
  if (y < 0.36) {
    const stripe = Math.floor(x * 8) % 2 === 0 ? RED : WHITE;
    const inStripe = (x * 8) % 1;
    const tooth = 0.3 + 0.06 * (1 - Math.abs(inStripe - 0.5) * 2);
    return y < tooth || y < 0.3 ? stripe : WALL;
  }
  // Tường + cửa hàng với kệ
  if (x < 0.05 || x > 0.95) return WALL;
  if (y > 0.4 && y < 0.98) {
    const rowY = (y - 0.4) / 0.58;
    const row = Math.floor(rowY * 3);
    const inRow = (rowY * 3) % 1;
    if (inRow > 0.85) return WOOD;
    if (inRow > 0.25 && inRow < 0.8) {
      const col = Math.floor(((x - 0.05) / 0.9) * 6);
      const inCol = (((x - 0.05) / 0.9) * 6) % 1;
      if (inCol > 0.15 && inCol < 0.85) return GOODS[(col + row * 2) % GOODS.length];
    }
    return DARK;
  }
  return WALL;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size, pixel));
console.log('Đã tạo public/icons/icon-192.png và icon-512.png');
