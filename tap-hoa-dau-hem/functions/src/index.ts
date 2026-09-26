import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger, setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createNewGame } from '../../src/core/state';
import { migrate } from '../../src/core/save';
import {
  advanceLiveShop,
  applyLiveShopCommand,
  createLiveShopAggregate,
  validateLiveCommandEnvelope,
  type LiveShopAggregate,
} from '../../src/core/liveSession';
import { compressSave, decompressSave } from '../../src/core/compress';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'asia-southeast1';
const MAX_LIVE_BYTES = 850_000;
const MAX_ADVANCE_SECONDS = 5;
const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

setGlobalOptions({ region: REGION, maxInstances: 10 });

export const openSharedShop = onCall(async (request) => {
  const uid = requireUid(request.auth?.uid);
  const now = Date.now();
  const refs = userRefs(uid);
  return db.runTransaction(async (tx) => {
    const liveSnap = await tx.get(refs.live);
    if (liveSnap.exists) return publicSnapshot(liveSnap.data()!);
    const saveSnap = await tx.get(refs.save);
    const aggregate = await aggregateFromSave(saveSnap.data());
    assertPayloadSize(aggregate);
    tx.create(refs.live, {
      ...aggregate,
      simulatedAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
    return publicSnapshot({ ...aggregate, simulatedAtMs: now });
  });
});

export const submitShopCommand = onCall(async (request) => {
  const uid = requireUid(request.auth?.uid);
  if (!validateLiveCommandEnvelope(request.data)) throw new HttpsError('invalid-argument', 'Thao tác gửi lên không hợp lệ.');
  const envelope = request.data;
  const refs = userRefs(uid);
  const receipt = refs.live.collection('commands').doc(envelope.commandId);
  const now = Date.now();

  try {
    return await db.runTransaction(async (tx) => {
      const [liveSnap, receiptSnap, saveSnap] = await Promise.all([tx.get(refs.live), tx.get(receipt), tx.get(refs.save)]);
      if (receiptSnap.exists) return receiptSnap.data()!.response;
      let aggregate = liveSnap.exists
        ? parseAggregate(liveSnap.data()!)
        : await aggregateFromSave(saveSnap.data());
      let lastCheckpointSequence = Number(liveSnap.data()?.lastCheckpointSequence) || -1;
      const simulatedAtMs = liveSnap.exists ? Number(liveSnap.data()!.simulatedAtMs) : now;
      const elapsedSeconds = Math.max(0, Math.min(MAX_ADVANCE_SECONDS, (now - simulatedAtMs) / 1000));
      aggregate = advanceLiveShop(aggregate, elapsedSeconds);
      const applied = applyLiveShopCommand(aggregate, envelope.command);
      assertPayloadSize(applied.aggregate);
      const response = { sequence: applied.aggregate.sequence, result: applied.result };
      if (shouldCheckpoint(applied.aggregate, lastCheckpointSequence)) {
        await writeCheckpoint(tx, refs.save, saveSnap.data(), applied.aggregate);
        lastCheckpointSequence = applied.aggregate.sequence;
      }
      tx.set(refs.live, {
        ...applied.aggregate,
        simulatedAtMs: now,
        ...(lastCheckpointSequence >= 0 ? { lastCheckpointSequence } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(receipt, {
        deviceId: envelope.deviceId,
        observedSequence: envelope.observedSequence,
        response,
        expireAt: new Date(now + RECEIPT_TTL_MS),
      });
      return response;
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('Live shop command rejected', { uid, commandId: envelope.commandId, error });
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Không áp dụng được thao tác.');
  }
});

export const pulseSharedShop = onCall(async (request) => {
  const uid = requireUid(request.auth?.uid);
  const deviceId = request.data?.deviceId;
  if (typeof deviceId !== 'string' || deviceId.length < 1 || deviceId.length > 128) {
    throw new HttpsError('invalid-argument', 'Thiếu mã thiết bị.');
  }
  const refs = userRefs(uid);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const liveSnap = await tx.get(refs.live);
    let aggregate: LiveShopAggregate;
    let simulatedAtMs: number;
    if (liveSnap.exists) {
      aggregate = parseAggregate(liveSnap.data()!);
      simulatedAtMs = Number(liveSnap.data()!.simulatedAtMs) || now;
    } else {
      aggregate = await aggregateFromSave((await tx.get(refs.save)).data());
      simulatedAtMs = now;
    }
    const elapsedSeconds = Math.max(0, Math.min(MAX_ADVANCE_SECONDS, (now - simulatedAtMs) / 1000));
    const advanced = advanceLiveShop(aggregate, elapsedSeconds);
    let lastCheckpointSequence = Number(liveSnap.data()?.lastCheckpointSequence) || -1;
    const checkpoint = shouldCheckpoint(advanced, lastCheckpointSequence);
    if (checkpoint) {
      const saveSnap = await tx.get(refs.save);
      await writeCheckpoint(tx, refs.save, saveSnap.data(), advanced);
      lastCheckpointSequence = advanced.sequence;
    }
    if (!liveSnap.exists || advanced.sequence !== aggregate.sequence || checkpoint) {
      assertPayloadSize(advanced);
      tx.set(refs.live, {
        ...advanced,
        simulatedAtMs: now,
        ...(lastCheckpointSequence >= 0 ? { lastCheckpointSequence } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { sequence: advanced.sequence, serverNowMs: now, deviceId };
  });
});

async function aggregateFromSave(save: FirebaseFirestore.DocumentData | undefined): Promise<LiveShopAggregate> {
  if (!save?.data || typeof save.data !== 'string') return createLiveShopAggregate(createNewGame());
  const decoded = await decompressSave(save.data);
  const state = migrate({ version: Number(save.schemaVersion) || 1, state: decoded as unknown as Record<string, unknown> });
  return createLiveShopAggregate(state);
}

function parseAggregate(value: FirebaseFirestore.DocumentData): LiveShopAggregate {
  const aggregate = value as LiveShopAggregate;
  if (aggregate.schemaVersion !== 1 || !Number.isSafeInteger(aggregate.sequence) || !aggregate.state) {
    throw new HttpsError('data-loss', 'Phiên tiệm trên cloud không hợp lệ.');
  }
  return aggregate;
}

function publicSnapshot(value: FirebaseFirestore.DocumentData | LiveShopAggregate & { simulatedAtMs: number }) {
  return {
    schemaVersion: value.schemaVersion,
    sequence: value.sequence,
    state: value.state,
    dayRuntime: value.dayRuntime,
    simulatedAtMs: Number(value.simulatedAtMs) || Date.now(),
  };
}

function userRefs(uid: string) {
  const user = db.collection('users').doc(uid);
  const live = user.collection('live').doc('main');
  return { live, save: user.collection('saves').doc('main') };
}

function shouldCheckpoint(aggregate: LiveShopAggregate, lastCheckpointSequence: number): boolean {
  return aggregate.state.phase === 'summary' && aggregate.sequence > lastCheckpointSequence;
}

async function writeCheckpoint(
  tx: FirebaseFirestore.Transaction,
  saveRef: FirebaseFirestore.DocumentReference,
  current: FirebaseFirestore.DocumentData | undefined,
  aggregate: LiveShopAggregate,
): Promise<void> {
  const state = aggregate.state;
  const data = await compressSave(state);
  if (Buffer.byteLength(data, 'utf8') >= 900_000) {
    throw new HttpsError('resource-exhausted', 'Bản checkpoint vượt giới hạn lưu cloud.');
  }
  tx.set(saveRef, {
    schemaVersion: state.version,
    revision: (Number(current?.revision) || 0) + 1,
    deviceId: state.sync.deviceId,
    summary: state.summary,
    data,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function requireUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Bạn cần đăng nhập Google.');
  return uid;
}

function assertPayloadSize(aggregate: LiveShopAggregate): void {
  const bytes = Buffer.byteLength(JSON.stringify(aggregate), 'utf8');
  if (bytes > MAX_LIVE_BYTES) throw new HttpsError('resource-exhausted', 'Phiên chơi vượt giới hạn dữ liệu.');
}
