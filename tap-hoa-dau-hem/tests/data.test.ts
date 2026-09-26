import { describe, expect, it } from 'vitest';
import { DATA, validateLevels, validateProducts } from '../src/core/data';

describe('dữ liệu mặt hàng', () => {
  it('products.json hợp lệ và có 33 món (17 + 16 giai đoạn 2)', () => {
    expect(validateProducts(DATA.products)).toEqual([]);
    expect(DATA.products).toHaveLength(33);
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
});
