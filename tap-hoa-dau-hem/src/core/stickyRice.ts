import { DATA, product } from './data';
import { formatClock, type CookedRice, type GameState, type SoakBatch, type StoreData } from './state';
import { takeLots } from './stock';

/** Nguyên liệu ảo trong công thức xôi: lấy từ `cookedRice` thay vì từ kho. */
export const COOKED_RICE_ID = 'nep_chin';
const RAW_RICE_ID = 'nep';
const DAY_MINUTES = 24 * 60;

const cfg = () => DATA.balance.stickyRice;

/** Phút game tuyệt đối (ngày × 1440 + phút) để so thời gian qua đêm. */
export function absoluteMinute(day: number, minute: number): number {
  return day * DAY_MINUTES + minute;
}

export type SoakStatus =
  | { kind: 'soaking'; minutesLeft: number }
  | { kind: 'ready'; minutesToSpoil: number }
  | { kind: 'spoiled' };

export function soakStatus(batch: SoakBatch, day: number, minute: number): SoakStatus {
  const soaked = absoluteMinute(day, minute) - absoluteMinute(batch.startDay, batch.startMinute);
  if (soaked > cfg().soakMaxMinutes) return { kind: 'spoiled' };
  if (soaked < cfg().soakMinMinutes) return { kind: 'soaking', minutesLeft: cfg().soakMinMinutes - soaked };
  return { kind: 'ready', minutesToSpoil: cfg().soakMaxMinutes - soaked };
}

/** Sức chứa ngâm (kg) theo số thùng ngâm đang đặt ở tiệm. */
export function soakCapacity(store: StoreData): number {
  return store.fixtures.filter((f) => f.type === 'thung_ngam').length * cfg().kgPerSoakTank;
}

export function soakingKg(store: StoreData): number {
  return store.soakBatches.reduce((sum, batch) => sum + batch.kg, 0);
}

export type SoakResult = { ok: true; batch: SoakBatch } | { ok: false; reason: 'tank' | 'capacity' | 'rice' | 'quantity' };

/** Đặt một mẻ ngâm, trừ nếp trong kho tiệm theo FEFO. */
export function startSoak(state: GameState, store: StoreData, kg: number): SoakResult {
  if (!Number.isInteger(kg) || kg <= 0) return { ok: false, reason: 'quantity' };
  const capacity = soakCapacity(store);
  if (capacity <= 0) return { ok: false, reason: 'tank' };
  if (soakingKg(store) + kg > capacity) return { ok: false, reason: 'capacity' };
  const have = store.warehouse.reduce((n, lot) => n + (lot.productId === RAW_RICE_ID ? lot.qty : 0), 0);
  if (have < kg) return { ok: false, reason: 'rice' };
  takeLots(store, RAW_RICE_ID, kg);
  const batch: SoakBatch = { id: `soak-${state.day}-${state.clock}-${store.soakBatches.length + 1}`, kg, startDay: state.day, startMinute: state.clock };
  store.soakBatches.push(batch);
  store.today.journal.push({ m: state.clock, t: `Ngâm ${kg} kg nếp` });
  return { ok: true, batch };
}

export type SteamResult =
  | { ok: true; rice: CookedRice }
  | { ok: false; reason: 'steamer' | 'missing' | 'soaking' | 'spoiled'; minutesLeft?: number };

/** Hấp một mẻ đã ngâm đủ ra nếp chín; `quality` lấy từ mini-game hấp (0.75–1.25). */
export function steamBatch(state: GameState, store: StoreData, batchId: string, quality = 1): SteamResult {
  if (!store.fixtures.some((f) => f.type === 'xung_hap')) return { ok: false, reason: 'steamer' };
  const batch = store.soakBatches.find((item) => item.id === batchId);
  if (!batch) return { ok: false, reason: 'missing' };
  const status = soakStatus(batch, state.day, state.clock);
  if (status.kind === 'soaking') return { ok: false, reason: 'soaking', minutesLeft: status.minutesLeft };
  if (status.kind === 'spoiled') return { ok: false, reason: 'spoiled' };
  store.soakBatches = store.soakBatches.filter((item) => item.id !== batchId);
  const rice: CookedRice = {
    portions: batch.kg * cfg().portionsPerKg,
    cookedDay: state.day,
    cookedMinute: state.clock,
    quality: Math.max(0.75, Math.min(1.25, quality)),
  };
  store.cookedRice.push(rice);
  store.today.journal.push({ m: state.clock, t: `Hấp ${batch.kg} kg nếp → ${rice.portions} phần nếp chín` });
  return { ok: true, rice };
}

export function isWarm(rice: CookedRice, day: number, minute: number): boolean {
  return absoluteMinute(day, minute) - absoluteMinute(rice.cookedDay, rice.cookedMinute) < cfg().warmMinutes;
}

/** Phút còn nóng của mẻ (0 = đã nguội). */
export function warmMinutesLeft(rice: CookedRice, day: number, minute: number): number {
  return Math.max(0, cfg().warmMinutes - (absoluteMinute(day, minute) - absoluteMinute(rice.cookedDay, rice.cookedMinute)));
}

export function cookedPortions(store: StoreData): number {
  return store.cookedRice.reduce((sum, rice) => sum + rice.portions, 0);
}

/** Lấy `qty` phần nếp chín, mẻ cũ nhất trước. Trả chất lượng thấp nhất và việc có dùng nếp nguội không; null nếu thiếu. */
export function takeCookedRice(store: StoreData, qty: number, day: number, minute: number): { quality: number; cold: boolean } | null {
  if (cookedPortions(store) < qty) return null;
  store.cookedRice.sort((a, b) => absoluteMinute(a.cookedDay, a.cookedMinute) - absoluteMinute(b.cookedDay, b.cookedMinute));
  let left = qty;
  let quality = Infinity;
  let cold = false;
  for (const rice of store.cookedRice) {
    if (left <= 0) break;
    if (rice.portions <= 0) continue;
    const used = Math.min(rice.portions, left);
    rice.portions -= used;
    left -= used;
    quality = Math.min(quality, rice.quality);
    if (!isWarm(rice, day, minute)) cold = true;
  }
  store.cookedRice = store.cookedRice.filter((rice) => rice.portions > 0);
  return { quality: Number.isFinite(quality) ? quality : 1, cold };
}

/** Chất lượng món làm từ nếp: nếp nguội bị chặn ở mức "Tạm được". */
export function riceDishQuality(dishQuality: number, rice: { quality: number; cold: boolean }): number {
  const q = (dishQuality + rice.quality) / 2;
  return rice.cold ? Math.min(q, cfg().coldQualityCap) : q;
}

/**
 * Cuối ngày: nếp chín còn lại hỏng; mẻ ngâm quá hạn cũng hỏng. Ghi vào hàng hỏng của ngày.
 * Trả số phần nếp chín và số kg nếp ngâm bị bỏ.
 */
export function spoilRiceEndOfDay(state: GameState, store: StoreData): { portions: number; soakKg: number } {
  const portions = cookedPortions(store);
  if (portions > 0) {
    const cost = product(COOKED_RICE_ID).cost;
    store.today.spoiled[COOKED_RICE_ID] = (store.today.spoiled[COOKED_RICE_ID] ?? 0) + portions;
    store.today.spoiledCost += portions * cost;
    store.today.journal.push({ m: state.clock, t: `Bỏ ${portions} phần nếp chín còn thừa cuối ngày` });
  }
  store.cookedRice = [];
  const soakKg = discardSpoiledSoaks(state, store);
  return { portions, soakKg };
}

/** Loại các mẻ ngâm đã quá thời gian tối đa (bị chua). */
export function discardSpoiledSoaks(state: GameState, store: StoreData): number {
  let kg = 0;
  store.soakBatches = store.soakBatches.filter((batch) => {
    if (soakStatus(batch, state.day, state.clock).kind !== 'spoiled') return true;
    kg += batch.kg;
    return false;
  });
  if (kg > 0) {
    store.today.spoiled[RAW_RICE_ID] = (store.today.spoiled[RAW_RICE_ID] ?? 0) + kg;
    store.today.spoiledCost += kg * product(RAW_RICE_ID).cost;
    store.today.journal.push({ m: state.clock, t: `${kg} kg nếp ngâm quá lâu bị chua, phải bỏ` });
  }
  return kg;
}

export function soakLabel(batch: SoakBatch, day: number, minute: number): string {
  const status = soakStatus(batch, day, minute);
  if (status.kind === 'spoiled') return `${batch.kg} kg · đã chua`;
  if (status.kind === 'soaking') return `${batch.kg} kg · còn ${Math.floor(status.minutesLeft / 60)}g${String(status.minutesLeft % 60).padStart(2, '0')}`;
  return `${batch.kg} kg · sẵn sàng hấp (ngâm từ ${formatClock(batch.startMinute)})`;
}

/**
 * Gợi ý số kg ngâm cho ngày mai ở tiệm xôi: theo số món xôi bán hôm nay (tối thiểu 2 kg),
 * trong giới hạn thùng ngâm còn trống và nếp đang có. 0 = không ngâm được.
 */
export function suggestSoakKg(store: StoreData): number {
  const dishes = new Set(DATA.recipes.filter((r) => r.ingredients[COOKED_RICE_ID]).map((r) => r.output));
  const sold = Object.entries(store.today.sold).reduce((n, [id, qty]) => n + (dishes.has(id) ? qty : 0), 0);
  const want = Math.max(2, Math.ceil(sold / cfg().portionsPerKg));
  const free = soakCapacity(store) - soakingKg(store);
  const rice = store.warehouse.reduce((n, lot) => n + (lot.productId === RAW_RICE_ID ? lot.qty : 0), 0);
  return Math.max(0, Math.min(want, free, rice));
}
