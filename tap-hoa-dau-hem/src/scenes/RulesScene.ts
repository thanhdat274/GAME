import Phaser from 'phaser';
import {
  addRule, autoRestockUnlocked, lockPlanogram, moveRule, removeRule, stockLevel, suggestRule,
} from '../core/autorestock';
import { DATA, hasFeature, product, supplier, type Category } from '../core/data';
import { formatMoney, unlockedProducts, type RestockRule } from '../core/state';
import { supplierUnlocked } from '../core/stock';
import { G, persist } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

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

/** Màn Quy tắc: "Khi tồn [món] dưới X thì nhập Y từ [mối]" và chốt sơ đồ kệ cho nhân viên kho. */
export class RulesScene extends Phaser.Scene {
  private list!: ScrollArea;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestions: ReturnType<typeof unlockedProducts> = [];
  private suggestionsTop = 0;
  private suggestionsLayer: Phaser.GameObjects.Container | null = null;
  private suggestionsWindow = '';
  private categoryFilter: ProductFilter = 'all';
  private filterTop = 0;

  constructor() {
    super('Rules');
  }

  create(): void {
    setupCamera(this);
    this.categoryFilter = 'all';
    pageFrame(this, '⚙️ Quy tắc tự động', () => { this.flushPendingPersist(); persist(); this.scene.start('Morning'); }, 'Chạy mỗi buổi sáng theo thứ tự ưu tiên');
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8, () => this.renderSuggestionsWindow());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.flushPendingPersist());
    this.render();
  }

  /** Gộp các lần chạm nhanh để tránh tuần tự hóa và ghi toàn bộ save cho từng lần bấm. */
  private queuePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      persist();
    }, 250);
  }

  private flushPendingPersist(): void {
    if (!this.persistTimer) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    persist();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    this.suggestionsLayer = null;
    this.suggestionsWindow = '';
    let y = 4;
    y = this.planogramCard(y);
    if (!autoRestockUnlocked(s)) {
      this.list.add(txt(this, W / 2, y + 30, `Đặt hàng tự động mở ở level ${DATA.levels.levels.find((l) => l.features?.includes('autorestock'))?.level}.`, { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 80);
      return;
    }
    this.list.add(txt(this, 14, y, `Quy tắc (${s.rules.length}) — trên cùng ưu tiên nhất khi thiếu tiền`, { size: 12, bold: true }));
    y += 22;
    s.rules.forEach((rule, i) => { y = this.ruleCard(rule, i, y); });
    y += 8;
    this.list.add(txt(this, 14, y, 'Thêm quy tắc (gợi ý theo bán trung bình 7 ngày)', { size: 12, bold: true }));
    y += 22;
    this.filterTop = y;
    const cols = 5;
    const gap = 3;
    const buttonW = (W - 20 - gap * (cols - 1)) / cols;
    FILTERS.forEach(({ id, label }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.list.add(new Button(this, 10 + buttonW / 2 + col * (buttonW + gap), y + 12 + row * 27, {
        w: buttonW, h: 24, radius: 4, label, size: 10,
        color: id === this.categoryFilter ? C.red : C.wood,
        onTap: this.list.guard(() => {
          this.categoryFilter = id;
          this.render();
          this.list.setScroll(Math.max(0, this.filterTop - 34));
        }),
      }));
    });
    y += 64;
    const has = new Set(s.rules.map((r) => r.productId));
    this.suggestions = unlockedProducts(s.level, s).filter((p) => !has.has(p.id) && (this.categoryFilter === 'all' || p.category === this.categoryFilter));
    this.suggestionsTop = y;
    const suggestionsHeight = this.suggestions.length * 48 + 20;
    this.suggestionsLayer = this.add.container(0, y + suggestionsHeight / 2).setSize(W, suggestionsHeight);
    this.list.add(this.suggestionsLayer);
    if (!this.suggestions.length) this.list.add(txt(this, W / 2, y + 28, 'Chưa có món để thêm trong danh mục này.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] }));
    this.list.setHeight(y + Math.max(60, this.suggestions.length * 48 + 20));
    this.renderSuggestionsWindow(true);
  }

  /** Chỉ dựng icon/nút của các gợi ý đang thấy trên màn hình. */
  private renderSuggestionsWindow(force = false): void {
    const layer = this.suggestionsLayer;
    if (!layer || !this.suggestions.length) return;
    const rowHeight = 48;
    const first = Math.max(0, Math.floor((this.list.scrollOffset - this.suggestionsTop) / rowHeight) - 2);
    const visibleRows = Math.ceil((this.list.bottom - this.list.top) / rowHeight);
    const end = Math.min(this.suggestions.length, first + visibleRows + 4);
    const key = `${first}:${end}`;
    if (!force && key === this.suggestionsWindow) return;
    this.suggestionsWindow = key;
    layer.removeAll(true);
    for (let i = first; i < end; i++) {
      const p = this.suggestions[i];
      const y = i * rowHeight - layer.height / 2;
      const sug = suggestRule(G.state, p.id);
      layer.add(card(this, 8, y, W - 16, 44));
      layer.add(productIcon(this, 30, y + 22, p, 28));
      layer.add(txt(this, 52, y + 6, p.name, { size: 12, bold: true }));
      layer.add(txt(this, 52, y + 24, `Còn ${stockLevel(G.state, p.id)} · gợi ý dưới ${sug.threshold} thì nhập ${sug.qty}`, { size: 10, color: HEX.muted }));
      layer.add(new Button(this, W - 50, y + 22, {
        w: 70, h: 30, label: '+ Thêm', size: 11, color: C.green,
        onTap: this.list.guard(() => {
          addRule(G.state, { productId: p.id, threshold: sug.threshold, qty: sug.qty, supplierId: 'co_tu' });
          play('pick');
          persist();
          this.render();
        }),
      }));
    }
  }

  private planogramCard(y: number): number {
    const s = G.state;
    this.list.add(card(this, 8, y, W - 16, 74, 0xe8f1fb));
    this.list.add(txt(this, 18, y + 8, '📐 Sơ đồ kệ', { size: 14, bold: true }));
    const stockerUnlocked = hasFeature(s.level, 'stocker');
    const status = s.planogram
      ? stockerUnlocked
        ? 'Đã chốt. Nhân viên kho/bổ sung kệ bày theo sơ đồ này.'
        : 'Đã lưu sơ đồ. Nhân viên kho sẽ làm theo khi mở khóa.'
      : stockerUnlocked
        ? 'Chưa chốt. Bày kệ như ý rồi bấm "Chốt" để nhân viên làm theo.'
        : 'Chốt cách bày hiện tại. Nhân viên kho làm theo sau khi mở khóa.';
    this.list.add(txt(this, 18, y + 28, status, { size: 10, color: HEX.muted, wrap: W - 150 }));
    this.list.add(new Button(this, W - 66, y + 36, {
      w: 104, h: 34, label: s.planogram ? '📐 Chốt lại' : '📐 Chốt', size: 12, color: C.blue,
      onTap: this.list.guard(() => {
        lockPlanogram(s);
        play('pick');
        persist();
        toast(this, 'Đã chốt sơ đồ kệ theo cách bày hiện tại');
        this.render();
      }),
    }));
    return y + 82;
  }

  private ruleCard(rule: RestockRule, index: number, y: number): number {
    const s = G.state;
    const p = product(rule.productId);
    const h = 104;
    const sp = supplier(rule.supplierId);
    this.list.add(card(this, 8, y, W - 16, h - 6));
    this.list.add(productIcon(this, 30, y + 22, p, 28));
    this.list.add(txt(this, 52, y + 8, `${index + 1}. ${p.name}`, { size: 13, bold: true }));
    this.list.add(txt(this, 52, y + 26, `Đang có ${stockLevel(s, p.id)} (kho + kệ + chờ giao)`, { size: 10, color: HEX.muted }));
    const step = (field: 'threshold' | 'qty', delta: number) => this.list.guard(() => {
      rule[field] = Math.max(field === 'qty' ? 1 : 0, rule[field] + delta);
      thresholdValue.setText(String(rule.threshold));
      qtyValue.setText(String(rule.qty));
      estimatedCost.setText(`≈ ${formatMoney(p.cost * rule.qty)}/lần`);
      this.queuePersist();
    });
    const row = y + 56;
    this.list.add(txt(this, 18, row, 'Dưới', { size: 11, origin: [0, 0.5] }));
    this.list.add(new Button(this, 64, row, { w: 26, h: 26, label: '−', size: 14, color: C.woodLight, onTap: step('threshold', -1) }));
    const thresholdValue = txt(this, 92, row, String(rule.threshold), { size: 13, bold: true, origin: [0.5, 0.5] });
    this.list.add(thresholdValue);
    this.list.add(new Button(this, 120, row, { w: 26, h: 26, label: '+', size: 14, color: C.green, onTap: step('threshold', 1) }));
    this.list.add(txt(this, 140, row, 'nhập', { size: 11, origin: [0, 0.5] }));
    this.list.add(new Button(this, 186, row, { w: 26, h: 26, label: '−', size: 14, color: C.woodLight, onTap: step('qty', -5) }));
    const qtyValue = txt(this, 216, row, String(rule.qty), { size: 13, bold: true, origin: [0.5, 0.5] });
    this.list.add(qtyValue);
    this.list.add(new Button(this, 246, row, { w: 26, h: 26, label: '+', size: 14, color: C.green, onTap: step('qty', 5) }));
    const other = DATA.suppliers.find((x) => x.id !== rule.supplierId && supplierUnlocked(s, x.id));
    this.list.add(new Button(this, W - 50, row, {
      w: 76, h: 26, label: `${sp.icon} ${sp.name.replace('Đại lý ', '')}`, size: 10, color: C.wood,
      onTap: this.list.guard(() => {
        if (!other) { toast(this, 'Chưa mở mối sỉ khác'); return; }
        rule.supplierId = other.id;
        persist();
        this.render();
      }),
    }));
    const by = y + 84;
    const estimatedCost = txt(this, 18, by, `≈ ${formatMoney(p.cost * rule.qty)}/lần`, { size: 10, color: HEX.muted, origin: [0, 0.5] });
    this.list.add(estimatedCost);
    this.list.add(new Button(this, W - 150, by, { w: 44, h: 22, label: '▲', size: 11, color: C.blue, onTap: this.list.guard(() => { moveRule(s, rule.productId, -1); persist(); this.render(); }) }).setEnabled(index > 0));
    this.list.add(new Button(this, W - 100, by, { w: 44, h: 22, label: '▼', size: 11, color: C.blue, onTap: this.list.guard(() => { moveRule(s, rule.productId, 1); persist(); this.render(); }) }).setEnabled(index < s.rules.length - 1));
    this.list.add(new Button(this, W - 44, by, { w: 56, h: 22, label: 'Xóa', size: 11, color: C.red, onTap: this.list.guard(() => { removeRule(s, rule.productId); persist(); this.render(); }) }));
    return y + h;
  }
}
