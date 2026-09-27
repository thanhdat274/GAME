import type { GameState } from '../core/state';
import { getFirebase } from './firebase';

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  photoURL: string | null;
  level: number;
  day: number;
  money: number;
  updatedAt: number | null;
}

export async function fetchTopLeaderboard(limitN = 10): Promise<LeaderboardEntry[]> {
  const { db, firestoreSdk } = await getFirebase();
  const q = firestoreSdk.query(
    firestoreSdk.collection(db, 'leaderboards'),
    firestoreSdk.orderBy('money', 'desc'),
    firestoreSdk.limit(limitN),
  );
  const snapshot = await firestoreSdk.getDocs(q);
  return snapshot.docs.map((doc: any) => parseEntry(doc.id, doc.data()));
}

/** Hạng của người chơi hiện tại (1 = cao nhất), null nếu chưa có trong bảng xếp hạng. */
export async function fetchMyRank(uid: string): Promise<{ entry: LeaderboardEntry; rank: number } | null> {
  const { db, firestoreSdk } = await getFirebase();
  const mineSnap = await firestoreSdk.getDoc(firestoreSdk.doc(db, 'leaderboards', uid));
  if (!mineSnap.exists()) return null;
  const entry = parseEntry(uid, mineSnap.data());
  const higherQuery = firestoreSdk.query(
    firestoreSdk.collection(db, 'leaderboards'),
    firestoreSdk.where('money', '>', entry.money),
  );
  const higherCount = await firestoreSdk.getCountFromServer(higherQuery);
  return { entry, rank: higherCount.data().count + 1 };
}

/**
 * Client tự ghi điểm (giống cơ chế cloud save): không qua Cloud Function nên chạy được ở gói
 * Firebase Spark miễn phí, đổi lại không có kiểm tra chéo với bản lưu thật — chấp nhận vì đây
 * là bảng xếp hạng vui/so tài, không phải mục đích cạnh tranh nghiêm ngặt.
 */
export async function submitLeaderboardEntry(state: GameState): Promise<void> {
  const { db, auth, firestoreSdk } = await getFirebase();
  const user = auth.currentUser;
  if (!user) return;
  await firestoreSdk.setDoc(firestoreSdk.doc(db, 'leaderboards', user.uid), {
    uid: user.uid,
    displayName: user.displayName ?? 'Ẩn danh',
    photoURL: user.photoURL ?? null,
    level: state.summary.level,
    day: state.summary.day,
    money: state.summary.money,
    updatedAt: firestoreSdk.serverTimestamp(),
  });
}

export async function deleteLeaderboardEntry(uid: string): Promise<void> {
  const { db, firestoreSdk } = await getFirebase();
  await firestoreSdk.deleteDoc(firestoreSdk.doc(db, 'leaderboards', uid));
}

function parseEntry(uid: string, value: any): LeaderboardEntry {
  return {
    uid,
    displayName: String(value?.displayName ?? 'Ẩn danh'),
    photoURL: value?.photoURL ?? null,
    level: Number(value?.level) || 1,
    day: Number(value?.day) || 1,
    money: Number(value?.money) || 0,
    updatedAt: value?.updatedAt?.toMillis?.() ?? null,
  };
}
