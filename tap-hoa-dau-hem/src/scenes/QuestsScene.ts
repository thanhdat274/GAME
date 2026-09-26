import Phaser from 'phaser';
import { DATA, decor } from '../core/data';
import { achievementProgress, claimQuest, ensureDailyQuests, questDef, questDone, questProgress, questsUnlocked, rerollQuest } from '../core/quests';
import { formatMoney } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, floatText } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Nhiệm vụ hằng ngày (3/ngày, đổi 1 lần) và thành tựu trọn đời. */
export class QuestsScene extends Phaser.Scene {
  private list!: ScrollArea;
  private back = 'Morning';

  constructor() {
    super('Quests');
  }

  create(data: { back?: string }): void {
    setupCamera(this);
    this.back = data?.back ?? 'Morning';
    ensureDailyQuests(G.state);
    pageFrame(this, '🎯 Nhiệm vụ', () => this.scene.start(this.back), `Ngày ${G.state.day}`);
    this.list = new ScrollArea(this, PAGE_TOP, H - 12);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    let y = 6;
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
}
