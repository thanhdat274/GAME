import { DATA } from './data';
import { counterFixture, walkTiles } from './layout';
import { fixtureOfShelf, type GameState } from './state';

/** Số giây người chơi đi một chiều từ quầy tới kệ `shelf` ở góc nhìn trên xuống (theo thời gian game). */
export function playerTripSeconds(state: GameState, shelf: number): number {
  const to = fixtureOfShelf(state, shelf);
  if (!to) return 0;
  let tiles = 0;
  try { tiles = walkTiles(state, counterFixture(state) ?? null, to); } catch { tiles = 0; }
  return tiles / DATA.balance.topDown.playerTilesPerSecond;
}
