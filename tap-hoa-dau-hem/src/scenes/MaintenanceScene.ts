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
  private leftPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Maintenance');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🔧 Sửa chữa', () => this.scene.start('Morning'));

    const landscape = W > H;
    const rightX = landscape ? 216 : 0;
    const rightW = landscape ? W - rightX - 8 : W;
    const topY = landscape ? PAGE_TOP + 4 : PAGE_TOP + 56;

    if (!landscape) {
      this.summary = txt(this, 14, PAGE_TOP + 2, '', { size: 13, bold: true });
      txt(this, 14, PAGE_TOP + 22, 'Đồ mòn dần theo ngày và có thể hỏng qua đêm. Bảo trì sớm rẻ hơn mua mới.', { size: 11, color: HEX.muted, wrap: W - 28 });
    }

    this.list = new ScrollArea(this, topY, H - 12, undefined, landscape ? { x: rightX, width: rightW } : undefined);
    this.render();
  }

  private render(): void {
    const s = G.state;
    const items = maintenanceItems(s).sort((a, b) => rank(b) - rank(a) || b.wear - a.wear);
    const broken = items.filter((i) => i.broken).length;
    const serviceable = items.filter((i) => !i.broken && needsService(i)).length;

    this.list.clear();
    this.leftPanel?.destroy(true);
    this.leftPanel = null;

    const landscape = W > H;
    if (landscape) {
      this.renderLeftPanel(broken, serviceable, items);
    } else {
      this.summary.setText(broken ? `⚠️ ${broken} món đang hỏng · 💰 ${formatMoney(s.money)}` : `✅ Mọi thứ đang chạy tốt · 💰 ${formatMoney(s.money)}`);
    }

    const startX = landscape ? 216 : 8;
    const cardW = landscape ? W - startX - 12 : W - 16;
    let y = 4;
    const breakFrom = DATA.balance.maintenance.breakFrom;

    for (const item of items) {
      const h = 70;
      const bg = item.broken === 'major' ? 0xf8d7d3 : item.broken ? 0xfdecc8 : C.panel;
      this.list.add(card(this, startX, y, cardW, h - 6, bg));
      this.list.add(emoji(this, startX + 24, y + (h - 6) / 2, item.icon, 24));
      this.list.add(txt(this, startX + 48, y + 8, item.name, { size: 13, bold: true }));

      const state = item.broken === 'major' ? '❌ Hỏng nặng · phải mua mới'
        : item.broken ? '🔧 Đang hỏng · không dùng được'
          : item.wear >= breakFrom ? '⚠️ Mòn nhiều, dễ hỏng' : `Hao mòn ${Math.round(item.wear)}%`;
      this.list.add(txt(this, startX + 48, y + 27, state, { size: 9.5, color: item.broken ? HEX.red : HEX.muted }));

      const barW = Math.max(90, cardW - 160);
      const bar = new Bar(this, startX + 48, y + 46, barW, 7, item.wear >= breakFrom ? C.red : item.wear >= breakFrom * 0.7 ? C.yellow : C.green, 0x000000);
      bar.set(item.wear / 100);
      this.list.add(bar);

      this.list.add(this.action(item, startX + cardW - 54, y + (h - 6) / 2));
      y += h;
    }
    if (!items.length) {
      this.list.add(txt(this, startX + cardW / 2, 30, 'Chưa có đồ nào cần bảo trì.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] }));
    }
    this.list.setHeight(y + 20);
  }

  private renderLeftPanel(broken: number, serviceable: number, items: MaintenanceItem[]): void {
    const s = G.state;
    const container = this.add.container(0, 0);
    this.leftPanel = container;
    const lx = 8;
    const ly = PAGE_TOP + 4;
    const lw = 200;
    const lh = H - PAGE_TOP - 16;

    container.add(card(this, lx, ly, lw, lh, C.panel));
    container.add(txt(this, lx + 12, ly + 14, 'Tình trạng thiết bị', { size: 12, bold: true }));
    const statusTxt = broken > 0 ? `⚠️ ${broken} món đang hỏng` : serviceable > 0 ? `🔧 ${serviceable} món cần bảo trì` : '✅ Tất cả hoạt động tốt';
    container.add(txt(this, lx + 12, ly + 34, statusTxt, { size: 11, bold: true, color: broken > 0 ? HEX.red : serviceable > 0 ? '#b7791f' : HEX.green }));

    container.add(txt(this, lx + 12, ly + 64, `Tiền mặt: ${formatMoney(s.money)}`, { size: 11, bold: true }));

    // Nút bảo trì tất cả các món cần bảo trì
    const needsWork = items.filter((i) => !i.broken && needsService(i));
    const totalRepairCost = needsWork.reduce((acc, i) => acc + repairCost(i), 0);
    const canAffordAll = totalRepairCost > 0 && s.money >= totalRepairCost;

    container.add(new Button(this, lx + lw / 2, ly + 104, {
      w: lw - 24, h: 36, size: 10.5, color: canAffordAll ? C.green : C.grey,
      label: totalRepairCost > 0 ? `Bảo trì tất cả (${formatMoney(totalRepairCost)})` : 'Đã bảo trì xong',
      onTap: this.list.guard(() => {
        if (!needsWork.length) return;
        let count = 0;
        for (const item of needsWork) {
          if (repairItem(G.state, item.key) === 'ok') count++;
        }
        if (count > 0) {
          play('cash');
          persist();
          toast(this, `Đã bảo trì ${count} món trang thiết bị!`);
          this.render();
        }
      }),
    }).setEnabled(canAffordAll));

    container.add(txt(this, lx + 12, ly + 154, 'Lưu ý vận hành:', { size: 11, bold: true }));
    container.add(txt(this, lx + 12, ly + 174,
      '• Đồ mòn theo ngày và có thể hỏng qua đêm.\n• Bảo trì sớm sẽ rẻ hơn mua mới.\n• Khi hỏng nặng (đỏ), bắt buộc phải mua mới thay thế.',
      { size: 9.5, color: HEX.muted, wrap: lw - 24 }));
  }

  private action(item: MaintenanceItem, x: number, y: number): Button {
    if (item.broken === 'major') {
      return new Button(this, x, y, { w: 92, h: 32, size: 9.5, color: C.red, label: `Mua mới\n${formatMoney(item.cost)}`, onTap: this.list.guard(() => {
        const r = replaceItem(G.state, item.key);
        if (r === 'ok') { play('cash'); persist(); toast(this, `Đã thay ${item.name} mới!`); this.render(); } else toast(this, 'Chưa đủ tiền', H * 0.5, C.red);
      }) });
    }
    const fix = !!item.broken || needsService(item);
    return new Button(this, x, y, { w: 92, h: 32, size: 9.5, color: item.broken ? C.green : C.blue, label: `${item.broken ? 'Sửa' : 'Bảo trì'}\n${formatMoney(repairCost(item))}`, onTap: this.list.guard(() => {
      const r = repairItem(G.state, item.key);
      if (r === 'ok') { play('cash'); persist(); toast(this, item.broken ? `Đã sửa xong ${item.name}!` : `Đã bảo trì ${item.name}`); this.render(); } else toast(this, r === 'money' ? 'Chưa đủ tiền' : 'Chưa cần sửa', H * 0.5, C.red);
    }) }).setEnabled(fix);
  }
}

const rank = (i: MaintenanceItem) => (i.broken === 'major' ? 3 : i.broken ? 2 : needsService(i) ? 1 : 0);
