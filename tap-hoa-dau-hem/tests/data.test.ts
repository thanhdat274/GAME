import { describe, expect, it } from 'vitest';
import { DATA, product, validateLevels, validateProducts } from '../src/core/data';
import { expiryFor, suggestedTarget } from '../src/core/stock';
import { createNewGame } from '../src/core/state';

describe('dữ liệu mặt hàng', () => {
  it('products.json hợp lệ và có đủ hàng các giai đoạn 1–4', () => {
    expect(validateProducts(DATA.products)).toEqual([]);
    expect(DATA.products).toHaveLength(110);
  });

  it('levels.json hợp lệ', () => {
    expect(validateLevels(DATA.levels)).toEqual([]);
  });

  it('báo lỗi thiếu trường, chỉ rõ id', () => {
    const errors = validateProducts([{ id: 'x', name: 'X', category: 'dry', icon: '?', color: '#fff', cost: 1000, size: 1, unlockLevel: 1 }]);
    expect(errors.some((e) => e.startsWith('x:') && e.includes('price'))).toBe(true);
  });

  it('báo lỗi giá bán nhỏ hơn giá nhập', () => {
    const errors = validateProducts([{ id: 'lo', name: 'Lỗ', category: 'dry', icon: '?', color: '#fff', cost: 5000, price: 4000, size: 1, unlockLevel: 1 }]);
    expect(errors).toEqual(['lo: giá bán (4000) nhỏ hơn giá nhập (5000)']);
  });

  it('level 1 chỉ mở 6 món đồ khô', () => {
    const l1 = DATA.products.filter((p) => p.unlockLevel <= 1);
    expect(l1).toHaveLength(6);
    expect(l1.every((p) => p.category === 'dry')).toBe(true);
  });

  it('hàng khô đóng gói cũng có HSD, nhưng dài hơn hàng tươi', () => {
    for (const id of ['mi_goi', 'nuoc_mam', 'muoi', 'bot_canh', 'bot_ngot', 'hat_nem', 'dau_an']) {
      expect(product(id).shelfLifeDays, id).toBeGreaterThanOrEqual(30);
    }
    expect(expiryFor('mi_goi', 10)).toBe(40);
    expect(product('banh_mi').shelfLifeDays).toBe(1);
  });

  it('gợi ý nhập: hàng HSD dài có dự phòng như hàng khô, hàng mau hỏng nhập sát nhu cầu', () => {
    const s = createNewGame();
    s.yesterdaySold = { mi_goi: 10, trung_ga: 10 };
    expect(suggestedTarget(s, product('mi_goi'))).toBe(Math.ceil(10 * DATA.balance.suggest.buffer) + 1);
    expect(suggestedTarget(s, product('trung_ga'))).toBe(Math.ceil(10 * DATA.balance.suggest.freshFactor));
  });
});
