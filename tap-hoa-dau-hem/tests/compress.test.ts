import { describe, expect, it } from 'vitest';
import { compressSave, decompressSave } from '../src/core/compress';

describe('nén bản lưu cloud', () => {
  it('giải nén ra đúng dữ liệu đã nén', async () => {
    const state = { level: 4, day: 18, shelves: [{ productId: 'mi_goi', qty: 7 }] };
    expect(await decompressSave(await compressSave(state))).toEqual(state);
  });

  it('từ chối chuỗi rỗng và dữ liệu hỏng', async () => {
    await expect(decompressSave('')).rejects.toThrow('rỗng');
    await expect(decompressSave('không phải bản nén hợp lệ')).rejects.toThrow();
  });
});
