import type { LiveCommandEnvelope, LiveShopAggregate, LiveShopCommand } from '../core/liveSession';
import { cloudSaveEnabled, getFirebase } from './firebase';
import { G, setLiveSnapshot } from '../game';

const env = import.meta.env as ImportMetaEnv & Record<string, string | undefined>;
const REGION = 'asia-southeast1';
let liveUnsubscribe: (() => void) | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let deviceId = '';
let commandQueue = Promise.resolve();
let emulatorConnected = false;

export interface LiveShopSnapshot extends LiveShopAggregate {
  simulatedAtMs: number;
}

export interface LiveCommandResponse {
  sequence: number;
  result: unknown;
}

export function liveShopEnabled(): boolean {
  return cloudSaveEnabled() && env.VITE_LIVE_SESSION === 'on';
}

export async function openLiveShop(): Promise<LiveShopSnapshot> {
  const { app, auth } = await getFirebase();
  if (!auth.currentUser) throw new Error('Bạn cần đăng nhập Google để mở phiên chung.');
  const { httpsCallable } = await import('firebase/functions');
  const functions = await getFunctions(app);
  const call = httpsCallable(functions, 'openSharedShop');
  const response = await call({});
  return parseSnapshot(response.data);
}

/** Join the UID's shared shop and keep this client subscribed while the app is open. */
export async function joinLiveShop(): Promise<LiveShopSnapshot> {
  const snapshot = await openLiveShop();
  const { auth } = await getFirebase();
  const userDeviceId = auth.currentUser?.uid ? G.state.sync.deviceId : '';
  if (!userDeviceId) throw new Error('Thiết bị chưa có mã định danh.');
  deviceId = userDeviceId;
  liveUnsubscribe?.();
  liveUnsubscribe = await subscribeLiveShop((next) => {
    if (!G.liveSnapshot || next.sequence >= G.liveSnapshot.sequence) setLiveSnapshot(next);
  }, (error) => window.dispatchEvent(new CustomEvent('thdh-live-error', { detail: error.message })));
  setLiveSnapshot(snapshot);
  return snapshot;
}

export function startLivePulses(): void {
  if (!G.liveSnapshot || !deviceId || heartbeat) return;
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (!document.hidden) void pulseLiveShop(deviceId).catch((error) => {
      window.dispatchEvent(new CustomEvent('thdh-live-error', { detail: error instanceof Error ? error.message : 'Không kết nối được phiên chung.' }));
    });
  }, 5000);
}

export function stopLivePulses(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

export function leaveLiveShop(): void {
  suspendLiveShop();
  deviceId = '';
  setLiveSnapshot(null);
}

export function suspendLiveShop(): void {
  liveUnsubscribe?.();
  liveUnsubscribe = null;
  stopLivePulses();
}

/** Serialize this device's writes; Firestore remains the cross-device source of truth. */
export function dispatchLiveCommand(command: LiveShopCommand): Promise<boolean> {
  if (!G.liveSnapshot || !deviceId) return Promise.resolve(false);
  if (typeof navigator !== 'undefined' && !navigator.onLine) return Promise.reject(new Error('Mất kết nối. Thao tác phiên chung đang khóa cho tới khi mạng hoạt động lại.'));
  const sequence = G.liveSnapshot.sequence;
  const task = commandQueue.then(() => sendLiveCommand(deviceId, G.liveSnapshot?.sequence ?? sequence, command));
  commandQueue = task.then(() => undefined, () => undefined);
  return task.then(() => true);
}

export async function sendLiveCommand(
  deviceId: string,
  observedSequence: number,
  command: LiveShopCommand,
): Promise<LiveCommandResponse> {
  const { app, auth } = await getFirebase();
  if (!auth.currentUser) throw new Error('Bạn cần đăng nhập Google để gửi thao tác.');
  const { httpsCallable } = await import('firebase/functions');
  const functions = await getFunctions(app);
  const envelope: LiveCommandEnvelope = {
    commandId: newCommandId(),
    deviceId,
    observedSequence,
    command,
  };
  const response = await httpsCallable(functions, 'submitShopCommand')(envelope);
  return response.data as LiveCommandResponse;
}

export async function pulseLiveShop(deviceId: string): Promise<{ sequence: number; serverNowMs: number }> {
  const { app, auth } = await getFirebase();
  if (!auth.currentUser) throw new Error('Bạn cần đăng nhập Google để đồng bộ phiên chung.');
  const { httpsCallable } = await import('firebase/functions');
  const functions = await getFunctions(app);
  const response = await httpsCallable(functions, 'pulseSharedShop')({ deviceId });
  return response.data as { sequence: number; serverNowMs: number };
}

export async function subscribeLiveShop(
  onSnapshot: (snapshot: LiveShopSnapshot) => void,
  onError: (error: Error) => void,
): Promise<() => void> {
  const { auth, db, firestoreSdk } = await getFirebase();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Bạn cần đăng nhập Google để nghe phiên chung.');
  const ref = firestoreSdk.doc(db, 'users', uid, 'live', 'main');
  return firestoreSdk.onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      onError(new Error('Phiên chơi realtime chưa được tạo.'));
      return;
    }
    try {
      onSnapshot(parseSnapshot(snapshot.data()));
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Snapshot phiên chung không hợp lệ.'));
    }
  }, onError);
}

async function getFunctions(app: Awaited<ReturnType<typeof getFirebase>>['app']) {
  const sdk = await import('firebase/functions');
  const functions = sdk.getFunctions(app, REGION);
  if (import.meta.env.DEV && env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorConnected) {
    sdk.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorConnected = true;
  }
  return functions;
}

function parseSnapshot(value: unknown): LiveShopSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Snapshot phiên chung không hợp lệ.');
  const snapshot = value as Partial<LiveShopSnapshot>;
  if (snapshot.schemaVersion !== 1 || !Number.isSafeInteger(snapshot.sequence) || !snapshot.state || !Number.isFinite(snapshot.simulatedAtMs)) {
    throw new Error('Snapshot phiên chung thiếu dữ liệu cần thiết.');
  }
  return snapshot as LiveShopSnapshot;
}

function newCommandId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
