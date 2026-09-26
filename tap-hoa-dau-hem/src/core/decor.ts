import { DATA, decor, furniture, hasFeature } from './data';
import { placementError, type PlaceError } from './layout';
import type { GameState } from './state';

/** Điểm thu hút = tổng điểm trang trí (tường, biển, quầy, đặt sàn), tối đa 100. */
export function attraction(state: GameState): number {
  let total = 0;
  for (const id of state.decorOwned) total += decor(id).attraction;
  for (const f of state.fixtures) if (furniture(f.type).kind === 'decor') total += decor(f.type).attraction;
  return Math.min(DATA.balance.attraction.max, total);
}

/** Hệ số sinh khách theo thu hút: 1 + thu hút / 400 (tối đa +25%). */
export function attractionMultiplier(state: GameState): number {
  return 1 + attraction(state) / DATA.balance.attraction.divisor;
}

export function hasCat(state: GameState): boolean {
  return state.decorOwned.some((id) => decor(id).cat);
}

export type BuyDecorResult = 'ok' | 'level' | 'money' | 'owned' | 'exclusive' | PlaceError;

/** Mua đồ trang trí. Đồ đặt sàn cần vị trí trên lưới; đồ tường/biển/quầy vào danh sách sở hữu. */
export function buyDecor(state: GameState, id: string, at?: { x: number; y: number }): BuyDecorResult {
  const d = decor(id);
  if (d.exclusive) return 'exclusive';
  if (state.level < d.unlockLevel || !hasFeature(state.level, 'decor')) return 'level';
  if (d.slot !== 'floor' && state.decorOwned.includes(id)) return 'owned';
  if (state.money < d.cost) return 'money';
  if (d.slot === 'floor') {
    if (!at) return 'bounds';
    const error = placementError(state, id, at.x, at.y, 0);
    if (error) return error;
    state.fixtures.push({ uid: state.nextUid++, type: id, x: at.x, y: at.y, rot: 0 });
  } else {
    // Mỗi tiệm chỉ có một biển hiệu: đổi biển thì bỏ biển cũ.
    if (d.slot === 'sign') state.decorOwned = state.decorOwned.filter((other) => decor(other).slot !== 'sign');
    state.decorOwned.push(id);
  }
  state.money -= d.cost;
  return 'ok';
}

/** Bán lại đồ trang trí tường/biển với 50% giá; đồ độc quyền không bán. */
export function sellDecor(state: GameState, id: string): boolean {
  const d = decor(id);
  if (d.exclusive || !state.decorOwned.includes(id)) return false;
  state.decorOwned = state.decorOwned.filter((other) => other !== id);
  state.money += Math.floor(d.cost * DATA.balance.sellBackRatio);
  return true;
}

/** Biển hiệu đang treo (để đổi mặt tiền). */
export function currentSign(state: GameState): string | null {
  return state.decorOwned.find((id) => decor(id).slot === 'sign') ?? null;
}
