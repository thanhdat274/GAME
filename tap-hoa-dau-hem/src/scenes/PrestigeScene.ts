import Phaser from 'phaser';
import { DATA } from '../core/data';
import { currentTitle, PRESTIGE_EXP_PER_STAR, prestigeStars } from '../core/prestige';
import { formatNumber } from '../core/state';
import { G } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Bar } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

export class PrestigeScene extends Phaser.Scene {
  constructor() { super('Prestige'); }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🏆 Danh hiệu', () => this.scene.start('Morning'), `Phát triển chuỗi sau level ${DATA.levels.maxLevel}`);

    const s = G.state;
    const stars = prestigeStars(s);
    const capExp = DATA.levels.levels[DATA.levels.maxLevel - 1].exp;
    const landscape = W > H;

    if (landscape) {
      this.renderLandscape(s, stars, capExp);
    } else {
      this.renderPortrait(s, stars, capExp);
    }
  }

  private renderLandscape(s: typeof G.state, stars: number, capExp: number): void {
    const lx = 8;
    const ly = PAGE_TOP + 4;
    const lw = 216;
    const lh = H - PAGE_TOP - 16;

    // Left status panel
    this.add.container(0, 0, [
      card(this, lx, ly, lw, lh, 0xfff1c1),
      txt(this, lx + 12, ly + 14, currentTitle(s), { size: 16, bold: true, wrap: lw - 24 }),
      txt(this, lx + 12, ly + 46, s.level < DATA.levels.maxLevel
        ? `Mở hệ danh hiệu khi đạt level ${DATA.levels.maxLevel} (${s.level}/${DATA.levels.maxLevel}).`
        : `★ ${stars}/30 sao danh vọng\n+${stars}% doanh thu toàn chuỗi`, { size: 11, color: HEX.ink, wrap: lw - 24 }),
    ]);

    const progress = Math.max(0, s.exp - capExp) % PRESTIGE_EXP_PER_STAR;
    const expRatio = s.level < DATA.levels.maxLevel ? Math.min(1, s.exp / capExp) : progress / PRESTIGE_EXP_PER_STAR;
    const bar = new Bar(this, lx + 12, ly + 110, lw - 24, 8, C.yellow, 0x000000);
    bar.set(expRatio);

    this.add.text(lx + 12, ly + 124, s.level < DATA.levels.maxLevel
      ? `EXP: ${formatNumber(s.exp)}/${formatNumber(capExp)}`
      : `${formatNumber(progress)}/${formatNumber(PRESTIGE_EXP_PER_STAR)} EXP`, {
      fontSize: '9.5px', color: HEX.muted, fontFamily: 'sans-serif',
    });

    this.add.text(lx + 12, ly + 158, 'Mỗi sao danh hiệu tăng 1% doanh thu bán lẻ toàn hệ thống các cửa hàng.', {
      fontSize: '9.5px', color: HEX.muted, fontFamily: 'sans-serif', wordWrap: { width: lw - 24 },
    });

    // Right titles list
    const rightX = 232;
    const rightW = W - rightX - 8;
    const list = new ScrollArea(this, PAGE_TOP + 4, H - 8, undefined, { x: rightX, width: rightW });
    const cardW = rightW - 4;
    let y = 4;
    for (const title of DATA.titles) {
      const owned = stars >= title.stars;
      list.add(card(this, rightX, y, cardW, 46, owned ? 0xe8f5e9 : C.panel));
      list.add(txt(this, rightX + 12, y + 8, `${owned ? '🏅' : '🔒'} ${title.name}`, { size: 12.5, bold: true }));
      list.add(txt(this, rightX + cardW - 14, y + 23, `${title.stars} sao`, { size: 10, color: owned ? HEX.green : HEX.muted, origin: [1, 0.5] }));
      y += 50;
    }
    list.setHeight(y + 10);
  }

  private renderPortrait(s: typeof G.state, stars: number, capExp: number): void {
    const list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    list.add(card(this, 8, 8, W - 16, 104, 0xfff1c1));
    list.add(txt(this, 18, 19, currentTitle(s), { size: 18, bold: true }));
    list.add(txt(this, 18, 51, s.level < DATA.levels.maxLevel ? `Mở hệ danh hiệu khi đạt level ${DATA.levels.maxLevel} (${s.level}/${DATA.levels.maxLevel}).` : `★ ${stars}/30 · Tăng ${stars}% doanh thu`, { size: 13, color: HEX.ink }));
    const progress = Math.max(0, s.exp - capExp) % PRESTIGE_EXP_PER_STAR;
    list.add(txt(this, 18, 78, s.level < DATA.levels.maxLevel ? `EXP ${formatNumber(s.exp)}/${formatNumber(capExp)}` : `${formatNumber(progress)}/${formatNumber(PRESTIGE_EXP_PER_STAR)} EXP tới sao tiếp theo`, { size: 11, color: HEX.muted, wrap: W - 36 }));
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
