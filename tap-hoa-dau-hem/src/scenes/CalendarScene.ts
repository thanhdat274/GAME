import Phaser from 'phaser';
import eventData from '../data/events.json';
import { calendarDate } from '../core/calendar';
import { DATA } from '../core/data';
import { eventDefinition } from '../core/eventScheduler';
import { formatMoney } from '../core/state';
import { billLabel, billTotal, monthTaxEstimate, openBills } from '../core/tax';
import { G, persist } from '../game';
import { Button, panel } from '../ui/widgets';
import { pageFrame } from '../ui/page';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

interface SeasonalEvent { id: string; name: string; start: { month: number; day: number }; end: { month: number; day: number }; dialog: string; items?: string[] }
const SEASONAL = (eventData as { seasonal: SeasonalEvent[] }).seasonal;

export class CalendarScene extends Phaser.Scene {
  constructor() { super('Calendar'); }

  create(): void {
    setupCamera(this);
    const state = G.state;
    const date = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear });
    this.createLandscape(date);
  }

  private createLandscape(date: ReturnType<typeof calendarDate>): void {
    const state = G.state;
    pageFrame(this, '🗓️ Lịch tiệm', () => { persist(); this.scene.start('Morning'); }, `Ngày ${date.day} · Tháng ${date.month} · Năm ${date.year} · ${date.seasonName}`);
    const leftX = 8;
    const top = 62;
    const leftW = Math.min(266, Math.floor(W * 0.42));
    const rightX = leftX + leftW + 8;
    const rightW = W - rightX - 8;
    const panelH = H - top - 40;
    panel(this, leftX, top, leftW, panelH);
    panel(this, rightX, top, rightW, panelH);
    txt(this, leftX + 12, top + 10, `Tháng ${date.month} · ${date.seasonName}`, { size: 13, bold: true, color: HEX.ink });
    txt(this, rightX + 12, top + 10, 'Sắp tới', { size: 13, bold: true, color: HEX.ink });

    const taxDue = new Set(openBills(state).map((bill) => date.day + bill.dueDay - state.day).filter((day) => day >= 1 && day <= 10));
    const gridTop = top + 48;
    const cellW = (leftW - 24) / 5;
    for (let day = 1; day <= 10; day++) {
      const col = (day - 1) % 5;
      const row = Math.floor((day - 1) / 5);
      const x = leftX + 12 + cellW * (col + 0.5);
      const y = gridTop + row * 38;
      const today = day === date.day;
      const due = taxDue.has(day);
      const g = this.add.graphics();
      g.fillStyle(today ? C.green : due ? C.red : C.wood, 1).fillRoundedRect(x - cellW * 0.42, y - 14, cellW * 0.84, 28, 5);
      txt(this, x, y, `${day}${due ? ' 🧾' : today ? ' ·' : ''}`, { size: 11, bold: true, color: HEX.white, origin: [0.5, 0.5] });
    }
    txt(this, leftX + 12, gridTop + 82, 'Hạn thuế được tô đỏ · hôm nay màu xanh', { size: 9, color: HEX.muted, wrap: leftW - 24 });

    const taxLines = openBills(state).sort((a, b) => a.dueDay - b.dueDay).map((bill) => ({
      name: `🧾 ${billLabel(bill)}`,
      line: `${bill.dueDay < state.day ? `Quá hạn ${state.day - bill.dueDay} ngày` : bill.dueDay === state.day ? 'Hạn hôm nay' : `Còn ${bill.dueDay - state.day} ngày`} · ${formatMoney(billTotal(state, bill))}`,
    }));
    if (state.tax.registered) taxLines.push({ name: '🧾 Chốt sổ thuế tháng', line: `Đầu tháng sau · tạm tính ${formatMoney(monthTaxEstimate(state))}` });
    const active = state.activeEvents.map((event) => ({ name: eventDefinition(event.id)?.name ?? event.id, line: `Đang diễn ra · tới ngày ${event.endsDay}` }));
    const upcoming = [...SEASONAL].sort((a, b) => ((a.start.month - date.month + 12) % 12) - ((b.start.month - date.month + 12) % 12)).slice(0, 4)
      .map((event) => ({ name: event.name, line: `Ngày ${event.start.day}/${event.start.month} · ${(event.items ?? []).map((id) => DATA.products.find((item) => item.id === id)?.name ?? id).join(', ') || 'hàng theo mùa'}` }));
    const entries = [...taxLines, ...active, ...upcoming].slice(0, 5);
    if (!entries.length) txt(this, rightX + 14, top + 58, 'Chưa có hạn thuế hoặc sự kiện sắp tới.', { size: 11, color: HEX.muted });
    entries.forEach((entry, index) => {
      const y = top + 38 + index * 46;
      if (index) this.add.graphics().lineStyle(1, C.panelEdge, 0.8).lineBetween(rightX + 12, y, rightX + rightW - 12, y);
      txt(this, rightX + 14, y + 5, entry.name, { size: 11, bold: true, color: HEX.ink, wrap: rightW - 28 });
      txt(this, rightX + 14, y + 22, entry.line, { size: 9, color: HEX.muted, wrap: rightW - 28 });
    });
    new Button(this, W - 60, H - 21, { w: 102, h: 30, label: '← Về tiệm', color: C.green, size: 11, onTap: () => { persist(); this.scene.start('Morning'); } });
  }
}
