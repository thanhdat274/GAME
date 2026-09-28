import calendarData from '../data/calendar.json';
import { calendarDate } from './calendar';
import { DATA, hasFeature, product, supplier, type TaxKind } from './data';
import { addPlayerExperience, recordRating } from './progression';
import { Rng, daySeed } from './rng';
import { shiftsOn } from './schedule';
import { onProbation } from './staff';
import { formatMoney, type GameState, type TaxBill } from './state';

/**
 * Thuế của tiệm, mô phỏng cách tính thuế ở Việt Nam:
 * - Hộ kinh doanh: doanh thu cả năm dưới ngưỡng thì miễn thuế; phần vượt ngưỡng nộp VAT + thuế TNCN
 *   theo tỉ lệ % doanh thu của từng nhóm ngành (bán hàng, ăn uống, dịch vụ).
 * - Doanh nghiệp (lên ở level cao, tùy chọn): VAT khấu trừ (đầu ra − đầu vào có hóa đơn) + thuế TNDN trên lãi.
 * - Thuế cộng dồn theo tháng game; sang tháng mới lập tờ thuế, hạn nộp vài ngày đầu tháng.
 *   Trễ hạn tính tiền chậm nộp; trễ lâu bị cưỡng chế trừ thẳng tiền mặt kèm tiền phạt.
 * - Khai bớt doanh thu, nhập hàng chợ không hóa đơn hay chưa lắp máy tính tiền khi bắt buộc
 *   đều có thể bị phát hiện khi thanh tra (ngẫu nhiên lúc chốt tháng).
 */

export const TAX_KIND_NAMES: Record<TaxKind, string> = {
  goods: 'Bán hàng hóa',
  food: 'Ăn uống',
  service: 'Dịch vụ giao hàng',
};

const cfg = () => DATA.balance.tax;

function monthKey(state: GameState, day = state.day): number {
  const d = calendarDate(day, { month: state.calendarStartMonth, year: state.calendarStartYear });
  return d.year * 12 + d.month - 1;
}

export function monthLabel(key: number): string {
  return `tháng ${key % 12 + 1}/năm ${Math.floor(key / 12)}`;
}

export function billLabel(bill: TaxBill): string {
  const month = monthLabel(bill.year * 12 + bill.month - 1);
  return bill.kind === 'audit' ? `Truy thu thanh tra ${month}` : `Thuế ${month}`;
}

/** Tính thuế đã mở chưa (đăng ký hộ kinh doanh). */
export function taxActive(state: GameState): boolean {
  return state.tax.registered;
}

export function isCompany(state: GameState): boolean {
  return state.tax.mode === 'company';
}

/** Tên loại thuế thu nhập theo hình thức: hộ kinh doanh nộp TNCN, doanh nghiệp nộp TNDN. */
export function incomeTaxName(state: GameState): string {
  return isCompany(state) ? 'TNDN' : 'TNCN';
}

/** Tổng tỉ lệ thuế (VAT + TNCN) của một nhóm ngành, hình thức hộ kinh doanh. */
export function taxRate(kind: TaxKind): number {
  const r = cfg().rates[kind];
  return r.vat + r.pit;
}

/** Món chế biến (bếp, quầy nước) tính thuế theo ngành ăn uống; còn lại là bán hàng hóa. */
export function taxKindOfProduct(productId: string): TaxKind {
  return product(productId).recipeOnly ? 'food' : 'goods';
}

function addAccrued(state: GameState, amount: number): void {
  state.today.taxAccrued = (state.today.taxAccrued ?? 0) + amount;
}

/** Phần VAT nằm trong giá đã gồm thuế. */
function vatInside(amount: number): number {
  const v = cfg().company.vatRate;
  return (amount * v) / (1 + v);
}

/**
 * Ghi nhận doanh thu chịu thuế. Hộ kinh doanh: chỉ phần doanh thu năm vượt ngưỡng mới phát sinh thuế.
 * Doanh nghiệp: mọi doanh thu đều có VAT đầu ra (TNDN tính trên lãi lúc cuối ngày).
 * Trả về số thuế phát sinh (chưa làm tròn).
 */
export function recordTaxableRevenue(state: GameState, kind: TaxKind, amount: number): number {
  const tax = state.tax;
  if (!tax.registered || !(amount > 0)) return 0;
  const before = tax.yearRevenue;
  tax.yearRevenue = before + amount;
  tax.monthRevenue[kind] += amount;
  if (isCompany(state)) {
    const vat = vatInside(amount);
    tax.monthVat += vat;
    addAccrued(state, vat);
    return vat;
  }
  const over = Math.max(0, tax.yearRevenue - Math.max(before, cfg().yearlyThreshold));
  const rate = cfg().rates[kind];
  const vat = over * rate.vat;
  const pit = over * rate.pit;
  tax.monthVat += vat;
  tax.monthPit += pit;
  addAccrued(state, vat + pit);
  return vat + pit;
}

/**
 * Ghi nhận một lần nhập hàng: mối có hóa đơn thì doanh nghiệp được khấu trừ VAT đầu vào;
 * mối không hóa đơn (chợ) thì cộng vào phần hàng thanh tra có thể phạt.
 */
export function recordPurchase(state: GameState, supplierId: string, total: number): void {
  const tax = state.tax;
  if (!tax.registered || !(total > 0)) return;
  if (!supplier(supplierId).invoice) {
    tax.unauditedMarket += total;
    return;
  }
  if (!isCompany(state)) return;
  const vat = vatInside(total);
  tax.monthVat -= vat;
  addAccrued(state, -vat);
}

/** Chiết khấu thương mại mối có hóa đơn dành cho doanh nghiệp (nhân vào giá nhập). */
export function supplierTaxFactor(state: GameState | null, supplierId: string): number {
  return state?.tax?.mode === 'company' && supplier(supplierId).invoice ? 1 - cfg().company.supplierDiscount : 1;
}

/** Hệ số tiền thưởng đơn tiệc: khách tổ chức cần hóa đơn VAT nên trả cao hơn cho doanh nghiệp. */
export function partyRewardFactor(state: GameState): number {
  return state.tax?.mode === 'company' ? cfg().company.partyRewardMul : 1;
}

// ---------- Khách xin hóa đơn ----------

/** Khách văn phòng xin xuất hóa đơn (quyết định riêng theo id khách để không đổi chuỗi ngẫu nhiên của ngày). */
export function customerWantsInvoice(state: GameState | undefined, typeId: string, customerId: number): boolean {
  if (!state?.tax?.registered) return false;
  const c = cfg().invoiceCustomer;
  if (typeId !== c.type) return false;
  const chance = isCompany(state) ? c.companyChance : c.chance;
  return new Rng(daySeed(state.day, customerId * 7919 + 0x1ab)).next() < chance;
}

// ---------- Cuối ngày ----------

export interface DayTaxResult {
  /** Tổng thuế phát sinh trong ngày (âm nếu được khấu trừ nhiều hơn). */
  tax: number;
  staffPit: number;
  reserved: number;
}

/** Khấu trừ TNCN của nhân viên có lương ngày vượt mức (tiệm giữ lại, nộp thay cùng tờ thuế tháng). */
function withholdStaffPit(state: GameState): number {
  const c = cfg().staffPit;
  if (state.wageDebt > 0) return 0;
  let total = 0;
  for (const s of state.staff) {
    if (s.quitting || onProbation(s, state.day)) continue;
    const paid = Math.round((s.wage * shiftsOn(state, s.id, state.day)) / 2);
    total += Math.round(Math.max(0, paid - c.dailyThreshold) * c.rate);
  }
  return total;
}

/**
 * Chạy sau khi trả lương cuối ngày: khấu trừ TNCN nhân viên, doanh nghiệp tạm tính TNDN trên lãi ngày,
 * rồi chuyển thuế vào quỹ thuế nếu đang bật. `preTaxProfit` là lãi ròng trước thuế của ngày.
 */
export function endDayTax(state: GameState, preTaxProfit: number): DayTaxResult {
  const tax = state.tax;
  const t = state.today;
  if (!tax.registered) return { tax: Math.round(t.taxAccrued ?? 0), staffPit: 0, reserved: 0 };
  const staffPit = withholdStaffPit(state);
  if (staffPit > 0) {
    state.money += staffPit;
    tax.monthStaffPit += staffPit;
  }
  if (isCompany(state)) {
    // Lãi chịu thuế: bỏ phần VAT (thu hộ nhà nước) ra khỏi lãi.
    const cit = (preTaxProfit - (t.taxAccrued ?? 0)) * cfg().company.citRate;
    tax.monthPit += cit;
    addAccrued(state, cit);
  }
  let reserved = 0;
  if (tax.reserveOn) {
    reserved = Math.min(Math.max(0, state.money), Math.max(0, Math.round(t.taxAccrued ?? 0)) + staffPit);
    state.money -= reserved;
    tax.reserve += reserved;
  }
  return { tax: Math.round(t.taxAccrued ?? 0), staffPit, reserved };
}

// ---------- Tờ thuế ----------

/** Thuế tạm tính của tháng đang chạy (phần âm được chuyển sang tháng sau, không tính). */
export function monthTaxEstimate(state: GameState): number {
  const tax = state.tax;
  return Math.max(0, Math.round(tax.monthVat)) + Math.max(0, Math.round(tax.monthPit)) + Math.round(tax.monthStaffPit);
}

/** Số ngày quá hạn đang bị tính tiền chậm nộp. */
export function lateDays(state: GameState, bill: TaxBill): number {
  return bill.status === 'open' ? Math.max(0, state.day - Math.max(bill.dueDay, bill.interestFrom)) : 0;
}

export function lateInterest(state: GameState, bill: TaxBill): number {
  return Math.round(bill.amount * cfg().lateInterestPerDay * lateDays(state, bill));
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
  return bill.dueDay + cfg().enforceAfterDays + 1;
}

/** Tiền có thể dùng nộp thuế: quỹ thuế trước, rồi tiền mặt. */
export function taxFunds(state: GameState): number {
  return state.tax.reserve + Math.max(0, state.money);
}

function spend(state: GameState, amount: number): void {
  const fromReserve = Math.min(state.tax.reserve, amount);
  state.tax.reserve -= fromReserve;
  state.money -= amount - fromReserve;
  state.tax.lifetimePaid += amount;
  state.tax.yearPaid += amount;
}

function markLate(state: GameState): void {
  state.tax.onTimeStreak = 0;
  state.tax.yearLate++;
}

export type PayResult = 'ok' | 'money' | 'missing';

export function payTaxBill(state: GameState, id: number): PayResult {
  const bill = state.tax.bills.find((b) => b.id === id && b.status === 'open');
  if (!bill) return 'missing';
  const total = billTotal(state, bill);
  if (taxFunds(state) < total) return 'money';
  spend(state, total);
  const late = state.day > bill.dueDay;
  bill.status = 'paid';
  bill.paidDay = state.day;
  bill.paidTotal = (bill.paidTotal ?? 0) + total;
  bill.amount = 0;
  if (late) {
    if (!bill.fined) markLate(state);
  } else if (bill.kind !== 'audit') {
    state.tax.onTimeStreak++;
    state.tax.bestOnTimeStreak = Math.max(state.tax.bestOnTimeStreak, state.tax.onTimeStreak);
  }
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

export type DeclareResult = 'ok' | 'machine' | 'already' | 'missing';

/** Có thể khai bớt tờ này không (chưa lắp máy tính tiền, tờ thuế tháng chưa nộp, chưa khai bớt). */
export function canDeclareLess(state: GameState, bill: TaxBill): boolean {
  return !state.tax.invoiceMachine && bill.status === 'open' && bill.kind !== 'audit' && !bill.hidden && !bill.audited && bill.vat + bill.pit > 0;
}

/**
 * Khai bớt doanh thu: số thuế phải nộp giảm một phần, nhưng phần giấu đi sẽ bị truy thu và phạt nếu gặp thanh tra.
 * Máy tính tiền ghi mọi hóa đơn nên đã lắp thì không khai bớt được.
 */
export function declareLess(state: GameState, id: number): DeclareResult {
  const bill = state.tax.bills.find((b) => b.id === id && b.status === 'open');
  if (!bill) return 'missing';
  if (state.tax.invoiceMachine) return 'machine';
  if (!canDeclareLess(state, bill)) return 'already';
  const hidden = Math.round((bill.vat + bill.pit) * cfg().underDeclarePct);
  bill.hidden = hidden;
  bill.amount = Math.max(0, bill.amount - hidden);
  return 'ok';
}

// ---------- Quỹ thuế, máy tính tiền, doanh nghiệp ----------

/** Bật/tắt quỹ thuế; tắt thì tiền trong quỹ trở lại tiền mặt. */
export function setTaxReserve(state: GameState, on: boolean): void {
  state.tax.reserveOn = on;
  if (!on) {
    state.money += state.tax.reserve;
    state.tax.reserve = 0;
  }
}

/** Doanh thu năm đã tới mức bắt buộc dùng hóa đơn điện tử từ máy tính tiền. */
export function machineRequired(state: GameState): boolean {
  return state.tax.yearRevenue >= cfg().invoiceMachine.requiredYearRevenue;
}

export type MachineResult = 'ok' | 'owned' | 'money' | 'locked';

export function buyInvoiceMachine(state: GameState): MachineResult {
  if (!state.tax.registered) return 'locked';
  if (state.tax.invoiceMachine) return 'owned';
  const cost = cfg().invoiceMachine.cost;
  if (state.money < cost) return 'money';
  state.money -= cost;
  state.tax.invoiceMachine = true;
  return 'ok';
}

export type CompanyResult = 'ok' | 'locked' | 'already' | 'machine' | 'money' | 'owed';

export function companyCheck(state: GameState): CompanyResult {
  if (isCompany(state)) return 'already';
  if (!state.tax.registered || !hasFeature(state.level, 'company')) return 'locked';
  if (!state.tax.invoiceMachine) return 'machine';
  if (openBills(state).length) return 'owed';
  if (state.money < cfg().company.setupCost) return 'money';
  return 'ok';
}

/**
 * Chuyển lên doanh nghiệp: mất ngưỡng miễn thuế, nộp VAT khấu trừ + TNDN trên lãi;
 * đổi lại được chiết khấu ở mối có hóa đơn, khách công ty ghé nhiều hơn, đơn tiệc trả cao hơn.
 */
export function becomeCompany(state: GameState): CompanyResult {
  const check = companyCheck(state);
  if (check !== 'ok') return check;
  state.money -= cfg().company.setupCost;
  state.tax.mode = 'company';
  state.tax.companyDay = state.day;
  return 'ok';
}

// ---------- Chốt tháng, thanh tra, quyết toán ----------

/** Chốt tháng đang cộng dồn thành tờ thuế (khi có thuế phải nộp). */
function closeMonth(state: GameState, nextMonthStartDay: number): void {
  const tax = state.tax;
  const company = isCompany(state);
  const rawVat = Math.round(tax.monthVat);
  const rawPit = Math.round(tax.monthPit);
  const vat = Math.max(0, rawVat);
  const pit = Math.max(0, rawPit);
  const staffPit = Math.round(tax.monthStaffPit);
  const revenue = tax.monthRevenue.goods + tax.monthRevenue.food + tax.monthRevenue.service;
  const label = monthLabel(tax.month);
  if (vat + pit + staffPit > 0) {
    const dueDay = nextMonthStartDay + cfg().dueDays - 1;
    tax.bills.push({
      id: tax.nextBillId++, year: Math.floor(tax.month / 12), month: tax.month % 12 + 1, kind: 'month', mode: tax.mode,
      revenue: { ...tax.monthRevenue }, vat, pit, staffPit, amount: vat + pit + staffPit, dueDay, interestFrom: dueDay, status: 'open',
    });
    state.morningNotes.push(`🧾 Chốt thuế ${label}: doanh thu ${formatMoney(revenue)}, phải nộp ${formatMoney(vat + pit + staffPit)} (hạn hết ngày ${dueDay}). Nộp ở ☰ Tiệm → Sổ thuế.`);
  } else if (revenue > 0 && !company) {
    const left = Math.max(0, cfg().yearlyThreshold - tax.yearRevenue);
    state.morningNotes.push(`🧾 Chốt thuế ${label}: doanh thu ${formatMoney(revenue)}, chưa vượt ngưỡng miễn thuế (còn ${formatMoney(left)}).`);
  } else if (revenue > 0) {
    state.morningNotes.push(`🧾 Chốt thuế ${label}: không phải nộp (VAT được khấu trừ / lỗ chuyển sang tháng sau).`);
  }
  tax.monthRevenue = { goods: 0, food: 0, service: 0 };
  // Doanh nghiệp: VAT đầu vào dư và lỗ được chuyển sang tháng sau.
  tax.monthVat = company ? Math.min(0, rawVat) : 0;
  tax.monthPit = company ? Math.min(0, rawPit) : 0;
  tax.monthStaffPit = 0;
}

/** Xác suất bị thanh tra lần chốt tháng này. */
export function auditChance(state: GameState): number {
  const a = cfg().audit;
  if (state.tax.invoiceMachine) return a.withMachineChance;
  return a.chance + (machineRequired(state) ? a.noMachineExtraChance : 0);
}

/**
 * Thanh tra thuế (ngẫu nhiên khi chốt tháng): truy thu phần khai bớt kèm phạt, phạt hàng nhập không hóa đơn,
 * phạt chưa lắp máy tính tiền khi đã bắt buộc. Sổ sách sạch thì được tiếng tốt với xóm.
 */
export function runAudit(state: GameState): number {
  const tax = state.tax;
  const a = cfg().audit;
  const findings: string[] = [];
  let total = 0;
  const hiddenBills = tax.bills.filter((b) => (b.hidden ?? 0) > 0 && !b.audited);
  const evaded = hiddenBills.reduce((sum, b) => sum + (b.hidden ?? 0), 0);
  if (evaded > 0) {
    const fine = Math.round(evaded * a.evasionFineMul);
    total += evaded + fine;
    findings.push(`Khai thiếu doanh thu: truy thu ${formatMoney(evaded)}, phạt ${formatMoney(fine)}`);
    tax.yearEvasion = true;
    recordRating(state, a.evasionStars);
  }
  for (const bill of tax.bills) bill.audited = true;
  if (tax.unauditedMarket > 0) {
    const fine = Math.round(tax.unauditedMarket * a.marketFineRate);
    total += fine;
    findings.push(`Hàng nhập không hóa đơn ${formatMoney(tax.unauditedMarket)}: phạt ${formatMoney(fine)}`);
    tax.unauditedMarket = 0;
  }
  if (!tax.invoiceMachine && machineRequired(state)) {
    total += a.noMachineFine;
    findings.push(`Doanh thu đã tới mức bắt buộc mà chưa dùng máy tính tiền: phạt ${formatMoney(a.noMachineFine)}`);
  }
  tax.audits.push({ day: state.day, total, findings });
  if (tax.audits.length > 10) tax.audits.splice(0, tax.audits.length - 10);
  if (total > 0) {
    const key = monthKey(state);
    const dueDay = state.day + cfg().dueDays - 1;
    tax.bills.push({
      id: tax.nextBillId++, year: Math.floor(key / 12), month: key % 12 + 1, kind: 'audit', mode: tax.mode,
      revenue: { goods: 0, food: 0, service: 0 }, vat: 0, pit: 0, amount: total, dueDay, interestFrom: dueDay, status: 'open',
      audited: true, note: findings.join('\n'),
    });
    state.morningNotes.push(`🕵️ Chị Hạnh bên thuế phường ghé thanh tra: ${findings.join('; ')}. Tổng phải nộp ${formatMoney(total)} (hạn hết ngày ${dueDay}).`);
  } else {
    recordRating(state, a.cleanStars);
    state.morningNotes.push('🕵️ Chị Hạnh bên thuế phường ghé thanh tra: sổ sách minh bạch, không vi phạm gì. Xóm khen tiệm làm ăn đàng hoàng!');
  }
  return total;
}

/** Quyết toán năm cũ: tổng kết, khen hộ/doanh nghiệp gương mẫu nếu nộp đủ, đúng hạn, không bị truy thu. */
function settleYear(state: GameState): void {
  const tax = state.tax;
  const exemplary = tax.yearPaid > 0 && tax.yearLate === 0 && !tax.yearEvasion;
  tax.years.push({ year: tax.year, revenue: tax.yearRevenue, paid: tax.yearPaid, late: tax.yearLate, evasion: tax.yearEvasion, exemplary });
  if (tax.years.length > 5) tax.years.splice(0, tax.years.length - 5);
  const who = isCompany(state) ? 'Doanh nghiệp' : 'Hộ kinh doanh';
  state.morningNotes.push(`📊 Quyết toán thuế năm ${tax.year}: doanh thu ${formatMoney(tax.yearRevenue)}, đã nộp ${formatMoney(tax.yearPaid)}${tax.yearLate ? `, trễ hạn ${tax.yearLate} lần` : ''}.`);
  if (exemplary) {
    addPlayerExperience(state, cfg().settlementExp);
    state.today.expGained += cfg().settlementExp;
    state.morningNotes.push(`🏅 Phường khen ${who.toLowerCase()} nộp thuế gương mẫu năm ${tax.year}: +${cfg().settlementExp} EXP.`);
  }
  tax.yearRevenue = 0;
  tax.yearPaid = 0;
  tax.yearLate = 0;
  tax.yearEvasion = false;
  // Lỗ không chuyển qua năm sau (đơn giản hóa quyết toán TNDN).
  tax.monthPit = 0;
}

/** Cưỡng chế tờ quá hạn lâu: trừ thẳng quỹ thuế rồi tiền mặt, lần đầu kèm tiền phạt. */
function enforceBills(state: GameState): void {
  for (const bill of openBills(state)) {
    if (state.day < enforceDay(bill)) continue;
    if (!bill.fined) {
      bill.fined = true;
      markLate(state);
      const fine = Math.round((bill.vat + bill.pit + (bill.staffPit ?? 0) + (bill.kind === 'audit' ? bill.amount : 0)) * cfg().enforceFine);
      bill.amount += lateInterest(state, bill) + fine;
      bill.interestFrom = state.day;
    }
    const total = billTotal(state, bill);
    const take = Math.min(taxFunds(state), total);
    if (take <= 0) {
      state.morningNotes.push(`⚠️ Cơ quan thuế cưỡng chế ${billLabel(bill).toLowerCase()} nhưng tiệm hết tiền. Còn nợ ${formatMoney(total)}.`);
      continue;
    }
    spend(state, take);
    bill.paidTotal = (bill.paidTotal ?? 0) + take;
    if (take >= total) {
      bill.status = 'enforced';
      bill.amount = 0;
      bill.paidDay = state.day;
    } else {
      bill.amount = total - take;
      bill.interestFrom = state.day;
    }
    state.morningNotes.push(`⚠️ Quá hạn ${billLabel(bill).toLowerCase()}: bị cưỡng chế trừ ${formatMoney(take)} (đã gồm phạt ${Math.round(cfg().enforceFine * 100)}% và tiền chậm nộp).`);
  }
}

function trimHistory(state: GameState): void {
  const keep = cfg().historyBills;
  const done = state.tax.bills.filter((b) => b.status !== 'open');
  if (done.length <= keep) return;
  const drop = new Set(done.slice(0, done.length - keep));
  state.tax.bills = state.tax.bills.filter((b) => !drop.has(b));
}

/**
 * Chạy mỗi khi sang ngày mới (kể cả các ngày offline): đăng ký hộ kinh doanh khi mở khóa,
 * chốt tháng cũ thành tờ thuế (có thể gặp thanh tra), đổi năm thì quyết toán, cưỡng chế tờ quá hạn lâu.
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
    state.morningNotes.push(`🧾 Tiệm đã đăng ký hộ kinh doanh. Doanh thu mỗi năm dưới ${formatMoney(cfg().yearlyThreshold)} được miễn thuế.`);
    return;
  }
  if (key > tax.month) {
    const offset = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear }).day - 1;
    closeMonth(state, state.day - offset);
    if (new Rng(daySeed(state.day, 0x7a3)).next() < auditChance(state)) runAudit(state);
    tax.month = key;
    const year = Math.floor(key / 12);
    if (year !== tax.year) {
      settleYear(state);
      tax.year = year;
    }
  }
  if (!tax.invoiceMachine && machineRequired(state) && tax.machineWarnedYear !== tax.year) {
    tax.machineWarnedYear = tax.year;
    state.morningNotes.push(`🧾 Doanh thu năm đã vượt ${formatMoney(cfg().invoiceMachine.requiredYearRevenue)}: tiệm bắt buộc dùng máy tính tiền xuất hóa đơn điện tử. Lắp ở ☰ Tiệm → Sổ thuế kẻo bị phạt khi thanh tra.`);
  }
  enforceBills(state);
  trimHistory(state);
}

/** Lời nhắc buổi sáng: tờ thuế sắp tới hạn hoặc đã quá hạn. */
export function taxReminders(state: GameState): string[] {
  const out: string[] = [];
  for (const bill of openBills(state)) {
    const label = billLabel(bill);
    const left = bill.dueDay - state.day;
    if (left < 0) {
      out.push(`⏰ ${label} đã quá hạn ${-left} ngày, đang bị tính tiền chậm nộp (${formatMoney(billTotal(state, bill))}). Cưỡng chế từ ngày ${enforceDay(bill)}.`);
    } else if (left <= cfg().remindDays) {
      out.push(`⏰ ${label}: ${formatMoney(bill.amount)}, hạn ${left === 0 ? 'hôm nay' : `còn ${left} ngày`}.`);
    }
  }
  return out;
}

/** Số ngày còn lại tới khi chốt tháng thuế đang chạy. */
export function daysUntilMonthEnd(state: GameState): number {
  const d = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear });
  return calendarData.daysPerMonth - d.day;
}
