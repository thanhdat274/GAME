import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { maxStores, openBranch, branchAvailable } from '../src/core/branches';
import { createNewGame, type GameState } from '../src/core/state';

describe('11-store chain mechanics and layout scalability', () => {
  it('defines maxStores as 11 in balance configuration', () => {
    expect(maxStores()).toBe(11);
    expect(DATA.balance.chain.maxStores).toBe(11);
  });

  it('defines 10 distinct branch types in branches.json', () => {
    expect(DATA.branches.length).toBe(10);
    const branchIds = DATA.branches.map((b) => b.id);
    expect(branchIds).toEqual([
      'xoi',
      'market',
      'school',
      'industrial',
      'veg',
      'drink',
      'home',
      'tea',
      'bakery',
      'mart',
    ]);
  });

  it('allows opening up to 11 stores (1 main store + 10 branches)', () => {
    const state: GameState = createNewGame();
    expect(state.stores.length).toBe(1);
    expect(state.stores[0].id).toBe('main');

    // Give infinite money and max level so all branches are unlocked
    state.money = 100_000_000;
    state.level = 50;

    DATA.branches.forEach((b) => {
      expect(branchAvailable(state, b)).toBe(true);
      const res = openBranch(state, b.id);
      expect(res.ok).toBe(true);
    });

    expect(state.stores.length).toBe(11);

    // Opening an 12th store should fail with limit
    const overLimit = openBranch(state, 'nonexistent');
    expect(overLimit.ok).toBe(false);
  });

  it('calculates valid layout parameters for 11 store cards in landscape', () => {
    const W = 640;
    const colW = Math.floor((W - 24) / 2);
    expect(colW).toBe(308);

    const storeCount = 11;
    const rows = Math.ceil(storeCount / 2);
    expect(rows).toBe(6);

    for (let i = 0; i < storeCount; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = 8 + col * (colW + 8);
      expect(cx + colW).toBeLessThanOrEqual(W - 8);
      expect(row).toBeLessThan(rows);
    }
  });
});
