import { compressSave, decompressSave } from './compress';
import { DATA, product } from './data';
import { applyLevelUps } from './progression';
import { createNewGame, defaultFixtures, emptySlots, syncActiveStore, type GameState, type Lot } from './state';

export const SAVE_KEY = 'thdh.save.v1';
export const BACKUP_KEY = 'thdh.save.v1.bak';
export const CURRENT_VERSION = 5;
/** Bản lưu trước khi migrate lên version mới, giữ 14 ngày để khôi phục. */
export const PRE_MIGRATE_KEY = 'thdh.save.premigrate';
const PRE_MIGRATE_DAYS = 14;

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
    const warehouse: Record<string, number> = state.warehouse && !Array.isArray(state.warehouse) ? { ...(state.warehouse as Record<string, number>) } : {};
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
  /** v2 (self-service) -> v3 (giai đoạn 2): kho thành lô không hạn, thêm lưới mặt bằng với 3 kệ ở vị trí cũ. */
  2: (state) => {
    const raw = state.warehouse;
    const warehouse: Lot[] = Array.isArray(raw)
      ? (raw as Lot[]).filter((lot) => lot && lot.qty > 0 && knownProduct(lot.productId))
      : Object.entries((raw as Record<string, number> | undefined) ?? {})
        .filter(([id, qty]) => qty > 0 && knownProduct(id))
        .map(([productId, qty]) => ({ productId, qty, exp: null }));
    const shelves = Array.isArray(state.shelves) ? (state.shelves as { productId: string | null; qty: number }[][]) : [];
    while (shelves.length < 3) shelves.push(emptySlots(DATA.balance.slotsPerShelf));
    const counter = Array.isArray(state.counter) ? state.counter : emptySlots(DATA.balance.counterSlots);
    return {
      ...state,
      version: 3,
      warehouse,
      holding: [],
      shelves: shelves.map((row) => row.map((slot) => (slot.productId && slot.qty > 0 ? { productId: slot.productId, qty: slot.qty, lots: [{ qty: slot.qty, exp: null }] } : { productId: slot.productId, qty: slot.qty }))),
      counter,
      fixtures: defaultFixtures(),
    };
  },
  /** v3 (giai đoạn 2) -> v4 (giai đoạn 3): thêm nhân viên, lịch ca, quy tắc, lịch sử; giữ nguyên khu hàng và kho lô. */
  3: (state) => ({
    ...state,
    version: 4,
    staff: [],
    staffBoard: null,
    fixedCandidateUsed: false,
    schedule: {},
    scheduleReady: false,
    rules: [],
    planogram: null,
    analytics: [],
    managerStats: [],
    manager: { enabled: false, speed: 1 },
    wageDebt: 0,
    camera: false,
    morningNotes: [],
    lastSeen: typeof state.lastSeen === 'number' ? state.lastSeen : Date.now(),
    /** EXP dư từ giai đoạn 2 (bị chặn ở L9) được tính lên level khi tải. */
    pendingLevelUp: true,
  }),
  /** v4 (giai đoạn 3) -> v5 (giai đoạn 4): đóng gói tiệm cũ thành cửa hàng chính. */
  4: (state) => ({
    ...state,
    version: 5,
    stores: [{ id: 'main', name: 'Tiệm chính', kind: 'main', data: {} }],
    activeStoreId: 'main',
    calendarStartMonth: 3,
    calendarStartYear: 1,
    activeEvents: [],
    eventProgress: {},
    eventHistory: [],
    eventRollDay: 0,
    eventRewards: [],
    activeRecipes: [],
    branchLastSimDay: {},
    branchShipments: [],
    storyProgress: [],
    storyStarted: {},
  }),
};

function knownProduct(id: string): boolean {
  try {
    product(id);
    return true;
  } catch {
    return false;
  }
}

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
  const { pendingLevelUp, ...rest } = state as Partial<GameState> & { pendingLevelUp?: boolean };
  const loaded = rest as Partial<GameState>;
  const result = {
    ...base,
    ...loaded,
    settings: { ...base.settings, ...loaded.settings },
    zones: loaded.zones?.length ? loaded.zones : base.zones,
    counter: loaded.counter?.length ? loaded.counter : base.counter,
    fixtures: loaded.fixtures?.length ? loaded.fixtures : base.fixtures,
    nextUid: Math.max(loaded.nextUid ?? 0, ...(loaded.fixtures ?? base.fixtures).map((f) => f.uid + 1)),
    lifetime: { ...base.lifetime, ...loaded.lifetime },
    today: { ...base.today, ...loaded.today },
    sync: { ...base.sync, ...loaded.sync },
    summary: {
      ...base.summary, ...loaded.summary,
      level: loaded.level ?? base.level,
      day: loaded.day ?? base.day,
      money: loaded.money ?? base.money,
    },
    manager: { ...base.manager, ...loaded.manager },
    stores: loaded.stores?.length ? loaded.stores : base.stores,
    activeStoreId: loaded.activeStoreId ?? 'main',
    calendarStartMonth: loaded.calendarStartMonth ?? base.calendarStartMonth,
    calendarStartYear: loaded.calendarStartYear ?? base.calendarStartYear,
    activeEvents: loaded.activeEvents ?? [],
    eventProgress: loaded.eventProgress ?? {},
    eventHistory: loaded.eventHistory ?? [],
    eventRollDay: loaded.eventRollDay ?? 0,
    eventRewards: loaded.eventRewards ?? [],
    activeRecipes: loaded.activeRecipes ?? [],
    branchLastSimDay: loaded.branchLastSimDay ?? {},
    branchShipments: Array.isArray(loaded.branchShipments) ? loaded.branchShipments : [],
    storyProgress: loaded.storyProgress ?? [],
    storyStarted: loaded.storyStarted ?? {},
    version: CURRENT_VERSION,
  } as GameState;
  syncActiveStore(result);
  if (pendingLevelUp) applyLevelUps(result);
  return result;
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
    syncActiveStore(state);
    state.summary.level = state.level;
    state.summary.day = state.day;
    state.summary.money = state.money;
    state.lastSeen = Date.now();
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
    const state = migrate(file as unknown as { version: number; state: Record<string, unknown> });
    if (file.version < CURRENT_VERSION) keepPreMigrate(store, raw, file.version);
    return { status: 'ok', state };
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

/** Giữ bản lưu cũ trước khi migrate (không ghi đè bản dự phòng còn hạn). */
function keepPreMigrate(store: KeyValueStore, raw: string, version: number): void {
  try {
    const existing = store.getItem(PRE_MIGRATE_KEY);
    if (existing) {
      const parsed = JSON.parse(existing) as { expiresAt: number };
      if (parsed.expiresAt > Date.now()) return;
    }
    store.setItem(PRE_MIGRATE_KEY, JSON.stringify({ version, expiresAt: Date.now() + PRE_MIGRATE_DAYS * 86_400_000, raw }));
  } catch {
    /* hết chỗ lưu: bỏ qua */
  }
}

// ---------- Mã sao lưu (xuất/nhập bằng chữ) ----------

const CODE_PREFIX = 'THDH1:';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(code: string): string {
  const binary = atob(code);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Xuất bản lưu thành mã chữ để chép sang máy khác. */
export async function exportBackupCode(state: GameState): Promise<string> {
  const packed = await compressSave({ version: CURRENT_VERSION, state });
  return CODE_PREFIX + toBase64(packed);
}

/** Đọc mã sao lưu; ném lỗi tiếng Việt nếu mã sai. */
export async function importBackupCode(code: string): Promise<GameState> {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (!trimmed.startsWith(CODE_PREFIX)) throw new Error('Mã sao lưu không đúng định dạng.');
  let file: { version: number; state: Record<string, unknown> };
  try {
    file = await decompressSave(fromBase64(trimmed.slice(CODE_PREFIX.length)));
  } catch {
    throw new Error('Mã sao lưu bị hỏng hoặc chép thiếu.');
  }
  if (!file || typeof file.version !== 'number' || typeof file.state !== 'object') throw new Error('Mã sao lưu bị hỏng hoặc chép thiếu.');
  return migrate(file);
}
