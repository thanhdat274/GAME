import { describe, expect, it } from 'vitest';
import { DATA, product } from '../src/core/data';
import { advanceLiveShop, applyLiveShopCommand, createLiveShopAggregate, validateLiveCommandEnvelope } from '../src/core/liveSession';
import { createNewGame, warehouseQty } from '../src/core/state';
import { addLot, planNewProducts } from '../src/core/stock';

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

    const placed = applyLiveShopCommand(bought, { type: 'assignShelf', shelf: 0, slot: 1, productId: 'mi_goi' }).aggregate;
    expect(placed.state.shelves[0][1]).toMatchObject({ productId: 'mi_goi', qty: 5 });
    expect(placed.dayRuntime).not.toBeNull();
  });

  it('giữa giờ bán không cho nạp tức thì ô đang bày', () => {
    const state = createNewGame();
    state.shelves[0][0] = { productId: 'mi_goi', qty: 2 };
    state.zones[0] = 'dry';
    const opened = applyLiveShopCommand(createLiveShopAggregate(state), { type: 'openShop' }).aggregate;
    const bought = applyLiveShopCommand(opened, { type: 'buyStock', cart: { mi_goi: 5 } }).aggregate;

    expect(() => applyLiveShopCommand(bought, { type: 'assignShelf', shelf: 0, slot: 0, productId: 'mi_goi' })).toThrow('ô trống');
    expect(() => applyLiveShopCommand(bought, { type: 'clearShelf', shelf: 0, slot: 0 })).toThrow('hết hàng');
    expect(() => applyLiveShopCommand(bought, { type: 'refillShelf', shelf: 0, slot: 0 })).toThrow('không dùng được');
  });

  it('tự bày giữa giờ bán chỉ xếp món chưa có ô vào ô trống', () => {
    const state = createNewGame();
    state.shelves[0][0] = { productId: 'mi_goi', qty: 2 };
    state.zones[0] = 'dry';
    const other = DATA.products.find((p) => p.category === 'dry' && p.id !== 'mi_goi' && p.unlockLevel <= state.level && !p.requiresCold)!;
    addLot(state, 'mi_goi', 5, null);
    addLot(state, other.id, 3, null);

    const { placements } = planNewProducts(state);
    expect(placements.map((p) => p.productId)).toEqual([other.id]);
    expect(state.shelves[placements[0].shelf][placements[0].slot].productId).toBeNull();
  });
});
