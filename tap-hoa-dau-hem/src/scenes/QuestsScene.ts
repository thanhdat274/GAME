import Phaser from 'phaser';
import { DATA, decor, product } from '../core/data';
import { achievementProgress, claimQuest, ensureDailyQuests, questDef, questDone, questProgress, questsUnlocked, rerollQuest } from '../core/quests';
import { formatMoney } from '../core/state';
import { calendarDate } from '../core/calendar';
import { eventDefinition } from '../core/eventScheduler';
import { claimWeeklyQuest, ensureWeeklyQuests } from '../core/weeklyQuests';
import { fulfillPartyOrder, partyOrderProgress, refreshPartyOrder, respondToPartyOrder } from '../core/partyOrders';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, floatText, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Nhiệm vụ hằng ngày (3/ngày, đổi 1 lần) và thành tựu trọn đời. */
export class QuestsScene extends Phaser.Scene {
  private list!: ScrollArea;
  private back = 'Morning';
  private tab: 'daily' | 'weekly' | 'events' | 'party' | 'achievements' = 'daily';

  constructor() {
    super('Quests');
  }

  create(data: { back?: string }): void {
    setupCamera(this);
    this.back = data?.back ?? 'Morning';
    this.tab = 'daily';
    ensureDailyQuests(G.state);
    ensureWeeklyQuests(G.state);
    refreshPartyOrder(G.state);
    pageFrame(this, '🎯 Nhiệm vụ', () => this.scene.start(this.back), `Ngày ${G.state.day}`);
    this.list = new ScrollArea(this, PAGE_TOP, H - 12);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    let y = 6;
    const tabs = [
      { id: 'daily' as const, label: 'Hôm nay' },
      { id: 'weekly' as const, label: 'Tuần' },
      { id: 'events' as const, label: 'Sự kiện' },
      { id: 'party' as const, label: 'Đơn tiệc' },
      { id: 'achievements' as const, label: 'Cúp' },
    ];
    tabs.forEach((item, index) => {
      const x = (W / 5) * (index + 0.5);
      this.list.add(new Button(this, x, y + 16, { w: W / 5 - 4, h: 30, label: item.label, size: 9, color: this.tab === item.id ? C.blue : C.wood, onTap: () => { this.tab = item.id; this.render(); } }));
    });
    y += 42;
    if (this.tab === 'events') {
      this.renderEvents(y);
      return;
    }
    if (this.tab === 'weekly') {
      this.renderWeekly(y);
      return;
    }
    if (this.tab === 'party') {
      this.renderParty(y);
      return;
    }
    if (this.tab === 'achievements') {
      this.renderAchievements(y);
      return;
    }
    this.list.add(txt(this, 14, y, 'HÔM NAY', { size: 12, bold: true, color: HEX.muted }));
    y += 20;
    if (!questsUnlocked(s) || !s.quests) {
      this.list.add(txt(this, W / 2, y + 20, `Nhiệm vụ hằng ngày mở ở level ${DATA.balance.quests.unlockLevel}.`, { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      y += 50;
    } else {
      s.quests.list.forEach((entry, index) => {
        const q = questDef(entry.id);
        const progress = Math.min(q.target, questProgress(s, q));
        const done = questDone(s, q);
        const h = 74;
        this.list.add(card(this, 8, y, W - 16, h - 6, entry.claimed ? 0xe3f3e6 : done ? 0xfff1c1 : C.panel));
        this.list.add(txt(this, 18, y + 8, q.text, { size: 14, bold: true }));
        this.list.add(txt(this, 18, y + 28, `Thưởng ${formatMoney(q.money)} · +${q.exp} EXP`, { size: 11, color: HEX.muted }));
        const bar = new Bar(this, 18, y + 48, 190, 9, done ? C.green : C.yellow, 0x000000);
        bar.set(progress / q.target);
        this.list.add(bar);
        const shown = q.metric === 'revenue' ? `${formatMoney(progress)}/${formatMoney(q.target)}` : q.metric === 'noSpoil' || q.metric === 'leftAtMost' ? (done ? 'Đạt' : 'Xét cuối ngày') : `${progress}/${q.target}`;
        this.list.add(txt(this, 214, y + 45, shown, { size: 10, bold: true }));
        const bx = W - 50;
        const by = y + h / 2 - 3;
        if (entry.claimed) this.list.add(txt(this, bx, by, '✓ Đã nhận', { size: 12, bold: true, color: HEX.green, origin: [0.5, 0.5] }));
        else if (done) {
          this.list.add(new Button(this, bx, by, { w: 70, h: 36, label: 'Nhận', size: 14, color: C.green, onTap: this.list.guard(() => {
            const r = claimQuest(G.state, index);
            if (r.ok) {
              play('coin');
              floatText(this, bx, by + PAGE_TOP, `+${formatMoney(r.money)}`, HEX.green, 16);
              persist();
              this.render();
            }
          }) }));
        } else {
          this.list.add(new Button(this, bx, by, { w: 70, h: 32, label: '🔄 Đổi', size: 12, color: C.wood, onTap: this.list.guard(() => {
            if (rerollQuest(G.state, index)) { play('tap'); persist(); this.render(); }
          }) }).setEnabled(!s.quests!.rerollUsed && progress === 0));
        }
        y += h;
      });
      this.list.add(txt(this, 14, y, s.quests.rerollUsed ? 'Đã dùng lượt đổi hôm nay.' : 'Được đổi 1 nhiệm vụ chưa làm mỗi ngày.', { size: 11, color: HEX.muted }));
      y += 26;
    }

    this.list.add(txt(this, 14, y, 'THÀNH TỰU', { size: 12, bold: true, color: HEX.muted }));
    y += 20;
    for (const a of DATA.achievements) {
      const got = s.achievements.includes(a.id);
      const progress = Math.min(a.target, achievementProgress(s, a));
      const h = 64;
      this.list.add(card(this, 8, y, W - 16, h - 6, got ? 0xe3f3e6 : C.panel));
      this.list.add(txt(this, 18, y + 7, `${got ? '🏆' : '🔒'} ${a.name}`, { size: 14, bold: true }));
      const reward = a.decor ? `Quà: ${decor(a.decor).icon} ${decor(a.decor).name}` : a.money ? `Thưởng ${formatMoney(a.money)}` : '';
      this.list.add(txt(this, 18, y + 27, `${a.text}${reward ? ` · ${reward}` : ''}`, { size: 10, color: HEX.muted, wrap: W - 50 }));
      if (!got) {
        const bar = new Bar(this, 18, y + 44, W - 110, 7, C.yellow, 0x000000);
        bar.set(progress / a.target);
        this.list.add(bar);
        this.list.add(txt(this, W - 84, y + 40, `${progress}/${a.target}`, { size: 10, bold: true }));
      }
      y += h;
    }
    this.list.setHeight(y + 20);
  }

  private renderEvents(y: number): void {
    const s = G.state;
    const date = calendarDate(s.day, { month: s.calendarStartMonth, year: s.calendarStartYear });
    const active = [...new Map(s.activeEvents.map((event) => [event.id, event])).values()];
    if (!active.length) {
      this.list.add(txt(this, W / 2, y + 28, 'Chưa có nhiệm vụ sự kiện hôm nay.', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.add(txt(this, W / 2, y + 54, 'Nhiệm vụ sẽ xuất hiện khi một sự kiện bắt đầu.', { size: 10, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 88);
      return;
    }
    for (const activeEvent of active) {
      const def = eventDefinition(activeEvent.id);
      if (!def) continue;
      this.list.add(txt(this, 14, y + 4, `🎉 ${def.name}`, { size: 14, bold: true }));
      y += 24;
      for (const quest of def.quests ?? []) {
        const key = `quest:${quest.id}:${date.year}`;
        const progress = Math.min(quest.target, s.eventProgress[key] ?? 0);
        const done = s.eventRewards.includes(key);
        this.list.add(card(this, 8, y, W - 16, 66, done ? 0xe3f3e6 : C.panel));
        this.list.add(txt(this, 18, y + 7, quest.text, { size: 12, bold: true, wrap: W - 36 }));
        const bar = new Bar(this, 18, y + 34, W - 112, 9, done ? C.green : C.yellow, 0x000000);
        bar.set(progress / quest.target);
        this.list.add(bar);
        this.list.add(txt(this, W - 46, y + 30, done ? '✓' : `${progress}/${quest.target}`, { size: 10, bold: true, color: done ? HEX.green : HEX.ink, origin: [0.5, 0.5] }));
        this.list.add(txt(this, 18, y + 48, `Thưởng ${formatMoney(quest.rewardMoney)} · +${quest.rewardExp} EXP${done ? ' · Đã nhận tự động' : ''}`, { size: 9, color: HEX.muted }));
        y += 72;
      }
      if (def.rewardAt && def.rewardDecor) {
        const key = `${activeEvent.id}:${date.year}`;
        const progress = Math.min(def.rewardAt, s.eventProgress[key] ?? 0);
        const done = s.eventRewards.includes(key);
        this.list.add(card(this, 8, y, W - 16, 58, done ? 0xe3f3e6 : C.panel));
        this.list.add(txt(this, 18, y + 8, `Mốc sự kiện: ${progress}/${def.rewardAt} món đã bán`, { size: 11, bold: true }));
        this.list.add(txt(this, 18, y + 30, `Quà: ${def.rewardDecor}${done ? ' · Đã nhận' : ''}`, { size: 10, color: HEX.muted }));
        y += 64;
      }
      y += 8;
    }
    this.list.setHeight(y + 20);
  }

  private renderWeekly(y: number): void {
    const s = G.state;
    const weekly = s.weeklyQuests;
    if (s.level < 27 || !weekly) {
      this.list.add(txt(this, W / 2, y + 30, 'Nhiệm vụ tuần mở ở level 27.', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 70);
      return;
    }
    const startDay = weekly.week * 7 + 1;
    this.list.add(txt(this, 14, y + 4, `TUẦN ${weekly.week + 1} · ngày ${startDay}–${startDay + 6}`, { size: 12, bold: true, color: HEX.muted }));
    y += 28;
    weekly.list.forEach((entry, index) => {
      const q = DATA.weeklyQuests.find((item) => item.id === entry.id);
      if (!q) return;
      const done = entry.progress >= q.target;
      this.list.add(card(this, 8, y, W - 16, 78, entry.claimed ? 0xe3f3e6 : done ? 0xfff1c1 : C.panel));
      this.list.add(txt(this, 18, y + 8, q.text, { size: 12, bold: true, wrap: W - 38 }));
      this.list.add(txt(this, 18, y + 29, `Thưởng ${formatMoney(q.money)} · +${q.exp} EXP`, { size: 10, color: HEX.muted }));
      const bar = new Bar(this, 18, y + 53, W - 118, 9, done ? C.green : C.yellow, 0x000000);
      bar.set(entry.progress / q.target);
      this.list.add(bar);
      if (entry.claimed) this.list.add(txt(this, W - 54, y + 48, '✓', { size: 13, bold: true, color: HEX.green, origin: [0.5, 0.5] }));
      else this.list.add(new Button(this, W - 54, y + 48, { w: 74, h: 34, label: done ? 'Nhận' : `${entry.progress}/${q.target}`, size: 9, color: done ? C.green : C.wood, onTap: this.list.guard(() => {
        const result = claimWeeklyQuest(G.state, index);
        if (result.ok) { play('coin'); persist(); this.render(); }
      }) }).setEnabled(done));
      y += 84;
    });
    this.list.add(txt(this, 14, y + 4, weekly.giftClaimed ? '🎁 Đã nhận hộp quà tuần.' : '🎁 Nhận cả 3 nhiệm vụ để mở hộp quà tuần: 150.000đ và đồ trang trí ngẫu nhiên.', { size: 10, bold: true, color: weekly.giftClaimed ? HEX.green : HEX.muted, wrap: W - 28 }));
    this.list.setHeight(y + 42);
  }

  private renderParty(y: number): void {
    const s = G.state;
    const order = s.partyOrder;
    if (s.level < 27) {
      this.list.add(txt(this, W / 2, y + 30, 'Đơn tiệc mở ở level 27.', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 70);
      return;
    }
    if (!order) {
      this.list.add(txt(this, W / 2, y + 24, 'Chưa có hàng xóm đặt tiệc tuần này.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.add(txt(this, W / 2, y + 48, 'Thỉnh thoảng sẽ có đơn mới, nhớ ghé xem nhé.', { size: 10, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 80);
      return;
    }
    this.list.add(card(this, 8, y, W - 16, 250, order.status === 'fulfilled' ? 0xe3f3e6 : C.panel));
    this.list.add(txt(this, 18, y + 10, `🎉 Đơn tiệc của ${order.customer}`, { size: 15, bold: true }));
    this.list.add(txt(this, 18, y + 34, order.status === 'offered' ? 'Hàng xóm cần số lượng lớn. Bạn có thể nhận hoặc từ chối.' : `Hạn giao: hết ngày ${order.deadlineDay}`, { size: 10, color: HEX.muted, wrap: W - 36 }));
    let itemY = y + 64;
    for (const line of partyOrderProgress(s, order)) {
      const p = product(line.productId);
      this.list.add(txt(this, 20, itemY, `${p.icon} ${p.name} · ${line.have}/${line.need}`, { size: 11, color: line.have >= line.need ? HEX.green : HEX.ink }));
      itemY += 24;
    }
    this.list.add(txt(this, 18, y + 142, `Thưởng khi giao đúng hạn: ${formatMoney(order.rewardMoney)} · +1 thân thiết`, { size: 10, bold: true, color: HEX.green, wrap: W - 36 }));
    if (order.status === 'offered') {
      this.list.add(new Button(this, W / 2 - 62, y + 202, { w: 108, h: 38, label: 'Nhận đơn', size: 12, color: C.green, onTap: this.list.guard(() => { respondToPartyOrder(s, true); persist(); this.render(); }) }));
      this.list.add(new Button(this, W / 2 + 66, y + 202, { w: 108, h: 38, label: 'Từ chối', size: 12, color: C.grey, onTap: this.list.guard(() => { respondToPartyOrder(s, false); persist(); this.render(); }) }));
    } else if (order.status === 'accepted') {
      this.list.add(new Button(this, W / 2, y + 202, { w: 180, h: 38, label: 'Giao đơn tiệc', size: 12, color: C.blue, onTap: this.list.guard(() => {
        const result = fulfillPartyOrder(s);
        if (!result.ok) { toast(this, result.reason === 'short' ? 'Chưa đủ hàng trong kho/kệ/quầy.' : result.reason === 'expired' ? 'Đơn đã quá hạn.' : 'Chưa thể giao đơn.'); }
        else toast(this, `Đã giao đơn · +${formatMoney(result.reward)}`);
        persist(); this.render();
      }) }).setEnabled(partyOrderProgress(s, order).every((line) => line.have >= line.need) && s.day <= order.deadlineDay));
    } else {
      const label = order.status === 'fulfilled' ? '✓ Đã giao · khách thân thiết hơn' : order.status === 'declined' ? 'Đã từ chối đơn' : 'Đơn quá hạn';
      this.list.add(txt(this, W / 2, y + 214, label, { size: 11, bold: true, color: order.status === 'fulfilled' ? HEX.green : HEX.muted, origin: [0.5, 0.5] }));
    }
    this.list.setHeight(y + 272);
  }

  private renderAchievements(y: number): void {
    for (const a of DATA.achievements) {
      const got = G.state.achievements.includes(a.id);
      const progress = Math.min(a.target, achievementProgress(G.state, a));
      const h = 64;
      this.list.add(card(this, 8, y, W - 16, h - 6, got ? 0xe3f3e6 : C.panel));
      this.list.add(txt(this, 18, y + 7, `${got ? '🏆' : '🔒'} ${a.name}`, { size: 14, bold: true }));
      const reward = a.decor ? `Quà: ${decor(a.decor).icon} ${decor(a.decor).name}` : a.money ? `Thưởng ${formatMoney(a.money)}` : '';
      this.list.add(txt(this, 18, y + 27, `${a.text}${reward ? ` · ${reward}` : ''}`, { size: 10, color: HEX.muted, wrap: W - 50 }));
      if (!got) {
        const bar = new Bar(this, 18, y + 44, W - 110, 7, C.yellow, 0x000000);
        bar.set(progress / a.target);
        this.list.add(bar);
        this.list.add(txt(this, W - 84, y + 40, `${progress}/${a.target}`, { size: 10, bold: true }));
      }
      y += h;
    }
    this.list.setHeight(y + 20);
  }
}
