import { DATA } from './data';
import { openBranch, visitStore } from './branches';
import { createNewGame, emptySlots, syncActiveStore, type GameState } from './state';
import { ensureDiningTables } from './dining';
import { cellsFor, warehouseCapacity } from './stock';

/** A disposable, fully unlocked profile used to inspect end-game content. */
export function createMaxLevelSimulation(): GameState {
  const state = createNewGame();
  const maxLevel = DATA.levels.maxLevel;
  state.level = maxLevel;
  state.exp = DATA.levels.levels[maxLevel - 1]?.exp ?? 0;
  state.day = 40;
  state.money = 50_000_000;
  state.land = DATA.land.plots.map((plot) => plot.id);
  state.lifetime.landsOpened = state.land.length;
  state.seenIntro = true;
  state.announcedLevel = maxLevel;
  state.tutorialsSeen = DATA.levels.levels.flatMap((level) => level.features ?? []);
  state.loginPromptSeen = true;
  state.activeRecipes = DATA.recipes.filter((recipe) => recipe.unlockLevel <= maxLevel).map((recipe) => recipe.id);
  state.warehouseTier = DATA.balance.warehouseTiers.length - 1;

  const fixturePlan: Array<{ type: string; x: number; y: number; rot: 0 | 1 }> = [
    { type: 'food_grill', x: 6, y: 0, rot: 0 },
    { type: 'hot_kettle', x: 6, y: 1, rot: 0 },
    { type: 'bread_case', x: 6, y: 2, rot: 0 },
    { type: 'food_table_2', x: 7, y: 0, rot: 0 },
    { type: 'drink_counter', x: 6, y: 4, rot: 0 },
    { type: 'blender', x: 6, y: 5, rot: 0 },
    { type: 'sugarcane_press', x: 6, y: 6, rot: 0 },
    { type: 'drink_table_2', x: 7, y: 4, rot: 0 },
    { type: 'generator', x: 4, y: 1, rot: 0 },
  ];
  for (const fixture of fixturePlan) {
    state.fixtures.push({ uid: state.nextUid++, ...fixture });
  }

  // Nạp kho vừa sức chứa (mỗi món một chồng 10 đơn vị) để hồ sơ không vượt giới hạn ô.
  const capacity = warehouseCapacity(state);
  let used = 0;
  state.warehouse = [];
  for (const item of DATA.products.filter((p) => p.unlockLevel <= maxLevel && !p.recipeOnly)) {
    const cells = cellsFor(item.id, 10);
    if (used + cells > capacity) continue;
    used += cells;
    state.warehouse.push({ productId: item.id, qty: 10, exp: item.shelfLifeDays ? state.day + item.shelfLifeDays - 1 : null });
  }

  state.counter = emptySlots(DATA.balance.counterSlots);
  // Chừa một nửa quầy trống để thử chế biến món/pha nước ngay.
  const counterProducts = ['the_cao', 'gas_mini', 'bat_lua', ...state.activeRecipes.map((id) => DATA.recipes.find((recipe) => recipe.id === id)?.output).filter((id): id is string => !!id)];
  counterProducts.slice(0, Math.floor(state.counter.length / 2)).forEach((id, index) => {
    state.counter[index] = { productId: id, qty: 20, lots: [{ qty: 20, exp: state.day + 1 }] };
  });
  const shelfProducts = DATA.products.filter((item) => !item.behindCounter && item.unlockLevel <= maxLevel);
  const categories = ['dry', 'snack', 'drink'] as const;
  state.shelves.forEach((shelf, index) => {
    const category = categories[index];
    const product = shelfProducts.find((item) => item.category === category);
    if (product && shelf[0]) shelf[0] = { productId: product.id, qty: 20, lots: [{ qty: 20, exp: null }] };
    state.zones[index] = category;
  });

  for (const branch of DATA.branches) openBranch(state, branch.id);
  visitStore(state, 'main');
  ensureDiningTables(state);
  state.phase = 'morning';
  state.clock = DATA.balance.openMinute;
  syncActiveStore(state);
  return state;
}
