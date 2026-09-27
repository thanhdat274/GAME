import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

// Chạy bằng `npm run test:emulator` (Firebase Emulator). Không nằm trong `npm test`.
let env: RulesTestEnvironment;

const save = (revision: number, data = 'lz-save') => ({
  schemaVersion: 5,
  revision,
  deviceId: 'device-a',
  summary: { level: 3, day: 5, money: 1000 },
  data,
  updatedAt: serverTimestamp(),
});

const board = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  displayName: 'Chủ tiệm',
  photoURL: null,
  level: 3,
  day: 5,
  money: 1000,
  updatedAt: serverTimestamp(),
  ...extra,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-tap-hoa-dau-hem',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => env.clearFirestore());

async function seedSave(uid: string, revision: number) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid, 'saves', 'main'), save(revision));
  });
}

describe('cloud save rules', () => {
  it('chủ bản lưu tạo revision 1 được', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'users', 'alice', 'saves', 'main'), save(1)));
  });

  it('tạo mới với revision khác 1 bị chặn', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users', 'alice', 'saves', 'main'), save(2)));
  });

  it('chưa đăng nhập không đọc/ghi được', async () => {
    await seedSave('alice', 1);
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', 'alice', 'saves', 'main')));
    await assertFails(setDoc(doc(db, 'users', 'alice', 'saves', 'main'), save(1)));
  });

  it('đọc chéo và ghi chéo tài khoản khác bị chặn', async () => {
    await seedSave('alice', 1);
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(db, 'users', 'alice', 'saves', 'main')));
    await assertFails(setDoc(doc(db, 'users', 'alice', 'saves', 'main'), save(2)));
  });

  it('cập nhật đúng revision+1 qua transaction giống client', async () => {
    await seedSave('alice', 3);
    const db = env.authenticatedContext('alice').firestore();
    const ref = doc(db, 'users', 'alice', 'saves', 'main');
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const current = await tx.get(ref);
        tx.set(ref, save(Number(current.data()?.revision) + 1));
      }),
    );
  });

  it('ghi sai revision (giữ nguyên hoặc nhảy cóc) bị chặn', async () => {
    await seedSave('alice', 3);
    const db = env.authenticatedContext('alice').firestore();
    const ref = doc(db, 'users', 'alice', 'saves', 'main');
    await assertFails(setDoc(ref, save(3)));
    await assertFails(setDoc(ref, save(5)));
    await assertFails(setDoc(ref, save(2)));
  });

  it('bản lưu quá 900 KB hoặc data không phải chuỗi bị chặn', async () => {
    const db = env.authenticatedContext('alice').firestore();
    const ref = doc(db, 'users', 'alice', 'saves', 'main');
    await assertFails(setDoc(ref, save(1, 'x'.repeat(900_001))));
    await assertFails(setDoc(ref, { ...save(1), data: { nested: true } }));
  });

  it('các collection khác dưới users/{uid} bị chặn', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'users', 'alice', 'other', 'x'), { a: 1 }));
  });
});

describe('meta/clock', () => {
  it('chỉ chủ ghi ping kiểu timestamp', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'users', 'alice', 'meta', 'clock'), { ping: serverTimestamp() }));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'meta', 'clock'), { ping: 123 }));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(setDoc(doc(bob, 'users', 'alice', 'meta', 'clock'), { ping: Timestamp.now() }));
  });
});

describe('live session', () => {
  it('client chỉ đọc live của mình, không ghi', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'alice', 'live', 's1'), { phase: 'open' });
    });
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'live', 's1')));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'live', 's1'), { phase: 'closed' }));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(doc(bob, 'users', 'alice', 'live', 's1')));
  });
});

describe('leaderboards', () => {
  it('người đăng nhập đọc được, khách thì không', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'leaderboards', 'alice'), board('alice'));
    });
    await assertSucceeds(getDoc(doc(env.authenticatedContext('bob').firestore(), 'leaderboards', 'alice')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'leaderboards', 'alice')));
  });

  it('chỉ ghi điểm của chính mình với dữ liệu hợp lệ', async () => {
    const alice = env.authenticatedContext('alice').firestore();
    await assertSucceeds(setDoc(doc(alice, 'leaderboards', 'alice'), board('alice')));
    await assertFails(setDoc(doc(alice, 'leaderboards', 'bob'), board('bob')));
    await assertFails(setDoc(doc(alice, 'leaderboards', 'alice'), board('bob')));
    await assertFails(setDoc(doc(alice, 'leaderboards', 'alice'), board('alice', { level: 0 })));
    await assertFails(setDoc(doc(alice, 'leaderboards', 'alice'), board('alice', { money: -1 })));
    await assertFails(setDoc(doc(alice, 'leaderboards', 'alice'), board('alice', { displayName: 'x'.repeat(60) })));
  });
});
