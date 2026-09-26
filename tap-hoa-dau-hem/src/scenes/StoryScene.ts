import Phaser from 'phaser';
import { beginChapter, chapterAvailable, chapterComplete, chapterStarted, claimChapter } from '../core/story';
import { DATA } from '../core/data';
import { formatMoney } from '../core/state';
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
    let y = 8;
    for (const chapter of DATA.story) {
      const available = chapterAvailable(G.state, chapter);
      const done = G.state.storyProgress.includes(chapter.id);
      const started = chapterStarted(G.state, chapter.id);
      const complete = chapterComplete(G.state, chapter);
      const h = 148;
      this.list.add(card(this, 8, y, W - 16, h - 6, done ? 0xe8f5e9 : available ? C.panel : 0xe5e5e5));
      this.list.add(txt(this, 18, y + 9, `${chapter.portrait}  Chương ${chapter.chapter}: ${chapter.title}`, { size: 13, bold: true, wrap: W - 36 }));
      this.list.add(txt(this, 18, y + 39, chapter.dialog.join('\n'), { size: 10, color: HEX.muted, wrap: W - 38 }));
      this.list.add(txt(this, 18, y + 82, `Mục tiêu: ${chapter.goal}`, { size: 10, bold: true, color: available ? HEX.ink : HEX.muted, wrap: W - 38 }));
      this.list.add(txt(this, 18, y + 105, `Thưởng ${formatMoney(chapter.rewardMoney)} · +${chapter.rewardExp} EXP`, { size: 10, color: HEX.muted }));
      let label = done ? '✓ Xong' : !available ? `Cần L${chapter.unlockLevel}` : !started ? 'Bắt đầu' : complete ? 'Nhận thưởng' : 'Đang diễn ra';
      if (available && !done) this.list.add(new Button(this, W - 61, y + 120, { w: 78, h: 30, label, size: 10, color: complete ? C.green : C.blue, onTap: this.list.guard(() => {
        if (!started) { beginChapter(G.state, chapter.id); toast(this, chapter.dialog[0]); }
        else if (claimChapter(G.state, chapter.id)) toast(this, `Hoàn thành: ${chapter.title}`);
        else toast(this, chapter.id === 'rival_supermarket' ? 'Cần đủ 10 ngày, sao trung bình từ 4,5 và 20 khách quen' : chapter.id === 'grandma_visit' ? 'Bà chờ cháu bán 10 phần món ăn nóng' : chapter.id === 'open_chain' ? 'Mở chi nhánh để hoàn thành chương' : `Mục tiêu: ${chapter.goal}`);
        persist(); this.render();
      }) }).setEnabled(label !== 'Đang diễn ra'));
      else this.list.add(txt(this, W - 61, y + 120, label, { size: 10, bold: true, color: done ? HEX.green : HEX.muted, origin: [0.5, 0.5] }));
      y += h;
    }
    this.list.setHeight(y + 16);
  }
}
