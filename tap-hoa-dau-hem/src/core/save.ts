import { createNewGame, type GameState } from './state';

export const SAVE_KEY = 'thdh.save.v1';
export const BACKUP_KEY = 'thdh.save.v1.bak';
export const CURRENT_VERSION = 2;

/** Giao diện tối thiểu của localStorage để test được. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; state: GameState }
  | { status: 'corrupt'; error: string };

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] chuyển bản lưu version n lên n+1. Giai đoạn sau thêm vào đây. */
const migrations: Record<number, Migration> = {
  1: (state) => {
    const shelves = Array.isArray(state.shelves) ? (state.shelves as { productId: string | null; qty: number }[][]) : [];
    const warehouse = (state.warehouse as Record<string, number> | undefined) ?? {};
    const zones: (string | null)[] = shelves.map((row) => {
      const counts = new Map<string, number>();
      for (const slot of row) {
        if (!slot.productId || slot.qty <= 0) continue;
        const p = product(slot.productId);
        if (p.behindCounter) {
          warehouse[p.id] = (warehouse[p.id] ?? 0) + slot.qty;
          slot.productId = null;
          slot.qty = 0;
          continue;
        }
        counts.set(p.category, (counts.get(p.category) ?? 0) + slot.qty);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    });
    for (let r = 0; r < shelves.length; r++) {
      for (const slot of shelves[r]) {
        if (!slot.productId || !slot.qty) continue;
        const p = product(slot.productId);
        if (p.category !== zones[r]) {
          warehouse[p.id] = (warehouse[p.id] ?? 0) + slot.qty;
          slot.productId = null;
          slot.qty = 0;
        }
      }
    }
    return {
      ...state,
      version: 2,
      shelves,
      zones,
      counter: Array.from({ length: DATA.balance.counterSlots }, () => ({ productId: null, qty: 0 })),
      warehouse,
      settings: { ...(state.settings as object ?? {}), autoScan: false },
    };
  },
};

import { DATA } from './data';
import { product } from './data';

export function migrate(file: { version: number; state: Record<string, unknown> }): GameState {
  let { version, state } = file;
  if (version > CURRENT_VERSION) throw new Error(`Bản lưu version ${version} mới hơn game (${CURRENT_VERSION})`);
  while (version < CURRENT_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`Không có migrate từ version ${version}`);
    state = step(state);
    version++;
  }
  // Bổ sung trường thiếu bằng giá trị mặc định (an toàn khi thêm trường không đổi version).
  const base = createNewGame();
  const loaded = state as Partial<GameState>;
  return {
    ...base,
    ...loaded,
    settings: { ...base.settings, ...loaded.settings },
    zones: loaded.zones?.length ? loaded.zones : base.zones,
    counter: loaded.counter?.length ? loaded.counter : base.counter,
    today: { ...base.today, ...loaded.today },
    sync: { ...base.sync, ...loaded.sync },
    summary: {
      ...base.summary, ...loaded.summary,
      level: loaded.level ?? base.level,
      day: loaded.day ?? base.day,
      money: loaded.money ?? base.money,
    },
    version: CURRENT_VERSION,
  } as GameState;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, store: KeyValueStore | null = defaultStore(), markDirty = true): boolean {
  if (!store) return false;
  try {
    if (markDirty) state.sync.dirty = true;
    state.summary.level = state.level;
    state.summary.day = state.day;
    state.summary.money = state.money;
    const file: SaveFile = { version: CURRENT_VERSION, savedAt: Date.now(), state };
    store.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(store: KeyValueStore | null = defaultStore()): LoadResult {
  if (!store) return { status: 'none' };
  let raw: string | null;
  try {
    raw = store.getItem(SAVE_KEY);
  } catch {
    return { status: 'none' };
  }
  if (!raw) return { status: 'none' };
  try {
    const file = JSON.parse(raw) as SaveFile;
    if (!file || typeof file.version !== 'number' || typeof file.state !== 'object') throw new Error('Sai cấu trúc');
    return { status: 'ok', state: migrate(file as unknown as { version: number; state: Record<string, unknown> }) };
  } catch (e) {
    try {
      store.setItem(BACKUP_KEY, raw);
    } catch {
      /* hết chỗ lưu: bỏ qua */
    }
    return { status: 'corrupt', error: e instanceof Error ? e.message : String(e) };
  }
}

export function hasSave(store: KeyValueStore | null = defaultStore()): boolean {
  return loadGame(store).status === 'ok';
}

export function deleteSave(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* bỏ qua */
  }
}
