import { compressSave, decompressSave } from './compress';
import { createNewGame, type GameState } from './state';

export const SAVE_KEY = 'thdh.save.v1';
export const BACKUP_KEY = 'thdh.save.v1.bak';
export const DEVICE_KEY = 'thdh.device.id';
export const DISCARDED_KEY = 'thdh.save.discarded';
export const CURRENT_VERSION = 1;
/** Bản bị bỏ khi chọn bản khác lúc xung đột được giữ 7 ngày. */
export const DISCARDED_TTL_MS = 7 * 24 * 3600 * 1000;

/** Giao diện tối thiểu của localStorage để test được. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Siêu dữ liệu đồng bộ cloud, chỉ nằm ở bản lưu local. */
export interface SyncMeta {
  /** Revision trên cloud mà bản local này dựa vào (0 = chưa từng đồng bộ). */
  baseRevision: number;
  /** Có thay đổi local chưa đẩy lên cloud. */
  dirty: boolean;
  lastSyncedAt: number | null;
  deviceId: string;
  /** Tài khoản mà `baseRevision` thuộc về (null = khách). */
  uid: string | null;
}

/** Tóm tắt để hiện khi chọn bản lưu. */
export interface SaveSummary {
  level: number;
  day: number;
  money: number;
  playSeconds: number;
}

interface SaveFile {
  version: number;
  savedAt: number;
  /** Tăng mỗi lần lưu local, để biết có lưu mới xen giữa lúc đang đẩy cloud không. */
  seq?: number;
  state: GameState;
  sync?: SyncMeta;
  summary?: SaveSummary;
}

export interface LocalSave {
  state: GameState;
  savedAt: number;
  seq: number;
  sync: SyncMeta;
  summary: SaveSummary;
}

export type LoadResult =
  | { status: 'none' }
  | ({ status: 'ok' } & LocalSave)
  | { status: 'corrupt'; error: string };

type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** migrations[n] chuyển bản lưu version n lên n+1. Giai đoạn sau thêm vào đây. */
const migrations: Record<number, Migration> = {};

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
    today: { ...base.today, ...loaded.today },
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

export function summarize(state: GameState): SaveSummary {
  return { level: state.level, day: state.day, money: state.money, playSeconds: Math.floor(state.playSeconds ?? 0) };
}

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

/** Mã ngẫu nhiên của thiết bị, sinh một lần. */
export function getDeviceId(store: KeyValueStore | null = defaultStore()): string {
  try {
    const id = store?.getItem(DEVICE_KEY);
    if (id) return id;
    const fresh = randomId();
    store?.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

function defaultSync(store: KeyValueStore | null): SyncMeta {
  return { baseRevision: 0, dirty: true, lastSyncedAt: null, deviceId: getDeviceId(store), uid: null };
}

function readFile(store: KeyValueStore): SaveFile | null {
  try {
    const raw = store.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  } catch {
    return null;
  }
}

/**
 * Lưu local. Mặc định đánh dấu `dirty` (có thay đổi chưa lên cloud) và giữ phần còn lại của
 * khối `sync`; truyền `sync` để ghi đè (ví dụ khi vừa tải bản cloud về).
 */
export function saveGame(
  state: GameState,
  store: KeyValueStore | null = defaultStore(),
  opts: { sync?: Partial<SyncMeta> } = {},
): boolean {
  if (!store) return false;
  try {
    const prev = readFile(store);
    const sync: SyncMeta = { ...defaultSync(store), ...prev?.sync, dirty: true, ...opts.sync };
    const file: SaveFile = {
      version: CURRENT_VERSION,
      savedAt: Date.now(),
      seq: (prev?.seq ?? 0) + 1,
      state,
      sync,
      summary: summarize(state),
    };
    store.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

/**
 * Cập nhật khối `sync` mà không đổi trạng thái game. Nếu có `expectSeq` mà bản lưu đã đổi
 * (lưu mới xen vào) thì chỉ cập nhật revision và giữ `dirty`.
 */
export function updateSync(patch: Partial<SyncMeta>, store: KeyValueStore | null = defaultStore(), expectSeq?: number): boolean {
  if (!store) return false;
  const file = readFile(store);
  if (!file) return false;
  const changed = expectSeq !== undefined && (file.seq ?? 0) !== expectSeq;
  const sync: SyncMeta = { ...defaultSync(store), ...file.sync, ...patch };
  if (changed) sync.dirty = true;
  try {
    store.setItem(SAVE_KEY, JSON.stringify({ ...file, sync }));
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
    return {
      status: 'ok',
      state,
      savedAt: typeof file.savedAt === 'number' ? file.savedAt : 0,
      seq: file.seq ?? 0,
      sync: { ...defaultSync(store), ...file.sync },
      summary: summarize(state),
    };
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

// ---------- Bản bị bỏ khi xung đột ----------

export interface DiscardedSave {
  discardedAt: number;
  expiresAt: number;
  summary: SaveSummary;
  savedAt: number;
  /** `{ version, state }` nén bằng `compressSave`. */
  data: string;
}

/** Giữ lại một bản lưu bị bỏ trong 7 ngày để có thể khôi phục thủ công. */
export function saveDiscarded(
  save: { state: GameState; savedAt: number },
  store: KeyValueStore | null = defaultStore(),
  now = Date.now(),
): boolean {
  if (!store) return false;
  const entry: DiscardedSave = {
    discardedAt: now,
    expiresAt: now + DISCARDED_TTL_MS,
    summary: summarize(save.state),
    savedAt: save.savedAt,
    data: compressSave({ version: CURRENT_VERSION, state: save.state }),
  };
  try {
    store.setItem(DISCARDED_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

/** Bản bị bỏ còn hạn (hết hạn thì tự xóa). */
export function loadDiscarded(store: KeyValueStore | null = defaultStore(), now = Date.now()): (DiscardedSave & { state: GameState }) | null {
  if (!store) return null;
  try {
    const raw = store.getItem(DISCARDED_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as DiscardedSave;
    if (!(entry.expiresAt > now)) {
      store.removeItem(DISCARDED_KEY);
      return null;
    }
    const file = decompressSave<{ version: number; state: Record<string, unknown> }>(entry.data);
    return { ...entry, state: migrate(file) };
  } catch {
    return null;
  }
}

export function clearDiscarded(store: KeyValueStore | null = defaultStore()): void {
  try {
    store?.removeItem(DISCARDED_KEY);
  } catch {
    /* bỏ qua */
  }
}
