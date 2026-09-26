import { loadGame, saveGame, type LoadResult } from './core/save';
import { createNewGame, type GameState } from './core/state';
import { setSoundEnabled } from './ui/sound';
import { localSaveChanged } from './services/sync';
import type { LiveShopSnapshot } from './services/liveShop';

/** Trạng thái dùng chung giữa các scene. */
export const G: { state: GameState; loadError: string | null; liveSnapshot: LiveShopSnapshot | null } = {
  state: createNewGame(),
  loadError: null,
  liveSnapshot: null,
};

export function setLiveSnapshot(snapshot: LiveShopSnapshot | null): void {
  G.liveSnapshot = snapshot;
  if (snapshot) {
    G.state = structuredClone(snapshot.state);
    persistLocal();
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('thdh-live-updated'));
}

let activeSince = typeof performance === 'undefined' ? 0 : performance.now();
let playClockRunning = false;
let playClockVisible = typeof document === 'undefined' || document.visibilityState === 'visible';

function accountPlayTime(): void {
  const now = typeof performance === 'undefined' ? activeSince : performance.now();
  if (playClockRunning && playClockVisible) {
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
    accountPlayTime();
    playClockVisible = document.visibilityState === 'visible';
  });
}

export function persist(): void {
  if (G.liveSnapshot) {
    persistLocal();
    return;
  }
  accountPlayTime();
  G.state.summary.level = G.state.level;
  G.state.summary.day = G.state.day;
  G.state.summary.money = G.state.money;
  saveGame(G.state);
  localSaveChanged(G.state);
}

/** Cache an authoritative live snapshot on this device without enqueueing solo cloud sync. */
export function persistLocal(): void {
  accountPlayTime();
  G.state.summary.level = G.state.level;
  G.state.summary.day = G.state.day;
  G.state.summary.money = G.state.money;
  saveGame(G.state, undefined, false);
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
  accountPlayTime();
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
