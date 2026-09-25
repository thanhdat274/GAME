import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { PRODUCT_SPRITES, validateSprite } from '../src/ui/pixelart';

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
});
