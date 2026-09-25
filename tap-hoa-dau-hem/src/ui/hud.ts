import Phaser from 'phaser';
import { DATA } from '../core/data';
import { averageRating, levelProgress, nextLevelDef } from '../core/progression';
import { formatClock, formatMoney, type GameState } from '../core/state';
import { Bar, toast } from './widgets';
import { C, HEX, W, txt } from './theme';
import { cloudSaveEnabled } from '../services/firebase';
import { getSyncStatus, onSyncStatus, syncNow, type SyncStatus } from '../services/sync';

export const HUD_H = 50;

/** Thanh trên cùng: tiền, ngày/giờ, sao, level + EXP. */
export class Hud extends Phaser.GameObjects.Container {
  private money: Phaser.GameObjects.Text;
  private day: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Text;
  private lv: Phaser.GameObjects.Text;
  private bar: Bar;
  private shownMoney = -1;
  private cloudIcon?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private gs: GameState, private opts: { onPause?: () => void; subtitle?: string } = {}) {
    super(scene, 0, 0);
    const bg = scene.add.graphics();
    bg.fillStyle(C.hud, 1).fillRect(0, 0, W, HUD_H);
    bg.fillStyle(0x000000, 0.25).fillRect(0, HUD_H, W, 3);
    this.money = txt(scene, 10, 6, '', { size: 16, bold: true, color: HEX.yellow });
    this.day = txt(scene, W / 2 + 18, 7, '', { size: 14, bold: true, color: HEX.cream, origin: [0.5, 0] });
    this.stars = txt(scene, opts.onPause ? W - 48 : W - 10, 7, '', { size: 14, bold: true, color: HEX.cream, origin: [1, 0] });
    this.lv = txt(scene, 10, 29, '', { size: 12, bold: true, color: HEX.cream });
    this.bar = new Bar(scene, 50, 33, cloudSaveEnabled() ? W - 95 : W - 60, 9, C.yellow, 0xffffff);
    this.add([bg, this.money, this.day, this.stars, this.lv, this.bar]);

    if (cloudSaveEnabled()) {
      this.cloudIcon = txt(scene, W - 22, 33, '', { size: 14, color: HEX.cream, origin: [0.5, 0.5] });
      const cloudZone = scene.add.zone(W - 22, 33, 36, 30).setInteractive({ useHandCursor: true });
      cloudZone.on('pointerup', () => {
        const current = getSyncStatus();
        if (current === 'pending' || current === 'error') void syncNow(true);
        toast(scene, ({ guest: 'Chơi khách · tiến trình lưu trên máy', syncing: 'Đang đồng bộ...', synced: 'Đã đồng bộ cloud', pending: 'Chưa đồng bộ · sẽ thử lại', error: 'Đồng bộ lỗi · đang thử lại', conflict: 'Hai bản lưu cần được chọn ở màn tiêu đề' })[current]);
      });
      this.add([this.cloudIcon, cloudZone]);
      const unsubscribe = onSyncStatus((status: SyncStatus) => this.cloudIcon?.setText(({ guest: '◇', syncing: '↻', synced: '☁', pending: '△', error: '!', conflict: '!' })[status]));
      this.once(Phaser.GameObjects.Events.DESTROY, unsubscribe);
    }

    // Chạm thanh EXP để xem phần thưởng level sau.
    const zone = scene.add.zone(W / 2, 37, W, 22).setInteractive();
    zone.on('pointerup', () => this.showNextUnlock());
    this.add(zone);

    if (opts.onPause) {
      const pz = scene.add.zone(W - 22, 16, 44, 32).setInteractive({ useHandCursor: true });
      const icon = txt(scene, W - 22, 15, '⏸', { size: 18, color: HEX.cream, origin: [0.5, 0.5] });
      pz.on('pointerup', () => opts.onPause?.());
      this.add([icon, pz]);
    }
    this.setDepth(500);
    scene.add.existing(this);
    this.refresh();
  }

  refresh(): void {
    const s = this.gs;
    if (this.shownMoney !== s.money) {
      this.shownMoney = s.money;
      this.money.setText(`💰 ${formatMoney(s.money)}`);
    }
    const when = s.phase === 'open' ? formatClock(s.clock) : this.opts.subtitle ?? 'Buổi sáng';
    this.day.setText(`Ngày ${s.day} · ${when}`);
    this.stars.setText(s.ratings.length ? `⭐ ${averageRating(s).toFixed(1)}` : '⭐ –');
    this.lv.setText(`Lv ${s.level}`);
    this.bar.set(levelProgress(s.exp, s.level));
  }

  private showNextUnlock(): void {
    const next = nextLevelDef(this.gs.level);
    if (!next) {
      toast(this.scene, `Level tối đa của bản này!\n${DATA.levels.nextTeaser}`);
      return;
    }
    toast(this.scene, `Lv ${next.level} (${this.gs.exp}/${next.exp} EXP)\nMở khóa: ${next.label}`);
  }
}
