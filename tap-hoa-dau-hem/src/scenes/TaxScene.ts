import Phaser from 'phaser';
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
export class TaxScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Tax');
  }

  create(): void {
    setupCamera(this);
    const company = isCompany(G.state);
    pageFrame(this, '🧾 Sổ thuế', () => this.scene.start('Morning'), company ? 'Công ty · VAT + TNDN' : 'Hộ kinh doanh · VAT + TNCN theo ngưỡng');
    if (!G.state.tax.registered) {
      updateTax(G.state);
      persist();
    }
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 12);
    this.render();
  }

  private render(): void {
    this.list.clear();
    const landscape = W > H;
    if (landscape) {
      const colW = Math.floor((W - 24) / 2);
      let yLeft = 4;
      yLeft = this.yearCard(8, yLeft, colW);
      yLeft = this.monthCard(8, yLeft, colW);
      yLeft = this.reserveCard(8, yLeft, colW);
      yLeft = this.machineCard(8, yLeft, colW);

      let yRight = 4;
      yRight = this.billsCard(16 + colW, yRight, colW);
      yRight = this.auditCard(16 + colW, yRight, colW);
      yRight = this.companyCard(16 + colW, yRight, colW);
      yRight = this.historyCard(16 + colW, yRight, colW);
      yRight = this.rulesCard(16 + colW, yRight, colW);

      this.list.setHeight(Math.max(yLeft, yRight) + 20);
    } else {
      const cardW = W - 16;
      let y = 4;
      y = this.yearCard(8, y, cardW);
      y = this.monthCard(8, y, cardW);
      y = this.billsCard(8, y, cardW);
      y = this.reserveCard(8, y, cardW);
      y = this.machineCard(8, y, cardW);
      y = this.auditCard(8, y, cardW);
      y = this.companyCard(8, y, cardW);
      y = this.historyCard(8, y, cardW);
      y = this.rulesCard(8, y, cardW);
      this.list.setHeight(y + 20);
    }
  }

  private yearCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const cfg = DATA.balance.tax;
    const h = 116;
    this.list.add(card(this, x, y, cardW, h - 6));
    this.list.add(txt(this, x + 10, y + 10, `📅 Năm ${s.tax.year} · ${formatMoney(s.tax.yearRevenue)}`, { size: 12, bold: true }));
    if (isCompany(s)) {
      this.list.add(txt(this, x + 10, y + 34, `🏢 Doanh nghiệp từ ngày ${s.tax.companyDay}: không còn ngưỡng miễn thuế, mọi doanh thu đều có VAT. Đã nộp năm nay ${formatMoney(s.tax.yearPaid)}.`, { size: 10, color: HEX.ink, wrap: cardW - 20 }));
      return y + h;
    }
    const over = s.tax.yearRevenue > cfg.yearlyThreshold;
    const barX = x + 10;
    const barW = cardW - 20;
    const ratio = Math.min(1, s.tax.yearRevenue / cfg.yearlyThreshold);
    const bar = this.add.graphics();
    bar.fillStyle(0x000000, 0.12).fillRoundedRect(barX, y + 36, barW, 12, 6);
    if (ratio > 0) bar.fillStyle(over ? C.red : C.green, 1).fillRoundedRect(barX, y + 36, Math.max(12, barW * ratio), 12, 6);
    this.list.add(bar);
    const note = over
      ? `Vượt ${formatMoney(cfg.yearlyThreshold)}: VAT và TNCN phát sinh theo phương pháp hộ.`
      : `Còn ${formatMoney(cfg.yearlyThreshold - s.tax.yearRevenue)} đến ngưỡng ${formatMoney(cfg.yearlyThreshold)}/năm.`;
    this.list.add(txt(this, x + 10, y + 56, note, { size: 10, color: over ? HEX.red : HEX.green, wrap: cardW - 20 }));
    this.list.add(txt(this, x + 10, y + 78, s.tax.yearRevenue <= cfg.householdPitMethodThreshold ? `Trên ngưỡng đến ${formatMoney(cfg.householdPitMethodThreshold)}: TNCN theo % doanh thu.` : `TNCN theo lãi × ${pct(cfg.householdPitProfitRate)}.`, { size: 9, color: HEX.muted, wrap: cardW - 20 }));
    return y + h;
  }

  private monthCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const company = isCompany(s);
    const extra: [string, string][] = company
      ? [['VAT phải nộp (ra − vào)', signed(Math.round(s.tax.monthVat))], [`TNDN tạm tính (${pct(DATA.balance.tax.company.citRate)} lãi)`, signed(Math.round(s.tax.monthPit))]]
      : [];
    if (s.tax.monthStaffPit > 0) extra.push(['TNCN giữ từ lương NV', formatMoney(Math.round(s.tax.monthStaffPit))]);
    const h = 60 + (KINDS.length + extra.length) * 20 + 28;
    this.list.add(card(this, x, y, cardW, h - 6));
    const left = daysUntilMonthEnd(s);
    this.list.add(txt(this, x + 10, y + 10, `🗓️ Đang tính: ${monthLabel(s.tax.month)}`, { size: 13, bold: true }));
    this.list.add(txt(this, x + 10, y + 30, left > 0 ? `Chốt sau ${left} ngày (sáng đầu tháng sau).` : 'Chốt sổ sáng mai.', { size: 10, color: HEX.muted }));
    let row = y + 54;
    for (const kind of KINDS) {
      this.list.add(txt(this, x + 10, row, company ? TAX_KIND_NAMES[kind] : `${TAX_KIND_NAMES[kind]} (${pct(taxRate(kind))})`, { size: 11 }));
      this.list.add(txt(this, x + cardW - 12, row, formatMoney(s.tax.monthRevenue[kind]), { size: 11, bold: true, origin: [1, 0] }));
      row += 20;
    }
    for (const [label, value] of extra) {
      this.list.add(txt(this, x + 10, row, label, { size: 11, color: '#1f5fa0' }));
      this.list.add(txt(this, x + cardW - 12, row, value, { size: 11, bold: true, color: '#1f5fa0', origin: [1, 0] }));
      row += 20;
    }
    this.list.add(txt(this, x + 10, row + 4, 'Thuế tạm tính tháng này', { size: 12, bold: true }));
    this.list.add(txt(this, x + cardW - 12, row + 4, formatMoney(monthTaxEstimate(s)), { size: 12, bold: true, color: '#b7411f', origin: [1, 0] }));
    return y + h;
  }

  private billsCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const bills = [...openBills(s)].sort((a, b) => a.dueDay - b.dueDay);
    this.list.add(txt(this, x + 6, y + 4, bills.length ? `📄 Cần nộp: ${formatMoney(taxOwed(s))}` : '📄 Không có tờ thuế nào cần nộp.', { size: 13, bold: true, color: bills.length ? HEX.red : HEX.green }));
    if (bills.length > 1) {
      this.list.add(new Button(this, x + cardW - 48, y + 10, { w: 84, h: 26, label: 'Nộp tất cả', size: 10, color: C.green, onTap: this.list.guard(() => this.payAll()) }));
    }
    y += 34;
    for (const bill of bills) y = this.billRow(bill, x, y, cardW);
    return y + 6;
  }

  private billRow(bill: TaxBill, x: number, y: number, cardW: number): number {
    const s = G.state;
    const declarable = canDeclareLess(s, bill);
    const note = bill.kind === 'audit'
      ? (bill.note ?? '')
      : `VAT ${formatMoney(bill.vat)} · ${bill.mode === 'company' ? 'TNDN' : 'TNCN'} ${formatMoney(bill.pit)}${bill.staffPit ? ` · NV ${formatMoney(bill.staffPit)}` : ''}${bill.hidden ? ` · bớt ${formatMoney(bill.hidden)}` : ''}`;
    const textW = cardW - 96;
    const titleText = txt(this, x + 10, y + 8, billLabel(bill), { size: 12, bold: true, wrap: textW });
    const noteText = txt(this, x + 10, y + 10 + titleText.height, note, { size: 10, color: bill.hidden ? '#b7411f' : HEX.muted, wrap: textW });
    const overdue = taxBillOverdue(s, bill);
    const late = lateDays(s, bill);
    const status = overdue
      ? `Quá hạn ${s.day - bill.dueDay} ngày${late ? ` (+${formatMoney(billTotal(s, bill) - bill.amount)})` : ''}\nCưỡng chế: N${enforceDay(bill)}`
      : bill.dueDay === s.day ? 'Hạn hôm nay' : `Hạn N${bill.dueDay} (${bill.dueDay - s.day}n)`;
    const statusText = txt(this, x + 10, y + 14 + titleText.height + noteText.height, status, { size: 10, color: overdue ? HEX.red : HEX.ink, wrap: textW });
    const h = Math.max(declarable ? 112 : 88, 28 + titleText.height + noteText.height + statusText.height);
    this.list.add(card(this, x, y, cardW, h - 6, overdue ? 0xffe4dc : bill.kind === 'audit' ? 0xfff0d0 : 0xfff6e6));
    this.list.add([titleText, noteText, statusText]);
    const total = billTotal(s, bill);
    const btnX = x + cardW - 46;
    this.list.add(new Button(this, btnX, y + 28, { w: 80, h: 36, label: `Nộp\n${formatMoney(total)}`, size: 10, color: overdue ? C.red : C.green, onTap: this.list.guard(() => this.pay(bill)) }).setEnabled(taxFunds(s) >= total));
    if (declarable) {
      this.list.add(new Button(this, btnX, y + 72, { w: 80, h: 24, label: '🤫 Khai bớt', size: 9, color: C.grey, onTap: this.list.guard(() => this.confirmDeclare(bill)) }));
    }
    return y + h;
  }

  private reserveCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const h = 80;
    this.list.add(card(this, x, y, cardW, h - 6, 0xeef8ee));
    this.list.add(txt(this, x + 10, y + 8, `🐷 Quỹ thuế: ${formatMoney(s.tax.reserve)}`, { size: 12, bold: true }));
    this.list.add(txt(this, x + 10, y + 28, s.tax.reserveOn ? 'Bật: cuối ngày tự trích thuế tạm tính. Nộp dùng quỹ trước.' : 'Tắt: tiền mặt trông nhiều hơn nhưng dễ hụt khi tới hạn.', { size: 10, color: HEX.muted, wrap: cardW - 100 }));
    this.list.add(new Button(this, x + cardW - 48, y + h / 2 - 3, { w: 84, h: 32, label: s.tax.reserveOn ? 'Tắt quỹ' : 'Bật quỹ', size: 10, color: s.tax.reserveOn ? C.grey : C.green, onTap: this.list.guard(() => {
      setTaxReserve(G.state, !G.state.tax.reserveOn);
      persist();
      play('tap');
      toast(this, G.state.tax.reserveOn ? 'Đã bật quỹ thuế' : 'Đã tắt quỹ thuế · tiền về lại ví');
      this.render();
    }) }));
    return y + h;
  }

  private machineCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const m = DATA.balance.tax.invoiceMachine;
    const owned = s.tax.invoiceMachine;
    const required = machineRequired(s);
    const body = owned
      ? 'Đã lắp máy tính tiền: khách có thể nhận hóa đơn điện tử.'
      : `Thiết bị hóa đơn điện tử. ${required ? 'Đã đạt mốc quy định.' : `Mốc doanh thu: ${formatMoney(m.requiredYearRevenue)}.`}`;
    const bodyText = txt(this, x + 10, y + 28, body, { size: 10, color: !owned && required ? HEX.red : HEX.muted, wrap: cardW - 100 });
    const h = Math.max(76, bodyText.height + 40);
    this.list.add(card(this, x, y, cardW, h - 6));
    this.list.add(txt(this, x + 10, y + 8, `🖨️ Máy tính tiền${owned ? ' ✓' : ''}`, { size: 12, bold: true }));
    this.list.add(bodyText);
    if (!owned) {
      this.list.add(new Button(this, x + cardW - 48, y + h / 2 - 3, { w: 84, h: 36, label: `Lắp\n${formatMoney(m.cost)}`, size: 10, color: C.blue, onTap: this.list.guard(() => {
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

  private auditCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const last = s.tax.audits[s.tax.audits.length - 1];
    const lines = [
      `Xác suất kiểm tra mỗi lần chốt tháng: ${pct(auditChance(s))}.`,
      s.tax.unauditedMarket > 0 ? `Hàng chợ chưa hóa đơn: ${formatMoney(s.tax.unauditedMarket)}.` : '',
      last ? `Gần nhất (N${last.day}): ${last.total ? `phạt ${formatMoney(last.total)}` : 'không vi phạm 👍'}` : 'Chưa có sự kiện kiểm tra.',
    ].filter(Boolean);
    const t = txt(this, x + 10, y + 28, lines.join('\n'), { size: 10, color: HEX.muted, wrap: cardW - 20 });
    const h = t.height + 40;
    this.list.add(card(this, x, y, cardW, h - 6));
    this.list.add(txt(this, x + 10, y + 8, '🕵️ Thanh tra thuế', { size: 12, bold: true }));
    this.list.add(t);
    return y + h;
  }

  private companyCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const c = DATA.balance.tax.company;
    if (isCompany(s)) return y;
    const unlocked = hasFeature(s.level, 'company');
    const body = unlocked
      ? `Chuyển lên công ty (phí ${formatMoney(c.setupCost)}). Khấu trừ VAT đầu vào, TNDN theo mức ${pct(c.citRateSmall)}–${pct(c.citRate)}. Ưu đãi: chiết khấu hàng ${pct(c.supplierDiscount)}, nhận khách công ty, đơn tiệc +${pct(c.partyRewardMul - 1)}.`
      : `Mở theo cấp game L${featureLevel('company')}: chuyển đổi lên mô hình doanh nghiệp.`;
    const bodyText = txt(this, x + 10, y + 28, body, { size: 10, color: HEX.muted, wrap: cardW - 20 });
    const h = bodyText.height + 40 + (unlocked ? 36 : 0);
    this.list.add(card(this, x, y, cardW, h - 6, unlocked ? 0xeef4ff : 0xe5e5e5));
    this.list.add(txt(this, x + 10, y + 8, '🏢 Lên doanh nghiệp', { size: 12, bold: true }));
    this.list.add(bodyText);
    if (unlocked) {
      const check = companyCheck(s);
      const hint = check === 'machine' ? 'Cần lắp máy tính tiền trước' : check === 'owed' ? 'Nộp hết thuế nợ trước' : check === 'money' ? 'Chưa đủ tiền phí' : '';
      if (hint) this.list.add(txt(this, x + 10, y + h - 30, hint, { size: 10, color: HEX.red, wrap: cardW - 130 }));
      this.list.add(new Button(this, x + cardW - 64, y + h - 24, { w: 116, h: 30, label: 'Thành lập cty', size: 10, color: C.blue, onTap: this.list.guard(() => this.confirmCompany()) }).setEnabled(check === 'ok'));
    }
    return y + h;
  }

  private historyCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const done = s.tax.bills.filter((b) => b.status !== 'open').reverse();
    this.list.add(txt(this, x + 6, y + 4, `📚 Đã nộp: ${formatMoney(s.tax.lifetimePaid)}`, { size: 12, bold: true }));
    y += 24;
    this.list.add(txt(this, x + 10, y, `Nộp đúng hạn: ${s.tax.onTimeStreak} tháng (kỷ lục ${s.tax.bestOnTimeStreak})`, { size: 10, color: HEX.green }));
    y += 18;
    const rows = [
      ...done.slice(0, 4).map((bill) => ({ text: `${billLabel(bill)} · ${formatMoney(bill.paidTotal ?? 0)} · ${bill.status === 'enforced' ? '⚠️ cưỡng chế' : `✓ N${bill.paidDay}`}`, color: bill.status === 'enforced' ? HEX.red : HEX.muted })),
      ...[...s.tax.years].reverse().slice(0, 2).map((year) => ({
        text: `📊 Năm ${year.year}: thu ${formatMoney(year.revenue)} · nộp ${formatMoney(year.paid)}${year.exemplary ? ' 🏅' : ''}`,
        color: HEX.ink,
      })),
    ];
    for (const row of rows) {
      const t = txt(this, x + 10, y, row.text, { size: 10, color: row.color, wrap: cardW - 20 });
      this.list.add(t);
      y += t.height + 4;
    }
    return y + 6;
  }

  private rulesCard(x: number, y: number, cardW: number): number {
    const cfg = DATA.balance.tax;
    const lines = [
      '📘 Quy tắc & cách tính',
      `• Miễn thuế năm: dưới ${formatMoney(cfg.yearlyThreshold)} không chịu VAT/TNCN.`,
      `• Hàng hóa: VAT ${pct(cfg.rates.goods.vat)}, TNCN ${pct(cfg.rates.goods.pit)}.`,
      `• Đồ ăn: VAT ${pct(cfg.rates.food.vat)}, TNCN ${pct(cfg.rates.food.pit)}.`,
      `• Phí chậm nộp: 0,03%/ngày theo số tiền chậm.`,
      `• Nộp đúng hạn 6 tháng liền nhận Bằng khen; năm gương mẫu thưởng +${cfg.settlementExp} EXP.`,
    ];
    const t = txt(this, x + 10, y + 10, lines.join('\n'), { size: 10, color: HEX.ink, wrap: cardW - 20 });
    this.list.add(card(this, x, y, cardW, t.height + 18, 0xeef4ff));
    this.list.add(t);
    return y + t.height + 24;
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
      body: `Trả ${formatMoney(c.setupCost)} chi phí gameplay để chuyển lên công ty. Ngoài đời TNDN áp dụng mức theo doanh thu và điều kiện; VAT theo hàng hóa/dịch vụ, còn có hóa đơn, kế toán, TNCN tiền lương và bảo hiểm bắt buộc. DNNVV mới đủ điều kiện có thể miễn TNDN 3 năm. Đây là lựa chọn trong game, không phải quy định tự động chuyển đổi.`,
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
