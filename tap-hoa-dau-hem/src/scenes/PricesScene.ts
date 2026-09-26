import Phaser from 'phaser';
import { DATA } from '../core/data';
import { priceRange, priceRatio, setPrice } from '../core/pricing';
import { formatMoney, priceOf, unlockedProducts } from '../core/state';
import { G, persist } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn chỉnh giá bán: 80–150% giá gợi ý, bước 500đ, chỉ ở Buổi sáng. */
export class PricesScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Prices');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '💲 Giá bán', () => this.scene.start('Morning'), 'Áp dụng cho cả ngày hôm nay');
    txt(this, 14, PAGE_TOP + 4, 'Giá cao hơn giá gợi ý: khách dễ chê "Đắt quá!".\nGiá rẻ hơn: khách tới đông hơn (tối đa +10%).', { size: 11, color: HEX.muted });
    this.list = new ScrollArea(this, PAGE_TOP + 40, H - 12);
    this.render();
  }

  private render(): void {
    this.list.clear();
    const s = G.state;
    let y = 4;
    for (const p of unlockedProducts(s.level)) {
      const range = priceRange(p.id);
      const price = priceOf(p.id, s);
      const pct = Math.round((priceRatio(s, p.id) - 1) * 100);
      const h = 62;
      this.list.add(card(this, 8, y, W - 16, h - 4));
      this.list.add(productIcon(this, 32, y + h / 2 - 2, p, 34));
      this.list.add(txt(this, 56, y + 6, p.name, { size: 13, bold: true }));
      this.list.add(txt(this, 56, y + 24, `Gợi ý ${formatMoney(range.ref)} · vốn ${formatMoney(p.cost)}`, { size: 10, color: HEX.muted }));
      const complained = s.yesterdayComplaints?.[p.id] ?? 0;
      if (complained) this.list.add(txt(this, 56, y + 38, `Hôm qua ${complained} khách chê đắt`, { size: 10, color: HEX.red }));
      const cy = y + h / 2 - 2;
      this.list.add(new Button(this, 196, cy, { w: 32, h: 36, label: '−', size: 18, color: C.woodLight, onTap: this.list.guard(() => this.change(p.id, -DATA.balance.pricing.step)) }).setEnabled(price > range.min));
      this.list.add(txt(this, 252, cy - 8, formatMoney(price), { size: 13, bold: true, origin: [0.5, 0.5] }));
      this.list.add(txt(this, 252, cy + 10, pct === 0 ? 'giá gợi ý' : `${pct > 0 ? '+' : ''}${pct}%`, { size: 11, bold: true, color: pct > 0 ? HEX.red : pct < 0 ? HEX.green : HEX.muted, origin: [0.5, 0.5] }));
      this.list.add(new Button(this, 308, cy, { w: 32, h: 36, label: '+', size: 18, color: C.green, onTap: this.list.guard(() => this.change(p.id, DATA.balance.pricing.step)) }).setEnabled(price < range.max));
      y += h;
    }
    this.list.add(new Button(this, W / 2, y + 26, { w: 200, h: 40, label: '↺ Về giá gợi ý tất cả', size: 13, color: C.grey, onTap: this.list.guard(() => {
      G.state.prices = {};
      persist();
      this.render();
    }) }));
    this.list.setHeight(y + 60);
  }

  private change(productId: string, delta: number): void {
    setPrice(G.state, productId, priceOf(productId, G.state) + delta);
    play('tap');
    persist();
    this.render();
  }
}
