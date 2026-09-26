import Phaser from 'phaser';
import { DATA } from '../core/data';
import { currentTitle, PRESTIGE_EXP_PER_STAR, prestigeStars } from '../core/prestige';
import { G } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { H, HEX, W, setupCamera, txt } from '../ui/theme';

export class PrestigeScene extends Phaser.Scene {
  constructor() { super('Prestige'); }
  create(): void {
    setupCamera(this);
    pageFrame(this, '🏆 Danh hiệu', () => this.scene.start('Morning'), 'Phát triển chuỗi sau level 35');
    const list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    const s = G.state;
    const stars = prestigeStars(s);
    const capExp = DATA.levels.levels[DATA.levels.maxLevel - 1].exp;
    list.add(card(this, 8, 8, W - 16, 104, 0xfff1c1));
    list.add(txt(this, 18, 19, currentTitle(s), { size: 18, bold: true }));
    list.add(txt(this, 18, 51, s.level < 35 ? `Mở hệ danh hiệu khi đạt level 35 (${s.level}/35).` : `★ ${stars}/30 · Tăng ${stars}% doanh thu`, { size: 13, color: HEX.ink }));
    const progress = Math.max(0, s.exp - capExp) % PRESTIGE_EXP_PER_STAR;
    list.add(txt(this, 18, 78, s.level < 35 ? `EXP ${s.exp}/${capExp}` : `${progress.toLocaleString()}/${PRESTIGE_EXP_PER_STAR.toLocaleString()} EXP tới sao tiếp theo`, { size: 11, color: HEX.muted, wrap: W - 36 }));
    let y = 126;
    for (const title of DATA.titles) {
      const owned = stars >= title.stars;
      list.add(card(this, 8, y, W - 16, 50, owned ? 0xe8f5e9 : 0xffffff));
      list.add(txt(this, 18, y + 9, `${owned ? '🏅' : '🔒'} ${title.name}`, { size: 13, bold: true }));
      list.add(txt(this, W - 20, y + 26, `${title.stars} sao`, { size: 10, color: HEX.muted, origin: [1, 0.5] }));
      y += 54;
    }
    list.setHeight(y + 10);
  }
}
