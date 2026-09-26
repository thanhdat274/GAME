import { describe, expect, it } from 'vitest';
import { product } from '../src/core/data';
import { advanceLiveShop, applyLiveShopCommand, createLiveShopAggregate, validateLiveCommandEnvelope } from '../src/core/liveSession';
import { createNewGame, warehouseQty } from '../src/core/state';

describe('phiên tiệm dùng chung', () => {
  it('áp dụng hành động lần lượt lên trạng thái mới nhất', () => {
    const state = createNewGame();
    const aggregate = createLiveShopAggregate(state);
    const bought = applyLiveShopCommand(aggregate, { type: 'buyStock', cart: { mi_goi: 4 } });
    const placed = applyLiveShopCommand(bought.aggregate, { type: 'assignShelf', shelf: 0, slot: 0, productId: 'mi_goi' });

    expect(bought.aggregate.state.money).toBe(state.money - 4 * product('mi_goi').cost);
    expect(placed.aggregate.sequence).toBe(2);
    expect(placed.aggregate.state.shelves[0][0]).toMatchObject({ productId: 'mi_goi', qty: 4 });
    expect(warehouseQty(placed.aggregate.state, 'mi_goi')).toBe(0);
  });

  it('chặn command không đúng pha', () => {
    const aggregate = createLiveShopAggregate(createNewGame());
    expect(() => applyLiveShopCommand(aggregate, { type: 'scanAll' })).toThrow('không dùng được');
    expect(aggregate.sequence).toBe(0);
  });

  it('chỉ chấp nhận envelope có ID thiết bị/command và payload hợp lệ', () => {
    const envelope = { commandId: 'cmd-12345678', deviceId: 'device-a', observedSequence: 4, command: { type: 'addBill', value: 10_000 } };
    expect(validateLiveCommandEnvelope(envelope)).toBe(true);
    expect(validateLiveCommandEnvelope({ ...envelope, command: { type: 'addBill', value: 123 } })).toBe(false);
    expect(validateLiveCommandEnvelope({ ...envelope, observedSequence: -1 })).toBe(false);
  });

  it('mở phiên với runtime và tiến đồng hồ bằng elapsed do server cấp', () => {
    const state = createNewGame();
    state.shelves[0][0] = { productId: 'mi_goi', qty: 4 };
    state.zones[0] = 'dry';
    const opened = applyLiveShopCommand(createLiveShopAggregate(state), { type: 'openShop' }).aggregate;
    const advanced = advanceLiveShop(opened, 1);

    expect(opened.dayRuntime).not.toBeNull();
    expect(advanced.sequence).toBe(opened.sequence + 1);
    expect(advanced.state.clock).toBeGreaterThan(opened.state.clock);
    expect(advanced.dayRuntime).not.toBeNull();
  });

  it('cho nhập thêm hàng giữa giờ bán mà không làm mất phiên bán', () => {
    const state = createNewGame();
    state.shelves[0][0] = { productId: 'mi_goi', qty: 4 };
    state.zones[0] = 'dry';
    const opened = applyLiveShopCommand(createLiveShopAggregate(state), { type: 'openShop' }).aggregate;
    const bought = applyLiveShopCommand(opened, { type: 'buyStock', cart: { mi_goi: 5 } }).aggregate;

    expect(bought.state.phase).toBe('open');
    expect(bought.dayRuntime).not.toBeNull();
    expect(warehouseQty(bought.state, 'mi_goi')).toBe(5);
    expect(bought.state.money).toBe(opened.state.money - 5 * product('mi_goi').cost);
  });
});
