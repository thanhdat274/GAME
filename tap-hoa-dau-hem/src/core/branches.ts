import { DATA, type BranchDef } from './data';
import { addStoreSnapshot, activateStore, createNewGame, emptyStats, syncActiveStore, type GameState, type StoreSnapshot } from './state';
import { takeLots } from './stock';

export type OpenBranchResult = { ok: true; store: StoreSnapshot } | { ok: false; reason: 'locked' | 'money' | 'exists' | 'limit' };

export function branchDefinition(id: string): BranchDef | undefined {
  return DATA.branches.find((branch) => branch.id === id);
}

export function openBranch(state: GameState, id: string): OpenBranchResult {
  const branch = branchDefinition(id);
  if (!branch || state.level < branch.unlockLevel) return { ok: false, reason: 'locked' };
  if (state.stores.some((store) => store.id === id)) return { ok: false, reason: 'exists' };
  if (state.stores.length >= 4) return { ok: false, reason: 'limit' };
  if (state.money < branch.cost) return { ok: false, reason: 'money' };
  state.money -= branch.cost;
  const ok = addStoreSnapshot(state, { id, name: branch.name, kind: branch.kind });
  if (!ok) { state.money += branch.cost; return { ok: false, reason: 'exists' }; }
  activateStore(state, id);
  const blank = createNewGame();
  state.warehouse = [];
  state.holding = [];
  state.shelves = blank.shelves;
  state.zones = blank.zones;
  state.counter = blank.counter;
  state.fixtures = branch.defaultLayout.map((fixture, index) => ({ uid: index + 1, ...fixture, rot: (fixture.rot ?? 0) as 0 | 1 }));
  state.nextUid = state.fixtures.length + 1;
  state.land = [];
  state.warehouseTier = 0;
  state.prices = {};
  state.deliveries = [];
  state.ledger = [];
  state.regulars = {};
  state.quests = null;
  state.weeklyQuests = null;
  state.partyOrder = null;
  state.partyOrderWeek = -1;
  state.decorOwned = [];
  state.lifetime = { sold: 0, served: 0, debtsCollected: 0, landsOpened: 0, loveStreak: 0 };
  state.tutorialsSeen = [];
  state.ratings = [];
  state.yesterdaySold = {};
  state.yesterdayMissed = {};
  state.today = emptyStats();
  state.staff = [];
  state.staffBoard = null;
  state.fixedCandidateUsed = false;
  state.schedule = {};
  state.scheduleReady = false;
  state.rules = [];
  state.planogram = null;
  state.analytics = [];
  state.managerStats = [];
  state.manager = { enabled: false, speed: 1 };
  state.wageDebt = 0;
  state.camera = false;
  state.morningNotes = [`Mở ${branch.name}. Số dư và level dùng chung toàn chuỗi; kho và nhân viên bắt đầu riêng.`];
  state.activeEvents = [];
  state.eventProgress = {};
  state.eventHistory = [];
  state.eventRewards = [];
  state.activeRecipes = [];
  state.branchLastSimDay[id] = state.day - 1;
  const saved = state.stores.find((store) => store.id === id)!;
  saved.simDay = state.day - 1;
  return { ok: true, store: saved };
}

export function visitStore(state: GameState, id: string): boolean {
  return activateStore(state, id);
}

export type ShipmentResult = { ok: true; shipmentId: string; fee: number } | { ok: false; reason: 'destination' | 'same' | 'quantity' | 'stock' | 'money' };

/** Ship stock by truck; cargo arrives in the target store's holding area next game morning. */
export function sendBranchShipment(state: GameState, toStoreId: string, productId: string, qty: number): ShipmentResult {
  if (!Number.isInteger(qty) || qty <= 0) return { ok: false, reason: 'quantity' };
  if (toStoreId === state.activeStoreId) return { ok: false, reason: 'same' };
  const destination = state.stores.find((store) => store.id === toStoreId);
  if (!destination) return { ok: false, reason: 'destination' };
  const available = state.warehouse.filter((lot) => lot.productId === productId).reduce((sum, lot) => sum + lot.qty, 0);
  if (available < qty) return { ok: false, reason: 'stock' };
  const fee = 500 + qty * 100;
  if (state.money < fee) return { ok: false, reason: 'money' };
  const lots = takeLots(state, productId, qty);
  if (lots.reduce((sum, lot) => sum + lot.qty, 0) !== qty) return { ok: false, reason: 'stock' };
  const shipmentId = `shipment-${state.day}-${state.branchShipments.length + 1}-${state.activeStoreId}-${toStoreId}`;
  state.money -= fee;
  state.branchShipments.push({ id: shipmentId, fromStoreId: state.activeStoreId, toStoreId, productId, lots, sentDay: state.day, arriveDay: state.day + 1, fee });
  syncActiveStore(state);
  return { ok: true, shipmentId, fee };
}

/** Deliver due cargo into each destination's receiving area, retaining original expiry lots. */
export function deliverBranchShipments(state: GameState, throughDay: number): number {
  const due = state.branchShipments.filter((shipment) => shipment.arriveDay <= throughDay);
  for (const shipment of due) {
    const destination = state.stores.find((store) => store.id === shipment.toStoreId);
    if (!destination) continue;
    const receiving = destination.id === state.activeStoreId
      ? state.holding
      : (Array.isArray(destination.data.holding) ? destination.data.holding as { productId: string; qty: number; exp: number | null }[] : (destination.data.holding = []) as { productId: string; qty: number; exp: number | null }[]);
    for (const lot of shipment.lots) {
      const same = receiving.find((item) => item.productId === shipment.productId && item.exp === lot.exp);
      if (same) same.qty += lot.qty;
      else receiving.push({ productId: shipment.productId, qty: lot.qty, exp: lot.exp });
    }
  }
  state.branchShipments = state.branchShipments.filter((shipment) => shipment.arriveDay > throughDay || !state.stores.some((store) => store.id === shipment.toStoreId));
  syncActiveStore(state);
  return due.length;
}

/** Pay out each unattended branch once for every closed game day. */
export function simulateBranches(state: GameState, throughDay: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const store of state.stores) {
    if (store.id === state.activeStoreId) continue;
    const def = branchDefinition(store.id);
    const storeAnalytics = Array.isArray(store.data.analytics) ? store.data.analytics as { profit: number }[] : [];
    const base = storeAnalytics.slice(-7);
    const averageProfit = base.length ? Math.max(0, base.reduce((n, d) => n + d.profit, 0) / base.length) : 0;
    const last = Math.max(store.simDay ?? state.branchLastSimDay[store.id] ?? 0, 0);
    const days = Math.max(0, throughDay - last);
    const workers = Array.isArray(store.data.staff) ? store.data.staff as { role?: string; level?: number; stats?: { accuracy?: number } }[] : [];
    const managers = workers.filter((worker) => worker.role === 'branch_manager');
    const managerBoost = managers.length ? managers.reduce((sum, manager) => sum + 0.03 * (manager.level ?? 1) + 0.005 * (manager.stats?.accuracy ?? 0), 0) / managers.length : 0;
    const efficiency = Math.min(0.9, (def?.efficiency ?? 0.6) + managerBoost);
    const income = Math.round(averageProfit * efficiency * (def?.traffic ?? 1) * days);
    state.money += income;
    store.simDay = throughDay;
    state.branchLastSimDay[store.id] = throughDay;
    if (income) result[store.id] = income;
  }
  return result;
}
