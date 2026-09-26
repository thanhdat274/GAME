import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../src/core/state';

const mocks = vi.hoisted(() => ({
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  getFirebase: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../src/services/firebase', () => ({ getFirebase: mocks.getFirebase }));

import { pull, push } from '../src/services/cloudSave';

function setup(revision = 0) {
  const ref = { path: 'save-ref' };
  const db = {};
  const auth = { currentUser: { uid: 'user-1' } };
  const firestoreSdk = {
    doc: vi.fn(() => ref),
    getDoc: mocks.getDoc,
    runTransaction: mocks.runTransaction,
    serverTimestamp: vi.fn(() => 'server-time'),
  };
  mocks.getFirebase.mockResolvedValue({ db, auth, firestoreSdk });
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  mocks.runTransaction.mockImplementation(async (_db, operation) => operation({
    get: async () => ({ exists: () => revision > 0, data: () => ({ revision }) }),
    set: mocks.set,
  }));
  return { db, ref, auth, firestoreSdk };
}

describe('lưu cloud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { onLine: true });
    setup();
  });

  it('đẩy theo revision hiện tại và đánh dấu bản đã đồng bộ', async () => {
    setup(3);
    const state = createNewGame();
    state.sync.baseRevision = 3;
    const result = await push(state);
    expect(result).toEqual({ status: 'ok', value: 4 });
    expect(mocks.set).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ revision: 4, deviceId: state.sync.deviceId }));
    expect(state.sync).toMatchObject({ baseRevision: 4, dirty: false });
  });

  it('trả xung đột khi revision cloud đã đổi', async () => {
    setup(5);
    const state = createNewGame();
    state.sync.baseRevision = 4;
    const result = await push(state);
    expect(result).toMatchObject({ status: 'conflict', cloud: { revision: 5 } });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('tải snapshot và chuyển thời gian Firestore thành milliseconds', async () => {
    setup();
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ schemaVersion: 2, revision: 7, deviceId: 'device-2', summary: { level: 3 }, data: 'packed', updatedAt: { toMillis: () => 123456 } }),
    });
    expect(await pull()).toEqual({ status: 'ok', value: {
      schemaVersion: 2,
      revision: 7,
      deviceId: 'device-2',
      summary: { level: 3 },
      data: 'packed',
      updatedAt: 123456,
    } });
  });

  it('giữ bản local và báo offline nếu không có mạng', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const state = createNewGame();
    expect(await push(state)).toEqual({ status: 'offline' });
    expect(state.sync.dirty).toBe(true);
    expect(mocks.getFirebase).not.toHaveBeenCalled();
  });

  it('giới hạn pull ở timeout cấu hình', async () => {
    setup();
    mocks.getDoc.mockReturnValue(new Promise(() => {}));
    expect(await pull(5)).toEqual({ status: 'error', message: 'Cloud phản hồi quá lâu.' });
  });

  it('phân loại lỗi pull thành offline khi thiết bị mất mạng', async () => {
    setup();
    mocks.getDoc.mockRejectedValue(new Error('network unavailable'));
    vi.stubGlobal('navigator', { onLine: false });
    expect(await pull()).toEqual({ status: 'offline' });
  });
});
