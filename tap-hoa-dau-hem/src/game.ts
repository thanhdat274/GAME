import { loadGame, saveGame, type LoadResult } from './core/save';
import { createNewGame, type GameState } from './core/state';
import { setSoundEnabled } from './ui/sound';

/** Trạng thái dùng chung giữa các scene. */
export const G: { state: GameState; loadError: string | null } = {
  state: createNewGame(),
  loadError: null,
};

export function persist(): void {
  saveGame(G.state);
}

export function tryLoad(): LoadResult {
  const res = loadGame();
  if (res.status === 'ok') {
    G.state = res.state;
    setSoundEnabled(G.state.settings.sound);
  } else if (res.status === 'corrupt') {
    G.loadError = res.error;
  }
  return res;
}

export function newGame(): void {
  const sound = G.state.settings.sound;
  G.state = createNewGame();
  G.state.settings.sound = sound;
  persist();
}

/** Scene tương ứng với pha hiện tại của bản lưu. */
export function sceneForPhase(): string {
  switch (G.state.phase) {
    case 'open':
      return 'Shop';
    case 'summary':
      return 'Summary';
    default:
      return 'Morning';
  }
}
