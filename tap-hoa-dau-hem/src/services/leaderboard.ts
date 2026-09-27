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
