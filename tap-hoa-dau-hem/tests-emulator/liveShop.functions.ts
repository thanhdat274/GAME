import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';

// Chạy bằng `npm run test:emulator` (Auth + Firestore + Functions Emulator). Không nằm trong `npm test`.
const PROJECT = 'demo-tap-hoa-dau-hem';
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const FUNCTIONS = 'http://127.0.0.1:5001';

let env: RulesTestEnvironment;
let seq = 0;

interface CallResult {
  ok: boolean;
  data?: any;
  status?: string;
}

async function signUp(): Promise<{ uid: string; token: string }> {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = await res.json();
  return { uid: body.localId, token: body.idToken };
}

async function call(name: string, data: unknown, token?: string): Promise<CallResult> {
  const res = await fetch(`${FUNCTIONS}/${PROJECT}/asia-southeast1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  return body.error ? { ok: false, status: body.error.status } : { ok: true, data: body.result };
}

function envelope(command: unknown, deviceId = 'device-a', commandId = `cmd-${Date.now()}-${seq++}`) {
  return { commandId, deviceId, observedSequence: 0, command };
}

async function liveSequence(uid: string): Promise<number | undefined> {
  let value: number | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), 'users', uid, 'live', 'main'));
    value = snap.data()?.sequence;
  });
  return value;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => env.clearFirestore());

describe('shared shop callables', () => {
  it('chưa đăng nhập bị từ chối', async () => {
    const res = await call('openSharedShop', {});
    expect(res).toMatchObject({ ok: false, status: 'UNAUTHENTICATED' });
  });

  it('mở phiên tạo live doc ở sequence 0, mở lại trả cùng phiên', async () => {
    const alice = await signUp();
    const first = await call('openSharedShop', {}, alice.token);
    expect(first.ok).toBe(true);
    expect(first.data.sequence).toBe(0);
    expect(first.data.state.phase).toBe('morning');
    const again = await call('openSharedShop', {}, alice.token);
    expect(again.data.sequence).toBe(0);
    expect(await liveSequence(alice.uid)).toBe(0);
  });

  it('command hợp lệ tăng sequence', async () => {
    const alice = await signUp();
    await call('openSharedShop', {}, alice.token);
    const res = await call('submitShopCommand', envelope({ type: 'setPreference', key: 'autoScan', value: true }), alice.token);
    expect(res.ok).toBe(true);
    expect(res.data.sequence).toBe(1);
    expect(await liveSequence(alice.uid)).toBe(1);
  });

  it('command trùng commandId chỉ áp dụng một lần', async () => {
    const alice = await signUp();
    await call('openSharedShop', {}, alice.token);
    const env1 = envelope({ type: 'setPreference', key: 'autoChange', value: true });
    const a = await call('submitShopCommand', env1, alice.token);
    const b = await call('submitShopCommand', { ...env1, deviceId: 'device-b' }, alice.token);
    expect(a.ok && b.ok).toBe(true);
    expect(b.data).toEqual(a.data);
    expect(await liveSequence(alice.uid)).toBe(1);
  });

  it('hai máy gửi đồng thời đều được tuần tự hóa, không mất lệnh', async () => {
    const alice = await signUp();
    await call('openSharedShop', {}, alice.token);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        call(
          'submitShopCommand',
          envelope({ type: 'setPreference', key: 'autoScan', value: i % 2 === 0 }, i % 2 ? 'device-b' : 'device-a'),
          alice.token,
        ),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const sequences = results.map((r) => r.data.sequence).sort((x, y) => x - y);
    expect(sequences).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await liveSequence(alice.uid)).toBe(6);
  });

  it('sai phase bị từ chối và không đổi trạng thái', async () => {
    const alice = await signUp();
    await call('openSharedShop', {}, alice.token);
    const scan = await call('submitShopCommand', envelope({ type: 'scanAll' }), alice.token);
    expect(scan).toMatchObject({ ok: false, status: 'FAILED_PRECONDITION' });
    const next = await call('submitShopCommand', envelope({ type: 'nextDay' }), alice.token);
    expect(next).toMatchObject({ ok: false, status: 'FAILED_PRECONDITION' });
    expect(await liveSequence(alice.uid)).toBe(0);
  });

  it('envelope sai định dạng bị từ chối', async () => {
    const alice = await signUp();
    const res = await call('submitShopCommand', { commandId: 'x', deviceId: 'd', observedSequence: 0, command: {} }, alice.token);
    expect(res).toMatchObject({ ok: false, status: 'INVALID_ARGUMENT' });
  });

  it('UID khác chỉ chạm phiên của chính mình', async () => {
    const alice = await signUp();
    const bob = await signUp();
    await call('openSharedShop', {}, alice.token);
    await call('submitShopCommand', envelope({ type: 'setPreference', key: 'autoScan', value: true }), alice.token);
    const bobRes = await call('submitShopCommand', envelope({ type: 'setPreference', key: 'autoScan', value: true }), bob.token);
    expect(bobRes.data.sequence).toBe(1);
    expect(await liveSequence(alice.uid)).toBe(1);
    expect(await liveSequence(bob.uid)).toBe(1);
  });

  it('pulse ở buổi sáng không tiến sequence, cần deviceId', async () => {
    const alice = await signUp();
    await call('openSharedShop', {}, alice.token);
    const pulse = await call('pulseSharedShop', { deviceId: 'device-a' }, alice.token);
    expect(pulse.data.sequence).toBe(0);
    const bad = await call('pulseSharedShop', {}, alice.token);
    expect(bad).toMatchObject({ ok: false, status: 'INVALID_ARGUMENT' });
  });

  it('mở tiệm rồi hai máy cùng pulse: DaySession chỉ tiến theo giờ server, không nhân đôi', async () => {
    const alice = await signUp();
    await call('openSharedShop', {}, alice.token);
    await call('submitShopCommand', envelope({ type: 'autoArrange' }), alice.token);
    const open = await call('submitShopCommand', envelope({ type: 'openShop' }), alice.token);
    expect(open.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1200));
    const [a, b] = await Promise.all([
      call('pulseSharedShop', { deviceId: 'device-a' }, alice.token),
      call('pulseSharedShop', { deviceId: 'device-b' }, alice.token),
    ]);
    expect(a.ok && b.ok).toBe(true);
    // Lần pulse thứ hai trong cùng khoảnh khắc gần như không có thời gian trôi thêm.
    const after = await liveSequence(alice.uid);
    expect(after! - open.data.sequence).toBeLessThanOrEqual(2);
    expect(after! - open.data.sequence).toBeGreaterThanOrEqual(1);
  });
});
