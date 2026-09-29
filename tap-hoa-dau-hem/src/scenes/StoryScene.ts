import Phaser from 'phaser';
import { beginChapter, chapterAvailable, chapterComplete, chapterStarted, claimChapter } from '../core/story';
import { DATA } from '../core/data';
import { formatMoney, formatNumber } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

export class StoryScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() { super('Story'); }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📖 Hành trình', () => { persist(); this.scene.start('Morning'); }, `Chương đã xong ${G.state.storyProgress.length}/${DATA.story.length}`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    this.render();
  }

  private render(): void {
    this.list.clear();
    const landscape = W > H;
    const colW = landscape ? Math.floor((W - 24) / 2) : W - 16;
    const h = 156;
    let y = 8;

    DATA.story.forEach((chapter, index) => {
      const available = chapterAvailable(G.state, chapter);
      const done = G.state.storyProgress.includes(chapter.id);
      const started = chapterStarted(G.state, chapter.id);
      const complete = chapterComplete(G.state, chapter);

      const col = landscape ? index % 2 : 0;
      const row = landscape ? Math.floor(index / 2) : index;
      const cx = 8 + col * (colW + 8);
      const cy = y + row * h;

      this.list.add(card(this, cx, cy, colW, h - 6, done ? 0xe8f5e9 : available ? C.panel : 0xe5e5e5));
      this.list.add(txt(this, cx + 10, cy + 8, `${chapter.portrait}  Chương ${chapter.chapter}: ${chapter.title}`, { size: 12.5, bold: true, wrap: colW - 20 }));
      this.list.add(txt(this, cx + 10, cy + 34, chapter.dialog.join('\n'), { size: 9.5, color: HEX.muted, wrap: colW - 20 }));
      this.list.add(txt(this, cx + 10, cy + 86, `Mục tiêu: ${chapter.goal}`, { size: 9.5, bold: true, color: available ? HEX.ink : HEX.muted, wrap: colW - 20 }));
      this.list.add(txt(this, cx + 10, cy + 116, `Thưởng ${formatMoney(chapter.rewardMoney)} · +${formatNumber(chapter.rewardExp)} EXP`, { size: 9, color: HEX.muted, wrap: colW - 90 }));

      const label = done ? '✓ Xong' : !available ? `Cần L${chapter.unlockLevel}` : !started ? 'Bắt đầu' : complete ? 'Nhận thưởng' : 'Đang làm';
      const bx = cx + colW - 46;
      const by = cy + 124;

      if (available && !done) {
        this.list.add(new Button(this, bx, by, {
          w: 78, h: 28, label, size: 10, color: complete ? C.green : C.blue,
          onTap: this.list.guard(() => {
            if (!started) { beginChapter(G.state, chapter.id); toast(this, chapter.dialog[0]); }
            else if (claimChapter(G.state, chapter.id)) toast(this, `Hoàn thành: ${chapter.title}`);
            else toast(this, chapter.id === 'rival_supermarket' ? 'Cần đủ 10 ngày, sao TB ≥ 4,5 và 20 khách quen' : chapter.id === 'grandma_visit' ? 'Bà chờ cháu bán 10 phần món ăn nóng' : chapter.id === 'open_chain' ? 'Mở chi nhánh để hoàn thành chương' : chapter.id === 'tax_officer' ? `Nộp thuế đúng hạn 3 tháng liền (đang ${G.state.tax.onTimeStreak} tháng)` : `Mục tiêu: ${chapter.goal}`);
            persist();
            this.render();
          }),
        }).setEnabled(label !== 'Đang làm'));
      } else {
        this.list.add(txt(this, bx, by, label, { size: 10, bold: true, color: done ? HEX.green : HEX.muted, origin: [0.5, 0.5] }));
      }
    });

    const totalRows = landscape ? Math.ceil(DATA.story.length / 2) : DATA.story.length;
    this.list.setHeight(y + totalRows * h + 16);
  }
}
