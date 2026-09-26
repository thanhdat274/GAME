import {
  DaySession,
  endDay,
  openShop,
  startNextDay,
  type DaySessionSnapshot,
} from './day';
import {
  assignCounterSlot,
  assignSlot,
  autoArrange,
  buyStock,
  counterFreeForNew,
  slotFreeForNew,
  clearSlot,
  refillCounterSlot,
  refillSlot,
  setClearance,
  type Cart,
} from './stock';
import { DATA, product, supplier, type Category } from './data';
import type { GameState } from './state';

/** Authoritative shared state stored by the live-session backend. */
export interface LiveShopAggregate {
  schemaVersion: 1;
  sequence: number;
  state: GameState;
  dayRuntime: DaySessionSnapshot | null;
}

/** Commands sent by either device. They are applied in server transaction order. */
export type LiveShopCommand =
  | { type: 'buyStock'; cart: Cart; supplierId?: string }
  | { type: 'assignShelf'; shelf: number; slot: number; productId: string }
  | { type: 'clearShelf'; shelf: number; slot: number }
  | { type: 'refillShelf'; shelf: number; slot: number }
  | { type: 'assignCounter'; slot: number; productId: string }
  | { type: 'refillCounter'; slot: number }
  | { type: 'autoArrange' }
  | { type: 'openShop' }
  | { type: 'startRefill'; shelf: number; slot: number }
  | { type: 'refillZone'; zone: Exclude<Category, 'counter'> }
  | { type: 'setClearance'; shelf: number; slot: number; pct: number | null }
  | { type: 'resolveBargain'; accept: boolean }
  | { type: 'resolveCredit'; grant: boolean }
  | { type: 'scanItem'; productId: string }
  | { type: 'scanAll' }
  | { type: 'serveCounter'; slot: number }
  | { type: 'addBill'; value: number }
  | { type: 'undoBill' }
  | { type: 'autoChange' }
  | { type: 'giveChange' }
  | { type: 'setPreference'; key: 'autoScan' | 'autoChange'; value: boolean }
  | { type: 'nextDay' };

export interface LiveCommandEnvelope {
  commandId: string;
  deviceId: string;
  observedSequence: number;
  command: LiveShopCommand;
}

export function createLiveShopAggregate(state: GameState): LiveShopAggregate {
  const copy = structuredClone(state);
  const dayRuntime = copy.phase === 'open' ? new DaySession(copy).snapshot() : null;
  return { schemaVersion: 1, sequence: 0, state: copy, dayRuntime };
}

/** Applies one validated player command to the latest shared state. */
export function applyLiveShopCommand(
  current: LiveShopAggregate,
  command: LiveShopCommand,
): { aggregate: LiveShopAggregate; result: unknown } {
  validateLiveShopCommand(command);
  const aggregate = structuredClone(current);
  const { state } = aggregate;
  let result: unknown;

  switch (command.type) {
    case 'buyStock':
      requireStocking(state);
      result = buyStock(state, command.cart, command.supplierId ?? 'co_tu');
      break;
    case 'assignShelf':
      requireStocking(state);
      if (state.phase === 'open' && !slotFreeForNew(state, command.shelf, command.slot, command.productId)) throw new Error('Giữa giờ bán chỉ bày món mới vào ô trống.');
      result = assignSlot(state, command.shelf, command.slot, command.productId);
      break;
    case 'clearShelf':
      requireStocking(state);
      if (state.phase === 'open' && (state.shelves[command.shelf]?.[command.slot]?.qty ?? 0) > 0) throw new Error('Giữa giờ bán chỉ dọn ô đã hết hàng.');
      clearSlot(state, command.shelf, command.slot);
      result = true;
      break;
    case 'refillShelf':
      requirePhase(state, 'morning');
      result = refillSlot(state, command.shelf, command.slot);
      break;
    case 'assignCounter':
      requireStocking(state);
      if (state.phase === 'open' && !counterFreeForNew(state, command.slot, command.productId)) throw new Error('Giữa giờ bán chỉ đưa món mới vào ô quầy trống.');
      result = assignCounterSlot(state, command.slot, command.productId);
      break;
    case 'refillCounter':
      requirePhase(state, 'morning');
      result = refillCounterSlot(state, command.slot);
      break;
    case 'setClearance':
      result = setClearance(state, command.shelf, command.slot, command.pct);
      break;
    case 'autoArrange':
      requirePhase(state, 'morning');
      autoArrange(state);
      result = true;
      break;
    case 'openShop':
      requirePhase(state, 'morning');
      openShop(state);
      aggregate.dayRuntime = new DaySession(state).snapshot();
      result = true;
      break;
    case 'startRefill':
    case 'refillZone':
    case 'scanItem':
    case 'scanAll':
    case 'serveCounter':
    case 'addBill':
    case 'undoBill':
    case 'autoChange':
    case 'resolveBargain':
    case 'resolveCredit':
    case 'giveChange': {
      const runtime = requireDayRuntime(aggregate);
      const session = DaySession.restore(state, runtime);
      switch (command.type) {
        case 'startRefill': result = session.startRefill(command.shelf, command.slot); break;
        case 'refillZone': result = session.refillZone(command.zone); break;
        case 'scanItem': result = session.scanItem(command.productId); break;
        case 'scanAll': result = session.scanAll(); break;
        case 'serveCounter': result = session.serveCounterRequest(command.slot); break;
        case 'addBill': session.addBill(command.value); result = true; break;
        case 'undoBill': session.undoBill(); result = true; break;
        case 'autoChange': result = session.autoChange(); break;
        case 'giveChange': result = session.giveChange(); break;
        case 'resolveBargain': result = session.resolveBargain(command.accept); break;
        case 'resolveCredit': result = session.resolveCredit(command.grant); break;
      }
      aggregate.dayRuntime = session.snapshot();
      break;
    }
    case 'nextDay':
      requirePhase(state, 'summary');
      result = startNextDay(state);
      aggregate.dayRuntime = null;
      break;
    case 'setPreference':
      state.settings[command.key] = command.value;
      result = true;
      break;
  }

  aggregate.sequence += 1;
  return { aggregate, result };
}

/** Validate untrusted callable payloads before invoking game logic. */
export function validateLiveCommandEnvelope(value: unknown): value is LiveCommandEnvelope {
  if (!isRecord(value)
    || typeof value.commandId !== 'string' || value.commandId.length < 8 || value.commandId.length > 128
    || typeof value.deviceId !== 'string' || value.deviceId.length < 1 || value.deviceId.length > 128
    || typeof value.observedSequence !== 'number' || !Number.isSafeInteger(value.observedSequence) || value.observedSequence < 0) return false;
  try {
    validateLiveShopCommand(value.command as LiveShopCommand);
    return true;
  } catch {
    return false;
  }
}

function validateLiveShopCommand(command: LiveShopCommand): void {
  if (!isRecord(command) || typeof command.type !== 'string') throw new Error('Command không hợp lệ.');
  switch (command.type) {
    case 'buyStock':
      if (!isRecord(command.cart) || Object.entries(command.cart).some(([id, qty]) => !isProduct(id) || !isQuantity(qty))) throw new Error('Giỏ nhập hàng không hợp lệ.');
      if (command.supplierId !== undefined) {
        try { supplier(String(command.supplierId)); } catch { throw new Error('Mối sỉ không hợp lệ.'); }
      }
      return;
    case 'setClearance':
      if (!isIndex(command.shelf) || !isIndex(command.slot) || !(command.pct === null || DATA.balance.clearance.options.includes(Number(command.pct)))) throw new Error('Bán xả không hợp lệ.');
      return;
    case 'resolveBargain':
      if (typeof command.accept !== 'boolean') throw new Error('Trả lời mặc cả không hợp lệ.');
      return;
    case 'resolveCredit':
      if (typeof command.grant !== 'boolean') throw new Error('Trả lời ghi sổ không hợp lệ.');
      return;
    case 'assignShelf':
      if (!isIndex(command.shelf) || !isIndex(command.slot) || !isProduct(command.productId)) throw new Error('Ô kệ không hợp lệ.');
      return;
    case 'clearShelf':
    case 'refillShelf':
    case 'startRefill':
      if (!isIndex(command.shelf) || !isIndex(command.slot)) throw new Error('Ô kệ không hợp lệ.');
      return;
    case 'assignCounter':
      if (!isIndex(command.slot) || !isProduct(command.productId)) throw new Error('Ô quầy không hợp lệ.');
      return;
    case 'refillCounter':
    case 'serveCounter':
      if (!isIndex(command.slot)) throw new Error('Ô quầy không hợp lệ.');
      return;
    case 'refillZone':
      if (!['dry', 'snack', 'household', 'drink', 'fresh', 'frozen'].includes(String(command.zone))) throw new Error('Khu hàng không hợp lệ.');
      return;
    case 'scanItem':
      if (!isProduct(command.productId)) throw new Error('Mặt hàng không hợp lệ.');
      return;
    case 'addBill':
      if (!DATA.balance.drawer.includes(Number(command.value))) throw new Error('Mệnh giá không hợp lệ.');
      return;
    case 'autoArrange':
    case 'openShop':
    case 'scanAll':
    case 'undoBill':
    case 'autoChange':
    case 'giveChange':
    case 'nextDay':
      return;
    case 'setPreference':
      if (!['autoScan', 'autoChange'].includes(String(command.key)) || typeof command.value !== 'boolean') throw new Error('Cài đặt không hợp lệ.');
      return;
    default:
      throw new Error('Loại command không được hỗ trợ.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndex(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 100;
}

function isQuantity(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000;
}

function isProduct(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    product(value);
    return true;
  } catch {
    return false;
  }
}

/** Advance shared customer simulation by trusted server elapsed time. */
export function advanceLiveShop(aggregate: LiveShopAggregate, elapsedSeconds: number): LiveShopAggregate {
  if (!aggregate.dayRuntime || aggregate.state.phase !== 'open' || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return aggregate;
  }
  const next = structuredClone(aggregate);
  const session = DaySession.restore(next.state, next.dayRuntime!);
  let remaining = Math.min(elapsedSeconds, 5);
  while (remaining > 0 && !session.ended) {
    const step = Math.min(remaining, 0.5);
    session.update(step);
    remaining -= step;
  }
  next.dayRuntime = session.snapshot();
  next.sequence += 1;
  if (session.ended) {
    endDay(next.state);
    next.dayRuntime = null;
  }
  return next;
}

function requirePhase(state: GameState, phase: GameState['phase']): void {
  if (state.phase !== phase) throw new Error(`Lệnh này không dùng được ở pha ${state.phase}.`);
}

/** Nhập và bày hàng: buổi sáng, hoặc khi tạm dừng giữa giờ bán. */
function requireStocking(state: GameState): void {
  if (state.phase !== 'morning') requirePhase(state, 'open');
}

function requireDayRuntime(aggregate: LiveShopAggregate): DaySessionSnapshot {
  requirePhase(aggregate.state, 'open');
  if (!aggregate.dayRuntime) throw new Error('Phiên bán chưa được khởi tạo.');
  return aggregate.dayRuntime;
}
