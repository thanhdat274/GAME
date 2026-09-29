/**
 * Pixel art 16×16 cho tiệm trà sữa, dựng bằng mã từ vài khuôn (ly, túi trà, chai siro, hộp topping, hũ).
 * Chỉ dùng ký tự trong PALETTE của `pixelart.ts`; không import ngược để tránh vòng phụ thuộc.
 */
type Grid = string[][];

const blank = (): Grid => Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
const put = (g: Grid, x: number, y: number, ch: string): void => { if (x >= 0 && x < 16 && y >= 0 && y < 16) g[y][x] = ch; };
const rect = (g: Grid, x: number, y: number, w: number, h: number, ch: string): void => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, ch);
};
const rows = (g: Grid): string[] => g.map((r) => r.join(''));

interface CupLook { liquid: string; foam?: string; bottom?: string; dots?: string }

/** Ly nhựa có nắp và ống hút: nước, lớp foam ở trên, topping ở đáy. */
function cup(look: CupLook): string[] {
  const g = blank();
  rect(g, 9, 0, 1, 3, 'r');
  rect(g, 4, 2, 8, 1, 'k');
  put(g, 9, 2, 'r');
  rect(g, 3, 3, 10, 1, 'w');
  put(g, 3, 3, 'k');
  put(g, 12, 3, 'k');
  rect(g, 3, 4, 10, 1, 'k');
  for (let y = 5; y <= 13; y++) {
    const left = y <= 8 ? 4 : 5;
    const right = y <= 8 ? 11 : 10;
    put(g, left, y, 'k');
    put(g, right, y, 'k');
    for (let x = left + 1; x < right; x++) {
      let ch = look.liquid;
      if (look.foam && y <= 6) ch = look.foam;
      else if (look.bottom && y >= 11) ch = look.bottom;
      put(g, x, y, ch);
    }
    put(g, left + 1, y, y === 7 ? 'w' : g[y][left + 1]); // vệt sáng bên trái
  }
  if (look.dots) for (const [x, y] of [[6, 12], [8, 12], [7, 13], [9, 13], [6, 11]]) put(g, x, y, look.dots);
  rect(g, 6, 14, 4, 1, 'k');
  return rows(g);
}

/** Túi/lon bột trà: thân có nhãn màu. */
function bag(color: string): string[] {
  const g = blank();
  rect(g, 4, 2, 8, 1, 'k');
  rect(g, 4, 3, 8, 2, 'W');
  rect(g, 3, 5, 10, 9, 'k');
  rect(g, 4, 5, 8, 8, color);
  rect(g, 5, 7, 6, 4, 'w');
  rect(g, 6, 8, 4, 2, color);
  rect(g, 4, 14, 8, 1, 'k');
  return rows(g);
}

/** Chai siro: cổ nhỏ, nắp đỏ, nhãn trắng. */
function bottle(color: string): string[] {
  const g = blank();
  rect(g, 6, 0, 4, 2, 'r');
  rect(g, 7, 2, 2, 2, 'k');
  rect(g, 4, 4, 8, 10, 'k');
  rect(g, 5, 4, 6, 9, color);
  rect(g, 5, 7, 6, 3, 'w');
  put(g, 7, 8, color);
  put(g, 8, 8, color);
  rect(g, 5, 14, 6, 1, 'k');
  return rows(g);
}

/** Hộp topping: mặt hộp phủ màu topping (`top`) có chấm (`dot`), thân trắng. */
function tub(top: string, dot: string): string[] {
  const g = blank();
  rect(g, 2, 5, 12, 2, 'k');
  rect(g, 3, 5, 10, 2, top);
  for (const [x, y] of [[4, 5], [6, 6], [8, 5], [10, 6], [11, 5]]) put(g, x, y, dot);
  rect(g, 2, 7, 12, 8, 'k');
  rect(g, 3, 7, 10, 7, 'w');
  rect(g, 4, 9, 8, 3, top);
  put(g, 6, 10, dot);
  put(g, 9, 10, dot);
  rect(g, 3, 14, 10, 1, 'S');
  return rows(g);
}

/** Hũ nước đường / mật. */
function jar(color: string): string[] {
  const g = blank();
  rect(g, 5, 2, 6, 2, 'b');
  rect(g, 4, 4, 8, 10, 'k');
  rect(g, 5, 4, 6, 9, color);
  rect(g, 6, 6, 2, 3, 'w');
  rect(g, 5, 14, 6, 1, 'k');
  return rows(g);
}

/** Chồng ly nhựa xếp úp. */
function cupStack(): string[] {
  const g = blank();
  for (let i = 0; i < 3; i++) {
    const y = 3 + i * 3;
    rect(g, 3, y, 10, 1, 'k');
    rect(g, 4, y + 1, 8, 2, 'w');
    rect(g, 4, y + 2, 8, 1, 'W');
  }
  rect(g, 4, 12, 8, 2, 'k');
  rect(g, 5, 12, 6, 1, 'W');
  return rows(g);
}

/** Sprite thành phẩm (ly) và nguyên liệu (bột, siro, topping, foam, đồ dùng) của tiệm trà sữa. */
export const TEA_PRODUCT_SPRITES: Record<string, string[]> = {
  // Nguyên liệu
  ly_nhua: cupStack(),
  nuoc_duong: jar('y'),
  tra_sua_base: bag('e'),
  hong_tra: bag('R'),
  luc_tra: bag('n'),
  tra_thai: bag('o'),
  olong: bag('b'),
  matcha_bot: bag('N'),
  siro_vai: bottle('q'),
  siro_dao: bottle('o'),
  siro_dau: bottle('r'),
  siro_nho: bottle('v'),
  siro_chanh_day: bottle('y'),
  tran_chau_den: tub('d', 'k'),
  thach_dua: tub('i', 'w'),
  tran_chau_trang: tub('w', 'W'),
  thach_trai_cay: tub('p', 'y'),
  pudding: tub('y', 'Y'),
  suong_sao: tub('S', 'd'),
  foam_cheese: tub('c', 'y'),
  foam_matcha: tub('n', 'N'),
  foam_muoi: tub('w', 'l'),
  foam_ube: tub('v', 'V'),
  // Thành phẩm
  tra_sua_tran_chau_tp: cup({ liquid: 't', bottom: 'e', dots: 'd' }),
  hong_tra_sua_tp: cup({ liquid: 'e' }),
  luc_tra_vai_tp: cup({ liquid: 'n', bottom: 'q' }),
  tra_thai_do_tp: cup({ liquid: 'o' }),
  hong_tra_dao_tp: cup({ liquid: 'o', bottom: 'q' }),
  olong_sua_tp: cup({ liquid: 'b', foam: 'c' }),
  matcha_latte_tp: cup({ liquid: 'n', foam: 'w' }),
  tra_dau_tp: cup({ liquid: 'p', bottom: 'r', dots: 'q' }),
  hong_tra_macchiato_tp: cup({ liquid: 'R', foam: 'c' }),
  matcha_foam_tp: cup({ liquid: 'N', foam: 'w' }),
  tra_nho_tp: cup({ liquid: 'v', bottom: 'V', dots: 'd' }),
  olong_foam_muoi_tp: cup({ liquid: 'b', foam: 'w' }),
  tra_chanh_day_tp: cup({ liquid: 'y', bottom: 'o', dots: 'w' }),
  tra_ube_tp: cup({ liquid: 'v', foam: 'q', bottom: 'y' }),
};
