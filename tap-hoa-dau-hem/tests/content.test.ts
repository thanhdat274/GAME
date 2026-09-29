import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/core/content';
import { DATA, type GameData } from '../src/core/data';

function clone(): GameData {
  return structuredClone(DATA);
}

describe('validateContent', () => {
  it('dữ liệu trong repo hợp lệ', () => {
    expect(validateContent(DATA)).toEqual([]);
  });

  it('bắt quest trỏ tới mặt hàng không tồn tại', () => {
    const data = clone();
    data.quests.push({ id: 'bad_q', text: 'x', metric: 'soldProduct', arg: 'khong_co', target: 1, minLevel: 1, money: 0, exp: 0 });
    expect(validateContent(data).join('\n')).toContain('quests.bad_q');
  });

  it('bắt đơn tiệc có khóa không phải hàng hay nhóm', () => {
    const data = clone();
    data.partyOrders[0].items['khong_co'] = 3;
    expect(validateContent(data).join('\n')).toContain('khong_co');
  });

  it('bắt trùng id nội thất', () => {
    const data = clone();
    data.furniture.push({ ...data.furniture[0] });
    expect(validateContent(data).join('\n')).toContain(`furniture.${data.furniture[0].id}: trùng id`);
  });

  it('bắt nội thất đòi mảnh đất không có', () => {
    const data = clone();
    data.furniture[0].requiresPlot = 'ZZ';
    expect(validateContent(data).join('\n')).toContain('requiresPlot "ZZ"');
  });

  it('bắt chiết khấu nhà cung cấp ngoài 0..1', () => {
    const data = clone();
    data.suppliers[0].discount = 1.5;
    expect(validateContent(data).join('\n')).toContain('discount');
  });

  it('bắt loại tiệm trỏ tới mặt hàng không tồn tại', () => {
    const data = clone();
    data.shopTypes[0].ingredients.push('khong_co');
    expect(validateContent(data).join('\n')).toContain('khong_co');
  });

  it('bắt tính năng chi nhánh không có trong bảng level', () => {
    const data = clone();
    data.branches[0].feature = 'feature_ma';
    expect(validateContent(data).join('\n')).toContain('feature_ma');
  });

  it('bắt vùng đất nằm ngoài lưới', () => {
    const data = clone();
    data.land.plots[0].rects[0] = { x: 99, y: 0, w: 1, h: 1 };
    expect(validateContent(data).join('\n')).toContain('ngoài lưới');
  });
});
