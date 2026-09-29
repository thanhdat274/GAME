import Phaser from 'phaser';
import { DATA } from '../core/data';
import { landscapePageNavigation } from '../ui/page';
import { Button, panel } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const PAGES = [
  {
    icon: '🏪',
    title: 'Tiệm Tạp Hóa Đầu Hẻm',
    body: 'Bà giao lại tiệm tạp hóa nhỏ đầu hẻm, cùng 500 nghìn làm vốn. Nhập hàng, bày kệ, bán hàng, thối tiền mỗi ngày để tiệm ngày càng đông khách.\n\nLên level mở khóa nhân viên, chi nhánh, nấu ăn, nhiệm vụ tuần và thăng cấp. Đăng nhập Google để lưu cloud và so tài trên bảng xếp hạng.',
  },
  {
    icon: '🛒',
    title: '1. Nhập hàng buổi sáng',
    body: 'Mỗi sáng mua hàng từ mối sỉ Cô Tư. Xem "Hôm qua bán" và "thiếu" (khách hỏi mà hết) để nhập vừa đủ, hoặc bấm 🪄 Gợi ý để game tự tính. Kho có 30 ô.',
  },
  {
    icon: '🧺',
    title: '2. Bày hàng lên kệ',
    body: `Chọn món trong kho rồi chạm (hoặc kéo) vào ô kệ. Mỗi kệ ${DATA.balance.slotsPerShelf} ô, mỗi ô chứa ${DATA.balance.slotCapacity} món. Bấm "Tự bày" nếu lười. Nút × trả hàng về kho.`,
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
  {
    icon: '🧾',
    title: '8. Thuế (từ level 10)',
    body: 'Tiệm lớn thì đăng ký hộ kinh doanh. Doanh thu năm dưới ngưỡng được miễn thuế; vượt ngưỡng thì mỗi tháng chốt sổ, nộp VAT + thuế TNCN ở ☰ Tiệm → Sổ thuế trước hạn. Trễ hạn bị tính tiền chậm nộp; khai bớt hay nhập hàng không hóa đơn coi chừng thanh tra!',
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
    txt(this, W / 2, 22, 'Cách chơi', { size: 18, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    landscapePageNavigation(this);
    panel(this, 20, 44, W - 40, H - 90);
    this.content = this.add.container(0, 0);
    this.dots = txt(this, W / 2, H - 38, '', { size: 14, color: HEX.cream, origin: [0.5, 0.5] });
    this.prev = new Button(this, W / 2 - 130, H - 18, { w: 96, h: 28, label: '‹ Trước', color: C.wood, size: 12, onTap: () => this.show(this.page - 1) });
    this.next = new Button(this, W / 2 + 130, H - 18, { w: 96, h: 28, label: 'Tiếp ›', size: 12, onTap: () => this.show(this.page + 1) });
    new Button(this, W / 2, H - 18, { w: 80, h: 28, label: 'Đóng', color: C.grey, size: 12, onTap: () => this.scene.start('Title') });
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
    {
      const leftColX = Math.round(W * 0.22);
      const rightColX = Math.round(W * 0.40);
      const textWrapW = W - rightColX - 36;
      this.content.add([
        txt(this, leftColX, Math.round(H * 0.35), p.icon, { size: 52, emoji: true, origin: [0.5, 0.5] }),
        txt(this, leftColX, Math.round(H * 0.58), p.title, { size: 15, bold: true, origin: [0.5, 0.5], align: 'center', wrap: Math.round(W * 0.28) }),
        txt(this, rightColX, 62, p.body, { size: 14, origin: [0, 0], align: 'left', wrap: textWrapW, color: HEX.ink }),
      ]);
    }

    this.dots.setText(PAGES.map((_, k) => (k === this.page ? '●' : '○')).join(' '));
    this.prev.setEnabled(this.page > 0);
    this.next.setText(this.page === PAGES.length - 1 ? 'Xong ✓' : 'Tiếp ›');
  }
}
