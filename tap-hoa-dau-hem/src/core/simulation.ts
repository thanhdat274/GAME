import { DATA, type FurnitureDef, type StaffRole } from './data';
import { openBranch, visitStore } from './branches';
import { createNewGame, emptySlots, syncActiveStore, type GameState, type ShelfZone, type Staff } from './state';
import { ensureDiningTables } from './dining';
import { ensureDailyQuests } from './quests';
import { ensureWeeklyQuests } from './weeklyQuests';
import { activeShopType, shopTypeOf } from './shopTypes';
import { cellsFor, kindAccepts, shelfCapacity, sellFixture, warehouseCapacity, warehouseCellsUsed } from './stock';
import { buyDecor } from './decor';
import { checkPaths, placeAnywhere } from './layout';
import { marketWage, staffSlots } from './staff';

const PROFILE_DAY = 40;

/** Create a disposable end-game profile with the complete current game catalog stocked. */
export function createMaxLevelSimulation(): GameState {
  const state = createNewGame();
  const maxLevel = DATA.levels.maxLevel;
  state.level = maxLevel;
  state.exp = DATA.levels.levels[maxLevel - 1]?.exp ?? 0;
  state.day = PROFILE_DAY;
  state.money = 50_000_000;
  state.land = DATA.land.plots.map((plot) => plot.id);
  state.lifetime.landsOpened = state.land.filter((id) => !DATA.land.plots.find((plot) => plot.id === id)?.generatorOnly).length;
  state.seenIntro = true;
  state.announcedLevel = maxLevel;
  state.tutorialsSeen = DATA.levels.levels.flatMap((level) => level.features ?? []);
  state.loginPromptSeen = true;
  state.storyProgress = DATA.story.map((chapter) => chapter.id);
  state.achievements = DATA.achievements.map((achievement) => achievement.id);
  state.tax.registered = true;
  state.tax.mode = 'company';
  state.tax.invoiceMachine = true;

  // Mở tất cả địa điểm có trong dữ liệu. Tiền và cấp độ dùng chung trong toàn chuỗi.
  for (const branch of DATA.branches) {
    const result = openBranch(state, branch.id);
    if (!result.ok) throw new Error(`Không mở được chi nhánh ${branch.id} trong hồ sơ max: ${result.reason}`);
  }

  const groceryStores = state.stores
    .filter((store) => shopTypeOf(store).def.id === 'grocery')
    .map((store) => store.id);
  const shopStores = state.stores.map((store) => store.id);
  for (const id of groceryStores) {
    visitStore(state, id);
    state.land = DATA.land.plots.map((plot) => plot.id);
    state.lifetime.landsOpened = state.land.filter((id) => !DATA.land.plots.find((plot) => plot.id === id)?.generatorOnly).length;
    // Tuyển trước để quầy thu ngân 2 có đủ thu ngân khi đặt nội thất.
    state.staff = createFullRoster(state, id);
    syncActiveStore(state);
  }

  // Trang bị cửa hàng chính trước; nếu lối đi hoặc diện tích giới hạn thì dùng các chi nhánh còn chỗ.
  placeGroceryFurniture(state, groceryStores);
  visitStore(state, 'main');
  for (const decor of DATA.decor.filter((item) => item.slot !== 'floor')) {
    if (!state.decorOwned.includes(decor.id)) state.decorOwned.push(decor.id);
  }
  let plantPlaced = placeFloorDecorAnywhere(state, 'chau_cay');
  if (!plantPlaced) {
    for (const storeId of groceryStores.slice(1)) {
      visitStore(state, storeId);
      const spareShelf = state.fixtures.find((fixture) => fixture.type === 'shelf' && fixture.shelf !== undefined);
      if (!spareShelf || sellFixture(state, spareShelf.uid) !== 'ok') continue;
      plantPlaced = buyDecor(state, 'chau_cay', { x: spareShelf.x, y: spareShelf.y }) === 'ok';
      if (plantPlaced) { syncActiveStore(state); break; }
    }
  }
  visitStore(state, 'main');
  ensureDiningTables(state);

  // Tiệm xôi cũng có đủ các trạm khác nhau trong phạm vi mặt bằng của nó.
  const xoiStore = DATA.branches.find((branch) => (branch.shopType ?? 'grocery') === 'xoi');
  if (xoiStore && visitStore(state, xoiStore.id)) {
    // Giữ lối vào trong mặt bằng nhỏ: đổi bàn 2 chỗ mặc định thành bàn 4 chỗ để còn chỗ máy phát và kệ kho.
    const smallTable = state.fixtures.find((fixture) => fixture.type === 'food_table_2');
    if (smallTable) {
      state.fixtures = state.fixtures.filter((fixture) => fixture !== smallTable);
      state.diningTables = state.diningTables.filter((table) => table.fixtureUid !== smallTable.uid);
    }
    for (const type of ['food_table_4', 'generator', 'storage_rack']) {
      if (!state.fixtures.some((fixture) => fixture.type === type) && !placeAnywhere(state, type)) {
        throw new Error(`Không đặt được ${type} trong tiệm xôi của hồ sơ max.`);
      }
    }
    ensureDiningTables(state);
  }

  // Nâng kho tối đa cho từng tiệm và bật toàn bộ công thức của đúng loại tiệm.
  for (const id of shopStores) {
    visitStore(state, id);
    state.warehouseTier = DATA.balance.warehouseTiers.length - 1;
    state.activeRecipes = activeShopType(state).def.recipes.filter((id) => DATA.recipes.some((recipe) => recipe.id === id));
    state.decorOwned = DATA.decor.filter((item) => item.slot !== 'floor').map((item) => item.id);
    state.staff = createFullRoster(state, id);
    state.schedule = Object.fromEntries(state.staff.map((staff) => [staff.id, Array.from({ length: 14 }, () => true)]));
    state.scheduleReady = true;
    state.manager = { enabled: true, speed: 4 };
    state.camera = true;
    state.quests = null;
    state.weeklyQuests = null;
    ensureDailyQuests(state);
    ensureWeeklyQuests(state);
    if (activeShopType(state).def.id === 'xoi') {
      state.soakBatches = [{ id: 'playtest-soak-ready', kg: 3, startDay: state.day - 1, startMinute: 20 * 60 }];
      state.cookedRice = [{ portions: 1_000, cookedDay: state.day, cookedMinute: state.clock, quality: 1 }];
    }
    ensureDiningTables(state);
    syncActiveStore(state);
  }

  // Fill the combined warehouse network with every purchasable / seasonal item.
  seedWholeCatalog(state, groceryStores, shopStores.filter((id) => !groceryStores.includes(id)));

  // Fill every storefront slot. The main store has all shelf types and is the heavy visual test case.
  for (const id of groceryStores) {
    visitStore(state, id);
    if (id === 'main') seedFullShelves(state);
    else seedBranchShelves(state);
    seedCounter(state);
    syncActiveStore(state);
  }
  // Tiệm bán theo kệ của loại khác (rau củ, giải khát, gia dụng...) cũng bày đủ hàng theo nhóm hàng của loại đó.
  for (const store of state.stores) {
    if (groceryStores.includes(store.id) || shopTypeOf(store).def.service !== 'shelves') continue;
    visitStore(state, store.id);
    seedBranchShelves(state);
    syncActiveStore(state);
  }
  const xoi = xoiStore?.id;
  if (xoi && visitStore(state, xoi)) {
    seedXoiCounter(state);
    syncActiveStore(state);
  }

  visitStore(state, 'main');
  state.phase = 'morning';
  state.clock = DATA.balance.openMinute;
  state.lastSummary = null;
  syncActiveStore(state);
  return state;
}

function groceryFurniture(): FurnitureDef[] {
  const grocery = DATA.shopTypes.find((shop) => shop.id === 'grocery');
  if (!grocery) throw new Error('Thiếu shop type grocery.');
  return DATA.furniture
    .filter((def) => !def.fixed && grocery.fixtures.includes(def.id))
    .sort((a, b) => furniturePlacementOrder(a) - furniturePlacementOrder(b)
      || b.w * b.h - a.w * a.h || a.id.localeCompare(b.id));
}

function furniturePlacementOrder(def: FurnitureDef): number {
  if (def.id === 'fridge') return -3;
  if (def.id === 'fridge_single') return -2;
  if (def.id === 'freezer') return -1;
  if (def.id === 'blender') return 1.5;
  if (def.id === 'sugarcane_press') return 1.75;
  return plotOrder(def);
}

function plotOrder(def: FurnitureDef): number {
  if (def.requiresPlot === 'D') return 0;
  if (def.requiresPlot === 'E') return 1;
  if (def.requiresPlot === 'F') return 2;
  return 3;
}

function placeFloorDecorAnywhere(state: GameState, id: string): boolean {
  for (let y = 0; y < DATA.land.rows; y++) for (let x = 0; x < DATA.land.cols; x++) {
    const money = state.money;
    const nextUid = state.nextUid;
    if (buyDecor(state, id, { x, y }) !== 'ok') continue;
    if (checkPaths(state).ok) return true;
    state.fixtures.pop();
    state.nextUid = nextUid;
    state.money = money;
  }
  return false;
}

function placeGroceryFurniture(state: GameState, stores: string[]): void {
  const notPlaced: string[] = [];
  for (const def of groceryFurniture()) {
    const wanted = def.limit ?? 1;
    for (let count = 0; count < wanted; count++) {
      let placed = false;
      for (const storeId of stores) {
        visitStore(state, storeId);
        if (state.fixtures.filter((fixture) => fixture.type === def.id).length >= wanted) { placed = true; break; }
        if (placeAnywhere(state, def.id)) {
          syncActiveStore(state);
          placed = true;
          break;
        }
      }
      if (!placed) notPlaced.push(def.id);
    }
  }
  visitStore(state, 'main');
  if (notPlaced.length) state.morningNotes.push(`Một số thiết bị chưa đặt sẵn do thiếu lối đi: ${[...new Set(notPlaced)].join(', ')}. Có thể mua và sắp xếp lại khi chơi.`);
}

function createFullRoster(state: GameState, storeId: string): Staff[] {
  const shopType = activeShopType(state).def.id;
  const roles: StaffRole[] = shopType === 'xoi'
    ? ['xoi_cook', 'cashier', 'stocker', 'delivery', 'branch_manager', 'chef', 'barista', 'refill']
    : ['cashier', 'refill', 'stocker', 'delivery', 'chef', 'barista', 'branch_manager', 'xoi_cook'];
  const count = staffSlots(state.level);
  return Array.from({ length: count }, (_, index) => {
    const role = roles[index % roles.length];
    const id = `max-${storeId}-${index + 1}`;
    const look = DATA.staff.looks[index % DATA.staff.looks.length];
    const stats = { speed: 10, accuracy: 10, friendly: 10, stamina: 10 };
    return {
      id,
      name: DATA.staff.names[(index + state.stores.findIndex((store) => store.id === storeId) * count) % DATA.staff.names.length],
      personality: DATA.staff.personalities[index % DATA.staff.personalities.length].id,
      look: { ...look },
      role,
      stats,
      wage: marketWage(stats),
      level: 10,
      exp: 0,
      mood: 100,
      hiredDay: state.day,
      streak: 0,
      lowMoodDays: 0,
      quitting: false,
      scoldedDay: null,
      lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 },
    };
  });
}

function seedWholeCatalog(state: GameState, groceryStoreIds: string[], specialtyStoreIds: string[]): void {
  const stores = [...groceryStoreIds, ...specialtyStoreIds];
  const remaining = new Map(stores.map((id) => [id, 0]));
  const capacities = new Map<string, number>();
  for (const storeId of stores) {
    visitStore(state, storeId);
    state.warehouse = [];
    capacities.set(storeId, warehouseCapacity(state));
    syncActiveStore(state);
  }

  const regularProducts = DATA.products.filter((item) => !item.recipeOnly);
  const missing: string[] = [];
  for (const item of regularProducts) {
    const candidates = stores.filter((id) => {
      const store = state.stores.find((entry) => entry.id === id)!;
      return shopTypeOf(store).allowsProduct(item.id);
    }).sort((a, b) => (remaining.get(a)! / capacities.get(a)!) - (remaining.get(b)! / capacities.get(b)!));
    let stored = false;
    for (const storeId of candidates) {
      visitStore(state, storeId);
      const capacity = warehouseCapacity(state);
      const used = warehouseCellsUsed(state.warehouse);
      const qty = item.behindCounter ? DATA.balance.counterCapacity * DATA.balance.counterSlots : 10;
      const cells = cellsFor(item.id, qty);
      if (used + cells > capacity) continue;
      state.warehouse.push({ productId: item.id, qty, exp: item.shelfLifeDays ? state.day + item.shelfLifeDays - 1 : null });
      remaining.set(storeId, used + cells);
      syncActiveStore(state);
      stored = true;
      break;
    }
    if (!stored) missing.push(item.id);
  }
  if (missing.length) throw new Error(`Không đủ sức chứa kho cho các mặt hàng: ${missing.join(', ')}`);
}

function seedFullShelves(state: GameState): void {
  const shop = activeShopType(state);
  const categories: ShelfZone[] = ['dry', 'snack', 'household', 'drink', 'fresh', 'frozen', 'drink', 'fresh', 'dry'];
  for (let row = 0; row < state.shelves.length; row++) {
    const fixture = state.fixtures.find((item) => item.shelf === row);
    if (!fixture) continue;
    const kind = fixture.type === 'fridge' || fixture.type === 'fridge_single' ? 'fridge' : fixture.type === 'freezer' ? 'freezer' : 'shelf';
    const preferred = kind === 'freezer' ? ['frozen'] as const
      : kind === 'fridge' ? ['fresh', 'drink'] as const
        : [categories[row] ?? 'dry', 'dry', 'snack', 'household', 'drink', 'fresh', 'frozen'] as const;
    const category = preferred.find((choice) => DATA.products.some((item) => shop.allowsProduct(item.id)
      && !item.recipeOnly && !item.behindCounter && item.category === choice
      && kindAccepts(state, row, item) === null));
    if (!category) continue;
    const candidates = DATA.products.filter((item) => shop.allowsProduct(item.id)
      && !item.recipeOnly && !item.behindCounter && item.category === category
      && kindAccepts(state, row, item) === null);
    if (!candidates.length) continue;
    state.zones[row] = category;
    state.shelves[row] = state.shelves[row].map((_, slotIndex) => {
      const item = candidates[(row * 11 + slotIndex) % candidates.length];
      const qty = shelfCapacity(state, row);
      return { productId: item.id, qty, lots: [{ qty, exp: item.shelfLifeDays ? state.day + item.shelfLifeDays - 1 : null }] };
    });
  }
}

function seedBranchShelves(state: GameState): void {
  const shop = activeShopType(state);
  // Tạp hóa giữ bộ nhóm cũ; loại tiệm khác dùng chính nhóm hàng của nó để kệ khớp loại tiệm.
  const categories: ShelfZone[] = shop.def.id === 'grocery' ? ['dry', 'snack', 'drink'] : shop.def.categories.filter((c): c is Exclude<typeof c, 'counter'> => c !== 'counter');
  for (let row = 0; row < state.shelves.length; row++) {
    if (!state.fixtures.some((fixture) => fixture.shelf === row)) continue;
    const candidates = DATA.products.filter((item) => shop.allowsProduct(item.id)
      && !item.recipeOnly && !item.behindCounter && item.category === categories[row % categories.length]
      && kindAccepts(state, row, item) === null);
    if (!candidates.length) continue;
    state.zones[row] = categories[row % categories.length];
    state.shelves[row] = state.shelves[row].map((_, slotIndex) => {
      const item = candidates[(slotIndex + row * 3) % candidates.length];
      const qty = shelfCapacity(state, row);
      return { productId: item.id, qty, lots: [{ qty, exp: item.shelfLifeDays ? state.day + item.shelfLifeDays - 1 : null }] };
    });
  }
}

function seedCounter(state: GameState): void {
  state.counter = emptySlots(DATA.balance.counterSlots);
  const shop = activeShopType(state);
  const outputs = shop.def.recipes
    .map((id) => DATA.recipes.find((recipe) => recipe.id === id)?.output)
    .filter((id): id is string => !!id);
  const behindCounter = DATA.products.filter((item) => item.behindCounter && shop.allowsProduct(item.id)).map((item) => item.id);
  const selected = [...outputs.slice(0, 2), ...behindCounter.slice(0, Math.max(0, state.counter.length - 2))]
    .slice(0, state.counter.length);
  selected.forEach((id, index) => {
    const qty = Math.min(DATA.balance.counterCapacity, DATA.products.find((item) => item.id === id)?.recipeOnly ? 1 : DATA.balance.counterCapacity);
    state.counter[index] = { productId: id, qty, lots: [{ qty, exp: state.day + 1 }] };
  });
}

function seedXoiCounter(state: GameState): void {
  state.counter = emptySlots(DATA.balance.counterSlots);
  const packaged = DATA.recipes.filter((recipe) => recipe.packaged && activeShopType(state).allowsRecipe(recipe.id));
  packaged.slice(0, state.counter.length).forEach((recipe, index) => {
    const qty = DATA.balance.counterCapacity;
    state.counter[index] = { productId: recipe.output, qty, lots: [{ qty, exp: state.day + recipe.shelfLifeDays }] };
  });
}
