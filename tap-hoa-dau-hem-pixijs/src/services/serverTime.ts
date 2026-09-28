import { getFirebase } from './firebase';

let offsetMs: number | null = null;

/** Fetch a server timestamp once per session; subsequent reads use the cached offset. */
export async function getServerNow(): Promise<number> {
  if (offsetMs !== null) return Date.now() + offsetMs;
  const { auth, db, firestoreSdk } = await getFirebase();
  const user = auth.currentUser;
  if (!user) throw new Error('Cần đăng nhập để lấy giờ máy chủ.');
  const ref = firestoreSdk.doc(db, 'users', user.uid, 'meta', 'clock');
  const before = Date.now();
  await firestoreSdk.setDoc(ref, { ping: firestoreSdk.serverTimestamp() });
  const result = await firestoreSdk.getDoc(ref);
  const serverMillis = result.data()?.ping?.toMillis?.();
  if (typeof serverMillis !== 'number') throw new Error('Không đọc được giờ máy chủ.');
  const after = Date.now();
  offsetMs = serverMillis - (before + after) / 2;
  return Date.now() + offsetMs;
}
