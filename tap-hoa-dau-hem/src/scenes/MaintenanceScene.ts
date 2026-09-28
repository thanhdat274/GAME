import Phaser from 'phaser';
import { DATA } from '../core/data';
import { maintenanceItems, needsService, repairCost, repairItem, replaceItem, type MaintenanceItem } from '../core/maintenance';
import { formatMoney } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, toast } from '../ui/widgets';
import { C, H, HEX, W, emoji, setupCamera, txt } from '../ui/theme';

/** Sửa chữa: xem độ hao mòn của kệ, tủ, bóng đèn, quạt; trả phí sửa hoặc mua mới khi hỏng nặng. */
export class MaintenanceScene extends Phaser.Scene {
  private list!: ScrollArea;
  private summary!: Phaser.GameObjects.Text;

  constructor() {
    super('Maintenance');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🔧 Sửa chữa', () => this.scene.start('Morning'));
    this.summary = txt(this, 14, PAGE_TOP + 2, '', { size: 13, bold: true });
    txt(this, 14, PAGE_TOP + 22, 'Đồ mòn dần theo ngày và có thể hỏng qua đêm. Bảo trì sớm rẻ hơn mua mới.', { size: 11, color: HEX.muted, wrap: W - 28 });
    this.list = new ScrollArea(this, PAGE_TOP + 56, H - 12);
    this.render();
  }

  private render(): void {
    const s = G.state;
    const items = maintenanceItems(s).sort((a, b) => rank(b) - rank(a) || b.wear - a.wear);
    const broken = items.filter((i) => i.broken).length;
    this.summary.setText(broken ? `⚠️ ${broken} món đang hỏng · 💰 ${formatMoney(s.money)}` : `✅ Mọi thứ đang chạy tốt · 💰 ${formatMoney(s.money)}`);
    this.list.clear();
    let y = 4;
    const breakFrom = DATA.balance.maintenance.breakFrom;
    for (const item of items) {
      const h = 70;
      const bg = item.broken === 'major' ? 0xf8d7d3 : item.broken ? 0xfdecc8 : C.panel;
      this.list.add(card(this, 8, y, W - 16, h - 6, bg));
      this.list.add(emoji(this, 32, y + h / 2 - 3, item.icon, 24));
      this.list.add(txt(this, 56, y + 8, item.name, { size: 13, bold: true }));
      const state = item.broken === 'major' ? '❌ Hỏng nặng · phải mua mới'
        : item.broken ? '🔧 Đang hỏng · không dùng được'
          : item.wear >= breakFrom ? '⚠️ Mòn nhiều, dễ hỏng' : `Hao mòn ${Math.round(item.wear)}%`;
      this.list.add(txt(this, 56, y + 27, state, { size: 10, color: item.broken ? HEX.red : HEX.muted }));
      const bar = new Bar(this, 56, y + 46, W - 200, 7, item.wear >= breakFrom ? C.red : item.wear >= breakFrom * 0.7 ? C.yellow : C.green, 0x000000);
      bar.set(item.wear / 100);
      this.list.add(bar);
      this.list.add(this.action(item, W - 64, y + h / 2 - 3));
      y += h;
    }
    if (!items.length) this.list.add(txt(this, W / 2, 30, 'Chưa có đồ nào cần bảo trì.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] }));
    this.list.setHeight(y + 20);
  }

  private action(item: MaintenanceItem, x: number, y: number): Button {
    if (item.broken === 'major') {
      return new Button(this, x, y, { w: 100, h: 34, size: 10, color: C.red, label: `Mua mới\n${formatMoney(item.cost)}`, onTap: this.list.guard(() => {
        const r = replaceItem(G.state, item.key);
        if (r === 'ok') { play('cash'); persist(); toast(this, `Đã thay ${item.name} mới!`); this.render(); } else toast(this, 'Chưa đủ tiền', H * 0.5, C.red);
      }) });
    }
    const fix = !!item.broken || needsService(item);
    return new Button(this, x, y, { w: 100, h: 34, size: 10, color: item.broken ? C.green : C.blue, label: `${item.broken ? 'Sửa' : 'Bảo trì'}\n${formatMoney(repairCost(item))}`, onTap: this.list.guard(() => {
      const r = repairItem(G.state, item.key);
      if (r === 'ok') { play('cash'); persist(); toast(this, item.broken ? `Đã sửa xong ${item.name}!` : `Đã bảo trì ${item.name}`); this.render(); } else toast(this, r === 'money' ? 'Chưa đủ tiền' : 'Chưa cần sửa', H * 0.5, C.red);
    }) }).setEnabled(fix);
  }
}

const rank = (i: MaintenanceItem) => (i.broken === 'major' ? 3 : i.broken ? 2 : needsService(i) ? 1 : 0);
