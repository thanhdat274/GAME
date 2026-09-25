import type { GameState } from '../core/state';
import { getFirebase } from './firebase';

const MAX_COMPRESSED_CHARS = 900_000;
const SAVE_PATH = ['users', 'saves', 'main'] as const;
const LZ_URL = 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/+esm';

export type CloudResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'conflict'; cloud: CloudSnapshot | null }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export interface CloudSnapshot {
  schemaVersion: number;
  revision: number;
  deviceId: string;
  summary: GameState['summary'];
  data: string;
  updatedAt: number | null;
}

export async function compressSave(state: GameState): Promise<string> {
  const lz = await import(/* @vite-ignore */ LZ_URL);
  const compressor = (lz as any).compressToUTF16 ?? (lz as any).default?.compressToUTF16;
  const compressed = compressor(JSON.stringify(state));
  if (typeof compressed !== 'string') throw new Error('Không nén được bản lưu.');
  return compressed;
}

export async function decompressSave(data: string): Promise<GameState> {
  const lz = await import(/* @vite-ignore */ LZ_URL);
  const decompressor = (lz as any).decompressFromUTF16 ?? (lz as any).default?.decompressFromUTF16;
  const json = decompressor(data);
  if (typeof json !== 'string') throw new Error('Bản lưu cloud bị hỏng.');
  const state = JSON.parse(json) as GameState;
  if (!state || typeof state !== 'object' || typeof state.level !== 'number' || typeof state.day !== 'number') {
    throw new Error('Bản lưu cloud không đúng định dạng.');
  }
  return state;
}

export async function pull(timeoutMs = 5000): Promise<CloudResult<CloudSnapshot | null>> {
  return withTimeout(async () => {
    const { db, auth, firestoreSdk } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return { status: 'error', message: 'Bạn chưa đăng nhập.' } as const;
    const ref = firestoreSdk.doc(db, ...SAVE_PATH.slice(0, 1), user.uid, ...SAVE_PATH.slice(1));
    const snapshot = await firestoreSdk.getDoc(ref);
    return { status: 'ok', value: snapshot.exists() ? parseSnapshot(snapshot.data()) : null } as const;
  }, timeoutMs);
}

export async function push(state: GameState): Promise<CloudResult<number>> {
  if (!navigator.onLine) return { status: 'offline' };
  try {
    const data = await compressSave(state);
    if (new TextEncoder().encode(data).byteLength > MAX_COMPRESSED_CHARS) return { status: 'error', message: 'Bản lưu quá lớn để đồng bộ.' };
    const { db, auth, firestoreSdk } = await getFirebase();
    const user = auth.currentUser;
    if (!user) return { status: 'error', message: 'Bạn chưa đăng nhập.' };
    const ref = firestoreSdk.doc(db, 'users', user.uid, 'saves', 'main');
    const baseRevision = state.sync.baseRevision;
    const revision = await firestoreSdk.runTransaction(db, async (transaction: any) => {
      const current = await transaction.get(ref);
      const cloudRevision = current.exists() ? Number(current.data().revision) : 0;
      if (cloudRevision !== baseRevision) throw new CloudConflict(current.exists() ? parseSnapshot(current.data()) : null);
      const next = cloudRevision + 1;
      transaction.set(ref, {
        schemaVersion: state.version,
        revision: next,
        deviceId: state.sync.deviceId,
        summary: state.summary,
        data,
        updatedAt: firestoreSdk.serverTimestamp(),
      });
      return next;
    });
    state.sync.baseRevision = revision;
    state.sync.dirty = false;
    state.sync.lastSyncedAt = Date.now();
    return { status: 'ok', value: revision };
  } catch (error) {
    if (error instanceof CloudConflict) return { status: 'conflict', cloud: error.cloud };
    if (!navigator.onLine) return { status: 'offline' };
    return { status: 'error', message: error instanceof Error ? error.message : 'Không đồng bộ được.' };
  }
}

export async function saveDiscarded(state: GameState): Promise<void> {
  const key = 'thdh.save.discarded';
  const items = loadDiscarded();
  items.unshift({ savedAt: Date.now(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, state });
  localStorage.setItem(key, JSON.stringify(items.slice(0, 3)));
}

export function loadDiscarded(): Array<{ savedAt: number; expiresAt: number; state: GameState }> {
  try {
    const value = JSON.parse(localStorage.getItem('thdh.save.discarded') ?? '[]') as Array<{ savedAt: number; expiresAt: number; state: GameState }>;
    return value.filter((item) => item.expiresAt > Date.now());
  } catch {
    return [];
  }
}

class CloudConflict extends Error {
  constructor(readonly cloud: CloudSnapshot | null) {
    super('Cloud revision conflict');
  }
}

function parseSnapshot(value: any): CloudSnapshot {
  return {
    schemaVersion: Number(value.schemaVersion) || 1,
    revision: Number(value.revision) || 0,
    deviceId: String(value.deviceId ?? ''),
    summary: value.summary,
    data: String(value.data ?? ''),
    updatedAt: value.updatedAt?.toMillis?.() ?? null,
  };
}

async function withTimeout<T>(operation: () => Promise<CloudResult<T>>, timeoutMs: number): Promise<CloudResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation().catch((error) => ({ status: 'error', message: error instanceof Error ? error.message : 'Lỗi kết nối cloud.' }) as const),
      new Promise<CloudResult<T>>((resolve) => { timer = setTimeout(() => resolve({ status: 'error', message: 'Cloud phản hồi quá lâu.' }), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
