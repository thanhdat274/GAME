import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { endDay, startNextDay } from '../src/core/day';
import { collectDebt } from '../src/core/ledger';
import { migrate } from '../src/core/save';
import { createNewGame, type GameState } from '../src/core/state';
import {
  billTotal, monthTaxEstimate, openBills, payTaxBill, recordTaxableRevenue, taxKindOfProduct, taxOwed, taxReminders, updateTax,
} from '../src/core/tax';

const cfg = DATA.balance.tax;

/** Tiệm đã đủ level đăng ký hộ kinh doanh, đang ở ngày 1 tháng 1 năm 1. */
function registered(): GameState {
  const s = createNewGame();
  s.level = 10;
  updateTax(s);
  return s;
}

/** Nhảy tới ngày `day` và chạy xử lý thuế đầu ngày. */
function goTo(s: GameState, day: number): void {
  s.day = day;
  updateTax(s);
}

describe('thuế hộ kinh doanh', () => {
  it('chưa tới level đăng ký thì không ghi nhận doanh thu, không tính thuế', () => {
    const s = createNewGame();
    updateTax(s);
    expect(s.tax.registered).toBe(false);
    expect(recordTaxableRevenue(s, 'goods', cfg.yearlyThreshold * 2)).toBe(0);
    expect(s.tax.yearRevenue).toBe(0);
  });

  it('đăng ký khi mở khóa, có thông báo buổi sáng', () => {
    const s = registered();
    expect(s.tax.registered).toBe(true);
    expect(s.tax.year).toBe(1);
    expect(s.morningNotes.some((n) => n.includes('hộ kinh doanh'))).toBe(true);
  });

  it('dưới ngưỡng năm miễn thuế; chỉ phần vượt ngưỡng mới chịu thuế', () => {
    const s = registered();
    expect(recordTaxableRevenue(s, 'goods', cfg.yearlyThreshold - 1_000_000)).toBe(0);
    const tax = recordTaxableRevenue(s, 'goods', 3_000_000);
    const rate = cfg.rates.goods.vat + cfg.rates.goods.pit;
    expect(tax).toBeCloseTo(2_000_000 * rate);
    expect(monthTaxEstimate(s)).toBe(Math.round(2_000_000 * rate));
    expect(s.today.taxAccrued).toBeCloseTo(2_000_000 * rate);
  });

  it('ăn uống và dịch vụ chịu tỉ lệ cao hơn bán hàng hóa', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    const goods = recordTaxableRevenue(s, 'goods', 1_000_000);
    const food = recordTaxableRevenue(s, 'food', 1_000_000);
    const service = recordTaxableRevenue(s, 'service', 1_000_000);
    expect(food).toBeGreaterThan(goods);
    expect(service).toBeGreaterThan(food);
    expect(s.tax.monthRevenue).toEqual({ goods: 1_000_000, food: 1_000_000, service: 1_000_000 });
  });

  it('món chế biến tính theo ngành ăn uống', () => {
    const recipeProduct = DATA.products.find((p) => p.recipeOnly)!;
    const ordinary = DATA.products.find((p) => !p.recipeOnly)!;
    expect(taxKindOfProduct(recipeProduct.id)).toBe('food');
    expect(taxKindOfProduct(ordinary.id)).toBe('goods');
  });

  it('sang tháng mới lập tờ thuế, hạn nộp đầu tháng; nộp đúng hạn không mất thêm', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    const expected = Math.round(10_000_000 * cfg.rates.goods.vat) + Math.round(10_000_000 * cfg.rates.goods.pit);
    goTo(s, 5);
    expect(openBills(s)).toHaveLength(0);
    goTo(s, 11);
    const [bill] = openBills(s);
    expect(bill).toMatchObject({ month: 1, year: 1, amount: expected, dueDay: 11 + cfg.dueDays - 1 });
    expect(monthTaxEstimate(s)).toBe(0);
    s.money = 1_000_000;
    expect(payTaxBill(s, bill.id)).toBe('ok');
    expect(s.money).toBe(1_000_000 - expected);
    expect(s.tax.lifetimePaid).toBe(expected);
    expect(taxOwed(s)).toBe(0);
  });

  it('tháng dưới ngưỡng không lập tờ thuế, chỉ báo doanh thu', () => {
    const s = registered();
    recordTaxableRevenue(s, 'goods', 1_000_000);
    goTo(s, 11);
    expect(s.tax.bills).toHaveLength(0);
    expect(s.morningNotes.some((n) => n.includes('chưa vượt ngưỡng'))).toBe(true);
  });

  it('không đủ tiền thì không nộp được', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    goTo(s, 11);
    s.money = 0;
    expect(payTaxBill(s, openBills(s)[0].id)).toBe('money');
  });

  it('trễ hạn bị tính tiền chậm nộp, có nhắc buổi sáng', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    goTo(s, 11);
    const bill = openBills(s)[0];
    expect(taxReminders(s).length).toBe(0);
    goTo(s, bill.dueDay);
    expect(taxReminders(s)[0]).toContain('hôm nay');
    goTo(s, bill.dueDay + 3);
    expect(billTotal(s, bill)).toBe(bill.amount + Math.round(bill.amount * cfg.lateInterestPerDay * 3));
    expect(taxReminders(s)[0]).toContain('quá hạn 3 ngày');
  });

  it('quá hạn lâu bị cưỡng chế trừ tiền kèm phạt', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    goTo(s, 11);
    const bill = openBills(s)[0];
    const principal = bill.amount;
    s.money = 10_000_000;
    goTo(s, bill.dueDay + cfg.enforceAfterDays);
    expect(bill.status).toBe('open');
    goTo(s, bill.dueDay + cfg.enforceAfterDays + 1);
    const late = Math.round(principal * cfg.lateInterestPerDay * (cfg.enforceAfterDays + 1));
    const fine = Math.round(principal * cfg.enforceFine);
    expect(bill.status).toBe('enforced');
    expect(s.money).toBe(10_000_000 - principal - late - fine);
    expect(bill.paidTotal).toBe(principal + late + fine);
  });

  it('cưỡng chế khi thiếu tiền: trừ hết tiền mặt, phần còn lại vẫn nợ', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    goTo(s, 11);
    const bill = openBills(s)[0];
    s.money = 50_000;
    goTo(s, bill.dueDay + cfg.enforceAfterDays + 1);
    expect(s.money).toBe(0);
    expect(bill.status).toBe('open');
    expect(bill.amount).toBeGreaterThan(0);
    expect(bill.fined).toBe(true);
  });

  it('sang năm mới tính lại ngưỡng', () => {
    const s = registered();
    recordTaxableRevenue(s, 'goods', cfg.yearlyThreshold + 1_000_000);
    goTo(s, 121);
    expect(s.tax.year).toBe(2);
    expect(s.tax.yearRevenue).toBe(0);
    expect(recordTaxableRevenue(s, 'goods', 1_000_000)).toBe(0);
  });

  it('thu nợ khách ghi sổ cũng là doanh thu chịu thuế', () => {
    const s = registered();
    s.ledger.push({ id: 1, name: 'Cô Tư', amount: 50_000, day: 1, dueDay: 4, fate: 'onTime', repayDay: 2, status: 'open' });
    collectDebt(s, 1);
    expect(s.tax.monthRevenue.goods).toBe(50_000);
  });

  it('tổng kết ngày trừ thuế tạm tính vào lãi ròng', () => {
    const s = registered();
    s.phase = 'open';
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 1_000_000);
    const summary = endDay(s);
    const rate = cfg.rates.goods.vat + cfg.rates.goods.pit;
    expect(summary.tax).toBe(Math.round(1_000_000 * rate));
    const s2 = registered();
    s2.phase = 'open';
    expect(summary.netProfit).toBe((endDay(s2).netProfit ?? 0) - Math.round(1_000_000 * rate));
  });

  it('sang ngày mới chạy xử lý thuế (đăng ký khi vừa lên level)', () => {
    const s = createNewGame();
    s.phase = 'open';
    endDay(s);
    s.level = 10;
    startNextDay(s);
    expect(s.tax.registered).toBe(true);
  });

  it('bản lưu cũ không có thuế vẫn nạp được', () => {
    const s = createNewGame() as unknown as Record<string, unknown>;
    delete s.tax;
    const loaded = migrate({ version: 5, state: s });
    expect(loaded.tax.registered).toBe(false);
    expect(loaded.tax.bills).toEqual([]);
    expect(loaded.today.taxAccrued).toBe(0);
  });
});
