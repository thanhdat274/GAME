import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, SAVE_KEY, deleteSave, loadGame, migrate, saveGame, type KeyValueStore } from '../src/core/save';
import { createNewGame } from '../src/core/state';

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
    s.warehouse = { mi_goi: 7 };
    expect(saveGame(s, store)).toBe(true);
    const res = loadGame(store);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.state.money).toBe(123000);
      expect(res.state.warehouse).toEqual({ mi_goi: 7 });
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
    expect(state.settings).toEqual({ sound: false, autoChange: true });
  });

  it('từ chối bản lưu mới hơn game', () => {
    expect(() => migrate({ version: 99, state: {} })).toThrow();
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
