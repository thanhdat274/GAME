import { loadGame, migrate, saveGame } from '../core/save';
import type { GameState } from '../core/state';
import { G } from '../game';
import { finishRedirectSignIn } from './auth';
import { decompressSave, pull, push, saveDiscarded, type CloudSnapshot } from './cloudSave';
import { cloudSaveEnabled, getFirebase, hasAuthHint } from './firebase';

export type SyncStatus = 'guest' | 'syncing' | 'synced' | 'pending' | 'error' | 'conflict';
const MIN_AUTO_PUSH_MS = 30_000;
let lastPushAt = 0;
let failures = 0;
let busy = false;
let started = false;
let status: SyncStatus = 'guest';
const statusListeners = new Set<(status: SyncStatus, message?: string) => void>();
let pendingConflict: CloudSnapshot | null = null;
let localEpoch = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAfterCooldown(): void {
  if (retryTimer) return;
  const remaining = Math.max(1, MIN_AUTO_PUSH_MS - (Date.now() - lastPushAt));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncNow(false);
  }, remaining);
}

export function getSyncStatus(): SyncStatus { return status; }
export function getPendingConflict(): CloudSnapshot | null { return pendingConflict; }

export function onSyncStatus(listener: (status: SyncStatus, message?: string) => void): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => { statusListeners.delete(listener); };
}

function setStatus(next: SyncStatus, message?: string): void {
  status = next;
  statusListeners.forEach((listener) => listener(next, message));
}

export async function startSync(): Promise<void> {
  if (started || !cloudSaveEnabled() || !hasAuthHint()) return;
  started = true;
  try {
    const { auth, authSdk } = await getFirebase();
    await finishRedirectSignIn();
    authSdk.onAuthStateChanged(auth, async (user: any) => {
      if (!user) {
        setStatus('guest');
        return;
      }
      try {
      setStatus('syncing');
      const cloud = await pull();
      if (cloud.status === 'ok') {
        const local = loadGame();
        if (!cloud.value) {
          G.state.sync.baseRevision = 0;
          await pushLocal(true);
        } else if (local.status === 'none') {
          await adoptCloud(cloud.value);
        } else if (local.status === 'ok') {
          const state = local.state;
          const revisionsDiffer = cloud.value.revision !== state.sync.baseRevision;
          if (revisionsDiffer && (state.sync.dirty || cloud.value.revision < state.sync.baseRevision)) {
            pendingConflict = cloud.value;
            setStatus('conflict');
          } else if (revisionsDiffer) {
            await adoptCloud(cloud.value);
          } else if (state.sync.dirty && cloud.value.revision === state.sync.baseRevision) {
            await pushLocal(true);
          } else {
            setStatus('synced');
          }
        } else {
          setStatus('error', 'Bản lưu trên máy bị hỏng; đã giữ bản dự phòng.');
        }
      } else {
        setStatus(cloud.status === 'offline' ? 'pending' : 'error', cloud.status === 'error' ? cloud.message : undefined);
      }
      } catch (error) {
        setStatus('error', error instanceof Error ? error.message : 'Không kiểm tra được bản cloud.');
      }
    });
  } catch (error) {
    started = false;
    setStatus('error', error instanceof Error ? error.message : 'Không kết nối được Firebase.');
  }
}

export async function syncNow(ignoreCooldown = true): Promise<void> {
  if (!cloudSaveEnabled() || !hasAuthHint() || busy) return;
  if (!ignoreCooldown && Date.now() - lastPushAt < MIN_AUTO_PUSH_MS) {
    scheduleAfterCooldown();
    return;
  }
  await pushLocal(ignoreCooldown);
}

async function pushLocal(ignoreCooldown: boolean): Promise<void> {
  if (busy || !hasAuthHint()) return;
  if (!ignoreCooldown && Date.now() - lastPushAt < MIN_AUTO_PUSH_MS) {
    scheduleAfterCooldown();
    return;
  }
  busy = true;
  setStatus('syncing');
  try {
    const snapshot = structuredClone(G.state);
    const epoch = localEpoch;
    const result = await push(snapshot);
    if (result.status === 'ok') {
      lastPushAt = Date.now();
      failures = 0;
      G.state.sync.baseRevision = result.value;
      G.state.sync.dirty = epoch !== localEpoch;
      G.state.sync.lastSyncedAt = Date.now();
      saveGame(G.state, undefined, false);
      setStatus(G.state.sync.dirty ? 'pending' : 'synced');
      if (G.state.sync.dirty) scheduleAfterCooldown();
    } else if (result.status === 'conflict') {
      pendingConflict = result.cloud;
      setStatus('conflict');
    } else if (result.status === 'offline') {
      setStatus('pending');
    } else {
      failures += 1;
      setStatus(failures >= 3 ? 'error' : 'pending', result.message);
    }
  } finally {
    busy = false;
  }
}

async function adoptCloud(snapshot: CloudSnapshot): Promise<void> {
  const decoded = await decompressSave(snapshot.data);
  const cloudState = migrate({ version: snapshot.schemaVersion, state: decoded as unknown as Record<string, unknown> });
  const deviceId = G.state.sync.deviceId;
  if (G.state.sync.dirty) await saveDiscarded(G.state);
  cloudState.sync = { ...cloudState.sync, deviceId, baseRevision: snapshot.revision, dirty: false, lastSyncedAt: snapshot.updatedAt ?? Date.now() };
  G.state = cloudState;
  saveGame(G.state, undefined, false);
  setStatus('synced');
  window.dispatchEvent(new CustomEvent('thdh-cloud-loaded'));
}

export async function resolveConflict(choice: 'local' | 'cloud'): Promise<void> {
  const cloud = pendingConflict ? { status: 'ok' as const, value: pendingConflict } : await pull();
  if (cloud.status !== 'ok' || !cloud.value) {
    setStatus('error', cloud.status === 'error' ? cloud.message : 'Không tải được bản cloud.');
    return;
  }
  if (choice === 'cloud') {
    await adoptCloud(cloud.value);
  } else {
    await saveDiscarded(await decompressSave(cloud.value.data));
    // Explicit local choice advances its base to the current revision before pushing.
    G.state.sync.baseRevision = cloud.value.revision;
    await pushLocal(true);
  }
  pendingConflict = null;
}

export function enableOnlineRetry(): void {
  window.addEventListener('online', () => { void syncNow(false); });
}

export function localSaveChanged(state: GameState): void {
  if (!state.sync.dirty) return;
  localEpoch += 1;
  setStatus(cloudSaveEnabled() && hasAuthHint() ? 'pending' : 'guest');
  void syncNow(false);
}
