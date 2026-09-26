import Phaser from 'phaser';
import eventData from '../data/events.json';
import { calendarDate } from '../core/calendar';
import { eventDefinition } from '../core/eventScheduler';
import { G, persist } from '../game';
import { Button, panel } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

interface SeasonalEvent { id: string; name: string; start: { month: number; day: number }; end: { month: number; day: number }; dialog: string; items?: string[] }
const SEASONAL = (eventData as { seasonal: SeasonalEvent[] }).seasonal;

export class CalendarScene extends Phaser.Scene {
  constructor() { super('Calendar'); }

  create(): void {
    setupCamera(this);
    const state = G.state;
    const date = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear });
    const bg = this.add.graphics();
    bg.fillStyle(C.bg, 1).fillRect(0, 0, W, H);
    bg.fillStyle(C.hud, 1).fillRect(0, 0, W, 54);
    txt(this, W / 2, 20, '🗓️ Lịch tiệm', { size: 18, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    txt(this, W / 2, 76, `Ngày ${date.day} · Tháng ${date.month} · Năm ${date.year}`, { size: 15, bold: true, color: HEX.white, origin: [0.5, 0.5] });
    txt(this, W / 2, 101, `Mùa ${date.seasonName}`, { size: 13, color: HEX.yellow, origin: [0.5, 0.5] });

    panel(this, 16, 124, W - 32, 153);
    txt(this, 30, 139, `Tháng ${date.month} · ${date.seasonName}`, { size: 14, bold: true, color: HEX.ink });
    for (let d = 1; d <= 10; d++) {
      const col = (d - 1) % 5;
      const row = Math.floor((d - 1) / 5);
      const x = 50 + col * 65;
      const y = 184 + row * 41;
      const isToday = d === date.day;
      const g = this.add.graphics();
      g.fillStyle(isToday ? C.green : C.wood, 1).fillRoundedRect(x - 24, y - 15, 48, 30, 6);
      txt(this, x, y, `${d}${isToday ? ' ·' : ''}`, { size: 13, bold: true, color: HEX.white, origin: [0.5, 0.5] });
    }

    panel(this, 16, 290, W - 32, 278);
    txt(this, 30, 306, 'Sắp tới', { size: 14, bold: true, color: HEX.ink });
    const active = state.activeEvents.map((event) => ({ name: eventDefinition(event.id)?.name ?? event.id, line: `Đang diễn ra · còn tới ngày ${event.endsDay}` }));
    const upcoming = [...SEASONAL].sort((a, b) => ((a.start.month - date.month + 12) % 12) - ((b.start.month - date.month + 12) % 12)).slice(0, 4)
      .map((event) => ({ name: event.name, line: `Ngày ${event.start.day} tháng ${event.start.month} · nhập: ${(event.items ?? []).join(', ') || 'hàng theo mùa'}` }));
    [...active, ...upcoming].slice(0, 5).forEach((event, i) => {
      const y = 342 + i * 43;
      txt(this, 30, y, event.name, { size: 12, bold: true, color: HEX.ink });
      txt(this, 30, y + 17, event.line, { size: 10, color: HEX.muted, wrap: 292 });
    });
    const seasonalToday = SEASONAL.find((event) => event.start.month === date.month && date.day >= event.start.day && date.day <= event.end.day);
    if (seasonalToday) txt(this, 30, 540, seasonalToday.dialog, { size: 9, color: HEX.green, wrap: 292 });

    new Button(this, W / 2, H - 42, { w: 190, h: 48, label: '← Về tiệm', color: C.green, onTap: () => { persist(); this.scene.start('Morning'); } });
  }
}
