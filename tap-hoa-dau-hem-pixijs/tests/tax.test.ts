import { describe, expect, it } from 'vitest';
import { DATA } from '../src/core/data';
import { endDay, startNextDay } from '../src/core/day';
import { collectDebt } from '../src/core/ledger';
import { migrate } from '../src/core/save';
import { createNewGame, type GameState } from '../src/core/state';
import { checkAchievements } from '../src/core/quests';
import { beginChapter, chapterComplete } from '../src/core/story';
import {
  auditChance, becomeCompany, billTotal, buyInvoiceMachine, companyCheck, customerWantsInvoice, declareLess, isCompany, machineRequired,
  monthTaxEstimate, openBills, partyRewardFactor, payTaxBill, recordPurchase, recordTaxableRevenue, runAudit, setTaxReserve,
  supplierTaxFactor, taxKindOfProduct, taxOwed, taxReminders, updateTax,
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

describe('thuế nâng cao', () => {
  it('quỹ thuế: cuối ngày để riêng thuế tạm tính, nộp dùng quỹ trước, tắt thì trả về tiền mặt', () => {
    const s = registered();
    setTaxReserve(s, true);
    s.phase = 'open';
    s.money = 1_000_000;
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    const summary = endDay(s);
    expect(summary.taxReserved).toBe(summary.tax);
    expect(s.tax.reserve).toBe(summary.tax);
    expect(s.money).toBe(1_000_000 - (summary.tax ?? 0));
    goTo(s, 11);
    const bill = openBills(s)[0];
    s.money = 0;
    expect(payTaxBill(s, bill.id)).toBe('ok');
    expect(s.tax.reserve).toBe(0);
    s.tax.reserve = 5000;
    setTaxReserve(s, false);
    expect(s.money).toBe(5000);
  });

  it('nộp đúng hạn tăng chuỗi; trễ hạn thì mất chuỗi', () => {
    const s = registered();
    for (let m = 0; m < 3; m++) {
      s.tax.yearRevenue = cfg.yearlyThreshold;
      recordTaxableRevenue(s, 'goods', 10_000_000);
      goTo(s, 11 + m * 10);
      s.money = 10_000_000;
      expect(payTaxBill(s, openBills(s)[0].id)).toBe('ok');
    }
    expect(s.tax.onTimeStreak).toBe(3);
    expect(s.tax.bestOnTimeStreak).toBe(3);
    recordTaxableRevenue(s, 'goods', 10_000_000);
    goTo(s, 41);
    const bill = openBills(s)[0];
    goTo(s, bill.dueDay + 1);
    payTaxBill(s, bill.id);
    expect(s.tax.onTimeStreak).toBe(0);
    expect(s.tax.bestOnTimeStreak).toBe(3);
    expect(s.tax.yearLate).toBe(1);
  });

  it('khai bớt giảm tiền thuế; có máy tính tiền thì không khai bớt được', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.yearlyThreshold;
    recordTaxableRevenue(s, 'goods', 10_000_000);
    goTo(s, 11);
    const bill = openBills(s)[0];
    bill.audited = false;
    const full = bill.amount;
    expect(declareLess(s, bill.id)).toBe('ok');
    expect(bill.hidden).toBe(Math.round(full * cfg.underDeclarePct));
    expect(bill.amount).toBe(full - (bill.hidden ?? 0));
    expect(declareLess(s, bill.id)).toBe('already');
    const s2 = registered();
    s2.tax.invoiceMachine = true;
    s2.tax.bills.push({ ...bill, id: 99, hidden: undefined, amount: full });
    expect(declareLess(s2, 99)).toBe('machine');
  });

  it('thanh tra: truy thu phần khai bớt + phạt, phạt hàng chợ không hóa đơn, mất uy tín', () => {
    const s = registered();
    s.tax.bills.push({ id: 1, year: 1, month: 1, kind: 'month', revenue: { goods: 0, food: 0, service: 0 }, vat: 100_000, pit: 50_000, amount: 105_000, dueDay: 15, interestFrom: 15, status: 'paid', hidden: 45_000 });
    s.tax.unauditedMarket = 1_000_000;
    s.ratings = [];
    const total = runAudit(s);
    expect(total).toBe(45_000 * (1 + cfg.audit.evasionFineMul) + 1_000_000 * cfg.audit.marketFineRate);
    const audit = openBills(s).find((b) => b.kind === 'audit')!;
    expect(audit.amount).toBe(total);
    expect(s.tax.unauditedMarket).toBe(0);
    expect(s.tax.yearEvasion).toBe(true);
    expect(s.ratings).toEqual([cfg.audit.evasionStars]);
    expect(runAudit(s)).toBe(0);
    expect(s.ratings.at(-1)).toBe(cfg.audit.cleanStars);
  });

  it('thanh tra phạt chưa lắp máy tính tiền khi doanh thu đã tới mức bắt buộc', () => {
    const s = registered();
    s.tax.yearRevenue = cfg.invoiceMachine.requiredYearRevenue;
    expect(machineRequired(s)).toBe(true);
    expect(auditChance(s)).toBeCloseTo(cfg.audit.chance + cfg.audit.noMachineExtraChance);
    expect(runAudit(s)).toBe(cfg.audit.noMachineFine);
    s.money = cfg.invoiceMachine.cost;
    expect(buyInvoiceMachine(s)).toBe('ok');
    expect(s.money).toBe(0);
    expect(auditChance(s)).toBe(cfg.audit.withMachineChance);
  });

  it('nhập chợ không hóa đơn được ghi lại cho thanh tra; mối có hóa đơn thì không', () => {
    const s = registered();
    recordPurchase(s, 'cho_dau_moi', 300_000);
    recordPurchase(s, 'co_tu', 200_000);
    expect(s.tax.unauditedMarket).toBe(300_000);
  });

  it('khấu trừ TNCN nhân viên lương cao: tiệm giữ lại rồi nộp cùng tờ thuế tháng', () => {
    const s = registered();
    s.phase = 'open';
    s.staff = [{ id: 'a', name: 'An', personality: 'cheerful', look: {} as never, role: 'cashier', stats: {} as never, wage: 250_000, level: 1, exp: 0, mood: 80, hiredDay: 1, streak: 0, lowMoodDays: 0, quitting: false, scoldedDay: null, lifetime: { served: 0, mistakes: 0, ratingSum: 0, ratingCount: 0, jobs: 0 } }];
    s.schedule = { a: Array.from({ length: 14 }, () => true) };
    s.money = 1_000_000;
    const summary = endDay(s);
    const expected = Math.round((250_000 - cfg.staffPit.dailyThreshold) * cfg.staffPit.rate);
    expect(summary.staffPit).toBe(expected);
    expect(s.tax.monthStaffPit).toBe(expected);
    goTo(s, 11);
    expect(openBills(s)[0].staffPit).toBe(expected);
  });

  it('doanh nghiệp: cần máy tính tiền, VAT khấu trừ đầu vào, TNDN trên lãi, chiết khấu mối có hóa đơn', () => {
    const s = registered();
    s.level = 27;
    s.money = 10_000_000;
    expect(companyCheck(s)).toBe('machine');
    s.tax.invoiceMachine = true;
    expect(becomeCompany(s)).toBe('ok');
    expect(s.money).toBe(10_000_000 - cfg.company.setupCost);
    expect(isCompany(s)).toBe(true);
    const v = cfg.company.vatRate;
    // Không còn ngưỡng: doanh thu đầu tiên đã có VAT đầu ra.
    expect(recordTaxableRevenue(s, 'goods', 1_080_000)).toBeCloseTo(1_080_000 * v / (1 + v));
    recordPurchase(s, 'anh_ba', 540_000);
    expect(s.tax.monthVat).toBeCloseTo((1_080_000 - 540_000) * v / (1 + v));
    expect(supplierTaxFactor(s, 'anh_ba')).toBeCloseTo(1 - cfg.company.supplierDiscount);
    expect(supplierTaxFactor(s, 'cho_dau_moi')).toBe(1);
    s.phase = 'open';
    s.today.revenue = 1_080_000;
    s.today.cogs = 540_000;
    const vatNet = s.today.taxAccrued;
    const summary = endDay(s);
    const preTax = (summary.netProfit ?? 0) + (summary.tax ?? 0);
    expect(s.tax.monthPit).toBeCloseTo((preTax - vatNet) * cfg.company.citRate);
  });

  it('doanh nghiệp: VAT đầu vào dư chuyển sang tháng sau, không lập tờ âm', () => {
    const s = registered();
    s.tax.mode = 'company';
    recordPurchase(s, 'co_tu', 1_080_000);
    goTo(s, 11);
    expect(openBills(s)).toHaveLength(0);
    expect(s.tax.monthVat).toBeLessThan(0);
  });

  it('khách văn phòng xin hóa đơn khi đã đăng ký thuế', () => {
    const s = registered();
    const hits = Array.from({ length: 200 }, (_, id) => customerWantsInvoice(s, cfg.invoiceCustomer.type, id)).filter(Boolean).length;
    expect(hits).toBeGreaterThan(20);
    expect(hits).toBeLessThan(120);
    expect(customerWantsInvoice(s, 'hoc_sinh', 1)).toBe(false);
    expect(customerWantsInvoice(createNewGame(), cfg.invoiceCustomer.type, 1)).toBe(false);
  });

  it('quyết toán năm: khen gương mẫu khi nộp đủ, không trễ, không bị truy thu', () => {
    const s = registered();
    s.tax.yearPaid = 500_000;
    const exp = s.exp;
    goTo(s, 121);
    expect(s.tax.years[0]).toMatchObject({ year: 1, paid: 500_000, exemplary: true });
    expect(s.exp).toBe(exp + cfg.settlementExp);
    expect(s.tax.yearPaid).toBe(0);
  });

  it('thành tựu Công dân gương mẫu tặng bằng khen khi nộp đúng hạn 6 tháng liền', () => {
    const s = registered();
    s.tax.bestOnTimeStreak = 6;
    const unlocked = checkAchievements(s).map((a) => a.id);
    expect(unlocked).toContain('tax_model');
    expect(s.decorOwned).toContain('bang_khen_thue');
  });

  it('chương truyện Chị Hạnh bên thuế cần 3 tháng nộp đúng hạn', () => {
    const s = registered();
    s.level = 16;
    s.storyProgress = ['homecoming', 'growing_shop', 'first_helper'];
    expect(beginChapter(s, 'tax_officer')).toBe(true);
    const chapter = DATA.story.find((c) => c.id === 'tax_officer')!;
    expect(chapterComplete(s, chapter)).toBe(false);
    s.tax.bestOnTimeStreak = 3;
    expect(chapterComplete(s, chapter)).toBe(true);
  });

  it('công ty được thưởng đơn tiệc cao hơn', () => {
    const s = registered();
    expect(partyRewardFactor(s)).toBe(1);
    s.tax.mode = 'company';
    expect(partyRewardFactor(s)).toBe(cfg.company.partyRewardMul);
  });
});
