import { describe, expect, it } from 'vitest';
import { DaySession, openShop } from '../src/core/day';
import { carryAvailable } from '../src/core/carry';
import { createNewGame, lotsFrom, warehouseQty } from '../src/core/state';

function setup() {
  const state = createNewGame();
  state.zones[0] = 'dry';
  state.shelves[0][0] = { productId: 'mi_goi', qty: 0 };
  state.warehouse = lotsFrom({ mi_goi: 30, gao: 20, duong: 20 });
  openShop(state);
  return { state, day: new DaySession(state, 123) };
}

describe('hàng cầm tay', () => {
  it('giữ chỗ tối đa hai stack mà không thay đổi kho', () => {
    const { state, day } = setup();
    expect(day.pickUpStock('mi_goi')).toBe(20);
    expect(day.pickUpStock('mi_goi')).toBe(0);
    expect(carryAvailable(state, day.carrying, 'mi_goi')).toBe(10);
    expect(day.pickUpStock('gao')).toBe(20);
    expect(day.pickUpStock('duong')).toBe(0);
    expect(warehouseQty(state, 'mi_goi')).toBe(30);
    day.clearCarrying();
    expect(warehouseQty(state, 'mi_goi')).toBe(30);
  });

  it('nạp theo lượng kho thực, rồi lưu và đọc phần còn cầm', () => {
    const { state, day } = setup();
    day.pickUpStock('mi_goi');
    expect(day.startRefillFromHand(0, 0, 'mi_goi')).toBe(true);
    const snapshot = day.snapshot();
    const restored = DaySession.restore(state, snapshot);
    expect(restored.carrying).toEqual([{ productId: 'mi_goi', qty: 20 }]);
    state.warehouse = lotsFrom({ mi_goi: 7 });
    for (let i = 0; i < 12; i++) restored.update(0.1);
    expect(state.shelves[0][0].qty).toBe(7);
    expect(restored.carrying).toEqual([]);
    expect(warehouseQty(state, 'mi_goi')).toBe(0);
    const old = { ...snapshot, carrying: undefined };
    expect(DaySession.restore(state, old).carrying).toEqual([]);
  });
});
