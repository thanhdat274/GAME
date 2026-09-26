import Phaser from 'phaser';
import { Button, panel } from '../ui/widgets';
import { C, HEX, W, setupCamera, txt } from '../ui/theme';

const PAGES = [
  {
    icon: '🛒',
    title: '1. Nhập hàng buổi sáng',
    body: 'Mỗi sáng mua hàng từ mối sỉ Cô Tư. Xem "Hôm qua bán" và "thiếu" (khách hỏi mà hết) để nhập vừa đủ, hoặc bấm 🪄 Gợi ý để game tự tính. Kho có 30 ô.',
  },
  {
    icon: '🧺',
    title: '2. Bày hàng lên kệ',
    body: 'Chọn món trong kho rồi chạm (hoặc kéo) vào ô kệ. Mỗi ô chứa 5 món. Bấm "Tự bày" nếu lười. Nút × trả hàng về kho.',
  },
  {
    icon: '🙋',
    title: '3. Khách tự chọn hàng',
    body: 'Khách tự đi tới khu hàng và lấy món trên kệ. Ô kệ vơi thì bấm nút + xanh để nạp thêm; nút Nạp cả khu giúp nạp lần lượt các ô.',
  },
  {
    icon: '🧾',
    title: '4. Quét giỏ ở quầy',
    body: 'Khi khách tới quầy, chạm từng món trong giỏ để quét hoặc bấm Quét hết. Quét nhanh từng món có cơ hội nhận tip combo. Có thể bật Tự quét giỏ trong menu tạm dừng hoặc màn chính.',
  },
  {
    icon: '🏪',
    title: '5. Hàng sau quầy',
    body: 'Từ level 3, một số khách hỏi hàng sau quầy. Xếp hàng vào các ô Sau quầy buổi sáng rồi chạm đúng ô khi khách yêu cầu trước khi hết giờ.',
  },
  {
    icon: '💵',
    title: '6. Thối tiền',
    body: 'Mặc định game tự thối tiền cho bạn. Muốn kiếm tip? Tắt "Tự thối tiền" (màn chính hoặc nút ⏸), rồi tự chọn tờ và bấm "Đưa": thối đúng trong 4 giây được tip! Thối thiếu khách giận, thối dư mất tiền.',
  },
  {
    icon: '⭐',
    title: '7. Lên level',
    body: 'Bán hàng và làm khách vui để nhận EXP. Lên level mở khóa ăn vặt, kệ thứ 3 và đồ dùng gia đình.',
  },
];

export class HowToScene extends Phaser.Scene {
  private page = 0;
  private content!: Phaser.GameObjects.Container;
  private dots!: Phaser.GameObjects.Text;
  private prev!: Button;
  private next!: Button;

  constructor() {
    super('HowTo');
  }

  create(): void {
    setupCamera(this);
    this.page = 0;
    txt(this, W / 2, 34, 'Cách chơi', { size: 22, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    panel(this, 20, 70, W - 40, 420);
    this.content = this.add.container(0, 0);
    this.dots = txt(this, W / 2, 510, '', { size: 18, color: HEX.cream, origin: [0.5, 0.5] });
    this.prev = new Button(this, 90, 560, { w: 120, h: 46, label: '‹ Trước', color: C.wood, onTap: () => this.show(this.page - 1) });
    this.next = new Button(this, W - 90, 560, { w: 120, h: 46, label: 'Tiếp ›', onTap: () => this.show(this.page + 1) });
    new Button(this, W / 2, 612, { w: 150, h: 36, label: 'Đóng', color: C.grey, size: 13, onTap: () => this.scene.start('Title') });
    this.show(0);
  }

  private show(i: number): void {
    if (i >= PAGES.length) {
      this.scene.start('Title');
      return;
    }
    this.page = Math.max(0, i);
    const p = PAGES[this.page];
    this.content.removeAll(true);
    this.content.add([
      txt(this, W / 2, 150, p.icon, { size: 72, emoji: true, origin: [0.5, 0.5] }),
      txt(this, W / 2, 230, p.title, { size: 20, bold: true, origin: [0.5, 0.5], align: 'center', wrap: 280 }),
      txt(this, W / 2, 262, p.body, { size: 16, origin: [0.5, 0], align: 'center', wrap: 270, color: HEX.ink }),
    ]);
    this.dots.setText(PAGES.map((_, k) => (k === this.page ? '●' : '○')).join(' '));
    this.prev.setEnabled(this.page > 0);
    this.next.setText(this.page === PAGES.length - 1 ? 'Xong ✓' : 'Tiếp ›');
  }
}
