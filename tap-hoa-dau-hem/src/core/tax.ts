import calendarData from '../data/calendar.json';
import { calendarDate } from './calendar';
import { DATA, hasFeature, product, type TaxKind } from './data';
import { formatMoney, type GameState, type TaxBill } from './state';

/**
 * Thuế hộ kinh doanh (mô phỏng cách tính thuế theo % doanh thu của hộ kinh doanh ở Việt Nam):
 * - Doanh thu cả năm dưới ngưỡng thì miễn thuế; chỉ phần vượt ngưỡng mới chịu thuế.
 * - Phần vượt ngưỡng nộp VAT + thuế TNCN theo tỉ lệ của từng nhóm ngành (bán hàng, ăn uống, dịch vụ).
 * - Thuế cộng dồn theo tháng game; sang tháng mới lập tờ thuế, hạn nộp vài ngày đầu tháng.
 * - Trễ hạn thì bị tính tiền chậm nộp theo ngày; trễ lâu bị cưỡng chế trừ thẳng vào tiền mặt kèm tiền phạt.
 */

export const TAX_KIND_NAMES: Record<TaxKind, string> = {
  goods: 'Bán hàng hóa',
  food: 'Ăn uống',
  service: 'Dịch vụ giao hàng',
};

function monthKey(state: GameState, day = state.day): number {
  const d = calendarDate(day, { month: state.calendarStartMonth, year: state.calendarStartYear });
  return d.year * 12 + d.month - 1;
}

export function monthLabel(key: number): string {
  return `tháng ${key % 12 + 1}/năm ${Math.floor(key / 12)}`;
}

/** Tính thuế đã mở chưa (đăng ký hộ kinh doanh). */
export function taxActive(state: GameState): boolean {
  return state.tax.registered;
}

/** Tổng tỉ lệ thuế (VAT + TNCN) của một nhóm ngành. */
export function taxRate(kind: TaxKind): number {
  const r = DATA.balance.tax.rates[kind];
  return r.vat + r.pit;
}

/** Món chế biến (bếp, quầy nước) tính thuế theo ngành ăn uống; còn lại là bán hàng hóa. */
export function taxKindOfProduct(productId: string): TaxKind {
  return product(productId).recipeOnly ? 'food' : 'goods';
}

/**
 * Ghi nhận doanh thu chịu thuế. Chỉ phần doanh thu năm vượt ngưỡng mới phát sinh thuế.
 * Trả về số thuế phát sinh (chưa làm tròn).
 */
export function recordTaxableRevenue(state: GameState, kind: TaxKind, amount: number): number {
  const tax = state.tax;
  if (!tax.registered || !(amount > 0)) return 0;
  const cfg = DATA.balance.tax;
  const before = tax.yearRevenue;
  const after = before + amount;
  const over = Math.max(0, after - Math.max(before, cfg.yearlyThreshold));
  const rate = cfg.rates[kind];
  const vat = over * rate.vat;
  const pit = over * rate.pit;
  tax.yearRevenue = after;
  tax.monthRevenue[kind] += amount;
  tax.monthVat += vat;
  tax.monthPit += pit;
  state.today.taxAccrued = (state.today.taxAccrued ?? 0) + vat + pit;
  return vat + pit;
}

/** Thuế tạm tính của tháng đang chạy. */
export function monthTaxEstimate(state: GameState): number {
  return Math.round(state.tax.monthVat + state.tax.monthPit);
}

/** Số ngày quá hạn đang bị tính tiền chậm nộp. */
export function lateDays(state: GameState, bill: TaxBill): number {
  return bill.status === 'open' ? Math.max(0, state.day - Math.max(bill.dueDay, bill.interestFrom)) : 0;
}

export function lateInterest(state: GameState, bill: TaxBill): number {
  return Math.round(bill.amount * DATA.balance.tax.lateInterestPerDay * lateDays(state, bill));
}

/** Số tiền phải nộp ngay cho tờ thuế (thuế còn nợ + tiền chậm nộp). */
export function billTotal(state: GameState, bill: TaxBill): number {
  return bill.status === 'open' ? bill.amount + lateInterest(state, bill) : 0;
}

export function openBills(state: GameState): TaxBill[] {
  return state.tax.bills.filter((b) => b.status === 'open');
}

/** Tổng thuế đang nợ (kể cả tiền chậm nộp). */
export function taxOwed(state: GameState): number {
  return openBills(state).reduce((sum, b) => sum + billTotal(state, b), 0);
}

export function taxBillOverdue(state: GameState, bill: TaxBill): boolean {
  return bill.status === 'open' && state.day > bill.dueDay;
}

/** Ngày cưỡng chế: quá hạn quá số ngày cho phép. */
export function enforceDay(bill: TaxBill): number {
  return bill.dueDay + DATA.balance.tax.enforceAfterDays + 1;
}

export type PayResult = 'ok' | 'money' | 'missing';

export function payTaxBill(state: GameState, id: number): PayResult {
  const bill = state.tax.bills.find((b) => b.id === id && b.status === 'open');
  if (!bill) return 'missing';
  const total = billTotal(state, bill);
  if (state.money < total) return 'money';
  state.money -= total;
  bill.status = 'paid';
  bill.paidDay = state.day;
  bill.paidTotal = (bill.paidTotal ?? 0) + total;
  bill.amount = 0;
  state.tax.lifetimePaid += total;
  return 'ok';
}

/** Nộp hết các tờ đủ tiền nộp, hạn sớm trước. Trả về số tiền đã nộp. */
export function payAllTaxBills(state: GameState): number {
  let paid = 0;
  for (const bill of [...openBills(state)].sort((a, b) => a.dueDay - b.dueDay)) {
    const total = billTotal(state, bill);
    if (payTaxBill(state, bill.id) === 'ok') paid += total;
  }
  return paid;
}

/** Chốt tháng đang cộng dồn thành tờ thuế (khi có thuế phải nộp). */
function closeMonth(state: GameState, nextMonthStartDay: number): void {
  const tax = state.tax;
  const cfg = DATA.balance.tax;
  const vat = Math.round(tax.monthVat);
  const pit = Math.round(tax.monthPit);
  const revenue = tax.monthRevenue.goods + tax.monthRevenue.food + tax.monthRevenue.service;
  const label = monthLabel(tax.month);
  if (vat + pit > 0) {
    const dueDay = nextMonthStartDay + cfg.dueDays - 1;
    tax.bills.push({
      id: tax.nextBillId++, year: Math.floor(tax.month / 12), month: tax.month % 12 + 1, revenue: { ...tax.monthRevenue },
      vat, pit, amount: vat + pit, dueDay, interestFrom: dueDay, status: 'open',
    });
    state.morningNotes.push(`🧾 Chốt thuế ${label}: doanh thu ${formatMoney(revenue)}, phải nộp ${formatMoney(vat + pit)} (hạn hết ngày ${dueDay}). Nộp ở ☰ Tiệm → Sổ thuế.`);
  } else if (revenue > 0) {
    const left = Math.max(0, cfg.yearlyThreshold - tax.yearRevenue);
    state.morningNotes.push(`🧾 Chốt thuế ${label}: doanh thu ${formatMoney(revenue)}, chưa vượt ngưỡng miễn thuế (còn ${formatMoney(left)}).`);
  }
  tax.monthRevenue = { goods: 0, food: 0, service: 0 };
  tax.monthVat = 0;
  tax.monthPit = 0;
}

/** Cưỡng chế tờ quá hạn lâu: trừ thẳng tiền mặt, lần đầu kèm tiền phạt. */
function enforceBills(state: GameState): void {
  const cfg = DATA.balance.tax;
  for (const bill of openBills(state)) {
    if (state.day < enforceDay(bill)) continue;
    if (!bill.fined) {
      bill.fined = true;
      const fine = Math.round((bill.vat + bill.pit) * cfg.enforceFine);
      bill.amount += lateInterest(state, bill) + fine;
      bill.interestFrom = state.day;
    }
    const total = billTotal(state, bill);
    const take = Math.min(Math.max(0, state.money), total);
    if (take <= 0) {
      state.morningNotes.push(`⚠️ Cơ quan thuế cưỡng chế thuế ${monthLabel(bill.year * 12 + bill.month - 1)} nhưng tiệm hết tiền. Còn nợ ${formatMoney(total)}.`);
      continue;
    }
    state.money -= take;
    state.tax.lifetimePaid += take;
    bill.paidTotal = (bill.paidTotal ?? 0) + take;
    if (take >= total) {
      bill.status = 'enforced';
      bill.amount = 0;
      bill.paidDay = state.day;
    } else {
      bill.amount = total - take;
      bill.interestFrom = state.day;
    }
    state.morningNotes.push(`⚠️ Quá hạn nộp thuế ${monthLabel(bill.year * 12 + bill.month - 1)}: bị cưỡng chế trừ ${formatMoney(take)} (đã gồm phạt ${Math.round(cfg.enforceFine * 100)}% và tiền chậm nộp).`);
  }
}

function trimHistory(state: GameState): void {
  const keep = DATA.balance.tax.historyBills;
  const done = state.tax.bills.filter((b) => b.status !== 'open');
  if (done.length <= keep) return;
  const drop = new Set(done.slice(0, done.length - keep));
  state.tax.bills = state.tax.bills.filter((b) => !drop.has(b));
}

/**
 * Chạy mỗi khi sang ngày mới (kể cả các ngày offline): đăng ký hộ kinh doanh khi mở khóa,
 * chốt tháng cũ thành tờ thuế, đổi năm thì tính lại ngưỡng, cưỡng chế tờ quá hạn lâu.
 */
export function updateTax(state: GameState): void {
  const tax = state.tax;
  const key = monthKey(state);
  if (!tax.registered) {
    if (!hasFeature(state.level, 'tax')) return;
    tax.registered = true;
    tax.registeredDay = state.day;
    tax.month = key;
    tax.year = Math.floor(key / 12);
    tax.yearRevenue = 0;
    state.morningNotes.push(`🧾 Tiệm đã đăng ký hộ kinh doanh. Doanh thu mỗi năm dưới ${formatMoney(DATA.balance.tax.yearlyThreshold)} được miễn thuế.`);
    return;
  }
  if (key > tax.month) {
    const offset = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear }).day - 1;
    closeMonth(state, state.day - offset);
    tax.month = key;
    const year = Math.floor(key / 12);
    if (year !== tax.year) {
      tax.year = year;
      tax.yearRevenue = 0;
    }
  }
  enforceBills(state);
  trimHistory(state);
}

/** Lời nhắc buổi sáng: tờ thuế sắp tới hạn hoặc đã quá hạn. */
export function taxReminders(state: GameState): string[] {
  const cfg = DATA.balance.tax;
  const out: string[] = [];
  for (const bill of openBills(state)) {
    const label = monthLabel(bill.year * 12 + bill.month - 1);
    const left = bill.dueDay - state.day;
    if (left < 0) {
      out.push(`⏰ Thuế ${label} đã quá hạn ${-left} ngày, đang bị tính tiền chậm nộp (${formatMoney(billTotal(state, bill))}). Cưỡng chế từ ngày ${enforceDay(bill)}.`);
    } else if (left <= cfg.remindDays) {
      out.push(`⏰ Thuế ${label}: ${formatMoney(bill.amount)}, hạn ${left === 0 ? 'hôm nay' : `còn ${left} ngày`}.`);
    }
  }
  return out;
}

/** Số ngày còn lại tới khi chốt tháng thuế đang chạy. */
export function daysUntilMonthEnd(state: GameState): number {
  const d = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear });
  return calendarData.daysPerMonth - d.day;
}
