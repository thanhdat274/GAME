import Phaser from 'phaser';
import { DATA, type Product } from '../core/data';
import { priceRange, priceRatio, setPrice } from '../core/pricing';
import { formatMoney, priceOf, unlockedProducts } from '../core/state';
import { G, persist } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const PRICE_ROW_H = 62;

/** Màn chỉnh giá bán: 80–150% giá gợi ý, bước 500đ, chỉ ở Buổi sáng. */
export class PricesScene extends Phaser.Scene {
  private list!: ScrollArea;
  private readonly rows = new Map<string, {
    price: Phaser.GameObjects.Text;
    ratio: Phaser.GameObjects.Text;
    minus: Button;
    plus: Button;
  }>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private products: Product[] = [];
  private windowKey = '';

  constructor() {
    super('Prices');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '💲 Giá bán', () => {
      this.flushPendingPersist();
      this.scene.start('Morning');
    }, 'Áp dụng cho cả ngày hôm nay');
    txt(this, 14, PAGE_TOP + 4, 'Giá cao hơn giá gợi ý: khách dễ chê "Đắt quá!".\nGiá rẻ hơn: khách tới đông hơn (tối đa +10%).', { size: 11, color: HEX.muted });
    this.list = new ScrollArea(this, PAGE_TOP + 40, H - 12, () => this.renderWindow());
    const flushOnHidden = () => {
      if (document.visibilityState === 'hidden') this.flushPendingPersist();
    };
    const flushOnPageHide = () => this.flushPendingPersist();
    document.addEventListener('visibilitychange', flushOnHidden);
    window.addEventListener('pagehide', flushOnPageHide);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', flushOnHidden);
      window.removeEventListener('pagehide', flushOnPageHide);
      this.flushPendingPersist();
    });
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.products = unlockedProducts(s.level, s);
    this.windowKey = '';
    this.list.setHeight(this.products.length * PRICE_ROW_H + 64);
    this.renderWindow(true);
  }

  /** Chỉ dựng các dòng đang nhìn thấy và một vài dòng đệm để cuộn vẫn liền mạch. */
  private renderWindow(force = false): void {
    const s = G.state;
    const first = Math.max(0, Math.floor(this.list.scrollOffset / PRICE_ROW_H) - 2);
    const count = Math.ceil((this.list.bottom - this.list.top) / PRICE_ROW_H);
    const end = Math.min(this.products.length, first + count + 4);
    const key = `${first}:${end}`;
    if (!force && key === this.windowKey) return;
    this.windowKey = key;
    this.list.clear();
    this.rows.clear();
    for (let i = first; i < end; i++) {
      const p = this.products[i];
      const y = 4 + i * PRICE_ROW_H;
      const range = priceRange(p.id);
      const price = priceOf(p.id, s);
      const pct = Math.round((priceRatio(s, p.id) - 1) * 100);
      const h = PRICE_ROW_H;
      this.list.add(card(this, 8, y, W - 16, h - 4));
      this.list.add(productIcon(this, 32, y + h / 2 - 2, p, 34));
      this.list.add(txt(this, 56, y + 6, p.name, { size: 13, bold: true }));
      this.list.add(txt(this, 56, y + 24, `Gợi ý ${formatMoney(range.ref)} · vốn ${formatMoney(p.cost)}`, { size: 10, color: HEX.muted }));
      const complained = s.yesterdayComplaints?.[p.id] ?? 0;
      if (complained) this.list.add(txt(this, 56, y + 38, `Hôm qua ${complained} khách chê đắt`, { size: 10, color: HEX.red }));
      const cy = y + h / 2 - 2;
      const minus = new Button(this, 196, cy, { w: 32, h: 36, label: '−', size: 18, color: C.woodLight, onTap: this.list.guard(() => this.change(p.id, -DATA.balance.pricing.step)) }).setEnabled(price > range.min);
      const priceLabel = txt(this, 252, cy - 8, formatMoney(price), { size: 13, bold: true, origin: [0.5, 0.5] });
      const ratioLabel = txt(this, 252, cy + 10, pct === 0 ? 'giá gợi ý' : `${pct > 0 ? '+' : ''}${pct}%`, { size: 11, bold: true, color: pct > 0 ? HEX.red : pct < 0 ? HEX.green : HEX.muted, origin: [0.5, 0.5] });
      const plus = new Button(this, 308, cy, { w: 32, h: 36, label: '+', size: 18, color: C.green, onTap: this.list.guard(() => this.change(p.id, DATA.balance.pricing.step)) }).setEnabled(price < range.max);
      this.list.add([minus, priceLabel, ratioLabel, plus]);
      this.rows.set(p.id, { price: priceLabel, ratio: ratioLabel, minus, plus });
    }
    const resetY = 4 + this.products.length * PRICE_ROW_H;
    if (resetY >= first * PRICE_ROW_H && resetY <= (end + 1) * PRICE_ROW_H) {
      this.list.add(new Button(this, W / 2, resetY + 26, { w: 200, h: 40, label: '↺ Về giá gợi ý tất cả', size: 13, color: C.grey, onTap: this.list.guard(() => {
        G.state.prices = {};
        this.renderWindow(true);
        this.queuePersist();
      }) }));
    }
  }

  private change(productId: string, delta: number): void {
    const price = setPrice(G.state, productId, priceOf(productId, G.state) + delta);
    const row = this.rows.get(productId);
    if (!row) return;
    const range = priceRange(productId);
    const pct = Math.round((price / range.ref - 1) * 100);
    row.price.setText(formatMoney(price));
    row.ratio
      .setText(pct === 0 ? 'giá gợi ý' : `${pct > 0 ? '+' : ''}${pct}%`)
      .setColor(pct > 0 ? HEX.red : pct < 0 ? HEX.green : HEX.muted);
    row.minus.setEnabled(price > range.min);
    row.plus.setEnabled(price < range.max);
    this.queuePersist();
  }

  private queuePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      persist();
    }, 300);
  }

  private flushPendingPersist(): void {
    if (!this.persistTimer) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    persist();
  }
}
