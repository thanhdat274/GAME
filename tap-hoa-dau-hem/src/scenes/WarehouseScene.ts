import Phaser from 'phaser';
import { hasFeature, product, type Category } from '../core/data';
import { formatMoney, type Lot } from '../core/state';
import { discardLot, nextWarehouseTier, stowHolding, upgradeWarehouse, warehouseCapacity, warehouseCellsUsed } from '../core/stock';
import { G, persist } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { ZONE_NAMES } from '../ui/shelves';
import { play } from '../ui/sound';
import { Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

type Filter = 'all' | 'soon' | Exclude<Category, 'counter'> | 'counter';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'soon', label: '⏰ Sắp hết hạn' },
  { id: 'dry', label: 'Khô' },
  { id: 'snack', label: 'Ăn vặt' },
  { id: 'household', label: 'Đồ dùng' },
  { id: 'drink', label: 'Uống' },
  { id: 'fresh', label: 'Tươi' },
  { id: 'frozen', label: 'Đông' },
  { id: 'counter', label: 'Sau quầy' },
];

/** Màn Kho: xem lô hàng, hạn dùng, dọn bỏ lô, nâng cấp kho và cất hàng chờ. */
export class WarehouseScene extends Phaser.Scene {
  private filter: Filter = 'all';
  private list!: ScrollArea;
  private header!: Phaser.GameObjects.Text;
  private chips: Button[] = [];

  constructor() {
    super('Warehouse');
  }

  create(): void {
    setupCamera(this);
    this.chips = [];
    pageFrame(this, '📦 Kho hàng', () => this.scene.start('Morning'));
    this.header = txt(this, 14, PAGE_TOP + 4, '', { size: 13, bold: true });
    const tier = nextWarehouseTier(G.state);
    if (tier && hasFeature(G.state.level, 'warehouse')) {
      new Button(this, W - 74, PAGE_TOP + 12, {
        w: 132, h: 30, size: 11, color: C.blue,
        label: `⬆ ${tier.name} · ${formatMoney(tier.cost)}`,
        onTap: () => this.upgrade(),
      });
    }
    // Bộ lọc dạng chip, 2 hàng.
    FILTERS.forEach((f, i) => {
      const x = 44 + (i % 5) * 68;
      const y = PAGE_TOP + 46 + Math.floor(i / 5) * 32;
      const b = new Button(this, x, y, { w: 64, h: 28, label: f.label, size: 10, color: C.wood, onTap: () => { this.filter = f.id; this.render(); } });
      this.chips.push(b);
    });
    this.list = new ScrollArea(this, PAGE_TOP + 112, H - 70);
    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, H - 66, W, 66);
    txt(this, 14, H - 54, 'Lô hết hạn tự bị loại cuối ngày.\nBỏ lô để lấy chỗ: giá vốn ghi là tổn thất.', { size: 11, color: HEX.cream });
    this.render();
  }

  private upgrade(): void {
    const tier = nextWarehouseTier(G.state);
    if (!tier) return;
    const r = upgradeWarehouse(G.state);
    if (r === 'ok') {
      play('cash');
      persist();
      toast(this, `Đã nâng kho: ${tier.name} (${tier.cells} ô)`);
      this.scene.restart();
    } else toast(this, r === 'money' ? 'Chưa đủ tiền' : r === 'level' ? `Cần level ${tier.unlockLevel}` : 'Kho đã tối đa', H * 0.5, C.red);
  }

  private matches(lot: Lot): boolean {
    const p = product(lot.productId);
    if (this.filter === 'all') return true;
    if (this.filter === 'soon') return lot.exp !== null && lot.exp <= G.state.day + 1;
    return p.category === this.filter;
  }

  private render(): void {
    const s = G.state;
    this.header.setText(`Đã dùng ${warehouseCellsUsed(s.warehouse)}/${warehouseCapacity(s)} ô`);
    FILTERS.forEach((f, i) => this.chips[i].setColor(f.id === this.filter ? C.red : C.wood));
    this.list.clear();
    let y = 4;
    if (s.holding.length) {
      const held = s.holding.reduce((sum, l) => sum + l.qty, 0);
      this.list.add(card(this, 8, y, W - 16, 58, 0xfff0d6));
      this.list.add(txt(this, 18, y + 8, `🚚 Hàng chờ: ${held} món chưa vào kho`, { size: 13, bold: true, color: HEX.red }));
      this.list.add(txt(this, 18, y + 30, 'Phải cất hoặc bỏ trước khi mở cửa.', { size: 11, color: HEX.muted }));
      this.list.add(new Button(this, W - 60, y + 29, { w: 90, h: 34, label: 'Cất vào kho', size: 11, color: C.green, onTap: this.list.guard(() => {
        const left = stowHolding(G.state);
        persist();
        toast(this, left ? `Kho vẫn đầy: còn ${left} món chờ` : 'Đã cất hết vào kho');
        this.render();
      }) }));
      y += 64;
      s.holding.forEach((lot, index) => { y = this.lotRow(lot, y, () => this.confirmDiscard(lot, index, 'holding')); });
      y += 8;
    }
    const lots = s.warehouse.map((lot, index) => ({ lot, index })).filter(({ lot }) => this.matches(lot));
    if (this.filter === 'soon') lots.sort((a, b) => (a.lot.exp ?? 1e9) - (b.lot.exp ?? 1e9));
    if (!lots.length) this.list.add(txt(this, W / 2, y + 40, this.filter === 'soon' ? 'Không có lô nào sắp hết hạn 👍' : 'Không có hàng', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
    for (const { lot, index } of lots) y = this.lotRow(lot, y, () => this.confirmDiscard(lot, index, 'warehouse'));
    this.list.setHeight(y + 20);
  }

  private lotRow(lot: Lot, y: number, onDiscard: () => void): number {
    const p = product(lot.productId);
    const day = G.state.day;
    const h = 56;
    this.list.add(card(this, 8, y, W - 16, h - 4));
    this.list.add(productIcon(this, 34, y + h / 2 - 2, p, 36));
    const zone = p.category === 'counter' ? 'SAU QUẦY' : ZONE_NAMES[p.category];
    this.list.add(txt(this, 60, y + 7, `${p.name} · x${lot.qty}`, { size: 14, bold: true }));
    let expText = 'Không hạn';
    let color = HEX.muted;
    if (lot.exp !== null) {
      const left = lot.exp - day;
      expText = left <= 0 ? '⚠️ Hết hạn hôm nay' : left === 1 ? 'Hết hạn ngày mai' : `Hạn: ngày ${lot.exp} (còn ${left} ngày)`;
      color = left <= 0 ? HEX.red : left === 1 ? '#9a6200' : HEX.green;
    }
    this.list.add(txt(this, 60, y + 28, `${zone} · ${expText}`, { size: 11, color }));
    this.list.add(new Button(this, W - 44, y + h / 2 - 2, { w: 60, h: 32, label: 'Bỏ', size: 12, color: C.grey, onTap: this.list.guard(onDiscard) }));
    return y + h;
  }

  private confirmDiscard(lot: Lot, index: number, from: 'warehouse' | 'holding'): void {
    const p = product(lot.productId);
    dialog(this, {
      icon: '🗑️',
      title: `Bỏ ${lot.qty} ${p.name}?`,
      body: `Tổn thất ${formatMoney(p.cost * lot.qty)} theo giá vốn.`,
      buttons: [
        { label: 'Giữ lại', color: C.grey },
        { label: 'Bỏ lô', color: C.red, onTap: () => {
          discardLot(G.state, index, from);
          play('wrong');
          persist();
          this.render();
        } },
      ],
    });
  }
}
