import Phaser from 'phaser';
import { DATA, hasFeature, type StaffRole, type StatKey } from '../core/data';
import {
  STAT_KEYS, STAT_NAMES, bonusStaff, changeRole, ensureBoard, expToNext, fire, hire, moodLabel, nextSlotLevel, personalityDef,
  roleDef, scoldStaff, staffSlots, unlockedRoles,
} from '../core/staff';
import { scheduleEnabled, shiftsOn } from '../core/schedule';
import { formatMoney, type Candidate, type Staff } from '../core/state';
import { G, persist } from '../game';
import { staffSprite } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

type Tab = 'staff' | 'hire';

/** Màn Nhân sự (thẻ nhân viên, chỉ số, tâm trạng, Thưởng/Nhắc nhở/Sa thải) và Tuyển dụng. */
export class StaffScene extends Phaser.Scene {
  private list!: ScrollArea;
  private tab: Tab = 'staff';
  private tabs!: Record<Tab, Button>;
  private header!: Phaser.GameObjects.Text;

  constructor() {
    super('Staff');
  }

  create(data: { tab?: Tab }): void {
    setupCamera(this);
    const s = G.state;
    ensureBoard(s);
    this.tab = data?.tab ?? (s.staff.length ? 'staff' : 'hire');
    pageFrame(this, '👥 Nhân sự', () => { persist(); this.scene.start('Morning'); });
    this.tabs = {
      staff: new Button(this, W / 4 + 4, PAGE_TOP + 18, { w: W / 2 - 16, h: 34, label: '👥 Nhân viên', size: 13, onTap: () => this.setTab('staff') }),
      hire: new Button(this, (W * 3) / 4 - 4, PAGE_TOP + 18, { w: W / 2 - 16, h: 34, label: '📋 Tuyển dụng', size: 13, onTap: () => this.setTab('hire') }),
    };
    this.header = txt(this, 14, PAGE_TOP + 42, '', { size: 11, color: HEX.muted, wrap: W - 28 });
    this.list = new ScrollArea(this, PAGE_TOP + 74, H - 8);
    this.setTab(this.tab);
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.tabs.staff.setColor(tab === 'staff' ? C.red : C.wood);
    this.tabs.hire.setColor(tab === 'hire' ? C.red : C.wood);
    this.list.setScroll(0);
    this.render();
  }

  private render(): void {
    const s = G.state;
    const slots = staffSlots(s.level);
    const next = nextSlotLevel(s.level);
    const wages = s.staff.reduce((sum, x) => sum + x.wage, 0);
    this.header.setText(`Chỗ: ${s.staff.length}/${slots}${next ? ` (thêm chỗ ở level ${next})` : ''} · Lương cả ngày: ${formatMoney(wages)}${s.wageDebt ? ` · Nợ lương ${formatMoney(s.wageDebt)}` : ''}`);
    this.list.clear();
    let y = 4;
    if (this.tab === 'staff') {
      if (!s.staff.length) this.list.add(txt(this, W / 2, 60, 'Chưa có nhân viên.\nSang tab Tuyển dụng để thuê người phụ.', { size: 14, color: HEX.muted, origin: [0.5, 0.5], align: 'center' }));
      for (const st of s.staff) y = this.staffCard(st, y);
      if (hasFeature(s.level, 'camera')) y = this.cameraCard(y);
    } else {
      const board = ensureBoard(s);
      const refresh = DATA.balance.staff.refreshDays - (s.day - (s.staffBoard?.day ?? s.day));
      this.list.add(txt(this, 14, y, `Bảng ứng viên đổi sau ${refresh} ngày.`, { size: 11, color: HEX.muted }));
      y += 18;
      if (!board.length) this.list.add(txt(this, W / 2, y + 40, 'Hết ứng viên, chờ bảng mới nhé.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
      for (const c of board) y = this.candidateCard(c, y);
    }
    this.list.setHeight(y + 20);
  }

  /** Bốn thanh chỉ số 1–10. */
  private statBars(stats: Record<StatKey, number>, x: number, y: number, main?: StatKey): number {
    STAT_KEYS.forEach((k, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = x + col * 160;
      const by = y + row * 18;
      this.list.add(txt(this, bx, by, `${STAT_NAMES[k]}${k === main ? '★' : ''}`, { size: 10, color: k === main ? '#b7411f' : HEX.muted }));
      const bar = new Bar(this, bx + 64, by + 4, 70, 6, k === main ? C.red : C.green, 0x000000);
      bar.set(stats[k] / 10);
      this.list.add(bar);
      this.list.add(txt(this, bx + 140, by, String(stats[k]), { size: 10, bold: true }));
    });
    return y + 38;
  }

  private staffCard(st: Staff, y: number): number {
    const s = G.state;
    const h = 186;
    const mood = moodLabel(st.mood);
    this.list.add(card(this, 8, y, W - 16, h - 6, st.quitting ? 0xffe4dc : C.panel));
    this.list.add(staffSprite(this, 34, y + 52, st).setScale(0.6));
    const role = roleDef(st.role);
    this.list.add(txt(this, 62, y + 8, `${st.name} · Cấp ${st.level}`, { size: 14, bold: true }));
    this.list.add(txt(this, 62, y + 28, `${role.icon} ${role.name} · ${personalityDef(st.personality).name} · ${formatMoney(st.wage)}/ngày`, { size: 11, color: HEX.muted, wrap: W - 80 }));
    this.list.add(txt(this, W - 20, y + 8, `${mood.icon} ${st.mood}`, { size: 13, bold: true, origin: [1, 0], color: st.mood < DATA.balance.staff.lowMoodThreshold ? HEX.red : HEX.green }));
    const exp = new Bar(this, 62, y + 48, W - 90, 5, C.yellow, 0x000000);
    exp.set(st.exp / expToNext(st));
    this.list.add(exp);
    const work = scheduleEnabled(s) ? `Hôm nay ${['nghỉ', '1 ca', 'ca đôi'][shiftsOn(s, st.id, s.day)]}` : 'Làm cả ngày';
    const perf = st.lifetime;
    this.list.add(txt(this, 62, y + 56, `${work} · làm liên tục ${st.streak} ngày · đã phục vụ ${perf.served} khách · sai ${perf.mistakes}`, { size: 10, color: HEX.muted, wrap: W - 80 }));
    let yy = this.statBars(st.stats, 18, y + 76, role.mainStat);
    if (st.quitting) {
      this.list.add(txt(this, 18, yy, `${st.name} muốn nghỉ việc (quyết định ở buổi sáng).`, { size: 11, bold: true, color: HEX.red }));
    }
    yy = y + h - 34;
    const bw = (W - 40) / 4;
    const btn = (i: number, label: string, color: number, onTap: () => void, enabled = true) =>
      this.list.add(new Button(this, 20 + bw / 2 + i * (bw + 2), yy, { w: bw - 4, h: 32, label, size: 11, color, onTap: this.list.guard(onTap) }).setEnabled(enabled));
    btn(0, `🎁 Thưởng ${DATA.balance.staff.bonusAmount / 1000}k`, C.green, () => {
      if (!bonusStaff(s, st.id)) { toast(this, 'Không đủ tiền thưởng', H / 2, C.red); return; }
      play('coin');
      persist();
      toast(this, `${st.name}: "Cảm ơn chủ nhiều!" (+tâm trạng)`);
      this.render();
    }, s.money >= DATA.balance.staff.bonusAmount);
    btn(1, '☝️ Nhắc nhở', C.yellow, () => {
      if (!scoldStaff(s, st.id)) return;
      persist();
      toast(this, `${st.name} cẩn thận hơn hôm nay (+2 chính xác), nhưng hơi buồn.`);
      this.render();
    }, st.scoldedDay !== s.day);
    btn(2, '🔁 Vai trò', C.blue, () => this.pickRole(st), unlockedRoles(s).length > 1);
    btn(3, '✖ Sa thải', C.red, () => dialog(this, {
      icon: '😢',
      title: `Sa thải ${st.name}?`,
      body: `Trả thêm ${formatMoney(st.wage * DATA.balance.staff.severanceDays)} trợ cấp. ${st.name} sẽ bị xóa khỏi lịch ca.`,
      buttons: [
        { label: 'Thôi', color: C.grey },
        { label: 'Sa thải', color: C.red, onTap: () => { fire(s, st.id); persist(); this.render(); } },
      ],
    }));
    return y + h;
  }

  private pickRole(st: Staff): void {
    const s = G.state;
    const buttons = unlockedRoles(s).map((r) => ({
      label: `${roleDef(r).icon} ${roleDef(r).name}${r === st.role ? ' (đang làm)' : ''}`,
      color: r === st.role ? C.grey : C.blue,
      onTap: () => { changeRole(s, st.id, r); persist(); this.render(); },
    }));
    buttons.push({ label: 'Đóng', color: C.grey, onTap: () => undefined });
    dialog(this, { title: `Vai trò của ${st.name}`, body: 'Thu ngân đứng quầy; Bổ sung kệ nạp ô vơi dưới 40%; Kho cất hàng và bày theo sơ đồ; Giao hàng chạy đơn điện thoại.', buttons });
  }

  private candidateCard(c: Candidate, y: number): number {
    const s = G.state;
    const h = 150;
    const role = roleDef(c.role);
    const fixed = c.id === DATA.staff.fixedCandidate.id;
    this.list.add(card(this, 8, y, W - 16, h - 6, fixed ? 0xfff0d0 : C.panel));
    this.list.add(staffSprite(this, 34, y + 50, c).setScale(0.6));
    this.list.add(txt(this, 62, y + 8, `${c.name}${fixed ? ' ⭐' : ''}`, { size: 14, bold: true }));
    this.list.add(txt(this, 62, y + 28, `Hợp vai: ${role.icon} ${role.name} · ${personalityDef(c.personality).name}`, { size: 11, color: HEX.muted }));
    this.list.add(txt(this, 62, y + 44, personalityDef(c.personality).note, { size: 10, color: HEX.muted, wrap: W - 180 }));
    this.list.add(txt(this, W - 20, y + 8, `${formatMoney(c.wage)}/ngày`, { size: 13, bold: true, origin: [1, 0], color: '#b7411f' }));
    this.statBars(c.stats, 18, y + 70, role.mainStat);
    const full = s.staff.length >= staffSlots(s.level);
    const next = nextSlotLevel(s.level);
    const label = full ? (next ? `Hết chỗ · L${next}` : 'Hết chỗ') : '✓ Thuê';
    this.list.add(new Button(this, W - 70, y + h - 30, { w: 116, h: 34, label, size: 12, color: C.green, onTap: this.list.guard(() => this.hireFlow(c)) }).setEnabled(!full));
    return y + h;
  }

  private hireFlow(c: Candidate): void {
    const s = G.state;
    const roles = unlockedRoles(s);
    const doHire = (role: StaffRole) => {
      const result = hire(s, c.id, role);
      if (result !== 'ok') { toast(this, result === 'full' ? 'Hết chỗ nhân viên' : 'Chưa thuê được', H / 2, C.red); return; }
      play('levelup');
      persist();
      toast(this, `${c.name} bắt đầu làm từ hôm nay!`, H / 2, C.greenDark);
      this.setTab('staff');
    };
    if (roles.length === 1) { doHire(roles[0]); return; }
    dialog(this, {
      title: `Thuê ${c.name} làm gì?`,
      body: `Hợp nhất: ${roleDef(c.role).name}.`,
      buttons: [
        ...roles.map((r) => ({ label: `${roleDef(r).icon} ${roleDef(r).name}`, color: r === c.role ? C.green : C.blue, onTap: () => doHire(r) })),
        { label: 'Thôi', color: C.grey },
      ],
    });
  }

  private cameraCard(y: number): number {
    const s = G.state;
    const cost = DATA.balance.security.cameraCost;
    this.list.add(card(this, 8, y, W - 16, 74, 0xe8f1fb));
    this.list.add(txt(this, 18, y + 10, '📷 Camera an ninh', { size: 14, bold: true }));
    this.list.add(txt(this, 18, y + 30, `Phát hiện ${Math.round(DATA.balance.security.cameraDetect * 100)}% kẻ trộm. Bổ sung kệ tự phát hiện ${Math.round(DATA.balance.security.refillDetect * 100)}% khi ở gần.`, { size: 10, color: HEX.muted, wrap: W - 150 }));
    this.list.add(new Button(this, W - 70, y + 36, {
      w: 110, h: 34, size: 12, color: C.blue,
      label: s.camera ? '✓ Đã lắp' : `Lắp ${formatMoney(cost)}`,
      onTap: this.list.guard(() => {
        if (s.camera || s.money < cost) return;
        s.money -= cost;
        s.camera = true;
        play('coin');
        persist();
        this.render();
      }),
    }).setEnabled(!s.camera && s.money >= cost));
    return y + 80;
  }
}
