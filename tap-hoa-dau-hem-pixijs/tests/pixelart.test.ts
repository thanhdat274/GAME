import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { FURNITURE_SPRITES, PRODUCT_SPRITES, validateSprite } from '../src/ui/pixelart';
import { furniture } from '../src/core/data';

describe('pixel art mặt hàng', () => {
  it('mọi mặt hàng đều có sprite', () => {
    for (const p of DATA.products) expect(PRODUCT_SPRITES[p.id], p.id).toBeDefined();
  });

  it.each(Object.entries(PRODUCT_SPRITES))('%s đúng 16x16 và chỉ dùng màu trong bảng', (_id, rows) => {
    expect(validateSprite(rows)).toEqual([]);
  });

  it('báo lỗi dòng sai độ dài', () => {
    expect(validateSprite(['..', '..'], 2)).toEqual([]);
    expect(validateSprite(['...', '..'], 2)).toEqual(['dòng 0 dài 3, cần 2']);
    expect(validateSprite(['.?', '..'], 2)).toEqual(['dòng 0 có ký tự lạ "?"']);
  });

  it('mọi nội thất và đồ đặt sàn có sprite đúng footprint (16 điểm ảnh mỗi ô)', () => {
    const ids = [...DATA.furniture.map((f) => f.id), ...DATA.decor.filter((d) => d.slot === 'floor').map((d) => d.id)];
    for (const id of ids) {
      const rows = FURNITURE_SPRITES[id];
      expect(rows, id).toBeDefined();
      const f = furniture(id);
      expect(validateSprite(rows, f.w * 16, f.h * 16), id).toEqual([]);
    }
    expect(validateSprite(FURNITURE_SPRITES.shelf_steel)).toEqual([]);
  });
});
