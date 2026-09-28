import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../src/ui/sound', () => ({ setSoundEnabled: vi.fn() }));
vi.mock('../src/services/sync', () => ({ localSaveChanged: vi.fn() }));
let game: typeof import('../src/game');
let now: number;
let doc: EventTarget & { visibilityState: string };

beforeEach(async () => {
  vi.resetModules(); now = 0;
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', doc);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) });
  game = await import('../src/game');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('counts active play once and excludes paused time', () => {
  now = 1000; game.setPlayClockRunning(true);
  now = 6000; game.persist(); expect(game.G.state.summary.playSeconds).toBe(5);
  now = 8000; game.setPlayClockRunning(false);
  now = 28000; game.persist(); expect(game.G.state.summary.playSeconds).toBe(7);
  game.setPlayClockRunning(true); now = 30000; game.persist();
  expect(game.G.state.summary.playSeconds).toBe(9);
});

it('flushes the visible interval when hiding and excludes background time', () => {
  game.setPlayClockRunning(true); now = 5000;
  doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
  expect(game.G.state.summary.playSeconds).toBe(5);
  now = 65000; game.persist();
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
  now = 68000; game.persist(); expect(game.G.state.summary.playSeconds).toBe(8);
});

it('resets elapsed time when starting a new game', () => {
  game.setPlayClockRunning(true); now = 5000; game.newGame();
  expect(game.G.state.summary.playSeconds).toBe(0);
  now = 7000; game.persist(); expect(game.G.state.summary.playSeconds).toBe(2);
});

it('updates summary fields on save and round-trips elapsed play time', () => {
  game.setPlayClockRunning(true); now = 12500;
  Object.assign(game.G.state, { day: 7, level: 4, money: 765000 }); game.persist();
  expect(game.G.state.summary).toEqual({ day: 7, level: 4, money: 765000, playSeconds: 12.5 });
  const loaded = game.tryLoad();
  expect(loaded.status).toBe('ok'); expect(game.G.state.summary.playSeconds).toBe(12.5);
});
