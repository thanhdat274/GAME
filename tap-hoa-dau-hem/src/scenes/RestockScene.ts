import Phaser from 'phaser';
import { DATA, product, supplier, type Category } from '../core/data';
import type { LiveShopCommand } from '../core/liveSession';
import { activeShopType } from '../core/shopTypes';
import { formatMoney, priceOf, shelfQty, unlockedProducts, usableShelves, warehouseQty, warehouseTotals } from '../core/state';
import {
  assignCounterSlot, assignSlot, buyStock, canRefill, checkCart, clearSlot, counterFreeForNew, hasPlaceFor, planNewProducts, refillSlot, slotFreeForNew,
  suggestRestockCart, supplierUnlocked, unitCost, warehouseCapacity, warehouseCellsUsed, type Cart,
} from '../core/stock';
import { G, persist } from '../game';
import { dispatchLiveCommand } from '../services/liveShop';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, pageFrame } from '../ui/page';
import { ROW_PITCH, SHELF_VIEW_ROWS, ShelfView, ZONE_NAMES, placeErrorText } from '../ui/shelves';
import { play } from '../ui/sound';
import { Button, rowLayout, toast } from '../ui/widgets';
import { ChipGrid } from '../ui/chipGrid';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

type Tab = 'buy' | 'arrange';
type ProductFilter = Category | 'all';

const ROW_H = 74;
const FOOT_H = 104;
const FOOT_Y = H - FOOT_H;
const TAB_Y = PAGE_TOP + 18;
const SHELF_TOP = PAGE_TOP + 46;
const CHIP_COLS = 6;
const CHIP_W = 54;
const CHIP_H = 58;

/**
 * Nhập và bày thêm hàng giữa giờ bán: phủ lên màn bán hàng, tiệm tạm dừng tới khi quay lại.
 * Tab "Nhập hàng" mua từ mối sỉ; tab "Bày kệ" đưa hàng trong kho lên kệ (kể cả món chưa có ô).
 */
export class RestockScene extends Phaser.Scene {
  private tab: Tab = 'buy';
  private cart: Cart = {};
  /** Món vừa được gợi ý (xếp lên đầu danh sách, giữ thứ tự khi bấm +/−). */
  private suggested = new Set<string>();
  private supplierId = 'co_tu';
  private busy = false;
  /** Tiệm chỉ bán ở quầy (tiệm xôi): chỉ nhập nguyên liệu, không có tab bày kệ. */
  private counterShop = false;
  private selected: string | null = null;
  private tabBtns!: Record<Tab, Button>;
  private buyLayer!: Phaser.GameObjects.Container;
  private arrangeLayer!: Phaser.GameObjects.Container;
  private list!: ScrollArea;
  private chips!: ScrollArea;
  private supplierBtns: Record<string, Button> = {};
  private categoryBtns: { filter: ProductFilter; button: Button }[] = [];
  private categoryFilter: ProductFilter = 'all';
  private supplierNote: Phaser.GameObjects.Text | null = null;
  private cartText!: Phaser.GameObjects.Text;
  private cartWarn!: Phaser.GameObjects.Text;
  private buyBtn!: Button;
  private shelves!: ShelfView;
  private whLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private arrangeBusy = false;
  private arrangeButton!: Button;
  private chipGrid!: ChipGrid;
  private chipsEmpty!: Phaser.GameObjects.Text;
  private renderingBuy = false;
  private buyRenderedStart = -1;
  private buyBuilt = false;
  private arrangeBuilt = false;

  private get shelfRows(): number {
    return SHELF_VIEW_ROWS;
  }
  private get floorY(): number {
    return SHELF_TOP + this.shelfRows * ROW_PITCH + 10;
  }
  private get chipTop(): number {
    // Dòng hướng dẫn có thể xuống 2 dòng: khung chip bắt đầu dưới nó để khỏi bị che.
    return this.floorY + 60;
  }

  constructor() {
    super('Restock');
  }

  create(data: { tab?: Tab } = {}): void {
    setupCamera(this);
    this.cart = {};
    this.busy = false;
    this.selected = null;
    this.supplierBtns = {};
    this.categoryBtns = [];
    this.categoryFilter = 'all';
    this.buyBuilt = false;
    this.arrangeBuilt = false;
    this.supplierNote = null;
    if (!supplierUnlocked(G.state, this.supplierId)) this.supplierId = 'co_tu';
    // Tiệm chỉ bán ở quầy (tiệm xôi) không có kệ: màn này chỉ còn phần nhập nguyên liệu.
    this.counterShop = activeShopType(G.state).def.service === 'counter';
    pageFrame(this, this.counterShop ? '📦 Nhập nguyên liệu' : '📦 Nhập & bày hàng', () => this.close(), '⏸ Tiệm đang tạm dừng');
    this.tabBtns = {
      buy: new Button(this, 92, TAB_Y, { w: 154, h: 36, radius: 5, label: '🛒 Nhập hàng', size: 13.5, onTap: () => this.setTab('buy') }),
      arrange: new Button(this, 268, TAB_Y, { w: 154, h: 36, radius: 5, label: '🧺 Bày kệ', size: 13.5, onTap: () => this.setTab('arrange') }),
    };
    if (this.counterShop) {
      this.tabBtns.arrange.setVisible(false);
    }
    // Chỉ dựng tab người chơi sắp mở. Màn bày kệ có nhiều đối tượng Phaser;
    // trì hoãn nó sẽ giảm công việc đồng bộ khi vừa vào màn nhập hàng.
    this.buyLayer = this.add.container(0, 0);
    this.arrangeLayer = this.add.container(0, 0);
    const onLiveUpdated = () => { if (G.liveSnapshot) this.refresh(); };
    window.addEventListener('thdh-live-updated', onLiveUpdated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('thdh-live-updated', onLiveUpdated));
    this.setTab(this.counterShop ? 'buy' : data.tab ?? 'buy');
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.selected = null;
    this.ensureTabBuilt(tab);
    this.tabBtns.buy.setColor(tab === 'buy' ? C.red : C.wood);
    this.tabBtns.arrange.setColor(tab === 'arrange' ? C.red : C.wood);
    this.buyLayer.setVisible(this.buyBuilt && tab === 'buy');
    if (this.buyBuilt) this.list.content.setVisible(tab === 'buy');
    this.arrangeLayer.setVisible(this.arrangeBuilt && tab === 'arrange');
    if (this.arrangeBuilt) this.chips.content.setVisible(tab === 'arrange');
    this.refresh();
  }

  private ensureTabBuilt(tab: Tab): void {
    if (tab === 'buy' && !this.buyBuilt) {
      this.buyBuilt = true;
      this.buildBuy();
    } else if (tab === 'arrange' && !this.arrangeBuilt) {
      this.arrangeBuilt = true;
      this.buildArrange();
    }
  }

  private refresh(): void {
    if (this.tab === 'buy') this.renderBuy();
    else this.renderArrange();
  }

  // ---------- Nhập hàng ----------

  private buildBuy(): void {
    const top = TAB_Y + 28;
    const suppliers = DATA.suppliers.filter((sp) => supplierUnlocked(G.state, sp.id));
    if (suppliers.length > 1) {
      const row = rowLayout(suppliers.length, { gap: 8 });
      suppliers.forEach((sp, i) => {
        const b = new Button(this, row.x(i), top + 10, { w: row.w, h: 28, size: 11.5, radius: 5, label: `${sp.icon} ${sp.name}`, color: C.wood, onTap: () => {
          this.supplierId = sp.id;
          this.cart = {};
          this.list.setScroll(0);
          this.renderBuy();
        } });
        this.supplierBtns[sp.id] = b;
        this.buyLayer.add(b);
      });
      this.supplierNote = txt(this, 14, top + 26, '', { size: 10, color: HEX.muted });
      this.buyLayer.add(this.supplierNote);
    } else {
      this.buyLayer.add(txt(this, 14, top + 6, '🧑‍🌾 Mối sỉ Cô Tư · giao ngay vào kho', { size: 12, color: HEX.muted }));
    }
    const filters: { id: ProductFilter; label: string }[] = [
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
    const gridTop = top + (this.supplierNote ? 53 : 39);
    const cols = 5;
    const gap = 3;
    const buttonW = (W - 20 - gap * (cols - 1)) / cols;
    filters.forEach(({ id, label }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const button = new Button(this, 10 + buttonW / 2 + col * (buttonW + gap), gridTop + row * 27, {
        w: buttonW, h: 24, radius: 4, label, size: 10,
        color: id === this.categoryFilter ? C.red : C.wood,
        onTap: () => { this.categoryFilter = id; this.list.setScroll(0); this.renderBuy(); },
      });
      this.categoryBtns.push({ filter: id, button });
      this.buyLayer.add(button);
    });
    const listTop = gridTop + 2 * 27 + 1;
    this.list = new ScrollArea(this, listTop, FOOT_Y - 4, () => {
      if (!this.renderingBuy && this.tab === 'buy' && this.buyWindowStart() !== this.buyRenderedStart) this.renderBuy();
    });

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRoundedRect(0, FOOT_Y, W, FOOT_H, { tl: 8, tr: 8, bl: 0, br: 0 });
    // Nẹp gỗ retro trên đỉnh gờ quầy
    foot.fillStyle(C.woodLight, 1).fillRect(0, FOOT_Y, W, 4);
    foot.fillStyle(0x1a120b, 0.4).fillRect(0, FOOT_Y + 4, W, 2);
    foot.lineStyle(1.5, 0x24150b, 1).strokeRoundedRect(0, FOOT_Y, W, FOOT_H, { tl: 8, tr: 8, bl: 0, br: 0 });

    this.cartText = txt(this, 12, FOOT_Y + 9, '', { size: 12.5, bold: true, color: HEX.cream });
    this.cartWarn = txt(this, 12, FOOT_Y + 28, '', { size: 10.5, color: '#ffb4a8', wrap: W - 24 });
    const suggest = new Button(this, 49, H - 28, { w: 78, h: 38, radius: 5, label: '🪄 Gợi ý', color: C.blue, size: 12.5, onTap: () => {
      const sug = suggestRestockCart(G.state, this.supplierId);
      this.cart = sug.cart;
      this.suggested = new Set(Object.keys(sug.cart));
      if (!Object.keys(this.cart).length) toast(this, 'Hàng còn đủ, hoặc hết tiền/chỗ kho rồi!', H * 0.5);
      else {
        const parts = [
          sug.outOfStock.length ? `${sug.outOfStock.length} món đang hết` : '',
          sug.bestSellers.length ? `${sug.bestSellers.length} món bán chạy` : '',
        ].filter(Boolean);
        toast(this, `🪄 Gợi ý: ${parts.join(' + ')}`, H * 0.5, C.greenDark);
      }
      this.renderBuy();
    } });
    const clear = new Button(this, 126, H - 28, { w: 64, h: 38, radius: 5, label: 'Xóa giỏ', color: C.grey, size: 11.5, onTap: () => { this.cart = {}; this.renderBuy(); } });
    this.buyBtn = new Button(this, 256, H - 28, { w: 172, h: 40, radius: 5, label: 'Nhập hàng', color: C.green, size: 15, onTap: () => void this.buy() });
    this.buyLayer.add([foot, this.cartText, this.cartWarn, suggest, clear, this.buyBtn]);
  }

  private products() {
    // Tiệm xôi không có kệ: nguyên liệu nằm trong kho, không cần chỗ bày.
    if (this.counterShop) return unlockedProducts(G.state.level, G.state);
    return unlockedProducts(G.state.level, G.state).filter((p) => p.behindCounter || hasPlaceFor(G.state, p));
  }

  private renderBuy(): void {
    if (this.renderingBuy) return;
    this.renderingBuy = true;
    try {
    const s = G.state;
    for (const [id, b] of Object.entries(this.supplierBtns)) b.setColor(id === this.supplierId ? C.red : C.wood);
    for (const { filter, button } of this.categoryBtns) button.setColor(filter === this.categoryFilter ? C.red : C.wood);
    this.supplierNote?.setText(supplier(this.supplierId).note);
    this.list.clear();
    // Món vừa gợi ý lên đầu, rồi tới món khách hỏi mà hết hàng hôm nay.
    const items = this.products()
      .filter((p) => this.categoryFilter === 'all' || p.category === this.categoryFilter)
      .sort((a, b) => (this.suggested.has(b.id) ? 1 : 0) - (this.suggested.has(a.id) ? 1 : 0) || (s.today.missed[b.id] ?? 0) - (s.today.missed[a.id] ?? 0));
    const viewportRows = Math.ceil((this.list.bottom - this.list.top) / ROW_H);
    const start = items.length ? Math.max(0, Math.floor(this.list.scrollOffset / ROW_H) - 2) : 0;
    const end = Math.min(items.length, start + viewportRows + 4);
    this.list.setHeight(items.length ? items.length * ROW_H + 8 : 56);
    this.buyRenderedStart = start;
    if (!items.length) {
      this.list.add(txt(this, W / 2, 28, 'Chưa có sản phẩm khả dụng trong nhóm này.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] }));
    }
    items.slice(start, end).forEach((p, offset) => {
      const i = start + offset;
      const y = i * ROW_H;
      const missed = s.today.missed[p.id] ?? 0;
      const onShelf = p.behindCounter ? s.counter.filter((slot) => slot.productId === p.id).reduce((sum, slot) => sum + slot.qty, 0) : shelfQty(s, p.id);
      const inWh = warehouseQty(s, p.id);
      const q = this.cart[p.id] ?? 0;
      const cy = y + ROW_H / 2 - 1;

      // Nền thẻ sản phẩm phong cách giấy nhãn tiệm tạp hóa xưa
      const cardBg = this.add.graphics();
      const isSelected = q > 0;
      cardBg.fillStyle(0x1a120b, 0.15).fillRoundedRect(8, y + 3.5, W - 16, ROW_H - 6, 6);
      cardBg.fillStyle(missed > 0 ? 0xfcf4f0 : isSelected ? 0xfbfbf2 : C.panel, 1).fillRoundedRect(8, y + 2, W - 16, ROW_H - 6, 6);
      cardBg.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(9, y + 3, W - 18, ROW_H - 8, 5);
      cardBg.lineStyle(1.5, missed > 0 ? 0xd0604b : isSelected ? C.greenDark : C.panelEdge, 0.95).strokeRoundedRect(8, y + 2, W - 16, ROW_H - 6, 6);

      // Cụm phím máy tính tiền vintage 90s: khung màn LCD ô liu ở giữa, phím cơ vuông 2 bên
      const stepperG = this.add.graphics();
      stepperG.fillStyle(0xd5ddcc, 1).fillRoundedRect(248, cy - 13, 32, 26, 3);
      stepperG.lineStyle(1, 0x828f78, 1).strokeRoundedRect(248, cy - 13, 32, 26, 3);

      const nameTxt = txt(this, 58, y + 10, p.name, { size: 13.5, bold: true });
      const itemsToAdd: Phaser.GameObjects.GameObject[] = [
        cardBg,
        productIcon(this, 33, cy, p, 38),
        nameTxt,
        txt(this, 58, y + 29, `Nhập ${formatMoney(unitCost(s, p.id, this.supplierId))} · bán ${formatMoney(priceOf(p.id, s))}`, { size: 10.5, color: HEX.muted }),
        txt(this, 58, y + 47, this.counterShop ? `Kho ${inWh}` : `${p.behindCounter ? 'Quầy' : 'Kệ'} ${onShelf} · Kho ${inWh}`, { size: 10, bold: false, color: onShelf + inWh === 0 ? HEX.red : HEX.green }),
        stepperG,
        new Button(this, 232, cy, { w: 26, h: 26, radius: 4, label: '−', color: q > 0 ? C.red : C.woodLight, size: 15, onTap: this.list.guard(() => this.changeQty(p.id, -1)) }).setEnabled(q > 0),
        txt(this, 264, cy, String(q), { size: 14, bold: true, color: q > 0 ? '#1b4d24' : '#5a6652', origin: [0.5, 0.5] }),
        new Button(this, 296, cy, { w: 26, h: 26, radius: 4, label: '+', color: C.green, size: 15, onTap: this.list.guard(() => this.changeQty(p.id, 1)) }),
        new Button(this, 332, cy, { w: 32, h: 28, radius: 4, label: '+10', color: C.greenDark, size: 11, onTap: this.list.guard(() => this.changeQty(p.id, 10)) }),
      ];

      if (missed > 0) {
        const tagX = 58 + nameTxt.width + 8;
        const lackTag = txt(this, tagX + 4, y + 11, `thiếu ${missed}`, { size: 9.5, bold: true, color: HEX.white });
        // Draw the badge separately from Text's background fill; the fill can collapse to a thin
        // strip on some mobile WebGL scales while the text texture is being resized.
        const lackBg = this.add.graphics();
        lackBg.fillStyle(C.red, 1).fillRect(tagX, y + 9, lackTag.width + 8, lackTag.height + 4);
        itemsToAdd.push(lackBg, lackTag);
      }

      this.list.add(itemsToAdd);
    });

    const check = checkCart(s, this.cart, this.supplierId);
    const sp = supplier(this.supplierId);
    this.cartText.setText(`Giỏ: ${formatMoney(check.total)} · Tiền: ${formatMoney(s.money)} · Kho: ${check.cells}/${warehouseCapacity(s)} ô`);
    this.cartWarn.setText(
      !check.ok && check.reason === 'money' ? `⚠️ Thiếu ${formatMoney(check.missing)}`
        : !check.ok && check.reason === 'space' ? '⚠️ Kho đầy, không đủ chỗ chứa'
          : !check.ok && check.reason === 'min-order' ? `⚠️ Đơn tối thiểu ${formatMoney(sp.minOrder)} (thiếu ${formatMoney(check.missing)})`
            : sp.delayDays > 0 && Object.keys(this.cart).length ? `🚚 Giao 15:00 ngày ${s.day + sp.delayDays}`
              : sp.invoice === false ? '⚠️ Chợ không xuất hóa đơn: thanh tra thuế có thể phạt'
                : Object.keys(this.cart).length ? '✓ Hàng giao ngay vào kho' : '',
    );
    this.buyBtn.setText(sp.delayDays > 0 ? 'Đặt hàng' : 'Nhập hàng');
    this.buyBtn.setEnabled(!this.busy);
    } finally {
      this.renderingBuy = false;
    }
  }

  private buyWindowStart(): number {
    return Math.max(0, Math.floor(this.list.scrollOffset / ROW_H) - 2);
  }

  private changeQty(id: string, delta: number): void {
    const next = Math.max(0, (this.cart[id] ?? 0) + delta);
    const check = checkCart(G.state, { ...this.cart, [id]: next }, this.supplierId);
    if (delta > 0 && !check.ok && check.reason === 'space') {
      play('error');
      toast(this, 'Kho đầy rồi!', H * 0.5, C.red);
      return;
    }
    if (next === 0) delete this.cart[id];
    else this.cart[id] = next;
    this.renderBuy();
  }

  private async buy(): Promise<void> {
    if (this.busy) return;
    const sp = supplier(this.supplierId);
    const cart = { ...this.cart };
    const check = checkCart(G.state, cart, this.supplierId);
    if (!check.ok) {
      play('error');
      toast(this, {
        empty: 'Chưa chọn món nào.',
        locked: 'Mối sỉ này chưa mở.',
        'min-order': `Đơn tối thiểu ${formatMoney(sp.minOrder)} (thiếu ${formatMoney(check.missing)})`,
        space: 'Kho đầy, không đủ chỗ chứa!',
        money: `Thiếu ${formatMoney(check.missing)}`,
      }[check.reason], H * 0.5, C.red);
      return;
    }
    const total = check.total;
    if (G.liveSnapshot) {
      this.busy = true;
      this.buyBtn.setEnabled(false);
      const ok = await this.liveCommand({ type: 'buyStock', cart, supplierId: this.supplierId });
      this.busy = false;
      if (!ok) { this.renderBuy(); return; }
    } else {
      const res = buyStock(G.state, cart, this.supplierId);
      if (!res.ok) { this.renderBuy(); return; }
      persist();
    }
    this.cart = {};
    play('cash');
    if (sp.delayDays > 0) {
      toast(this, `Đã đặt ${sp.name}: -${formatMoney(total)}\nXe giao 15:00 ngày ${G.state.day + sp.delayDays}.`, H * 0.5, C.greenDark);
      this.renderBuy();
      return;
    }
    if (this.counterShop) {
      toast(this, `Đã nhập nguyên liệu: -${formatMoney(total)}`, H * 0.5, C.greenDark);
      this.renderBuy();
      return;
    }
    toast(this, `Đã nhập hàng: -${formatMoney(total)}\nGiờ bày hàng lên kệ nhé!`, H * 0.5, C.greenDark);
    // Nhập xong chuyển luôn sang bày kệ, như buổi sáng.
    this.setTab('arrange');
  }

  // ---------- Bày kệ ----------

  private buildArrange(): void {
    this.shelves = new ShelfView(this, SHELF_TOP, {
      onSlotTap: (r, c) => this.onSlotTap(r, c),
      onRefill: (r, c) => this.shelfAction({ type: 'refillShelf', shelf: r, slot: c }, () => refillSlot(G.state, r, c)),
      onRemove: (r, c) => {
        // Chỉ dọn ô đã bán hết để đổi món; ô còn hàng giữ nguyên (tránh dọn rồi bày lại để nạp tức thì).
        if ((G.state.shelves[r]?.[c]?.qty ?? 0) > 0) { toast(this, 'Ô còn hàng, đang bán thì chưa dọn được.', H * 0.62); return; }
        this.shelfAction({ type: 'clearShelf', shelf: r, slot: c }, () => clearSlot(G.state, r, c));
      },
    }, G.state, this.shelfRows);
    const g = this.add.graphics();
    g.fillStyle(C.floorB, 1).fillRect(0, this.floorY, W, FOOT_Y - this.floorY);
    g.fillStyle(C.woodDark, 1).fillRect(0, this.floorY, W, 4);
    this.whLabel = txt(this, 12, this.floorY + 9, '', { size: 14, bold: true, color: HEX.white });
    this.hint = txt(this, 12, this.floorY + 30, '', { size: 11, color: HEX.cream, wrap: W - 24 });
    this.chips = new ScrollArea(this, this.chipTop, FOOT_Y - 4);
    this.chipsEmpty = txt(this, W / 2, 30, 'Kho trống. Qua tab "Nhập hàng" để mua thêm.', { size: 13, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: 300 }).setVisible(false);
    this.chips.add(this.chipsEmpty);
    this.chipGrid = new ChipGrid(this, this.chips, {
      cols: CHIP_COLS, chipW: CHIP_W, chipH: CHIP_H, x0: 31, y0: CHIP_H / 2 + 4, pitchX: 59.5, pitchY: CHIP_H + 6,
      onTap: (id, ptr) => this.onChipTap(id, ptr),
    });

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, FOOT_Y, W, H - FOOT_Y);
    const note = txt(this, 12, FOOT_Y + 10, 'Bày xong bấm "Bán tiếp" để mở lại tiệm.', { size: 11, color: HEX.cream });
    this.arrangeButton = new Button(this, 76, H - 38, { w: 132, h: 46, label: '✨ Tự bày', color: C.blue, onTap: () => void this.autoArrange() });
    const resume = new Button(this, W - 84, H - 38, { w: 152, h: 48, label: 'Bán tiếp ▶', color: C.red, size: 17, onTap: () => this.close() });
    this.arrangeLayer.add([this.shelves, g, this.whLabel, this.hint, foot, note, this.arrangeButton, resume]);
  }

  private renderArrange(): void {
    const s = G.state;
    this.shelves.render(s, { mode: 'arrange' });
    this.whLabel.setText(`📦 Kho · ${warehouseCellsUsed(s.warehouse)}/${warehouseCapacity(s)} ô`);
    this.hint.setText(this.selected
      ? `Chạm ô kệ để bày ${product(this.selected).name}`
      : 'Chạm món rồi chạm ô kệ trống để bày. Hàng 🔐 chạm là vào quầy trống.');
    const items = Object.entries(warehouseTotals(s)).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty, selected: this.selected === id }));
    this.chipsEmpty.setVisible(!items.length);
    const height = this.chipGrid.update(items);
    this.chips.setHeight(items.length ? height + 8 : 60);
  }

  private onChipTap(id: string, ptr: Phaser.Input.Pointer): void {
    if (ptr.getDistance() > 10 || !this.chips.inView(ptr.worldY)) return;
    play('tap');
    if (product(id).behindCounter) { this.toCounter(id); return; }
    this.selected = this.selected === id ? null : id;
    this.renderArrange();
  }

  private onSlotTap(r: number, c: number): void {
    const slot = G.state.shelves[r]?.[c];
    if (!slot) return;
    if (this.selected) {
      const id = this.selected;
      // Ô đang bày món khác thì không gán đè; ô cùng món hoặc trống thì nạp/gán bằng nút + xanh.
      if (!slotFreeForNew(G.state, r, c, id)) { this.refillHint(); return; }
      this.shelfAction({ type: 'assignShelf', shelf: r, slot: c, productId: id }, () => assignSlot(G.state, r, c, id), () => {
        if (warehouseQty(G.state, id) <= 0) this.selected = null;
      });
    } else if (slot.productId && slot.qty > 0) {
      this.refillHint();
    } else {
      toast(this, 'Chọn một món trong kho trước', H * 0.62);
    }
  }

  private refillHint(): void {
    toast(this, 'Ô này đang có hàng. Bấm nút + xanh trên ô để nạp thêm.', H * 0.62);
  }

  /** Hàng sau quầy: đưa vào một ô quầy trống (món đang có ở quầy thì không nạp tức thì). */
  private toCounter(id: string): void {
    const counter = G.state.counter;
    if (counter.some((slot) => slot.productId === id && slot.qty > 0)) { toast(this, `${product(id).name} đang có ở quầy rồi.`, H * 0.62); return; }
    const index = counter.findIndex((_, i) => counterFreeForNew(G.state, i, id));
    if (index < 0) { toast(this, 'Quầy không còn ô trống. Sắp lại quầy vào buổi sáng.', H * 0.62, C.redDark); return; }
    this.shelfAction(
      { type: 'assignCounter', slot: index, productId: id },
      () => assignCounterSlot(G.state, index, id),
      () => toast(this, `Đã đưa ${product(id).name} vào quầy`, H * 0.62, C.greenDark),
    );
  }

  /** Tự bày giữa giờ bán: nạp các ô đang có nút + xanh, rồi xếp món chưa có ô vào ô trống hợp lệ. */
  private async autoArrange(): Promise<void> {
    if (this.arrangeBusy) return;
    this.arrangeBusy = true;
    this.arrangeButton.setEnabled(false);
    // Ô cần nạp tính trước khi xếp món mới: món mới chưa có ô nên không trùng với các ô này.
    const refills: { shelf: number; slot: number }[] = [];
    for (const shelf of usableShelves(G.state)) {
      G.state.shelves[shelf].forEach((_, slot) => { if (canRefill(G.state, shelf, slot)) refills.push({ shelf, slot }); });
    }
    const { placements, unplaced } = planNewProducts(G.state);
    try {
      if (!refills.length && !placements.length && !unplaced.length) {
        toast(this, 'Kệ đã đầy, món nào trong kho cũng đã có ô.', H * 0.62);
        return;
      }
      let ok = true;
      for (const { shelf, slot } of refills) {
        if (G.liveSnapshot) { if (!(ok = await this.liveCommand({ type: 'refillShelf', shelf, slot }))) break; }
        else refillSlot(G.state, shelf, slot);
      }
      let placed = 0;
      for (const { shelf, slot, productId } of ok ? placements : []) {
        if (G.liveSnapshot) { if (!(await this.liveCommand({ type: 'assignShelf', shelf, slot, productId }))) break; }
        else assignSlot(G.state, shelf, slot, productId);
        placed++;
      }
      if (refills.length || placed) play('pick');
      if (!G.liveSnapshot) persist();
      this.renderArrange();
      if (unplaced.length) {
        const groups = [...new Set(unplaced.map((id) => ZONE_NAMES[product(id).category as Exclude<Category, 'counter'>]?.toLowerCase() ?? 'sau quầy'))].join(', ');
        const done = [placed ? `xếp ${placed} món mới` : '', refills.length ? `nạp ${refills.length} ô` : ''].filter(Boolean).join(' · ');
        toast(this, `${done ? `Đã ${done}. ` : ''}Không đủ kệ/tủ trống cho nhóm: ${groups} (${unplaced.length} món)`, H * 0.62, C.redDark);
      } else {
        toast(this, `Đã tự bày xong${placed ? ` · ${placed} món mới` : ''}${refills.length ? ` · nạp ${refills.length} ô` : ''}.`, H * 0.62, C.greenDark);
      }
    } catch (error) {
      toast(this, error instanceof Error ? `Tự bày bị lỗi: ${error.message}` : 'Tự bày bị lỗi.', H * 0.5, C.red);
    } finally {
      this.arrangeBusy = false;
      this.arrangeButton.setEnabled(true);
    }
  }

  /** Thao tác kệ: phiên chung gửi lệnh, chơi đơn thì sửa trạng thái rồi lưu. */
  private shelfAction(command: LiveShopCommand, local: () => unknown, after?: () => void): void {
    if (G.liveSnapshot) {
      void this.liveCommand(command).then((ok) => { if (ok) { after?.(); this.renderArrange(); } });
      return;
    }
    try {
      local();
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      play('error');
      toast(this, placeErrorText(e.message), H * 0.62);
      return;
    }
    play('pick');
    persist();
    after?.();
    this.renderArrange();
  }

  private async liveCommand(command: LiveShopCommand): Promise<boolean> {
    try {
      await dispatchLiveCommand(command);
      return true;
    } catch (error) {
      toast(this, error instanceof Error ? error.message : 'Không gửi được thao tác lên phiên chung.', H * 0.5, C.red);
      return false;
    }
  }

  private close(): void {
    const shop = this.scene.get('Shop') as Phaser.Scene & { resumeFromRestock?: () => void };
    this.scene.stop('Restock');
    this.scene.resume('Shop');
    shop.resumeFromRestock?.();
  }
}
