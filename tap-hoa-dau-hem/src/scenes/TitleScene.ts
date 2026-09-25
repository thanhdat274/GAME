import Phaser from 'phaser';
import { hasSave } from '../core/save';
import { G, newGame, persist, sceneForPhase } from '../game';
import { drawStorefront } from '../ui/art';
import { play, setSoundEnabled, startMusic, stopMusic } from '../ui/sound';
import { Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const INTRO = [
  { icon: '👵', text: 'Cháu ơi, bà già rồi, đứng tiệm không nổi nữa...' },
  { icon: '🏪', text: 'Tiệm tạp hóa đầu hẻm này bà giao lại cho cháu. Bà để lại 300 nghìn làm vốn.' },
  { icon: '💪', text: 'Sáng nhập hàng, bày lên kệ rồi mở cửa bán. Nhớ thối tiền cho đúng nghen cháu!' },
];

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    setupCamera(this);
    const g = this.add.graphics();
    g.fillGradientStyle(0xf7a35c, 0xf7a35c, 0x6b3fa0, 0x6b3fa0, 1).fillRect(0, 0, W, 360);
    g.fillStyle(0xffe08a, 1).fillCircle(36, 44, 24);
    drawStorefront(this, W / 2, 360);
    txt(this, W / 2, 200, 'TẠP HÓA ĐẦU HẺM', { size: 22, bold: true, color: HEX.white, origin: [0.5, 0.5], stroke: '#7a1f15' });
    txt(this, W / 2, 60, 'Tạp Hóa\nĐầu Hẻm', {
      size: 40,
      bold: true,
      color: '#fff3d6',
      origin: [0.5, 0.5],
      align: 'center',
      stroke: '#5a2a12',
    });
    txt(this, W / 2, 122, 'Nhập hàng · Bày kệ · Bán hàng · Thối tiền', { size: 13, color: HEX.white, origin: [0.5, 0.5] });

    const saved = hasSave();
    let y = saved ? 372 : 400;
    if (saved) {
      new Button(this, W / 2, y, {
        w: 240,
        h: 52,
        label: `▶  Chơi tiếp (Ngày ${G.state.day})`,
        color: C.green,
        size: 17,
        onTap: () => this.continueGame(),
      });
      y += 60;
    }
    new Button(this, W / 2, y, {
      w: 240,
      h: 48,
      label: '🆕  Chơi mới',
      color: saved ? C.blue : C.green,
      onTap: () => this.askNewGame(saved),
    });
    y += 56;
    new Button(this, W / 2, y, { w: 240, h: 44, label: '📖  Cách chơi', color: C.wood, onTap: () => this.scene.start('HowTo') });
    y += 52;
    const sound = new Button(this, W / 2, y, {
      w: 240,
      h: 40,
      label: this.soundLabel(),
      color: C.woodDark,
      size: 14,
      onTap: () => {
        G.state.settings.sound = !G.state.settings.sound;
        setSoundEnabled(G.state.settings.sound);
        sound.setText(this.soundLabel());
        if (saved) persist();
      },
    });
    y += 48;
    const autoLabel = () => (G.state.settings.autoChange ? '🧮  Tự thối tiền: Bật' : '✋  Tự thối tiền: Tắt');
    const auto = new Button(this, W / 2, y, {
      w: 240,
      h: 40,
      label: autoLabel(),
      color: C.woodDark,
      size: 14,
      onTap: () => {
        G.state.settings.autoChange = !G.state.settings.autoChange;
        auto.setText(autoLabel());
        if (saved) persist();
      },
    });
    txt(this, W / 2, H - 12, 'Phiên bản 0.1 · Giai đoạn 1', { size: 10, color: '#d8c3a0', origin: [0.5, 1] });

    if (G.loadError) {
      toast(this, 'Bản lưu bị lỗi nên không đọc được.\nĐã giữ bản sao lưu, bạn có thể chơi mới.', H * 0.3, C.red);
      G.loadError = null;
    }
  }

  private soundLabel(): string {
    return G.state.settings.sound ? '🔊  Âm thanh: Bật' : '🔇  Âm thanh: Tắt';
  }

  private continueGame(): void {
    if (G.state.settings.sound) startMusic();
    this.scene.start(sceneForPhase());
  }

  private askNewGame(saved: boolean): void {
    if (!saved) {
      this.startNew();
      return;
    }
    dialog(this, {
      icon: '⚠️',
      title: 'Chơi lại từ đầu?',
      body: `Tiến trình hiện tại (Ngày ${G.state.day}, Lv ${G.state.level}) sẽ bị xóa.`,
      buttons: [
        { label: 'Hủy', color: C.grey },
        { label: 'Đồng ý', color: C.red, onTap: () => this.startNew() },
      ],
    });
  }

  private startNew(): void {
    newGame();
    stopMusic();
    if (G.state.settings.sound) startMusic();
    this.showIntro(0);
  }

  private showIntro(i: number): void {
    if (i >= INTRO.length) {
      G.state.seenIntro = true;
      persist();
      this.scene.start('Morning');
      return;
    }
    play('tap');
    dialog(this, {
      icon: INTRO[i].icon,
      title: i === 0 ? 'Thư của bà' : undefined,
      body: INTRO[i].text,
      buttons: [{ label: i === INTRO.length - 1 ? 'Mở tiệm thôi!' : 'Tiếp ›', onTap: () => this.showIntro(i + 1) }],
    });
  }
}
