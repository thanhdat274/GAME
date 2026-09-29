import Phaser from 'phaser';
import { DATA, hasFeature, type StaffRole, type StatKey } from '../core/data';
import {
  STAT_KEYS, STAT_NAMES, bonusStaff, changeRole, ensureBoard, expToNext, fire, hire, moodLabel, nextSlotLevel, personalityDef, recommendCandidate,
  roleDef, scoldStaff, staffSlots, landBonusSlots, transferStaff, unlockedRoles,
} from '../core/staff';
import { scheduleEnabled, shiftsOn } from '../core/schedule';
import { formatMoney, storeView, type Candidate, type Staff } from '../core/state';
import { G, persist } from '../game';
import { staffSprite } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, dialog, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

type Tab = 'staff' | 'hire';

/** Màn Nhân sự (thẻ nhân viên, chỉ số, tâm trạng, Thưởng/Nhắc nhở/Sa thải) và Tuyển dụng. */
export class StaffScene extends Phaser.Scene {
  private list!: ScrollArea;
  private detailArea?: ScrollArea;
  private tab: Tab = 'staff';
  private tabs!: Record<Tab, Button>;
  private header!: Phaser.GameObjects.Text;
  private landscape = false;
  private detailWidth = 0;
  private selectedStaffId: string | null = null;
  private selectedCandidateId: string | null = null;

  constructor() {
    super('Staff');
  }

  create(data: { tab?: Tab }): void {
    setupCamera(this);
    const s = G.state;
    ensureBoard(s);
    this.tab = data?.tab ?? (s.staff.length ? 'staff' : 'hire');
    pageFrame(this, '👥 Nhân sự', () => { persist(); this.scene.start('Morning'); });

    this.landscape = W > H;
    if (this.landscape) {
      const padX = W >= 700 ? 36 : 10;
      const leftW = 212;
      const tabW = Math.floor((leftW - 4) / 2);
      this.tabs = {
        staff: new Button(this, padX + tabW / 2, PAGE_TOP + 16, { w: tabW, h: 26, label: '👥 Nhân viên', size: 10, onTap: () => this.setTab('staff') }),
        hire: new Button(this, padX + tabW + 4 + tabW / 2, PAGE_TOP + 16, { w: tabW, h: 26, label: '📋 Tuyển dụng', size: 10, onTap: () => this.setTab('hire') }),
      };
      const detailX = padX + leftW + 12;
      this.detailWidth = W - detailX - padX;
      this.header = txt(this, detailX, PAGE_TOP + 16, '', { size: 10, color: HEX.muted, wrap: this.detailWidth, origin: [0, 0.5] });
      this.list = new ScrollArea(this, PAGE_TOP + 34, H - 10, undefined, { x: padX, width: leftW });
      this.detailArea = new ScrollArea(this, PAGE_TOP + 34, H - 10, undefined, { x: detailX, width: this.detailWidth });
    } else {
      this.tabs = {
        staff: new Button(this, W / 4 + 4, PAGE_TOP + 18, { w: W / 2 - 16, h: 34, label: '👥 Nhân viên', size: 13, onTap: () => this.setTab('staff') }),
        hire: new Button(this, (W * 3) / 4 - 4, PAGE_TOP + 18, { w: W / 2 - 16, h: 34, label: '📋 Tuyển dụng', size: 13, onTap: () => this.setTab('hire') }),
      };
      this.header = txt(this, 14, PAGE_TOP + 42, '', { size: 11, color: HEX.muted, wrap: W - 28 });
      this.list = new ScrollArea(this, PAGE_TOP + 74, H - 8);
    }
    this.setTab(this.tab);
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.tabs.staff.setColor(tab === 'staff' ? C.red : C.wood);
    this.tabs.hire.setColor(tab === 'hire' ? C.red : C.wood);
    this.list.setScroll(0);
    this.detailArea?.setScroll(0);
    this.render();
  }

  private render(): void {
    const s = G.state;
    const slots = staffSlots(s.level, s.land);
    const next = nextSlotLevel(s.level);
    const wages = s.staff.reduce((sum, x) => sum + x.wage, 0);
    const landBonus = landBonusSlots(s.land);
    this.header.setText(`Chỗ: ${s.staff.length}/${slots}${landBonus ? ` (+${landBonus} đất)` : ''}${next ? ` · thêm ở L${next}` : ''} | Lương: ${formatMoney(wages)}${s.wageDebt ? ` · Nợ ${formatMoney(s.wageDebt)}` : ''}`);

    if (this.landscape) {
      this.renderLandscape();
      return;
    }

    this.list.clear();
    let y = 4;
    if (this.tab === 'staff') {
      if (!s.staff.length) this.list.add(txt(this, W / 2, 60, 'Chưa có nhân viên.\nSang tab Tuyển dụng để thuê người phụ.', { size: 14, color: HEX.muted, origin: [0.5, 0.5], align: 'center' }));
      for (const st of s.staff) y = this.staffCard(st, y);
      if (hasFeature(s.level, 'camera')) y = this.cameraCard(y);
      if (hasFeature(s.level, 'thief')) y = this.policeCard(y);
    } else {
      const board = ensureBoard(s);
      const refresh = DATA.balance.staff.refreshDays - (s.day - (s.staffBoard?.day ?? s.day));
      this.list.add(txt(this, 14, y, `Bảng ứng viên đổi sau ${refresh} ngày.`, { size: 11, color: HEX.muted }));
      y += 18;
      if (!board.length) this.list.add(txt(this, W / 2, y + 40, 'Hết ứng viên, chờ bảng mới nhé.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
      const recommendation = recommendCandidate(s, board);
      const ordered = recommendation
        ? [recommendation.candidate, ...board.filter((candidate) => candidate.id !== recommendation.candidate.id)]
        : board;
      for (const c of ordered) y = this.candidateCard(c, y, c.id === recommendation?.candidate.id ? recommendation.reason : undefined);
    }
    this.list.setHeight(y + 20);
  }

  private renderLandscape(): void {
    const s = G.state;
    this.list.clear();
    this.detailArea?.clear();

    if (this.tab === 'staff') {
      if (!s.staff.length) {
        this.list.add(txt(this, 106, 60, 'Chưa có nhân viên.\nSang Tuyển dụng để thuê.', { size: 11, color: HEX.muted, origin: [0.5, 0.5], align: 'center' }));
        this.list.setHeight(100);
        return;
      }
      if (!this.selectedStaffId || !s.staff.some((x) => x.id === this.selectedStaffId)) {
        this.selectedStaffId = s.staff[0].id;
      }

      let y = 4;
      for (const st of s.staff) {
        const sel = st.id === this.selectedStaffId;
        const role = roleDef(st.role);
        const mood = moodLabel(st.mood);
        this.list.add(card(this, 0, y, 212, 46, sel ? 0xfff0d0 : (st.quitting ? 0xffe4dc : C.panel)));
        this.list.add(staffSprite(this, 18, y + 23, st).setScale(0.42));
        this.list.add(txt(this, 38, y + 6, `${st.name} · C${st.level}`, { size: 11, bold: true, color: sel ? HEX.red : HEX.ink }));
        this.list.add(txt(this, 38, y + 24, `${role.icon} ${mood.icon} ${formatMoney(st.wage)}/ngày`, { size: 9, color: HEX.muted }));
        const tapZone = this.add.zone(106, y + 23, 212, 46).setInteractive();
        tapZone.on('pointerup', this.list.guard(() => { this.selectedStaffId = st.id; this.render(); }));
        this.list.add(tapZone);
        y += 50;
      }

      if (hasFeature(s.level, 'camera')) {
        const cost = DATA.balance.security.cameraCost;
        this.list.add(card(this, 0, y, 212, 40, 0xe8f1fb));
        this.list.add(txt(this, 8, y + 6, '📷 Camera an ninh', { size: 10, bold: true }));
        this.list.add(txt(this, 8, y + 22, s.camera ? '✓ Đã lắp' : `Chưa lắp (${formatMoney(cost)})`, { size: 9, color: s.camera ? HEX.green : HEX.muted }));
        if (!s.camera) {
          const btn = new Button(this, 172, y + 20, {
            w: 68, h: 26, size: 9, color: C.blue, label: 'Lắp',
            onTap: this.list.guard(() => {
              if (s.money < cost) return;
              s.money -= cost;
              s.camera = true;
              play('coin');
              persist();
              this.render();
            }),
          }).setEnabled(s.money >= cost);
          this.list.add(btn);
        }
        y += 44;
      }

      if (hasFeature(s.level, 'thief')) {
        const on = s.settings.callPolice !== false;
        this.list.add(card(this, 0, y, 212, 40, 0xe8f1fb));
        this.list.add(txt(this, 8, y + 6, '🚓 Báo công an', { size: 10, bold: true }));
        this.list.add(txt(this, 8, y + 22, on ? '✓ Có báo khi bị trộm' : 'Tự chịu mất', { size: 9, color: on ? HEX.green : HEX.muted }));
        const btn = new Button(this, 172, y + 20, {
          w: 68, h: 26, size: 9, color: on ? C.green : C.grey, label: on ? 'Bật' : 'Tắt',
          onTap: this.list.guard(() => {
            s.settings.callPolice = !on;
            play('coin');
            persist();
            this.render();
          }),
        });
        this.list.add(btn);
        y += 44;
      }
      this.list.setHeight(y + 10);

      const activeStaff = s.staff.find((x) => x.id === this.selectedStaffId) ?? s.staff[0];
      if (activeStaff && this.detailArea) {
        this.renderStaffDetailLandscape(activeStaff);
      }
    } else {
      const board = ensureBoard(s);
      if (!this.selectedCandidateId || !board.some((x) => x.id === this.selectedCandidateId)) {
        const rec = recommendCandidate(s, board);
        this.selectedCandidateId = rec?.candidate.id ?? board[0]?.id ?? null;
      }

      let y = 4;
      const rec = recommendCandidate(s, board);
      for (const c of board) {
        const sel = c.id === this.selectedCandidateId;
        const isRec = c.id === rec?.candidate.id;
        const role = roleDef(c.role);
        this.list.add(card(this, 0, y, 212, 46, sel ? 0xfff0d0 : (isRec ? 0xe8f5e9 : C.panel)));
        this.list.add(staffSprite(this, 18, y + 23, c).setScale(0.42));
        this.list.add(txt(this, 38, y + 6, `${c.name}${isRec ? ' ⭐' : ''}`, { size: 11, bold: true, color: isRec ? HEX.green : HEX.ink }));
        this.list.add(txt(this, 38, y + 24, `${role.icon} ${formatMoney(c.wage)}/ngày`, { size: 9, color: HEX.muted }));
        const tapZone = this.add.zone(106, y + 23, 212, 46).setInteractive();
        tapZone.on('pointerup', this.list.guard(() => { this.selectedCandidateId = c.id; this.render(); }));
        this.list.add(tapZone);
        y += 50;
      }
      this.list.setHeight(y + 10);

      const activeCandidate = board.find((x) => x.id === this.selectedCandidateId) ?? board[0];
      if (activeCandidate && this.detailArea) {
        this.renderCandidateDetailLandscape(activeCandidate, rec?.candidate.id === activeCandidate.id ? rec.reason : undefined);
      }
    }
  }

  private renderStaffDetailLandscape(st: Staff): void {
    if (!this.detailArea) return;
    const s = G.state;
    const dw = this.detailWidth || (W - 240);
    const L = this.detailArea;
    const role = roleDef(st.role);
    const mood = moodLabel(st.mood);
    const h = 265;

    L.add(card(this, 0, 0, dw, h, st.quitting ? 0xffe4dc : C.panel));
    L.add(staffSprite(this, 36, 42, st).setScale(0.65));
    L.add(txt(this, 72, 8, `${st.name} · Cấp ${st.level}`, { size: 15, bold: true }));
    L.add(txt(this, 72, 28, `${role.icon} ${role.name} · ${personalityDef(st.personality).name} · ${formatMoney(st.wage)}/ngày`, { size: 11, color: HEX.muted }));
    L.add(txt(this, dw - 14, 8, `${mood.icon} ${st.mood}`, { size: 14, bold: true, origin: [1, 0], color: st.mood < DATA.balance.staff.lowMoodThreshold ? HEX.red : HEX.green }));

    const exp = new Bar(this, 72, 48, dw - 90, 5, C.yellow, 0x000000);
    exp.set(st.exp / expToNext(st));
    L.add(exp);

    const work = scheduleEnabled(s) ? `Hôm nay ${['nghỉ', '1 ca', 'ca đôi'][shiftsOn(s, st.id, s.day)]}` : 'Làm cả ngày';
    const perf = st.lifetime;
    L.add(txt(this, 72, 58, `${work} · streak ${st.streak} ngày · đã phục vụ ${perf.served} khách · sai ${perf.mistakes}`, { size: 10, color: HEX.muted, wrap: dw - 80 }));

    this.statBars(st.stats, 20, 80, role.mainStat, L);

    if (st.quitting) {
      L.add(txt(this, 20, 126, `⚠️ ${st.name} muốn nghỉ việc (quyết định ở buổi sáng).`, { size: 11, bold: true, color: HEX.red }));
    }

    const yy = h - 38;
    const bw = Math.floor((dw - 24) / 5);
    const btn = (i: number, label: string, color: number, onTap: () => void, enabled = true) =>
      L.add(new Button(this, 12 + bw / 2 + i * (bw + 2), yy, { w: bw - 2, h: 32, label, size: 9, color, onTap: L.guard(onTap) }).setEnabled(enabled));

    btn(0, `🎁 Thưởng\n${DATA.balance.staff.bonusAmount / 1000}k`, C.green, () => {
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
    btn(3, '⇄ Chuyển', C.blue, () => this.transferFlow(st), s.stores.length > 1);
    btn(4, '✖ Sa thải', C.red, () => dialog(this, {
      icon: '😢',
      title: `Sa thải ${st.name}?`,
      body: `Trả thêm ${formatMoney(st.wage * DATA.balance.staff.severanceDays)} trợ cấp. ${st.name} sẽ bị xóa khỏi lịch ca.`,
      buttons: [
        { label: 'Thôi', color: C.grey },
        { label: 'Sa thải', color: C.red, onTap: () => { fire(s, st.id); persist(); this.render(); } },
      ],
    }));

    L.setHeight(h + 8);
  }

  private renderCandidateDetailLandscape(c: Candidate, recommendation?: string): void {
    if (!this.detailArea) return;
    const s = G.state;
    const dw = this.detailWidth || (W - 240);
    const L = this.detailArea;
    const role = roleDef(c.role);
    const fixed = c.id === DATA.staff.fixedCandidate.id;
    const h = 265;

    L.add(card(this, 0, 0, dw, h, recommendation ? 0xe8f5e9 : fixed ? 0xfff0d0 : C.panel));
    L.add(staffSprite(this, 36, 42, c).setScale(0.65));
    L.add(txt(this, 72, 8, `${c.name}${fixed ? ' ⭐' : ''}${recommendation ? ' · ĐỀ XUẤT' : ''}`, { size: 14, bold: true, color: recommendation ? HEX.green : HEX.ink }));
    L.add(txt(this, 72, 28, `Hợp vai: ${role.icon} ${role.name} · ${personalityDef(c.personality).name}`, { size: 11, color: HEX.muted }));
    L.add(txt(this, dw - 14, 8, `${formatMoney(c.wage)}/ngày`, { size: 13, bold: true, origin: [1, 0], color: '#b7411f' }));

    L.add(txt(this, 72, 48, recommendation ? `⭐ ${recommendation}` : personalityDef(c.personality).note, { size: 10, bold: !!recommendation, color: recommendation ? HEX.green : HEX.muted, wrap: dw - 85 }));

    this.statBars(c.stats, 20, 80, role.mainStat, L);

    const full = s.staff.length >= staffSlots(s.level, s.land);
    const next = nextSlotLevel(s.level);
    const label = full ? (next ? `Hết chỗ · Cấp ${next}` : 'Hết chỗ') : '✓ Thuê nhân viên này';
    L.add(new Button(this, dw / 2, h - 28, { w: Math.min(220, dw - 40), h: 36, label, size: 12, color: C.green, onTap: L.guard(() => this.hireFlow(c)) }).setEnabled(!full));

    L.setHeight(h + 8);
  }

  /** Bốn thanh chỉ số 1–10. */
  private statBars(stats: Record<StatKey, number>, x: number, y: number, main?: StatKey, targetArea?: ScrollArea): number {
    const area = targetArea ?? this.list;
    STAT_KEYS.forEach((k, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = x + col * 160;
      const by = y + row * 18;
      area.add(txt(this, bx, by, `${STAT_NAMES[k]}${k === main ? '★' : ''}`, { size: 10, color: k === main ? '#b7411f' : HEX.muted }));
      const bar = new Bar(this, bx + 64, by + 4, 70, 6, k === main ? C.red : C.green, 0x000000);
      bar.set(stats[k] / 10);
      area.add(bar);
      area.add(txt(this, bx + 140, by, String(stats[k]), { size: 10, bold: true }));
    });
    return y + 38;
  }

  private staffCard(st: Staff, y: number): number {
    const s = G.state;
    const h = 208;
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
    const bw = (W - 40) / 5;
    const btn = (i: number, label: string, color: number, onTap: () => void, enabled = true) =>
      this.list.add(new Button(this, 20 + bw / 2 + i * (bw + 2), yy, { w: bw - 4, h: 32, label, size: 9, color, onTap: this.list.guard(onTap) }).setEnabled(enabled));
    btn(0, `🎁 Thưởng\n${DATA.balance.staff.bonusAmount / 1000}k`, C.green, () => {
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
    btn(3, '⇄ Chuyển', C.blue, () => this.transferFlow(st), s.stores.length > 1);
    btn(4, '✖ Sa thải', C.red, () => dialog(this, {
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

  private transferFlow(st: Staff): void {
    const s = G.state;
    const slots = staffSlots(s.level, s.land);
    const destinations = s.stores.filter((store) => store.id !== s.activeStoreId);
    if (!destinations.length) {
      toast(this, 'Chưa có chi nhánh khác để điều chuyển', H / 2, C.red);
      return;
    }

    const landscape = W > H;
    const overlay = this.add.container(0, 0).setDepth(2000);
    const panelW = landscape ? Math.min(420, W - 40) : W - 28;
    const panelH = landscape ? H - 20 : Math.min(460, H - 70);
    const panelX = Math.round((W - panelW) / 2);
    const panelTop = Math.round((H - panelH) / 2);

    overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().on('pointerup', () => overlay.destroy()));
    overlay.add(panel(this, panelX, panelTop, panelW, panelH));
    overlay.add(txt(this, panelX + 16, panelTop + 14, `⇄ Điều chuyển ${st.name}`, { size: 14, bold: true }));
    overlay.add(txt(this, panelX + 16, panelTop + 32, 'Chỗ nhân viên tính riêng từng tiệm. Lịch làm được giữ lại.', { size: 9.5, color: HEX.muted, wrap: panelW - 54 }));
    overlay.add(new Button(this, panelX + panelW - 20, panelTop + 18, {
      w: 28, h: 26, label: '✕', size: 12, color: C.grey, onTap: () => overlay.destroy(),
    }));

    const listTop = panelTop + 48;
    const listBottom = panelTop + panelH - 8;
    const scroll = new ScrollArea(this, listTop, listBottom, undefined, { x: panelX + 8, width: panelW - 16 });
    overlay.add(scroll.content);

    let y = 4;
    const rowH = 48;
    destinations.forEach((store) => {
      const count = storeView(s, store.id).staff.length;
      const canTransfer = count < slots;
      const cx = panelX + 10;
      const cardW = panelW - 20;

      scroll.add(card(this, cx, y, cardW, rowH - 4, canTransfer ? C.panel : 0xf2ebe0));
      scroll.add(txt(this, cx + 12, y + 8, store.name, { size: 12.5, bold: true }));
      scroll.add(txt(this, cx + 12, y + 26, `Nhân sự: ${count}/${slots} chỗ`, { size: 10, color: canTransfer ? HEX.ink : HEX.red }));

      scroll.add(new Button(this, cx + cardW - 46, y + (rowH - 4) / 2, {
        w: 78, h: 28, label: canTransfer ? 'Chuyển tới' : 'Hết chỗ', size: 10,
        color: canTransfer ? C.blue : C.grey,
        onTap: () => {
          if (!transferStaff(s, st.id, store.id)) {
            toast(this, 'Chi nhánh đã đủ chỗ', H / 2, C.red);
            return;
          }
          overlay.destroy();
          persist();
          toast(this, `${st.name} đã chuyển tới ${store.name}`, H / 2, C.greenDark);
          this.render();
        },
      }).setEnabled(canTransfer));

      y += rowH;
    });
    scroll.setHeight(y + 8);
  }

  private pickRole(st: Staff): void {
    const s = G.state;
    const buttons = unlockedRoles(s).map((r) => ({
      label: `${roleDef(r).icon} ${roleDef(r).name}${r === st.role ? ' (đang làm)' : ''}`,
      color: r === st.role ? C.grey : C.blue,
      onTap: () => { changeRole(s, st.id, r); persist(); this.render(); },
    }));
    buttons.push({ label: 'Đóng', color: C.grey, onTap: () => undefined });
    dialog(this, { title: `Vai trò của ${st.name}`, body: 'Thu ngân đứng quầy; Bổ sung kệ nạp ô vơi dưới 40%; Kho cất hàng và bày theo sơ đồ; Giao hàng chạy đơn điện thoại; Bảo vệ trực ở cửa/hiên trông xe, quan sát người ra vào, vào tiệm xử lý trộm và khách phá phách; trực đêm chống đột nhập.', buttons });
  }

  private candidateCard(c: Candidate, y: number, recommendation?: string): number {
    const s = G.state;
    const h = 150;
    const role = roleDef(c.role);
    const fixed = c.id === DATA.staff.fixedCandidate.id;
    this.list.add(card(this, 8, y, W - 16, h - 6, recommendation ? 0xe8f5e9 : fixed ? 0xfff0d0 : C.panel));
    this.list.add(staffSprite(this, 34, y + 50, c).setScale(0.6));
    this.list.add(txt(this, 62, y + 8, `${c.name}${fixed ? ' ⭐' : ''}${recommendation ? ' · ĐỀ XUẤT' : ''}`, { size: 13, bold: true, color: recommendation ? HEX.green : HEX.ink }));
    this.list.add(txt(this, 62, y + 28, `Hợp vai: ${role.icon} ${role.name} · ${personalityDef(c.personality).name}`, { size: 11, color: HEX.muted }));
    this.list.add(txt(this, 62, y + 44, recommendation ? `⭐ ${recommendation}` : personalityDef(c.personality).note, { size: 10, bold: !!recommendation, color: recommendation ? HEX.green : HEX.muted, wrap: W - 180 }));
    this.list.add(txt(this, W - 20, y + 8, `${formatMoney(c.wage)}/ngày`, { size: 13, bold: true, origin: [1, 0], color: '#b7411f' }));
    this.statBars(c.stats, 18, y + 70, role.mainStat);
    const full = s.staff.length >= staffSlots(s.level, s.land);
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

  /** Cài đặt của tiệm: có báo công an khi bị trộm đột nhập / phát hiện tiền giả không. */
  private policeCard(y: number): number {
    const s = G.state;
    const on = s.settings.callPolice !== false;
    this.list.add(card(this, 8, y, W - 16, 86, 0xe8f1fb));
    this.list.add(txt(this, 18, y + 10, '🚓 Báo công an', { size: 14, bold: true }));
    this.list.add(txt(this, 18, y + 30, on
      ? 'Bị trộm đột nhập: công an điều tra, bắt được thì trả lại tiền. Phát hiện tiền giả: người dùng tiền giả bị đưa đi (mất đơn, được phường khen).'
      : 'Tự xử: bị trộm thì chịu mất. Phát hiện tiền giả thì trả lại, khách đổi tờ thật hoặc bỏ đi.', { size: 10, color: HEX.muted, wrap: W - 150 }));
    this.list.add(new Button(this, W - 70, y + 42, {
      w: 110, h: 34, size: 12, color: on ? C.green : C.grey,
      label: on ? '✓ Có báo' : 'Không báo',
      onTap: this.list.guard(() => {
        s.settings.callPolice = !on;
        play('coin');
        persist();
        this.render();
      }),
    }));
    return y + 92;
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
