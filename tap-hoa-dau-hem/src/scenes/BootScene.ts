import Phaser from 'phaser';
import { DATA } from '../core/data';
import { tryLoad } from '../game';
import { customerTexture, ownerTexture } from '../ui/art';
import { Bar } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn tải: tạo texture pixel art, đọc bản lưu rồi sang màn tiêu đề. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    setupCamera(this);
    txt(this, W / 2, H / 2 - 40, '🏪', { size: 48, emoji: true, origin: [0.5, 0.5] });
    txt(this, W / 2, H / 2 + 10, 'Đang dọn hàng...', { size: 15, color: HEX.cream, origin: [0.5, 0.5] });
    const bar = new Bar(this, W / 2 - 100, H / 2 + 36, 200, 10, C.yellow, 0xffffff);

    // Chờ font hệ thống sẵn sàng để chữ tiếng Việt đo đúng kích thước.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts?.ready ?? Promise.resolve();
    const steps = [...DATA.customers.map((t) => () => customerTexture(this, t)), () => ownerTexture(this), () => tryLoad()];
    let i = 0;
    const next = () => {
      if (i < steps.length) {
        steps[i++]();
        bar.set(i / steps.length);
        this.time.delayedCall(30, next);
      } else {
        void ready.then(() => this.scene.start('Title'));
      }
    };
    next();
  }
}
