import Phaser from 'phaser';
import { hasFeature, product, type Category } from '../core/data';
import { formatMoney, type Lot } from '../core/state';
import { discardLot, nextWarehouseTier, stowHolding, upgradeWarehouse, warehouseCapacity, warehouseCellsUsed } from '../core/stock';
import { G, persist } from '../game';
import { furnitureImage, productIcon } from '../ui/art';
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
  private landscape = false;
  private rightW = 0;

  constructor() {
    super('Warehouse');
  }

  create(): void {
    setupCamera(this);
    this.chips = [];
    pageFrame(this, '📦 Kho hàng', () => this.scene.start('Morning'));

    this.landscape = W > H;
    if (this.landscape) {
      const leftW = 196;
      const leftX = 10;
      const rightX = leftX + leftW + 10;
      this.rightW = W - rightX - 10;

      const panelG = this.add.graphics();
      panelG.fillStyle(C.panel, 1).fillRoundedRect(leftX, PAGE_TOP + 4, leftW, H - PAGE_TOP - 16, 6);
      panelG.lineStyle(1.5, C.panelEdge, 0.95).strokeRoundedRect(leftX, PAGE_TOP + 4, leftW, H - PAGE_TOP - 16, 6);

      this.header = txt(this, leftX + 10, PAGE_TOP + 12, '', { size: 12, bold: true, color: HEX.ink });

      let topY = PAGE_TOP + 32;
      const tier = nextWarehouseTier(G.state);
      if (tier && hasFeature(G.state.level, 'warehouse')) {
        const label = `⬆ ${tier.name} · ${formatMoney(tier.cost)}`;
        new Button(this, leftX + leftW / 2, topY + 12, { w: leftW - 16, h: 26, size: 10, color: C.blue, label, onTap: () => this.upgrade() });
        topY += 32;
      }

      const fCols = 2;
      const fGap = 4;
      const fBtnW = Math.floor((leftW - 16 - fGap) / fCols);
      FILTERS.forEach((f, i) => {
        const col = i % fCols;
        const row = Math.floor(i / fCols);
        const btn = new Button(this, leftX + 8 + fBtnW / 2 + col * (fBtnW + fGap), topY + 12 + row * 26, {
          w: fBtnW, h: 22, radius: 4, label: f.label, size: 9,
          color: C.wood, onTap: () => { this.filter = f.id; this.render(); },
        });
        this.chips.push(btn);
      });

      txt(this, leftX + 10, H - 42, 'Hạn hết tự loại cuối ngày.\nBỏ lô: vốn ghi tổn thất.', { size: 9, color: HEX.muted, wrap: leftW - 20 });
      this.list = new ScrollArea(this, PAGE_TOP + 4, H - 10, undefined, { x: rightX, width: this.rightW });
    } else {
      this.rightW = W - 16;
      this.header = txt(this, 14, PAGE_TOP + 4, '', { size: 13, bold: true });
      const tier = nextWarehouseTier(G.state);
      if (tier && hasFeature(G.state.level, 'warehouse')) {
        const label = `⬆ ${tier.name} · ${formatMoney(tier.cost)}`;
        const w = Math.min(W - 160, this.textWidth(label, 11) + 18);
        furnitureImage(this, 'shelf_steel', W - 12 - w - 18, PAGE_TOP + 12, 26, 26);
        new Button(this, W - 12 - w / 2, PAGE_TOP + 12, { w, h: 30, size: 11, color: C.blue, label, onTap: () => this.upgrade() });
      }
      // Bộ lọc dạng chip: rộng theo chữ, tự xuống hàng khi hết chỗ.
      const gap = 6;
      let x = 12;
      let y = PAGE_TOP + 46;
      for (const f of FILTERS) {
        const w = this.textWidth(f.label, 10.5) + 20;
        if (x + w > W - 12) { x = 12; y += 32; }
        this.chips.push(new Button(this, x + w / 2, y, { w, h: 28, radius: 14, label: f.label, size: 10.5, color: C.wood, onTap: () => { this.filter = f.id; this.render(); } }));
        x += w + gap;
      }
      this.list = new ScrollArea(this, y + 34, H - 70);
      const foot = this.add.graphics();
      foot.fillStyle(C.hud, 1).fillRoundedRect(0, H - 66, W, 66, { tl: 14, tr: 14, bl: 0, br: 0 });
      foot.lineStyle(1.5, C.woodLight, 0.7).strokeRoundedRect(0, H - 66, W, 66, { tl: 14, tr: 14, bl: 0, br: 0 });
      txt(this, 16, H - 52, 'Lô hết hạn tự bị loại cuối ngày.\nBỏ lô để lấy chỗ: giá vốn ghi là tổn thất.', { size: 11, color: HEX.cream });
    }
    this.render();
  }

  private textWidth(label: string, size: number): number {
    const t = txt(this, 0, 0, label, { size, bold: true });
    const w = Math.ceil(t.width);
    t.destroy();
    return w;
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
    FILTERS.forEach((f, i) => this.chips[i]?.setColor(f.id === this.filter ? C.red : C.wood));
    this.list.clear();
    let y = 4;
    const rightW = this.rightW;

    if (s.holding.length) {
      const held = s.holding.reduce((sum, l) => sum + l.qty, 0);
      const cardW = this.landscape ? rightW : W - 16;
      const cardX = this.landscape ? 0 : 8;
      this.list.add(card(this, cardX, y, cardW, 58, 0xfff0d6));
      this.list.add(txt(this, cardX + 10, y + 8, `🚚 Hàng chờ: ${held} món chưa vào kho`, { size: 12, bold: true, color: HEX.red }));
      this.list.add(txt(this, cardX + 10, y + 30, 'Phải cất hoặc bỏ trước khi mở cửa.', { size: 10, color: HEX.muted }));
      this.list.add(new Button(this, cardX + cardW - 54, y + 29, { w: 86, h: 32, label: 'Cất vào kho', size: 11, color: C.green, onTap: this.list.guard(() => {
        const left = stowHolding(G.state);
        persist();
        toast(this, left ? `Kho vẫn đầy: còn ${left} món chờ` : 'Đã cất hết vào kho');
        this.render();
      }) }));
      y += 64;
      s.holding.forEach((lot, index) => {
        y = this.lotRow(lot, y, () => this.confirmDiscard(lot, index, 'holding'), 0, cardW);
      });
      y += 8;
    }

    const lots = s.warehouse.map((lot, index) => ({ lot, index })).filter(({ lot }) => this.matches(lot));
    if (this.filter === 'soon') lots.sort((a, b) => (a.lot.exp ?? 1e9) - (b.lot.exp ?? 1e9));
    if (!lots.length) {
      this.list.add(txt(this, (this.landscape ? rightW : W) / 2, y + 40, this.filter === 'soon' ? 'Không có lô nào sắp hết hạn 👍' : 'Không có hàng', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 80);
      return;
    }

    if (this.landscape) {
      const cols = 2;
      const gap = 6;
      const colW = Math.floor((rightW - gap) / cols);
      const lotH = 54;
      lots.forEach(({ lot, index }, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const lx = col * (colW + gap);
        const ly = y + row * (lotH + gap);
        this.lotRow(lot, ly, () => this.confirmDiscard(lot, index, 'warehouse'), lx, colW, true);
      });
      y += Math.ceil(lots.length / cols) * (lotH + gap);
    } else {
      for (const { lot, index } of lots) {
        y = this.lotRow(lot, y, () => this.confirmDiscard(lot, index, 'warehouse'), 8, W - 16, false);
      }
    }
    this.list.setHeight(y + 20);
  }

  private lotRow(lot: Lot, y: number, onDiscard: () => void, x = 8, w = W - 16, compact = false): number {
    const p = product(lot.productId);
    const day = G.state.day;
    const h = compact ? 54 : 56;
    this.list.add(card(this, x, y, w, h - 4));
    this.list.add(productIcon(this, x + (compact ? 20 : 34), y + h / 2 - 2, p, compact ? 30 : 36));
    const zone = p.category === 'counter' ? 'SAU QUẦY' : ZONE_NAMES[p.category];
    const nameX = x + (compact ? 38 : 60);
    const nameMaxW = compact ? w - 74 : w - 120;
    const name = txt(this, nameX, y + (compact ? 8 : 7), `${p.name} · x${lot.qty}`, { size: compact ? 11 : 14, bold: true });
    name.setScale(Math.min(1, nameMaxW / name.width));
    this.list.add(name);

    let expText = 'Không hạn';
    let color = HEX.muted;
    if (lot.exp !== null) {
      const left = lot.exp - day;
      expText = left <= 0 ? '⚠️ Hết hạn hôm nay' : left === 1 ? 'Hết hạn ngày mai' : `Hạn: ngày ${lot.exp} (${left}n)`;
      color = left <= 0 ? HEX.red : left === 1 ? '#9a6200' : HEX.green;
    }
    const sub = txt(this, nameX, y + (compact ? 26 : 28), `${zone} · ${expText}`, { size: compact ? 9 : 11, color });
    sub.setScale(Math.min(1, nameMaxW / sub.width));
    this.list.add(sub);

    const btnW = compact ? 30 : 60;
    const btnX = x + w - btnW / 2 - (compact ? 4 : 8);
    this.list.add(new Button(this, btnX, y + h / 2 - 2, { w: btnW, h: compact ? 26 : 32, label: compact ? '✖' : 'Bỏ', size: compact ? 12 : 12, color: C.grey, onTap: this.list.guard(onDiscard) }));
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
