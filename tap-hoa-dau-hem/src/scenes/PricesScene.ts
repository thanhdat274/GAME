import Phaser from 'phaser';
import { DATA, type Category, type Product } from '../core/data';
import { priceRange, priceRatio, setPrice } from '../core/pricing';
import { formatMoney, priceOf, unlockedProducts } from '../core/state';
import { G, persist } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const PRICE_ROW_H = 100;
type ProductFilter = Category | 'all';
const FILTERS: { id: ProductFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'dry', label: 'Đồ khô' },
  { id: 'snack', label: 'Ăn vặt' },
  { id: 'household', label: 'Đồ dùng' },
  { id: 'drink', label: 'Đồ uống' },
  { id: 'fresh', label: 'Đồ tươi' },
  { id: 'frozen', label: 'Đông lạnh' },
  { id: 'counter', label: 'Sau quầy' },
  { id: 'food', label: 'Đồ ăn' },
  { id: 'beverage', label: 'Pha chế' },
];

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
  private categoryFilter: ProductFilter = 'all';
  private categoryBtns: { filter: ProductFilter; button: Button }[] = [];

  constructor() {
    super('Prices');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '💲 Giá bán', () => {
      this.flushPendingPersist();
      this.scene.start('Morning');
    }, 'Áp dụng cho cả ngày hôm nay');
    txt(this, 14, PAGE_TOP + 4, 'Giá cao dễ bị chê; giá thấp hút khách (tối đa +10%).', { size: 10, color: HEX.muted });
    new Button(this, W / 2, PAGE_TOP + 39, {
      w: 200, h: 30, label: '↺ Về giá gợi ý tất cả', size: 12, color: C.grey,
      onTap: () => { G.state.prices = {}; this.renderWindow(true); this.queuePersist(); },
    });
    this.categoryFilter = 'all';
    this.categoryBtns = [];
    const cols = 5;
    const gap = 3;
    const buttonW = (W - 20 - gap * (cols - 1)) / cols;
    FILTERS.forEach(({ id, label }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const button = new Button(this, 10 + buttonW / 2 + col * (buttonW + gap), PAGE_TOP + 76 + row * 27, {
        w: buttonW, h: 24, radius: 4, label, size: 10,
        color: id === this.categoryFilter ? C.red : C.wood,
        onTap: () => { this.categoryFilter = id; this.list.setScroll(0); this.render(); },
      });
      this.categoryBtns.push({ filter: id, button });
    });
    this.list = new ScrollArea(this, PAGE_TOP + 123, H - 12, () => this.renderWindow());
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
    this.products = unlockedProducts(s.level, s).filter((p) => this.categoryFilter === 'all' || p.category === this.categoryFilter);
    for (const { filter, button } of this.categoryBtns) button.setColor(filter === this.categoryFilter ? C.red : C.wood);
    this.windowKey = '';
    this.list.setHeight(Math.max(100, this.products.length * PRICE_ROW_H + 8));
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
    if (!this.products.length) {
      this.list.add(txt(this, W / 2, 40, 'Chưa có mặt hàng trong danh mục này.', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      return;
    }
    for (let i = first; i < end; i++) {
      const p = this.products[i];
      const y = 4 + i * PRICE_ROW_H;
      const range = priceRange(p.id);
      const price = priceOf(p.id, s);
      const pct = Math.round((priceRatio(s, p.id) - 1) * 100);
      const h = PRICE_ROW_H;
      this.list.add(card(this, 8, y, W - 16, h - 4));
      this.list.add(productIcon(this, 33, y + 26, p, 34));
      const name = txt(this, 58, y + 7, p.name, { size: 13, bold: true });
      name.setScale(Math.min(1, (W - 78) / name.width));
      this.list.add(name);
      const details = txt(this, 58, y + 27, `Gợi ý ${formatMoney(range.ref)} · vốn ${formatMoney(p.cost)}`, { size: 10, color: HEX.muted });
      details.setScale(Math.min(1, (W - 78) / details.width));
      this.list.add(details);
      const complained = s.yesterdayComplaints?.[p.id] ?? 0;
      if (complained) this.list.add(txt(this, 58, y + 42, `Hôm qua ${complained} khách chê đắt`, { size: 10, color: HEX.red }));
      const cy = y + 73;
      const minus = new Button(this, 76, cy, { w: 46, h: 36, label: '−', size: 18, color: C.woodLight, onTap: this.list.guard(() => this.change(p.id, -DATA.balance.pricing.step)) }).setEnabled(price > range.min);
      const priceLabel = txt(this, W / 2, cy - 10, formatMoney(price), { size: 14, bold: true, origin: [0.5, 0.5] });
      const ratioLabel = txt(this, W / 2, cy + 10, pct === 0 ? 'giá gợi ý' : `${pct > 0 ? '+' : ''}${pct}%`, { size: 10, bold: true, color: pct > 0 ? HEX.red : pct < 0 ? HEX.green : HEX.muted, origin: [0.5, 0.5] });
      const plus = new Button(this, W - 76, cy, { w: 46, h: 36, label: '+', size: 18, color: C.green, onTap: this.list.guard(() => this.change(p.id, DATA.balance.pricing.step)) }).setEnabled(price < range.max);
      this.list.add([minus, priceLabel, ratioLabel, plus]);
      this.rows.set(p.id, { price: priceLabel, ratio: ratioLabel, minus, plus });
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
