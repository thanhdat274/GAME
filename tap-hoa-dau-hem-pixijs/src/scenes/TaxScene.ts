import * as Engine from '../engine';
import calendarData from '../data/calendar.json';
import { DATA, featureLevel, hasFeature, type TaxKind } from '../core/data';
import { formatMoney, type TaxBill } from '../core/state';
import {
  TAX_KIND_NAMES, auditChance, becomeCompany, billLabel, billTotal, buyInvoiceMachine, canDeclareLess, companyCheck, daysUntilMonthEnd,
  declareLess, enforceDay, isCompany, lateDays, machineRequired, monthLabel, monthTaxEstimate, openBills, payAllTaxBills,
  payTaxBill, setTaxReserve, taxBillOverdue, taxFunds, taxOwed, taxRate, updateTax,
} from '../core/tax';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const KINDS: TaxKind[] = ['goods', 'food', 'service'];

function pct(v: number): string {
  return `${(v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

function signed(v: number): string {
  return v < 0 ? `−${formatMoney(-v)}` : formatMoney(v);
}

/**
 * Màn Sổ thuế: hình thức (hộ kinh doanh / doanh nghiệp), ngưỡng miễn thuế năm, thuế tạm tính tháng này,
 * tờ thuế cần nộp, quỹ thuế, máy tính tiền, thanh tra, quyết toán năm và cách tính.
 */
export class TaxScene extends Engine.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Tax');
  }

  create(): void {
    setupCamera(this);
    const company = isCompany(G.state);
    pageFrame(this, '🧾 Sổ thuế', () => this.scene.start('Morning'), company ? 'Doanh nghiệp · VAT khấu trừ + TNDN' : 'Hộ kinh doanh · thuế theo % doanh thu');
    if (!G.state.tax.registered) {
      updateTax(G.state);
      persist();
    }
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 12);
    this.render();
  }

  private render(): void {
    this.list.clear();
    let y = 4;
    y = this.yearCard(y);
    y = this.monthCard(y);
    y = this.billsCard(y);
    y = this.reserveCard(y);
    y = this.machineCard(y);
    y = this.auditCard(y);
    y = this.companyCard(y);
    y = this.historyCard(y);
    y = this.rulesCard(y);
    this.list.setHeight(y + 20);
  }

  private yearCard(y: number): number {
    const s = G.state;
    const cfg = DATA.balance.tax;
    const h = 96;
    this.list.add(card(this, 8, y, W - 16, h - 6));
    this.list.add(txt(this, 18, y + 10, `📅 Năm ${s.tax.year} · doanh thu ${formatMoney(s.tax.yearRevenue)}`, { size: 13, bold: true }));
    if (isCompany(s)) {
      this.list.add(txt(this, 18, y + 34, `🏢 Doanh nghiệp từ ngày ${s.tax.companyDay}: không còn ngưỡng miễn thuế, mọi doanh thu đều có VAT. Đã nộp năm nay ${formatMoney(s.tax.yearPaid)}.`, { size: 11, color: HEX.ink, wrap: W - 44 }));
      return y + h;
    }
    const over = s.tax.yearRevenue > cfg.yearlyThreshold;
    const barX = 18;
    const barW = W - 52;
    const ratio = Math.min(1, s.tax.yearRevenue / cfg.yearlyThreshold);
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.12).fillRoundedRect(barX, y + 36, barW, 12, 6);
    if (ratio > 0) bar.fillStyle(over ? C.red : C.green, 1).fillRoundedRect(barX, y + 36, Math.max(12, barW * ratio), 12, 6);
    this.list.add(bar);
    const note = over
      ? `Đã vượt ngưỡng ${formatMoney(cfg.yearlyThreshold)}: phần doanh thu vượt ngưỡng phải chịu thuế.`
      : `Còn ${formatMoney(cfg.yearlyThreshold - s.tax.yearRevenue)} nữa mới tới ngưỡng miễn thuế ${formatMoney(cfg.yearlyThreshold)}/năm.`;
    this.list.add(txt(this, 18, y + 56, note, { size: 11, color: over ? HEX.red : HEX.green, wrap: W - 44 }));
    return y + h;
  }

  private monthCard(y: number): number {
    const s = G.state;
    const company = isCompany(s);
    const extra: [string, string][] = company
      ? [['VAT phải nộp (đầu ra − đầu vào)', signed(Math.round(s.tax.monthVat))], [`TNDN tạm tính (${pct(DATA.balance.tax.company.citRate)} lãi)`, signed(Math.round(s.tax.monthPit))]]
      : [];
    if (s.tax.monthStaffPit > 0) extra.push(['TNCN giữ lại từ lương nhân viên', formatMoney(Math.round(s.tax.monthStaffPit))]);
    const h = 60 + (KINDS.length + extra.length) * 20 + 28;
    this.list.add(card(this, 8, y, W - 16, h - 6));
    const left = daysUntilMonthEnd(s);
    this.list.add(txt(this, 18, y + 10, `🗓️ Đang tính: ${monthLabel(s.tax.month)}`, { size: 13, bold: true }));
    this.list.add(txt(this, 18, y + 30, left > 0 ? `Chốt sổ sau ${left} ngày nữa (sáng ngày đầu tháng sau).` : 'Chốt sổ sáng mai.', { size: 11, color: HEX.muted }));
    let row = y + 54;
    for (const kind of KINDS) {
      this.list.add(txt(this, 18, row, company ? TAX_KIND_NAMES[kind] : `${TAX_KIND_NAMES[kind]} (${pct(taxRate(kind))})`, { size: 12 }));
      this.list.add(txt(this, W - 22, row, formatMoney(s.tax.monthRevenue[kind]), { size: 12, bold: true, origin: [1, 0] }));
      row += 20;
    }
    for (const [label, value] of extra) {
      this.list.add(txt(this, 18, row, label, { size: 12, color: '#1f5fa0' }));
      this.list.add(txt(this, W - 22, row, value, { size: 12, bold: true, color: '#1f5fa0', origin: [1, 0] }));
      row += 20;
    }
    this.list.add(txt(this, 18, row + 4, 'Thuế tạm tính tháng này', { size: 13, bold: true }));
    this.list.add(txt(this, W - 22, row + 4, formatMoney(monthTaxEstimate(s)), { size: 13, bold: true, color: '#b7411f', origin: [1, 0] }));
    return y + h;
  }

  private billsCard(y: number): number {
    const s = G.state;
    const bills = [...openBills(s)].sort((a, b) => a.dueDay - b.dueDay);
    this.list.add(txt(this, 14, y + 4, bills.length ? `📄 Cần nộp: ${formatMoney(taxOwed(s))}` : '📄 Không có tờ thuế nào cần nộp.', { size: 14, bold: true, color: bills.length ? HEX.red : HEX.green }));
    if (bills.length > 1) {
      this.list.add(new Button(this, W - 60, y + 12, { w: 88, h: 28, label: 'Nộp tất cả', size: 11, color: C.green, onTap: this.list.guard(() => this.payAll()) }));
    }
    y += 34;
    for (const bill of bills) y = this.billRow(bill, y);
    return y + 6;
  }

  private billRow(bill: TaxBill, y: number): number {
    const s = G.state;
    const declarable = canDeclareLess(s, bill);
    const note = bill.kind === 'audit'
      ? (bill.note ?? '')
      : `VAT ${formatMoney(bill.vat)} · ${bill.mode === 'company' ? 'TNDN' : 'TNCN'} ${formatMoney(bill.pit)}${bill.staffPit ? ` · TNCN nhân viên ${formatMoney(bill.staffPit)}` : ''}${bill.hidden ? ` · đã khai bớt ${formatMoney(bill.hidden)}` : ''}`;
    const titleText = txt(this, 18, y + 8, billLabel(bill), { size: 13, bold: true, wrap: W - 140 });
    const noteText = txt(this, 18, y + 12 + titleText.height, note, { size: 11, color: bill.hidden ? '#b7411f' : HEX.muted, wrap: W - 140 });
    const overdue = taxBillOverdue(s, bill);
    const late = lateDays(s, bill);
    const status = overdue
      ? `Quá hạn ${s.day - bill.dueDay} ngày${late ? ` · chậm nộp +${formatMoney(billTotal(s, bill) - bill.amount)}` : ''}\nCưỡng chế từ ngày ${enforceDay(bill)}`
      : bill.dueDay === s.day ? 'Hạn hôm nay' : `Hạn hết ngày ${bill.dueDay} (còn ${bill.dueDay - s.day} ngày)`;
    const statusText = txt(this, 18, y + 18 + titleText.height + noteText.height, status, { size: 11, color: overdue ? HEX.red : HEX.ink, wrap: W - 140 });
    const h = Math.max(declarable ? 118 : 92, 32 + titleText.height + noteText.height + statusText.height);
    this.list.add(card(this, 8, y, W - 16, h - 6, overdue ? 0xffe4dc : bill.kind === 'audit' ? 0xfff0d0 : 0xfff6e6));
    this.list.add([titleText, noteText, statusText]);
    const total = billTotal(s, bill);
    this.list.add(new Button(this, W - 60, y + 32, { w: 88, h: 42, label: `Nộp\n${formatMoney(total)}`, size: 11, color: overdue ? C.red : C.green, onTap: this.list.guard(() => this.pay(bill)) }).setEnabled(taxFunds(s) >= total));
    if (declarable) {
      this.list.add(new Button(this, W - 60, y + 84, { w: 88, h: 26, label: '🤫 Khai bớt', size: 10, color: C.grey, onTap: this.list.guard(() => this.confirmDeclare(bill)) }));
    }
    return y + h;
  }

  private reserveCard(y: number): number {
    const s = G.state;
    const h = 80;
    this.list.add(card(this, 8, y, W - 16, h - 6, 0xeef8ee));
    this.list.add(txt(this, 18, y + 8, `🐷 Quỹ thuế: ${formatMoney(s.tax.reserve)}`, { size: 13, bold: true }));
    this.list.add(txt(this, 18, y + 30, s.tax.reserveOn ? 'Đang bật: cuối ngày tự để riêng thuế tạm tính. Nộp thuế dùng quỹ trước.' : 'Tắt: tiền mặt trông nhiều hơn nhưng dễ hụt khi tới hạn.', { size: 11, color: HEX.muted, wrap: W - 140 }));
    this.list.add(new Button(this, W - 60, y + h / 2 - 3, { w: 88, h: 34, label: s.tax.reserveOn ? 'Tắt quỹ' : 'Bật quỹ', size: 11, color: s.tax.reserveOn ? C.grey : C.green, onTap: this.list.guard(() => {
      setTaxReserve(G.state, !G.state.tax.reserveOn);
      persist();
      play('tap');
      toast(this, G.state.tax.reserveOn ? 'Đã bật quỹ thuế' : 'Đã tắt quỹ thuế · tiền trong quỹ về lại tiền mặt');
      this.render();
    }) }));
    return y + h;
  }

  private machineCard(y: number): number {
    const s = G.state;
    const m = DATA.balance.tax.invoiceMachine;
    const owned = s.tax.invoiceMachine;
    const required = machineRequired(s);
    const body = owned
      ? 'Đã lắp: khách công ty xin hóa đơn được xuất ngay (thêm sao, EXP). Mọi hóa đơn được ghi lại nên không khai bớt được, thanh tra ít ghé.'
      : `Khách văn phòng hay xin hóa đơn; chưa có máy thì họ phật ý. ${required ? '⚠️ Doanh thu năm đã tới mức bắt buộc lắp máy!' : `Bắt buộc khi doanh thu năm từ ${formatMoney(m.requiredYearRevenue)}.`}`;
    const bodyText = txt(this, 18, y + 30, body, { size: 11, color: !owned && required ? HEX.red : HEX.muted, wrap: W - 140 });
    const h = Math.max(80, bodyText.height + 44);
    this.list.add(card(this, 8, y, W - 16, h - 6));
    this.list.add(txt(this, 18, y + 8, `🖨️ Máy tính tiền${owned ? ' ✓' : ''}`, { size: 13, bold: true }));
    this.list.add(bodyText);
    if (!owned) {
      this.list.add(new Button(this, W - 60, y + h / 2 - 3, { w: 88, h: 40, label: `Lắp\n${formatMoney(m.cost)}`, size: 11, color: C.blue, onTap: this.list.guard(() => {
        const r = buyInvoiceMachine(G.state);
        if (r === 'money') { play('wrong'); toast(this, 'Không đủ tiền lắp máy', H * 0.5, C.red); return; }
        if (r !== 'ok') return;
        persist();
        play('coin');
        toast(this, 'Đã lắp máy tính tiền, xuất hóa đơn điện tử!');
        this.render();
      }) }).setEnabled(s.money >= m.cost));
    }
    return y + h;
  }

  private auditCard(y: number): number {
    const s = G.state;
    const last = s.tax.audits[s.tax.audits.length - 1];
    const lines = [
      `Khả năng bị thanh tra mỗi lần chốt tháng: ${pct(auditChance(s))}.`,
      s.tax.unauditedMarket > 0 ? `Hàng nhập chợ không hóa đơn chưa qua thanh tra: ${formatMoney(s.tax.unauditedMarket)} (có thể bị phạt ${pct(DATA.balance.tax.audit.marketFineRate)}).` : '',
      last ? `Lần gần nhất (ngày ${last.day}): ${last.total ? `truy thu + phạt ${formatMoney(last.total)}` : 'không vi phạm 👍'}` : 'Chưa bị thanh tra lần nào.',
    ].filter(Boolean);
    const t = txt(this, 18, y + 30, lines.join('\n'), { size: 11, color: HEX.muted, wrap: W - 44 });
    const h = t.height + 44;
    this.list.add(card(this, 8, y, W - 16, h - 6));
    this.list.add(txt(this, 18, y + 8, '🕵️ Thanh tra thuế', { size: 13, bold: true }));
    this.list.add(t);
    return y + h;
  }

  private companyCard(y: number): number {
    const s = G.state;
    const c = DATA.balance.tax.company;
    if (isCompany(s)) return y;
    const unlocked = hasFeature(s.level, 'company');
    const body = unlocked
      ? `Phí thành lập ${formatMoney(c.setupCost)}. Mất ngưỡng miễn thuế; nộp VAT ${pct(c.vatRate)} khấu trừ (đầu ra − đầu vào có hóa đơn) + TNDN ${pct(c.citRate)} trên lãi. Được chiết khấu ${pct(c.supplierDiscount)} ở mối có hóa đơn, khách công ty ghé nhiều hơn, đơn tiệc trả thêm ${pct(c.partyRewardMul - 1)}. Không quay lại hộ kinh doanh được.`
      : `Mở ở level ${featureLevel('company')}: thành lập công ty, nộp VAT khấu trừ + thuế TNDN trên lãi.`;
    const bodyText = txt(this, 18, y + 30, body, { size: 11, color: HEX.muted, wrap: W - 44 });
    const h = bodyText.height + 44 + (unlocked ? 40 : 0);
    this.list.add(card(this, 8, y, W - 16, h - 6, unlocked ? 0xeef4ff : 0xe5e5e5));
    this.list.add(txt(this, 18, y + 8, '🏢 Lên doanh nghiệp', { size: 13, bold: true }));
    this.list.add(bodyText);
    if (unlocked) {
      const check = companyCheck(s);
      const hint = check === 'machine' ? 'Cần lắp máy tính tiền trước' : check === 'owed' ? 'Nộp hết tờ thuế đang nợ trước' : check === 'money' ? 'Chưa đủ tiền phí thành lập' : '';
      if (hint) this.list.add(txt(this, 18, y + h - 36, hint, { size: 11, color: HEX.red, wrap: W - 150 }));
      this.list.add(new Button(this, W - 76, y + h - 28, { w: 120, h: 32, label: 'Thành lập công ty', size: 11, color: C.blue, onTap: this.list.guard(() => this.confirmCompany()) }).setEnabled(check === 'ok'));
    }
    return y + h;
  }

  private historyCard(y: number): number {
    const s = G.state;
    const done = s.tax.bills.filter((b) => b.status !== 'open').reverse();
    this.list.add(txt(this, 14, y + 4, `📚 Đã nộp từ trước tới nay: ${formatMoney(s.tax.lifetimePaid)}`, { size: 13, bold: true }));
    y += 26;
    this.list.add(txt(this, 18, y, `Nộp đúng hạn liên tiếp: ${s.tax.onTimeStreak} tháng (kỷ lục ${s.tax.bestOnTimeStreak})`, { size: 11, color: HEX.green }));
    y += 20;
    const rows = [
      ...done.map((bill) => ({ text: `${billLabel(bill)} · ${formatMoney(bill.paidTotal ?? 0)} · ${bill.status === 'enforced' ? '⚠️ bị cưỡng chế' : `✓ nộp ngày ${bill.paidDay}`}`, color: bill.status === 'enforced' ? HEX.red : HEX.muted })),
      ...[...s.tax.years].reverse().map((year) => ({
        text: `📊 Năm ${year.year}: doanh thu ${formatMoney(year.revenue)} · nộp ${formatMoney(year.paid)}${year.exemplary ? ' · 🏅 gương mẫu' : year.evasion ? ' · bị truy thu' : year.late ? ` · trễ ${year.late} lần` : ''}`,
        color: HEX.ink,
      })),
    ];
    for (const row of rows) {
      const t = txt(this, 18, y, row.text, { size: 11, color: row.color, wrap: W - 36 });
      this.list.add(t);
      y += t.height + 4;
    }
    return y + 10;
  }

  private rulesCard(y: number): number {
    const cfg = DATA.balance.tax;
    const lines = [
      '📘 Cách tính',
      `• Hộ kinh doanh: doanh thu cả năm dưới ${formatMoney(cfg.yearlyThreshold)} miễn thuế; chỉ phần vượt ngưỡng mới tính thuế.`,
      ...KINDS.map((k) => `• ${TAX_KIND_NAMES[k]}: VAT ${pct(cfg.rates[k].vat)} + TNCN ${pct(cfg.rates[k].pit)}.`),
      `• Doanh nghiệp: VAT ${pct(cfg.company.vatRate)} trên doanh thu trừ VAT hàng nhập có hóa đơn; TNDN ${pct(cfg.company.citRate)} trên lãi (lỗ trừ vào tháng sau trong năm).`,
      `• Nhân viên lương trên ${formatMoney(cfg.staffPit.dailyThreshold)}/ngày: tiệm giữ lại ${pct(cfg.staffPit.rate)} phần vượt để nộp thuế TNCN thay.`,
      '• Giá bán trên kệ đã gồm thuế, khách không phải trả thêm.',
      `• Mỗi tháng (${calendarData.daysPerMonth} ngày) chốt sổ một lần, hạn nộp hết ngày thứ ${cfg.dueDays} của tháng sau.`,
      `• Trễ hạn: chậm nộp ${pct(cfg.lateInterestPerDay)}/ngày. Trễ quá ${cfg.enforceAfterDays} ngày: bị cưỡng chế trừ thẳng vào tiền, phạt thêm ${pct(cfg.enforceFine)}.`,
      `• Khai bớt: giảm ${pct(cfg.underDeclarePct)} tiền thuế, nhưng thanh tra phát hiện thì truy thu và phạt gấp ${cfg.audit.evasionFineMul + 1} lần phần đã giấu.`,
      `• Nộp đúng hạn 6 tháng liền được Bằng khen; năm không trễ hạn, không bị truy thu được khen gương mẫu (+${cfg.settlementExp} EXP).`,
    ];
    const t = txt(this, 18, y + 10, lines.join('\n'), { size: 11, color: HEX.ink, wrap: W - 44 });
    this.list.add(card(this, 8, y, W - 16, t.height + 20, 0xeef4ff));
    this.list.add(t);
    return y + t.height + 26;
  }

  private pay(bill: TaxBill): void {
    const total = billTotal(G.state, bill);
    const result = payTaxBill(G.state, bill.id);
    if (result === 'money') { play('wrong'); toast(this, 'Không đủ tiền nộp thuế', H * 0.5, C.red); return; }
    if (result !== 'ok') return;
    persist();
    play('coin');
    toast(this, `Đã nộp ${formatMoney(total)} tiền thuế`);
    this.render();
  }

  private payAll(): void {
    const paid = payAllTaxBills(G.state);
    if (!paid) { play('wrong'); toast(this, 'Không đủ tiền nộp thuế', H * 0.5, C.red); return; }
    persist();
    play('coin');
    toast(this, `Đã nộp ${formatMoney(paid)} tiền thuế${openBills(G.state).length ? ' · còn tờ chưa đủ tiền' : ''}`);
    this.render();
  }

  private confirmDeclare(bill: TaxBill): void {
    const cfg = DATA.balance.tax;
    const hidden = Math.round((bill.vat + bill.pit) * cfg.underDeclarePct);
    dialog(this, {
      icon: '🤫',
      title: 'Khai bớt doanh thu?',
      body: `Bớt ${formatMoney(hidden)} tiền thuế ${monthLabel(bill.year * 12 + bill.month - 1)}. Nếu bị thanh tra phát hiện: truy thu ${formatMoney(hidden)}, phạt thêm ${formatMoney(Math.round(hidden * cfg.audit.evasionFineMul))} và mất uy tín với xóm.`,
      buttons: [
        { label: 'Khai đúng', color: C.green },
        { label: 'Khai bớt', color: C.red, onTap: () => {
          if (declareLess(G.state, bill.id) !== 'ok') return;
          persist();
          play('tap');
          toast(this, `Đã khai bớt, còn phải nộp ${formatMoney(bill.amount)}`);
          this.render();
        } },
      ],
    });
  }

  private confirmCompany(): void {
    const c = DATA.balance.tax.company;
    dialog(this, {
      icon: '🏢',
      title: 'Thành lập công ty?',
      body: `Trả ${formatMoney(c.setupCost)} phí thành lập. Từ nay nộp VAT khấu trừ + thuế TNDN ${pct(c.citRate)} trên lãi, không còn ngưỡng miễn thuế. Không quay lại hộ kinh doanh được.`,
      buttons: [
        { label: 'Để sau', color: C.grey },
        { label: 'Thành lập', color: C.blue, onTap: () => {
          if (becomeCompany(G.state) !== 'ok') return;
          persist();
          play('levelup');
          toast(this, '🏢 Đã thành lập công ty!');
          this.scene.restart();
        } },
      ],
    });
  }
}
