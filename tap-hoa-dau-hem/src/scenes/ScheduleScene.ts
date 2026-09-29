import Phaser from 'phaser';
import { DATA } from '../core/data';
import { SHIFTS, WEEK_DAYS, autoSchedule, doubleShift, scheduleGrid, toggleShift, weekday, type Shift } from '../core/schedule';
import { roleDef } from '../core/staff';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn Xếp ca: mỗi ngày một thẻ, hỗ trợ giao diện 2 cột màn hình ngang. */
export class ScheduleScene extends Phaser.Scene {
  private list!: ScrollArea;
  private leftPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Schedule');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📅 Xếp ca', () => { persist(); this.scene.start('Morning'); });

    const landscape = W > H;
    const rightX = landscape ? 216 : 0;
    const rightW = landscape ? W - rightX - 8 : W;
    const topY = landscape ? PAGE_TOP + 4 : PAGE_TOP + 96;

    if (!landscape) {
      new Button(this, W / 2, PAGE_TOP + 20, {
        w: 200, h: 34, label: '✨ Xếp tự động', size: 13, color: C.green,
        onTap: () => { autoSchedule(G.state); play('pick'); persist(); this.render(); },
      });
      txt(this, 14, PAGE_TOP + 44, 'Ca sáng 08–14 · chiều 14–20 · nửa lương mỗi ca\nTự động: phủ thu ngân, chia đều ca; 2 người cần ca đôi.\nChạm tên để đổi. Vàng: ca đôi. Đỏ: thiếu thu ngân.', { size: 10, color: HEX.muted, wrap: W - 28 });
    }

    this.list = new ScrollArea(this, topY, H - 8, undefined, landscape ? { x: rightX, width: rightW } : undefined);
    this.render();
  }

  private render(): void {
    this.list.clear();
    this.leftPanel?.destroy(true);
    this.leftPanel = null;

    const landscape = W > H;
    if (landscape) {
      this.renderLeftPanel();
      this.renderLandscapeDays();
    } else {
      this.renderPortraitDays();
    }
  }

  private renderLeftPanel(): void {
    const container = this.add.container(0, 0);
    this.leftPanel = container;
    const lx = 8;
    const ly = PAGE_TOP + 4;
    const lw = 200;
    const lh = H - PAGE_TOP - 16;

    container.add(card(this, lx, ly, lw, lh, C.panel));
    container.add(new Button(this, lx + lw / 2, ly + 28, {
      w: lw - 24, h: 36, label: '✨ Xếp tự động', size: 12.5, color: C.green,
      onTap: () => { autoSchedule(G.state); play('pick'); persist(); this.render(); },
    }));

    container.add(txt(this, lx + 14, ly + 62, 'Quy tắc ca làm việc:', { size: 11, bold: true }));
    container.add(txt(this, lx + 14, ly + 82, '• Sáng: 08:00 – 14:00\n• Chiều: 14:00 – 20:00\n• Nửa lương mỗi ca\n• Chạm tên để gán ca', { size: 9.5, color: HEX.muted }));

    container.add(txt(this, lx + 14, ly + 154, 'Ý nghĩa màu sắc:', { size: 11, bold: true }));
    container.add(txt(this, lx + 14, ly + 174, '🟩 Xanh: Ca đơn chuẩn\n🟨 Vàng: Ca đôi (cả ngày)\n🟥 Đỏ: Thiếu thu ngân\n⬜ Xám: Được nghỉ', { size: 9.5, color: HEX.muted }));
  }

  private renderLandscapeDays(): void {
    const s = G.state;
    const grid = scheduleGrid(s);
    const today = weekday(s.day);
    const rightX = 216;
    const cardW = W - rightX - 12;
    const halfW = Math.floor((cardW - 12) / 2);
    const columns = Math.max(1, Math.min(2, s.staff.length));
    const chipRows = Math.ceil(s.staff.length / columns);
    const shiftBoxH = 34 + chipRows * 34;
    const rowH = 30 + shiftBoxH;

    let y = 4;
    if (!s.staff.length) {
      this.list.add(txt(this, rightX + cardW / 2, 60, 'Chưa có nhân viên để xếp ca.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(100);
      return;
    }

    for (let i = 0; i < WEEK_DAYS; i++) {
      const dow = (today + i) % WEEK_DAYS;
      const day = s.day + i;
      this.list.add(card(this, rightX, y, cardW, rowH - 6, i === 0 ? 0xfff0d0 : C.panel));
      this.list.add(txt(this, rightX + 12, y + 8, `${i === 0 ? 'Hôm nay · ' : ''}Ngày ${day}`, { size: 12.5, bold: true }));

      SHIFTS.forEach((shift) => {
        const cell = grid.find((c) => c.dow === dow && c.shift === shift)!;
        const sx = rightX + 6 + shift * (halfW + 6);
        const sy = y + 26;
        const empty = cell.cashiers === 0;

        const bg = this.add.graphics();
        bg.fillStyle(empty ? 0xfbd5cc : 0xf3e7d0, 1).fillRoundedRect(sx, sy, halfW, shiftBoxH - 6, 6);
        this.list.add(bg);

        this.list.add(txt(this, sx + 8, sy + 4, DATA.balance.staff.shifts[shift].name, { size: 10, bold: true }));
        this.list.add(txt(this, sx + halfW - 8, sy + 5, empty ? 'Thiếu thu ngân' : `${cell.cashiers} quầy`, {
          size: 8.5, bold: empty, color: empty ? HEX.red : HEX.muted, origin: [1, 0],
        }));

        this.chipsLandscape(dow, shift, sx, sy + 24, halfW, columns);
      });
      y += rowH;
    }
    this.list.setHeight(y + 20);
  }

  private chipsLandscape(dow: number, shift: Shift, sx: number, firstCy: number, boxW: number, columns: number): void {
    const s = G.state;
    const gap = 4;
    const w = Math.floor((boxW - 12 - (columns - 1) * gap) / columns);
    s.staff.forEach((st, i) => {
      const on = !!s.schedule[st.id]?.[dow * 2 + shift];
      const dbl = on && doubleShift(s, st.id, dow);
      const label = `${roleDef(st.role).icon}${st.name.split(' ').slice(-1)[0]}`;
      const col = i % columns;
      const row = Math.floor(i / columns);
      this.list.add(new Button(this, sx + 6 + w / 2 + col * (w + gap), firstCy + 14 + row * 34, {
        w, h: 26, size: 9.5, label,
        color: !on ? C.grey : dbl ? C.yellow : C.green,
        textColor: dbl ? HEX.ink : HEX.white,
        onTap: this.list.guard(() => { toggleShift(s, st.id, dow, shift); play('tap'); persist(); this.render(); }),
      }));
    });
  }

  private renderPortraitDays(): void {
    const s = G.state;
    const grid = scheduleGrid(s);
    const today = weekday(s.day);
    const columns = Math.max(1, Math.min(3, s.staff.length));
    const chipRows = Math.ceil(s.staff.length / columns);
    const shiftH = 38 + chipRows * 38;
    let y = 4;
    if (!s.staff.length) {
      this.list.add(txt(this, W / 2, 60, 'Chưa có nhân viên để xếp ca.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(100);
      return;
    }
    for (let i = 0; i < WEEK_DAYS; i++) {
      const dow = (today + i) % WEEK_DAYS;
      const day = s.day + i;
      const rowH = 30 + SHIFTS.length * shiftH;
      this.list.add(card(this, 8, y, W - 16, rowH - 6, i === 0 ? 0xfff0d0 : C.panel));
      this.list.add(txt(this, 18, y + 8, `${i === 0 ? 'Hôm nay · ' : ''}Ngày ${day}`, { size: 13, bold: true }));
      for (const shift of SHIFTS) {
        const cell = grid.find((c) => c.dow === dow && c.shift === shift)!;
        const sy = y + 30 + shift * shiftH;
        const empty = cell.cashiers === 0;
        const bg = this.add.graphics();
        bg.fillStyle(empty ? 0xfbd5cc : 0xf3e7d0, 1).fillRoundedRect(14, sy - 2, W - 28, shiftH - 6, 8);
        this.list.add(bg);
        this.list.add(txt(this, 20, sy + 4, DATA.balance.staff.shifts[shift].name, { size: 11, bold: true }));
        this.list.add(txt(this, W - 20, sy + 5, empty ? 'Không ai đứng quầy' : `${cell.cashiers} thu ngân`, { size: 9, bold: empty, color: empty ? HEX.red : HEX.muted, origin: [1, 0] }));
        this.chipsPortrait(dow, shift, sy + 36, columns);
      }
      y += rowH;
    }
    this.list.setHeight(y + 20);
  }

  private chipsPortrait(dow: number, shift: Shift, firstCy: number, columns: number): void {
    const s = G.state;
    const gap = 6;
    const w = (W - 40 - (columns - 1) * gap) / columns;
    s.staff.forEach((st, i) => {
      const on = !!s.schedule[st.id]?.[dow * 2 + shift];
      const dbl = on && doubleShift(s, st.id, dow);
      const label = `${roleDef(st.role).icon}${st.name.split(' ').slice(-1)[0]}`;
      const col = i % columns;
      const row = Math.floor(i / columns);
      this.list.add(new Button(this, 20 + w / 2 + col * (w + gap), firstCy + row * 38, {
        w, h: 30, size: 11, label,
        color: !on ? C.grey : dbl ? C.yellow : C.green,
        textColor: dbl ? HEX.ink : HEX.white,
        onTap: this.list.guard(() => { toggleShift(s, st.id, dow, shift); play('tap'); persist(); this.render(); }),
      }));
    });
  }
}
