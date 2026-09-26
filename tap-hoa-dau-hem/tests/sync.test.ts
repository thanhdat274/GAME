import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame, type GameState } from '../src/core/state';
import type { CloudSnapshot } from '../src/services/cloudSave';

const mocks = vi.hoisted(() => ({
  pull: vi.fn(), push: vi.fn(), decode: vi.fn(), discarded: vi.fn(),
  firebase: vi.fn(), hint: vi.fn(), enabled: vi.fn(), load: vi.fn(), save: vi.fn(),
  G: { state: null as unknown as GameState, liveSnapshot: null as unknown },
}));
vi.mock('../src/game', () => ({ G: mocks.G }));
vi.mock('../src/services/auth', () => ({ finishRedirectSignIn: vi.fn() }));
vi.mock('../src/services/firebase', () => ({ getFirebase: mocks.firebase, hasAuthHint: mocks.hint, cloudSaveEnabled: mocks.enabled }));
vi.mock('../src/services/cloudSave', () => ({ pull: mocks.pull, push: mocks.push, decompressSave: mocks.decode, saveDiscarded: mocks.discarded }));
vi.mock('../src/core/save', async (original) => ({ ...await original<object>(), loadGame: mocks.load, saveGame: mocks.save }));

let sync: typeof import('../src/services/sync');
let authChange: (user: unknown) => Promise<void>;
let safe: boolean;
const cloud = (revision = 2): CloudSnapshot => ({ schemaVersion: 2, revision, deviceId: 'other', summary: { level: 3, day: 8, money: 900000, playSeconds: 100 }, data: 'packed', updatedAt: 1000 });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(100_000);
  vi.stubGlobal('window', new EventTarget());
  mocks.G.state = createNewGame(); mocks.G.liveSnapshot = null;
  mocks.G.state.sync.baseRevision = 1; mocks.G.state.sync.dirty = false;
  mocks.hint.mockReturnValue(true); mocks.enabled.mockReturnValue(true);
  mocks.load.mockImplementation(() => ({ status: 'ok', state: mocks.G.state }));
  mocks.save.mockReturnValue(true);
  mocks.pull.mockResolvedValue({ status: 'ok', value: cloud() });
  mocks.push.mockResolvedValue({ status: 'ok', value: 3 });
  mocks.decode.mockImplementation(async () => ({ ...createNewGame(), day: 8, level: 3 }));
  mocks.discarded.mockResolvedValue(undefined);
  mocks.firebase.mockResolvedValue({ auth: {}, authSdk: { onAuthStateChanged: (_auth: unknown, cb: typeof authChange) => { authChange = cb; } } });
  sync = await import('../src/services/sync');
  safe = true; sync.configureCloudApplyGuard(() => safe);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('startup D7', () => {
  it('uploads local when cloud is empty', async () => {
    mocks.pull.mockResolvedValue({ status: 'ok', value: null });
    await sync.syncNow();
    expect(mocks.push.mock.calls[0][0].sync.baseRevision).toBe(0);
    expect(sync.getSyncStatus()).toBe('synced');
  });
  it('adopts cloud on a new device and retains device identity', async () => {
    mocks.load.mockReturnValue({ status: 'none' }); mocks.G.state.sync.dirty = true;
    const deviceId = mocks.G.state.sync.deviceId;
    await sync.syncNow();
    expect(mocks.G.state.day).toBe(8);
    expect(mocks.G.state.sync).toMatchObject({ deviceId, baseRevision: 2, dirty: false });
  });
  it('pushes dirty local with matching revision', async () => {
    mocks.G.state.sync.dirty = true; mocks.pull.mockResolvedValue({ status: 'ok', value: cloud(1) });
    await sync.syncNow(); expect(mocks.push).toHaveBeenCalledOnce();
  });
  it('does not write a clean matching save', async () => {
    mocks.pull.mockResolvedValue({ status: 'ok', value: cloud(1) });
    await sync.syncNow(); await sync.syncNow();
    expect(mocks.push).not.toHaveBeenCalled(); expect(sync.getSyncStatus()).toBe('synced');
  });
  it('adopts a newer cloud at a safe boundary', async () => {
    await sync.syncNow(); expect(mocks.G.state.day).toBe(8);
    expect(mocks.discarded).toHaveBeenCalledOnce();
  });
  it.each([0, 2])('preserves a conflict with cloud revision %s', async (revision) => {
    mocks.G.state.sync.dirty = true; mocks.pull.mockResolvedValue({ status: 'ok', value: cloud(revision) });
    await sync.syncNow(); sync.localSaveChanged(mocks.G.state); await sync.syncNow();
    expect(sync.getSyncStatus()).toBe('conflict'); expect(mocks.push).not.toHaveBeenCalled();
  });
  it('does not overwrite either save if local storage is corrupt', async () => {
    mocks.load.mockReturnValue({ status: 'corrupt', error: 'invalid' });
    await sync.syncNow(); expect(sync.getSyncStatus()).toBe('error');
    expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.decode).not.toHaveBeenCalled();
  });
  it('retries reconciliation on reconnect after offline startup', async () => {
    mocks.pull.mockResolvedValueOnce({ status: 'offline' });
    sync.enableOnlineRetry(); await sync.syncNow();
    expect(sync.getSyncStatus()).toBe('pending');
    window.dispatchEvent(new Event('online')); await flush();
    expect(mocks.pull).toHaveBeenCalledTimes(2); expect(mocks.G.state.day).toBe(8);
  });
});

describe('safe application and concurrent updates', () => {
  it('defers while selling, then applies on reaching title or morning', async () => {
    safe = false; await sync.syncNow(); expect(mocks.G.state.day).toBe(1);
    safe = true; sync.applyPendingCloud(); await flush(); expect(mocks.G.state.day).toBe(8);
  });
  it('turns deferred adoption into a conflict if the player progresses', async () => {
    safe = false; await sync.syncNow(); mocks.G.state.sync.dirty = true;
    sync.localSaveChanged(mocks.G.state); safe = true; sync.applyPendingCloud(); await flush();
    expect(sync.getSyncStatus()).toBe('conflict'); expect(mocks.G.state.day).toBe(1);
  });
  it('uses edits made while pull is pending', async () => {
    const pending = deferred<{ status: 'ok'; value: CloudSnapshot }>(); mocks.pull.mockReturnValue(pending.promise);
    const run = sync.syncNow(); mocks.G.state.sync.dirty = true; sync.localSaveChanged(mocks.G.state);
    pending.resolve({ status: 'ok', value: cloud() }); await run;
    expect(sync.getSyncStatus()).toBe('conflict');
  });
  it('checks the scene again after asynchronous decoding', async () => {
    const pending = deferred<GameState>(); mocks.decode.mockReturnValue(pending.promise);
    const run = sync.syncNow(); await flush(); safe = false;
    pending.resolve(createNewGame()); await run;
    expect(mocks.G.state.sync.baseRevision).toBe(1); expect(sync.getSyncStatus()).toBe('pending');
  });
  it('keeps changes made during push dirty and sends them after cooldown', async () => {
    mocks.G.state.sync.dirty = true; mocks.pull.mockResolvedValue({ status: 'ok', value: cloud(1) });
    const pending = deferred<{ status: 'ok'; value: number }>(); mocks.push.mockReturnValueOnce(pending.promise);
    const run = sync.syncNow(); await flush(); mocks.G.state.money += 500; sync.localSaveChanged(mocks.G.state);
    pending.resolve({ status: 'ok', value: 2 }); await run;
    expect(mocks.G.state.sync.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.push).toHaveBeenCalledTimes(2); expect(mocks.G.state.sync.dirty).toBe(false);
  });
  it('retains a second conflict from another device while resolving the first', async () => {
    mocks.G.state.sync.dirty = true; await sync.syncNow();
    mocks.push.mockResolvedValue({ status: 'conflict', cloud: cloud(3) });
    await sync.resolveConflict('local');
    expect(sync.getPendingConflict()?.revision).toBe(3); expect(sync.getSyncStatus()).toBe('conflict');
  });
  it('preserves local when saving the discarded copy fails', async () => {
    mocks.G.state.sync.dirty = true; await sync.syncNow();
    mocks.discarded.mockRejectedValue(new Error('quota'));
    await sync.resolveConflict('cloud');
    expect(mocks.G.state.day).toBe(1); expect(sync.getPendingConflict()).not.toBeNull();
  });
  it('does not apply a response after sign-out', async () => {
    await sync.startSync(); const pending = deferred<{ status: 'ok'; value: CloudSnapshot }>();
    mocks.pull.mockReturnValue(pending.promise); const run = authChange({ uid: 'a' });
    await authChange(null); pending.resolve({ status: 'ok', value: cloud() }); await run;
    expect(sync.getSyncStatus()).toBe('guest'); expect(mocks.G.state.day).toBe(1);
  });
  it('does not sync solo saves during authoritative live play', async () => {
    mocks.G.liveSnapshot = {}; await sync.syncNow(); expect(mocks.pull).not.toHaveBeenCalled();
  });
  it('reports three failures and recovers on manual retry', async () => {
    mocks.pull.mockRejectedValue(new Error('timeout'));
    await sync.syncNow(); await sync.syncNow(); await sync.syncNow();
    expect(sync.getSyncStatus()).toBe('error');
    mocks.pull.mockResolvedValue({ status: 'ok', value: cloud() }); await sync.syncNow();
    expect(sync.getSyncStatus()).toBe('synced');
  });
  it('never reports synced after failing to decode a newer cloud', async () => {
    mocks.decode.mockRejectedValue(new Error('invalid save'));
    await sync.syncNow(); await sync.syncNow(); await sync.syncNow();
    expect(sync.getSyncStatus()).toBe('error'); expect(mocks.G.state.day).toBe(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it('rate-limits failed automatic push attempts', async () => {
    mocks.G.state.sync.dirty = true; mocks.pull.mockResolvedValue({ status: 'ok', value: cloud(1) });
    mocks.push.mockResolvedValue({ status: 'offline' }); await sync.syncNow(false);
    sync.localSaveChanged(mocks.G.state); sync.localSaveChanged(mocks.G.state); await flush();
    expect(mocks.push).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.push).toHaveBeenCalledTimes(2);
  });
});
