import Phaser from 'phaser';
import { DATA } from '../core/data';
import { averageRating, levelProgress } from '../core/progression';
import { openLevelRoadmap } from './levelRoadmap';
import { formatClock, formatMoney, type GameState } from '../core/state';
import { Bar, toast } from './widgets';
import { C, H, HEX, W, txt } from './theme';
import { cloudSaveEnabled } from '../services/firebase';
import { getSyncStatus, onSyncStatus, syncNow, type SyncStatus } from '../services/sync';
import { calendarDate } from '../core/calendar';

export const HUD_H = 50;

/** Thanh trên cùng: tiền, ngày/giờ, sao, level + EXP. */
export class Hud extends Phaser.GameObjects.Container {
  private money: Phaser.GameObjects.Text;
  private day: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Text;
  private lv: Phaser.GameObjects.Text;
  private bar: Bar;
  private shownMoney = -1;
  private shownLevel = -1;
  private cloudIcon?: Phaser.GameObjects.Text;
  private htmlHud?: Phaser.GameObjects.DOMElement;
  private htmlMoney?: HTMLSpanElement;
  private htmlDay?: HTMLSpanElement;
  private htmlStars?: HTMLSpanElement;
  private htmlLevel?: HTMLSpanElement;
  private overlayDepth = 0;

  private onHudOverlay = (open: boolean): void => {
    this.overlayDepth = Math.max(0, this.overlayDepth + (open ? 1 : -1));
    this.htmlHud?.setVisible(this.overlayDepth === 0);
  };
  private onScenePause = (): void => this.onHudOverlay(true);
  private onSceneResume = (): void => this.onHudOverlay(false);

  /** `onOverlay(true/false)`: bảng lộ trình level mở / đóng (màn bán dừng giờ trong lúc xem). */
  constructor(scene: Phaser.Scene, private gs: GameState, private opts: { onPause?: () => void; subtitle?: string; onOverlay?: (open: boolean) => void; htmlText?: boolean } = {}) {
    super(scene, 0, 0);
    const landscape = W > H;
    const hudH = landscape ? 38 : HUD_H;
    const bg = scene.add.graphics();
    bg.fillStyle(C.hud, 1).fillRect(0, 0, W, hudH);
    bg.fillStyle(C.woodLight, 1).fillRect(0, hudH - 2, W, 2);
    bg.fillStyle(0x000000, 0.25).fillRect(0, hudH, W, 2);

    if (landscape) {
      this.lv = txt(scene, 12, 11, '', { size: 12, bold: true, color: HEX.cream });
      this.bar = new Bar(scene, 54, 14, 86, 10, C.yellow, 0xffffff);
      this.money = txt(scene, 150, 9, '', { size: 14, bold: true, color: HEX.yellow });
      this.day = txt(scene, W / 2 + 50, 11, '', { size: 10, bold: true, color: HEX.cream, origin: [0.5, 0], align: 'center' });
      this.stars = txt(scene, opts.onPause ? W - 44 : W - 10, 10, '', { size: 13, bold: true, color: HEX.cream, origin: [1, 0] });
    } else {
      this.money = txt(scene, 10, 6, '', { size: 16, bold: true, color: HEX.yellow });
      this.day = txt(scene, W / 2 + 18, 7, '', { size: 9.5, bold: true, color: HEX.cream, origin: [0.5, 0], align: 'center' });
      this.stars = txt(scene, opts.onPause ? W - 48 : W - 10, 7, '', { size: 14, bold: true, color: HEX.cream, origin: [1, 0] });
      this.lv = txt(scene, 10, 29, '', { size: 12, bold: true, color: HEX.cream });
      this.bar = new Bar(scene, 50, 33, cloudSaveEnabled() ? W - 95 : W - 60, 9, C.yellow, 0xffffff);
    }
    this.add([bg, this.money, this.day, this.stars, this.lv, this.bar]);

    if (opts.htmlText) {
      const root = document.createElement('div');
      root.style.cssText = 'position:relative;width:360px;height:50px;pointer-events:none;overflow:hidden;font-family:"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;text-shadow:0 1px 1px #25170f;';
      const makeLabel = (css: string): HTMLSpanElement => {
        const label = document.createElement('span');
        label.style.cssText = `position:absolute;white-space:nowrap;line-height:1.15;${css}`;
        root.append(label);
        return label;
      };
      this.htmlMoney = makeLabel('left:10px;top:6px;font-size:16px;font-weight:700;color:#f2b632;');
      this.htmlDay = makeLabel('top:7px;font-size:9.5px;font-weight:700;color:#f6e3c4;transform:translateX(-50%);');
      this.htmlStars = makeLabel('right:10px;top:7px;font-size:14px;font-weight:700;color:#f6e3c4;');
      this.htmlLevel = makeLabel('left:10px;top:29px;font-size:12px;font-weight:700;color:#f6e3c4;');
      this.htmlHud = scene.add.dom(0, 0, root).setOrigin(0, 0).setDepth(501);
      this.add(this.htmlHud);
      this.money.setVisible(false);
      this.day.setVisible(false);
      this.stars.setVisible(false);
      this.lv.setVisible(false);
      scene.events.on('thdh-hud-overlay', this.onHudOverlay);
      scene.events.on(Phaser.Scenes.Events.PAUSE, this.onScenePause);
      scene.events.on(Phaser.Scenes.Events.RESUME, this.onSceneResume);
      this.once(Phaser.GameObjects.Events.DESTROY, () => {
        scene.events.off('thdh-hud-overlay', this.onHudOverlay);
        scene.events.off(Phaser.Scenes.Events.PAUSE, this.onScenePause);
        scene.events.off(Phaser.Scenes.Events.RESUME, this.onSceneResume);
      });
    }

    if (cloudSaveEnabled()) {
      const cx = landscape ? (opts.onPause ? W - 66 : W - 20) : W - 22;
      const cy = landscape ? 19 : 33;
      this.cloudIcon = txt(scene, cx, cy, '', { size: 14, color: HEX.cream, origin: [0.5, 0.5] });
      const cloudZone = scene.add.zone(cx, cy, 36, 30).setInteractive({ useHandCursor: true });
      cloudZone.on('pointerup', () => {
        const current = getSyncStatus();
        if (current === 'pending' || current === 'error') void syncNow(true);
        toast(scene, ({ guest: 'Chơi khách · tiến trình lưu trên máy', syncing: 'Đang đồng bộ...', synced: 'Đã đồng bộ cloud', pending: 'Chưa đồng bộ · sẽ thử lại', error: 'Đồng bộ lỗi · đang thử lại', conflict: 'Hai bản lưu cần được chọn ở màn tiêu đề' })[current]);
      });
      this.add([this.cloudIcon, cloudZone]);
      const unsubscribe = onSyncStatus((status: SyncStatus) => this.cloudIcon?.setText(({ guest: '◇', syncing: '↻', synced: '☁', pending: '△', error: '!', conflict: '!' })[status]));
      this.once(Phaser.GameObjects.Events.DESTROY, unsubscribe);
    }

    // Chạm "Lv" hoặc thanh EXP để mở lộ trình level (tiến độ + các mốc mở khóa).
    const zoneX = landscape ? 60 : W / 2 - 20;
    const zoneY = landscape ? 19 : 37;
    const zoneW = landscape ? 120 : W - 40;
    const zone = scene.add.zone(zoneX, zoneY, zoneW, 24).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.getDistance() < 10) this.showRoadmap(); });
    this.add(zone);

    if (opts.onPause) {
      const bx = landscape ? W - 32 : W - 36;
      const by = landscape ? 7 : 3;
      const bw = landscape ? 26 : 28;
      const bh = landscape ? 24 : 22;
      const btnG = scene.add.graphics();
      btnG.fillStyle(0x000000, 0.25).fillRoundedRect(bx, by + 1, bw, bh, 6);
      btnG.fillStyle(0x4a2e1b, 1).fillRoundedRect(bx, by, bw, bh, 6);
      btnG.lineStyle(1.2, 0x8a5a32, 1).strokeRoundedRect(bx, by, bw, bh, 6);
      const icon = txt(scene, bx + bw / 2, by + bh / 2, '⏸', { size: landscape ? 12 : 13, color: HEX.cream, origin: [0.5, 0.5] });
      const pz = scene.add.zone(bx + bw / 2, by + bh / 2, bw + 10, bh + 8).setInteractive({ useHandCursor: true });
      pz.on('pointerdown', () => btnG.setAlpha(0.7));
      pz.on('pointerout', () => btnG.setAlpha(1));
      pz.on('pointerup', () => {
        btnG.setAlpha(1);
        opts.onPause?.();
      });
      this.add([btnG, icon, pz]);
    }
    this.setDepth(500);
    scene.add.existing(this);
    this.refresh();
  }

  refresh(): void {
    const s = this.gs;
    if (this.shownMoney !== s.money) {
      this.shownMoney = s.money;
      const money = `💰 ${formatMoney(s.money)}`;
      this.money.setText(money);
      if (this.htmlMoney) this.htmlMoney.textContent = money;
    }
    const date = calendarDate(s.day, { month: s.calendarStartMonth, year: s.calendarStartYear });
    const when = s.phase === 'open' ? ` · ${formatClock(s.clock)}` : '';
    const stars = s.ratings.length ? `⭐ ${averageRating(s).toFixed(1)}` : '⭐ –';
    this.stars.setText(stars);
    if (this.htmlStars) this.htmlStars.textContent = stars;
    // Chữ ngày nằm giữa tiền và sao; tiền lớn thì rút gọn để không đè lên nhau.
    const left = this.money.x + this.money.width + 6;
    const right = this.stars.x - this.stars.width - 6;
    const avail = Math.max(40, right - left);
    const variants = [
      `Ngày ${date.day} · Tháng ${date.month} · Năm ${date.year} · Mùa ${date.seasonName}${when}`,
      `Ngày ${date.day} · T${date.month}/N${date.year} · ${date.seasonName}${when}`,
      `N${date.day} · T${date.month} · ${date.seasonName}${when}`,
    ];
    this.day.setScale(1);
    for (const text of variants) {
      this.day.setText(text);
      if (this.day.width <= avail) break;
    }
    if (this.day.width > avail) this.day.setScale(avail / this.day.width);
    this.day.setX(left + avail / 2);
    if (this.htmlDay) {
      this.htmlDay.textContent = this.day.text;
      this.htmlDay.style.left = `${left + avail / 2}px`;
      this.htmlDay.style.transform = `translateX(-50%) scale(${this.day.scaleX})`;
    }
    const level = `Lv ${s.level}`;
    this.lv.setText(level);
    if (this.htmlLevel) this.htmlLevel.textContent = level;
    this.bar.set(levelProgress(s.exp, s.level));
    if (this.shownLevel >= 0 && s.level > this.shownLevel) {
      const gained = DATA.levels.levels.filter((item) => item.level > this.shownLevel && item.level <= s.level);
      const unlocks = gained.map((item) => `${item.level}: ${item.label}`).join(' · ');
      toast(this.scene, `🎉 Lên level ${s.level}!${unlocks ? `\nMở khóa: ${unlocks}` : ''}`, Math.max(96, H * 0.18), 0x3b8d5b);
    }
    this.shownLevel = s.level;
  }

  private roadmap: Phaser.GameObjects.Container | null = null;

  private showRoadmap(): void {
    if (this.roadmap?.active) return;
    this.opts.onOverlay?.(true);
    this.roadmap = openLevelRoadmap(this.scene, this.gs, () => {
      this.roadmap = null;
      this.opts.onOverlay?.(false);
    });
  }
}
