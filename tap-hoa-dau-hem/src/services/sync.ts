import { loadGame, migrate, saveGame } from '../core/save';
import type { GameState } from '../core/state';
import { G } from '../game';
import { finishRedirectSignIn } from './auth';
import { decompressSave, pull, push, saveDiscarded, type CloudSnapshot } from './cloudSave';
import { cloudSaveEnabled, getFirebase, hasAuthHint } from './firebase';

export type SyncStatus = 'guest' | 'syncing' | 'synced' | 'pending' | 'error' | 'conflict';
const MIN_AUTO_PUSH_MS = 30_000;
let lastPushAt = -Infinity;
let failures = 0;
let busy = false;
let started = false;
let reconciled = false;
let accountEpoch = 0;
let status: SyncStatus = 'guest';
const statusListeners = new Set<(status: SyncStatus, message?: string) => void>();
let pendingConflict: CloudSnapshot | null = null;
let hasConflict = false;
let pendingCloud: CloudSnapshot | null = null;
let canApplyCloud = () => false;
let localEpoch = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** The renderer owns the safe scene boundary; check again after every await. */
export function configureCloudApplyGuard(guard: () => boolean): void { canApplyCloud = guard; }

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

function conflict(snapshot: CloudSnapshot | null): void {
  pendingCloud = null;
  pendingConflict = snapshot;
  hasConflict = true;
  setStatus('conflict');
}

function failed(error: unknown): void {
  failures += 1;
  setStatus(failures >= 3 ? 'error' : 'pending', error instanceof Error ? error.message : String(error));
}

export async function startSync(): Promise<void> {
  if (started || !cloudSaveEnabled() || !hasAuthHint()) return;
  started = true;
  try {
    const { auth, authSdk } = await getFirebase();
    await finishRedirectSignIn();
    authSdk.onAuthStateChanged(auth, async (user: any) => {
      accountEpoch += 1;
      reconciled = false;
      pendingCloud = pendingConflict = null;
      hasConflict = false;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (!user) { setStatus('guest'); return; }
      await syncNow(true);
    });
  } catch (error) {
    started = false;
    setStatus('error', error instanceof Error ? error.message : 'Không kết nối được Firebase.');
  }
}

/** Reconcile against the current in-memory state, including edits made during pull. */
async function reconcile(epoch: number): Promise<void> {
  const cloud = await pull();
  if (epoch !== accountEpoch || G.liveSnapshot) return;
  if (cloud.status !== 'ok') {
    if (cloud.status === 'offline') setStatus('pending');
    else failed(cloud.status === 'error' ? cloud.message : 'Không tải được bản cloud.');
    return;
  }
  const local = loadGame();
  if (local.status === 'corrupt') {
    setStatus('error', 'Bản lưu trên máy bị hỏng; đã giữ bản dự phòng.');
    return;
  }
  reconciled = true;
  if (!cloud.value) {
    G.state.sync.baseRevision = 0;
    await pushLocal(epoch);
  } else if (local.status === 'none') {
    await adoptCloud(cloud.value, epoch);
  } else if (cloud.value.revision !== G.state.sync.baseRevision) {
    if (G.state.sync.dirty || cloud.value.revision < G.state.sync.baseRevision) conflict(cloud.value);
    else await adoptCloud(cloud.value, epoch);
  } else if (G.state.sync.dirty) {
    await pushLocal(epoch);
  } else {
    failures = 0;
    setStatus('synced');
  }
}

export async function syncNow(ignoreCooldown = true): Promise<void> {
  if (G.liveSnapshot || !cloudSaveEnabled() || !hasAuthHint() || busy || hasConflict) return;
  if (!ignoreCooldown && Date.now() - lastPushAt < MIN_AUTO_PUSH_MS) {
    scheduleAfterCooldown();
    return;
  }
  busy = true;
  const epoch = accountEpoch;
  setStatus('syncing');
  try {
    if (pendingCloud) await adoptCloud(pendingCloud, epoch);
    else if (!reconciled) await reconcile(epoch);
    else if (G.state.sync.dirty) await pushLocal(epoch);
    else setStatus('synced');
  } catch (error) {
    if (epoch === accountEpoch) failed(error);
  } finally {
    busy = false;
  }
}

async function pushLocal(account: number): Promise<void> {
  const snapshot = structuredClone(G.state);
  const state = G.state;
  const epoch = localEpoch;
  // Rate-limit attempts as well as successes during network failures.
  lastPushAt = Date.now();
  const result = await push(snapshot);
  if (account !== accountEpoch || G.liveSnapshot) return;
  if (result.status === 'ok') {
    failures = 0;
    G.state.sync.baseRevision = result.value;
    G.state.sync.dirty = epoch !== localEpoch || state !== G.state;
    G.state.sync.lastSyncedAt = Date.now();
    saveGame(G.state, undefined, false);
    setStatus(G.state.sync.dirty ? 'pending' : 'synced');
    if (G.state.sync.dirty) scheduleAfterCooldown();
  } else if (result.status === 'conflict') conflict(result.cloud);
  else if (result.status === 'offline') setStatus('pending');
  else failed(result.message);
}

async function adoptCloud(snapshot: CloudSnapshot, account: number, explicit = false): Promise<boolean> {
  pendingCloud = snapshot;
  if (!canApplyCloud()) {
    pendingCloud = snapshot;
    setStatus('pending', 'Tiến trình cloud sẽ được kiểm tra ở màn tiêu đề hoặc buổi sáng.');
    return false;
  }
  const state = G.state;
  const epoch = localEpoch;
  const decoded = await decompressSave(snapshot.data);
  const cloudState = migrate({ version: snapshot.schemaVersion, state: decoded as unknown as Record<string, unknown> });
  if (account !== accountEpoch || G.liveSnapshot) return false;
  if (!canApplyCloud()) { pendingCloud = snapshot; setStatus('pending'); return false; }
  if (epoch !== localEpoch || state !== G.state || (!explicit && G.state.sync.dirty && loadGame().status !== 'none')) {
    conflict(snapshot);
    return false;
  }
  // Preserve the replaced save even if it was previously marked clean.
  await saveDiscarded(structuredClone(G.state));
  if (account !== accountEpoch || G.liveSnapshot) return false;
  if (epoch !== localEpoch || state !== G.state) { conflict(snapshot); return false; }
  if (!canApplyCloud()) { pendingCloud = snapshot; setStatus('pending'); return false; }
  cloudState.sync = { ...cloudState.sync, deviceId: G.state.sync.deviceId, baseRevision: snapshot.revision, dirty: false, lastSyncedAt: snapshot.updatedAt ?? Date.now() };
  G.state = cloudState;
  saveGame(G.state, undefined, false);
  pendingCloud = pendingConflict = null;
  hasConflict = false;
  failures = 0;
  setStatus('synced');
  window.dispatchEvent(new Event('thdh-cloud-loaded'));
  return true;
}

/** Called on scene changes; no polling/network writes while an unsafe scene is active. */
export function applyPendingCloud(): void {
  if (pendingCloud && canApplyCloud()) void syncNow(true);
}

export async function resolveConflict(choice: 'local' | 'cloud'): Promise<void> {
  if (busy || G.liveSnapshot || !hasAuthHint()) return;
  busy = true;
  const account = accountEpoch;
  try {
    const snapshot = pendingConflict;
    if (!hasConflict) return;
    if (choice === 'cloud') {
      if (!snapshot) { setStatus('error', 'Bản cloud đã bị xóa. Hãy giữ bản trên máy.'); return; }
      await adoptCloud(snapshot, account, true);
    } else {
      if (snapshot) await saveDiscarded(await decompressSave(snapshot.data));
      if (account !== accountEpoch || G.liveSnapshot) return;
      G.state.sync.baseRevision = snapshot?.revision ?? 0;
      G.state.sync.dirty = true;
      hasConflict = false;
      pendingConflict = null;
      // A concurrent update creates a NEW conflict which must remain pending.
      await pushLocal(account);
    }
  } catch (error) {
    if (account === accountEpoch) setStatus('error', error instanceof Error ? error.message : 'Không chọn được bản lưu.');
  } finally {
    busy = false;
  }
}

export function enableOnlineRetry(): void {
  window.addEventListener('online', () => { void syncNow(false); });
}

export function localSaveChanged(state: GameState): void {
  if (G.liveSnapshot || !state.sync.dirty) return;
  localEpoch += 1;
  if (hasConflict) return;
  if (pendingCloud) { conflict(pendingCloud); return; }
  setStatus(cloudSaveEnabled() && hasAuthHint() ? 'pending' : 'guest');
  void syncNow(false);
}
