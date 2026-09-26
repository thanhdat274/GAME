import { DATA, hasFeature } from './data';
import { recordRating } from './progression';
import type { Rng } from './rng';
import type { Debt, GameState } from './state';

export function openDebts(state: GameState): Debt[] {
  return state.ledger.filter((d) => d.status === 'open');
}

export function openDebtTotal(state: GameState): number {
  return openDebts(state).reduce((sum, d) => sum + d.amount, 0);
}

/** Hạn mức: tổng nợ không vượt 20% tiền mặt. */
export function debtLimit(state: GameState): number {
  return Math.floor(Math.max(0, state.money) * DATA.balance.debt.limitRatio);
}

export function canGiveCredit(state: GameState, amount: number): boolean {
  return hasFeature(state.level, 'credit') && openDebtTotal(state) + amount <= debtLimit(state);
}

/** Ghi nợ mới; số phận khoản nợ (trả đúng hạn / trễ / quỵt) được rút ngay khi ghi. */
export function recordDebt(state: GameState, name: string, amount: number, rng: Rng): Debt {
  const cfg = DATA.balance.debt;
  const id = state.ledger.reduce((max, d) => Math.max(max, d.id), 0) + 1;
  const dueDay = state.day + cfg.dueDays;
  const roll = rng.next();
  let debt: Debt;
  if (roll < cfg.onTime) debt = { id, name, amount, day: state.day, dueDay, fate: 'onTime', repayDay: state.day + rng.int(1, cfg.dueDays), status: 'open' };
  else if (roll < cfg.onTime + cfg.late) debt = { id, name, amount, day: state.day, dueDay, fate: 'late', repayDay: dueDay + rng.int(1, Math.max(1, cfg.badAfterDays - cfg.dueDays - 1)), status: 'open' };
  else debt = { id, name, amount, day: state.day, dueDay, fate: 'default', repayDay: null, status: 'open' };
  state.ledger.push(debt);
  state.today.debtGiven += amount;
  return debt;
}

export function isOverdue(state: GameState, debt: Debt): boolean {
  return debt.status === 'open' && state.day > debt.dueDay;
}

export type RemindResult = 'ok' | 'early' | 'already' | 'missing';

/** Nhắc nợ: quá hạn thì tăng xác suất trả trong 2 ngày tới; chưa tới hạn thì khách phật ý (ghi 2 sao). */
export function remindDebt(state: GameState, id: number, rng: Rng): RemindResult {
  const cfg = DATA.balance.debt;
  const debt = state.ledger.find((d) => d.id === id && d.status === 'open');
  if (!debt) return 'missing';
  if (!isOverdue(state, debt)) {
    recordRating(state, cfg.wrongReminderStars);
    return 'early';
  }
  if (debt.reminded) return 'already';
  debt.reminded = true;
  const soon = state.day + rng.int(1, cfg.reminderDays);
  if (rng.next() < cfg.reminderRepay) debt.repayDay = debt.repayDay === null ? soon : Math.min(debt.repayDay, soon);
  return 'ok';
}

/** Khoản nợ khách sẽ ghé trả hôm nay. */
export function repaymentsToday(state: GameState): Debt[] {
  return openDebts(state).filter((d) => d.repayDay !== null && d.repayDay <= state.day);
}

export function collectDebt(state: GameState, id: number): number {
  const debt = state.ledger.find((d) => d.id === id && d.status === 'open');
  if (!debt) return 0;
  debt.status = 'paid';
  state.money += debt.amount;
  state.today.debtCollected++;
  state.today.debtCollectedAmount += debt.amount;
  state.lifetime.debtsCollected++;
  return debt.amount;
}

/** Cuối ngày: khoản quá 7 ngày chưa trả thành nợ khó đòi. */
export function markBadDebts(state: GameState): Debt[] {
  const cfg = DATA.balance.debt;
  const bad = openDebts(state).filter((d) => state.day - d.day >= cfg.badAfterDays && (d.repayDay === null || d.repayDay > state.day));
  for (const d of bad) {
    d.status = 'bad';
    state.today.badDebt += d.amount;
  }
  // Giữ sổ gọn: bỏ các dòng đã xong quá 14 ngày.
  state.ledger = state.ledger.filter((d) => d.status === 'open' || state.day - d.day <= 14);
  return bad;
}
