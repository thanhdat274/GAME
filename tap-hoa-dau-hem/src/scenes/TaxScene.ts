import Phaser from 'phaser';
import calendarData from '../data/calendar.json';
import { DATA, type TaxKind } from '../core/data';
import { formatMoney, type TaxBill } from '../core/state';
import {
  TAX_KIND_NAMES, billTotal, daysUntilMonthEnd, enforceDay, lateDays, monthLabel, monthTaxEstimate, openBills, payAllTaxBills, payTaxBill,
  taxBillOverdue, taxOwed, taxRate, updateTax,
} from '../core/tax';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const KINDS: TaxKind[] = ['goods', 'food', 'service'];

function pct(v: number): string {
  return `${(v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

/** Màn Sổ thuế: ngưỡng miễn thuế năm, thuế tạm tính tháng này, tờ thuế cần nộp và lịch sử. */
export class TaxScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Tax');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🧾 Sổ thuế', () => this.scene.start('Morning'), 'Hộ kinh doanh · thuế theo % doanh thu');
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
    y = this.historyCard(y);
    y = this.rulesCard(y);
    this.list.setHeight(y + 20);
  }

  private yearCard(y: number): number {
    const s = G.state;
    const cfg = DATA.balance.tax;
    const h = 96;
    this.list.add(card(this, 8, y, W - 16, h - 6));
    const over = s.tax.yearRevenue > cfg.yearlyThreshold;
    this.list.add(txt(this, 18, y + 10, `📅 Năm ${s.tax.year} · doanh thu ${formatMoney(s.tax.yearRevenue)}`, { size: 13, bold: true }));
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
    const h = 60 + KINDS.length * 20 + 28;
    this.list.add(card(this, 8, y, W - 16, h - 6));
    const left = daysUntilMonthEnd(s);
    this.list.add(txt(this, 18, y + 10, `🗓️ Đang tính: ${monthLabel(s.tax.month)}`, { size: 13, bold: true }));
    this.list.add(txt(this, 18, y + 30, left > 0 ? `Chốt sổ sau ${left} ngày nữa (sáng ngày đầu tháng sau).` : 'Chốt sổ sáng mai.', { size: 11, color: HEX.muted }));
    let row = y + 54;
    for (const kind of KINDS) {
      this.list.add(txt(this, 18, row, `${TAX_KIND_NAMES[kind]} (${pct(taxRate(kind))})`, { size: 12 }));
      this.list.add(txt(this, W - 22, row, formatMoney(s.tax.monthRevenue[kind]), { size: 12, bold: true, origin: [1, 0] }));
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
    const h = 92;
    const overdue = taxBillOverdue(s, bill);
    this.list.add(card(this, 8, y, W - 16, h - 6, overdue ? 0xffe4dc : 0xfff6e6));
    this.list.add(txt(this, 18, y + 8, `Thuế ${monthLabel(bill.year * 12 + bill.month - 1)}`, { size: 13, bold: true }));
    this.list.add(txt(this, 18, y + 28, `VAT ${formatMoney(bill.vat)} · TNCN ${formatMoney(bill.pit)}`, { size: 11, color: HEX.muted }));
    const late = lateDays(s, bill);
    const status = overdue
      ? `Quá hạn ${s.day - bill.dueDay} ngày${late ? ` · chậm nộp +${formatMoney(billTotal(s, bill) - bill.amount)}` : ''}\nCưỡng chế từ ngày ${enforceDay(bill)}`
      : bill.dueDay === s.day ? 'Hạn hôm nay' : `Hạn hết ngày ${bill.dueDay} (còn ${bill.dueDay - s.day} ngày)`;
    this.list.add(txt(this, 18, y + 46, status, { size: 11, color: overdue ? HEX.red : HEX.ink, wrap: W - 140 }));
    const total = billTotal(s, bill);
    this.list.add(new Button(this, W - 60, y + h / 2 - 3, { w: 88, h: 42, label: `Nộp\n${formatMoney(total)}`, size: 11, color: overdue ? C.red : C.green, onTap: this.list.guard(() => this.pay(bill)) }).setEnabled(s.money >= total));
    return y + h;
  }

  private historyCard(y: number): number {
    const s = G.state;
    const done = s.tax.bills.filter((b) => b.status !== 'open').reverse();
    this.list.add(txt(this, 14, y + 4, `📚 Đã nộp từ trước tới nay: ${formatMoney(s.tax.lifetimePaid)}`, { size: 13, bold: true }));
    y += 28;
    for (const bill of done) {
      const tag = bill.status === 'enforced' ? '⚠️ bị cưỡng chế' : `✓ nộp ngày ${bill.paidDay}`;
      this.list.add(txt(this, 18, y, `${monthLabel(bill.year * 12 + bill.month - 1)} · ${formatMoney(bill.paidTotal ?? 0)} · ${tag}`, { size: 11, color: bill.status === 'enforced' ? HEX.red : HEX.muted }));
      y += 18;
    }
    return y + 10;
  }

  private rulesCard(y: number): number {
    const cfg = DATA.balance.tax;
    const lines = [
      '📘 Cách tính',
      `• Doanh thu cả năm dưới ${formatMoney(cfg.yearlyThreshold)}: miễn thuế. Chỉ phần vượt ngưỡng mới tính thuế.`,
      ...KINDS.map((k) => `• ${TAX_KIND_NAMES[k]}: VAT ${pct(cfg.rates[k].vat)} + TNCN ${pct(cfg.rates[k].pit)}.`),
      '• Giá bán trên kệ đã gồm thuế, khách không phải trả thêm.',
      `• Mỗi tháng (${calendarData.daysPerMonth} ngày) chốt sổ một lần, hạn nộp hết ngày thứ ${cfg.dueDays} của tháng sau.`,
      `• Trễ hạn: chậm nộp ${pct(cfg.lateInterestPerDay)}/ngày. Trễ quá ${cfg.enforceAfterDays} ngày: bị cưỡng chế trừ thẳng vào tiền, phạt thêm ${pct(cfg.enforceFine)} tiền thuế.`,
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
}
