import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, deleteSave, loadGame, migrate, saveGame, type KeyValueStore } from '../src/core/save';
import { createNewGame, lotsFrom, warehouseQty } from '../src/core/state';

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('lưu game', () => {
  it('chưa có bản lưu', () => {
    expect(loadGame(new MemoryStore())).toEqual({ status: 'none' });
  });

  it('lưu rồi tải lại giữ nguyên tiền và kho', () => {
    const store = new MemoryStore();
    const s = createNewGame();
    s.money = 123000;
    s.warehouse = lotsFrom({ mi_goi: 7 });
    expect(saveGame(s, store)).toBe(true);
    const res = loadGame(store);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.state.money).toBe(123000);
      expect(res.state.warehouse).toEqual(lotsFrom({ mi_goi: 7 }));
    }
  });

  it('bản lưu hỏng: giữ .bak và báo lỗi', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, '{không phải json');
    const res = loadGame(store);
    expect(res.status).toBe('corrupt');
    expect(store.getItem(BACKUP_KEY)).toBe('{không phải json');
  });

  it('bổ sung trường mới còn thiếu bằng giá trị mặc định', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.announcedLevel;
    const state = migrate({ version: 1, state: old });
    expect(state.announcedLevel).toBe(1);
  });

  it('bản lưu cũ thiếu cài đặt tự thối tiền thì mặc định bật', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    old.settings = { sound: false };
    const state = migrate({ version: 1, state: old });
    expect(state.settings).toEqual({ sound: false, autoChange: true, autoScan: false });
  });

  it('bản lưu cũ đang giữa ngày (chưa có "missed") vẫn tải được', () => {
    const old = createNewGame() as unknown as { today: Record<string, unknown>; yesterdayMissed?: unknown };
    delete old.today.missed;
    delete old.yesterdayMissed;
    const state = migrate({ version: 1, state: old as unknown as Record<string, unknown> });
    expect(state.today.missed).toEqual({});
    expect(state.yesterdayMissed).toEqual({});
  });

  it('bản lưu cũ được bổ sung metadata đồng bộ mà không tăng version', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    delete old.sync;
    delete old.summary;
    const state = migrate({ version: 1, state: old });
    expect(state.sync.baseRevision).toBe(0);
    expect(state.sync.dirty).toBe(true);
    expect(state.sync.deviceId.length).toBeGreaterThan(0);
    expect(state.summary).toMatchObject({ level: 1, day: 1, playSeconds: 0 });
  });

  it('migrate v1 gán khu theo nhóm nhiều nhất và trả hàng sai khu về kho', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    const shelves = old.shelves as { productId: string | null; qty: number }[][];
    shelves[0][0] = { productId: 'mi_goi', qty: 4 };
    shelves[0][1] = { productId: 'mi_goi', qty: 3 };
    shelves[0][2] = { productId: 'keo', qty: 2 };
    delete old.zones;
    delete old.counter;
    old.settings = { sound: true, autoChange: true };
    const state = migrate({ version: 1, state: old });
    expect(state.zones[0]).toBe('dry');
    expect(state.shelves[0][2]).toEqual({ productId: null, qty: 0 });
    expect(warehouseQty(state, 'keo')).toBe(2);
    expect(state.counter.every((slot) => !slot.productId)).toBe(true);
    expect(state.settings.autoScan).toBe(false);
  });

  it('migrate v1 giữ ngày và thống kê khi bản lưu ở giữa ngày', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    old.phase = 'open';
    old.clock = 735;
    old.day = 8;
    old.today = { ...(old.today as object), revenue: 42000, sold: { mi_goi: 7 } };
    delete old.zones;
    delete old.counter;
    const state = migrate({ version: 1, state: old });
    expect(state).toMatchObject({ phase: 'open', clock: 735, day: 8, today: { revenue: 42000, sold: { mi_goi: 7 } } });
  });

  it('migrate v1 giữ nguyên kệ chỉ có một nhóm hàng', () => {
    const old = createNewGame() as unknown as Record<string, unknown>;
    const shelves = old.shelves as { productId: string | null; qty: number }[][];
    shelves[0][0] = { productId: 'mi_goi', qty: 4 };
    shelves[0][1] = { productId: 'muoi', qty: 2 };
    delete old.zones;
    delete old.counter;
    const state = migrate({ version: 1, state: old });
    expect(state.zones[0]).toBe('dry');
    expect(state.shelves[0][0]).toMatchObject({ productId: 'mi_goi', qty: 4 });
    expect(state.shelves[0][1]).toMatchObject({ productId: 'muoi', qty: 2 });
  });

  it('lưu local đánh dấu dirty, còn ghi sau đồng bộ giữ trạng thái sạch', () => {
    const store = new MemoryStore();
    const state = createNewGame();
    state.sync.dirty = false;
    state.money = 123000;
    expect(saveGame(state, store)).toBe(true);
    expect(state.sync.dirty).toBe(true);
    expect(state.summary.money).toBe(123000);
    state.sync.dirty = false;
    expect(saveGame(state, store, false)).toBe(true);
    const loaded = loadGame(store);
    expect(loaded.status).toBe('ok');
    if (loaded.status === 'ok') expect(loaded.state.sync.dirty).toBe(false);
  });

  it('từ chối bản lưu mới hơn game', () => {
    expect(() => migrate({ version: 99, state: {} })).toThrow();
  });

  it('summary của bản lưu cũ phản ánh tiến trình thật ngay khi tải', () => {
    const old = { ...createNewGame(), day: 9, level: 4, money: 850000 } as Record<string, unknown>;
    delete old.summary;
    expect(migrate({ version: 2, state: old }).summary).toEqual({ day: 9, level: 4, money: 850000, playSeconds: 0 });
  });

  it('localStorage ném lỗi thì không làm hỏng game', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('bị chặn');
      },
      setItem: () => {
        throw new Error('bị chặn');
      },
      removeItem: () => {
        throw new Error('bị chặn');
      },
    };
    expect(saveGame(createNewGame(), broken)).toBe(false);
    expect(loadGame(broken)).toEqual({ status: 'none' });
    expect(() => deleteSave(broken)).not.toThrow();
  });
});
