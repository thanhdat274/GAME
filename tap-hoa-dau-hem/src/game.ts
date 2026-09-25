import { loadGame, saveGame, type LoadResult } from './core/save';
import { createNewGame, type GameState } from './core/state';
import { setSoundEnabled } from './ui/sound';
import { localSaveChanged } from './services/sync';

/** Trạng thái dùng chung giữa các scene. */
export const G: { state: GameState; loadError: string | null } = {
  state: createNewGame(),
  loadError: null,
};

let activeSince = typeof performance === 'undefined' ? 0 : performance.now();
let playClockRunning = false;

function accountPlayTime(): void {
  const now = typeof performance === 'undefined' ? activeSince : performance.now();
  if (playClockRunning && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
    G.state.summary.playSeconds += Math.max(0, (now - activeSince) / 1000);
  }
  activeSince = now;
}

export function setPlayClockRunning(running: boolean): void {
  accountPlayTime();
  playClockRunning = running;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') accountPlayTime();
    activeSince = performance.now();
  });
}

export function persist(): void {
  accountPlayTime();
  G.state.summary.level = G.state.level;
  G.state.summary.day = G.state.day;
  G.state.summary.money = G.state.money;
  saveGame(G.state);
  localSaveChanged(G.state);
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
  const deviceId = G.state.sync.deviceId;
  G.state = createNewGame();
  G.state.settings.sound = sound;
  G.state.sync.deviceId = deviceId;
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
