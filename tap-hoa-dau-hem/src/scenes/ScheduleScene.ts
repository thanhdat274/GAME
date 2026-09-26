import Phaser from 'phaser';
import { DATA } from '../core/data';
import { SHIFTS, WEEK_DAYS, autoSchedule, doubleShift, scheduleGrid, toggleShift, weekday, type Shift } from '../core/schedule';
import { roleDef } from '../core/staff';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn Xếp ca: mỗi ngày một thẻ, mỗi ca một hàng chip nhân viên chạm để bật/tắt. */
export class ScheduleScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Schedule');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📅 Xếp ca', () => { persist(); this.scene.start('Morning'); }, 'Ca sáng 08–14 · ca chiều 14–20 · nửa lương mỗi ca');
    new Button(this, W / 2, PAGE_TOP + 20, {
      w: 200, h: 34, label: '✨ Xếp tự động', size: 13, color: C.green,
      onTap: () => { autoSchedule(G.state); play('pick'); persist(); this.render(); },
    });
    txt(this, 14, PAGE_TOP + 42, 'Chạm tên để thêm/bỏ khỏi ca. Vàng: ca đôi (trừ tâm trạng). Đỏ: ca không có thu ngân.', { size: 10, color: HEX.muted, wrap: W - 28 });
    this.list = new ScrollArea(this, PAGE_TOP + 72, H - 8);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    const grid = scheduleGrid(s);
    const today = weekday(s.day);
    let y = 4;
    if (!s.staff.length) {
      this.list.add(txt(this, W / 2, 60, 'Chưa có nhân viên để xếp ca.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(100);
      return;
    }
    for (let i = 0; i < WEEK_DAYS; i++) {
      // Bắt đầu từ hôm nay để người chơi thấy ngay ca sắp tới.
      const dow = (today + i) % WEEK_DAYS;
      const day = s.day + i;
      const rowH = 28 + SHIFTS.length * 46;
      this.list.add(card(this, 8, y, W - 16, rowH - 6, i === 0 ? 0xfff0d0 : C.panel));
      this.list.add(txt(this, 18, y + 8, `${i === 0 ? 'Hôm nay · ' : ''}Ngày ${day}`, { size: 13, bold: true }));
      for (const shift of SHIFTS) {
        const cell = grid.find((c) => c.dow === dow && c.shift === shift)!;
        const sy = y + 30 + shift * 46;
        const empty = cell.cashiers === 0;
        const bg = this.add.graphics();
        bg.fillStyle(empty ? 0xfbd5cc : 0xf3e7d0, 1).fillRoundedRect(14, sy - 2, W - 28, 40, 8);
        this.list.add(bg);
        this.list.add(txt(this, 20, sy + 4, DATA.balance.staff.shifts[shift].name, { size: 11, bold: true }));
        this.list.add(txt(this, 20, sy + 20, empty ? 'Không ai đứng quầy' : `${cell.cashiers} thu ngân`, { size: 9, bold: empty, color: empty ? HEX.red : HEX.muted }));
        this.chips(dow, shift, sy + 18);
      }
      y += rowH;
    }
    this.list.setHeight(y + 20);
  }

  private chips(dow: number, shift: Shift, cy: number): void {
    const s = G.state;
    const n = s.staff.length;
    const x0 = 110;
    const w = Math.min(78, (W - x0 - 18) / Math.max(1, n) - 4);
    s.staff.forEach((st, i) => {
      const on = !!s.schedule[st.id]?.[dow * 2 + shift];
      const dbl = on && doubleShift(s, st.id, dow);
      const label = `${roleDef(st.role).icon}${st.name.split(' ').slice(-1)[0]}`;
      this.list.add(new Button(this, x0 + w / 2 + i * (w + 4), cy, {
        w, h: 30, size: 10, label,
        color: !on ? C.grey : dbl ? C.yellow : C.green,
        textColor: dbl ? HEX.ink : HEX.white,
        onTap: this.list.guard(() => { toggleShift(s, st.id, dow, shift); play('tap'); persist(); this.render(); }),
      }));
    });
  }
}
