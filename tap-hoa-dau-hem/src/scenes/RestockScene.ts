import Phaser from 'phaser';
import { DATA, product, supplier, type Category } from '../core/data';
import type { LiveShopCommand } from '../core/liveSession';
import { formatMoney, priceOf, shelfQty, unlockedProducts, warehouseQty, warehouseTotals } from '../core/state';
import {
  assignCounterSlot, assignSlot, autoArrange, buyStock, checkCart, clearSlot, hasPlaceFor, refillCounterSlot, refillSlot,
  suggestCart, supplierUnlocked, unitCost, warehouseCapacity, warehouseCellsUsed, type Cart,
} from '../core/stock';
import { G, persist } from '../game';
import { dispatchLiveCommand } from '../services/liveShop';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { ShelfView, ZONE_NAMES, placeErrorText } from '../ui/shelves';
import { play } from '../ui/sound';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

type Tab = 'buy' | 'arrange';

const ROW_H = 62;
const FOOT_Y = H - 96;
const TAB_Y = PAGE_TOP + 18;
const SHELF_TOP = PAGE_TOP + 46;
const FLOOR_Y = SHELF_TOP + 198;
const CHIP_TOP = FLOOR_Y + 48;
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
  private supplierId = 'co_tu';
  private busy = false;
  private selected: string | null = null;
  private tabBtns!: Record<Tab, Button>;
  private buyLayer!: Phaser.GameObjects.Container;
  private arrangeLayer!: Phaser.GameObjects.Container;
  private list!: ScrollArea;
  private chips!: ScrollArea;
  private supplierBtns: Record<string, Button> = {};
  private cartText!: Phaser.GameObjects.Text;
  private cartWarn!: Phaser.GameObjects.Text;
  private buyBtn!: Button;
  private shelves!: ShelfView;
  private whLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('Restock');
  }

  create(data: { tab?: Tab } = {}): void {
    setupCamera(this);
    this.cart = {};
    this.busy = false;
    this.selected = null;
    this.supplierBtns = {};
    if (!supplierUnlocked(G.state, this.supplierId)) this.supplierId = 'co_tu';
    pageFrame(this, '📦 Nhập & bày hàng', () => this.close(), '⏸ Tiệm đang tạm dừng');
    this.tabBtns = {
      buy: new Button(this, W / 4 + 4, TAB_Y, { w: W / 2 - 16, h: 34, label: '🛒 Nhập hàng', size: 14, onTap: () => this.setTab('buy') }),
      arrange: new Button(this, (W * 3) / 4 - 4, TAB_Y, { w: W / 2 - 16, h: 34, label: '🧺 Bày kệ', size: 14, onTap: () => this.setTab('arrange') }),
    };
    this.buildBuy();
    this.buildArrange();
    const onLiveUpdated = () => { if (G.liveSnapshot) this.refresh(); };
    window.addEventListener('thdh-live-updated', onLiveUpdated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('thdh-live-updated', onLiveUpdated));
    this.setTab(data.tab ?? 'buy');
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.selected = null;
    this.tabBtns.buy.setColor(tab === 'buy' ? C.red : C.wood);
    this.tabBtns.arrange.setColor(tab === 'arrange' ? C.red : C.wood);
    this.buyLayer.setVisible(tab === 'buy');
    this.list.content.setVisible(tab === 'buy');
    this.arrangeLayer.setVisible(tab === 'arrange');
    this.chips.content.setVisible(tab === 'arrange');
    this.refresh();
  }

  private refresh(): void {
    if (this.tab === 'buy') this.renderBuy();
    else this.renderArrange();
  }

  // ---------- Nhập hàng ----------

  private buildBuy(): void {
    this.buyLayer = this.add.container(0, 0);
    const top = TAB_Y + 26;
    const suppliers = DATA.suppliers.filter((sp) => supplierUnlocked(G.state, sp.id));
    if (suppliers.length > 1) {
      suppliers.forEach((sp, i) => {
        const b = new Button(this, 64 + i * 118, top + 10, { w: 112, h: 22, size: 11, label: `${sp.icon} ${sp.name}`, color: C.wood, onTap: () => {
          this.supplierId = sp.id;
          this.cart = {};
          this.renderBuy();
        } });
        this.supplierBtns[sp.id] = b;
        this.buyLayer.add(b);
      });
    } else {
      this.buyLayer.add(txt(this, 14, top + 3, '🧑‍🌾 Mối sỉ Cô Tư · giao ngay vào kho', { size: 12, color: HEX.muted }));
    }
    this.list = new ScrollArea(this, top + 24, FOOT_Y - 4);

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, FOOT_Y, W, H - FOOT_Y);
    this.cartText = txt(this, 12, FOOT_Y + 8, '', { size: 12, bold: true, color: HEX.cream });
    this.cartWarn = txt(this, 12, FOOT_Y + 26, '', { size: 11, color: '#ffb4a8', wrap: W - 24 });
    const suggest = new Button(this, 60, H - 24, { w: 100, h: 36, label: '🪄 Gợi ý', color: C.blue, size: 13, onTap: () => {
      this.cart = suggestCart(G.state, this.supplierId);
      if (!Object.keys(this.cart).length) toast(this, 'Hàng còn đủ, hoặc hết tiền/chỗ kho rồi!', H * 0.5);
      this.renderBuy();
    } });
    const clear = new Button(this, 150, H - 24, { w: 68, h: 36, label: 'Xóa giỏ', color: C.grey, size: 12, onTap: () => { this.cart = {}; this.renderBuy(); } });
    this.buyBtn = new Button(this, W - 74, H - 24, { w: 128, h: 40, label: 'Nhập hàng', color: C.green, size: 15, onTap: () => void this.buy() });
    this.buyLayer.add([foot, this.cartText, this.cartWarn, suggest, clear, this.buyBtn]);
  }

  private products() {
    return unlockedProducts(G.state.level, G.state).filter((p) => p.behindCounter || hasPlaceFor(G.state, p));
  }

  private renderBuy(): void {
    const s = G.state;
    for (const [id, b] of Object.entries(this.supplierBtns)) b.setColor(id === this.supplierId ? C.red : C.wood);
    this.list.clear();
    // Món khách hỏi mà hết hàng hôm nay lên đầu danh sách.
    const items = this.products().sort((a, b) => (s.today.missed[b.id] ?? 0) - (s.today.missed[a.id] ?? 0));
    items.forEach((p, i) => {
      const y = i * ROW_H;
      const missed = s.today.missed[p.id] ?? 0;
      const onShelf = p.behindCounter ? s.counter.filter((slot) => slot.productId === p.id).reduce((sum, slot) => sum + slot.qty, 0) : shelfQty(s, p.id);
      const inWh = warehouseQty(s, p.id);
      const q = this.cart[p.id] ?? 0;
      const cy = y + ROW_H / 2 - 1;
      this.list.add([
        card(this, 8, y + 2, W - 16, ROW_H - 6, missed > 0 ? 0xfcf1ed : C.panel),
        productIcon(this, 32, cy, p, 36),
        txt(this, 56, y + 8, p.name, { size: 13, bold: true }),
        txt(this, 56, y + 25, `Nhập ${formatMoney(unitCost(s, p.id, this.supplierId))} · bán ${formatMoney(priceOf(p.id, s))}`, { size: 10, color: HEX.muted }),
        txt(this, 56, y + 40, `${p.behindCounter ? 'Quầy' : 'Kệ'} ${onShelf} · Kho ${inWh}${missed ? ` · thiếu ${missed}` : ''}`, { size: 10, bold: missed > 0, color: missed > 0 || onShelf + inWh === 0 ? HEX.red : HEX.green }),
        new Button(this, 222, cy, { w: 32, h: 36, label: '−', color: C.woodLight, size: 17, onTap: this.list.guard(() => this.changeQty(p.id, -1)) }).setEnabled(q > 0),
        txt(this, 254, cy, String(q), { size: 15, bold: true, origin: [0.5, 0.5] }),
        new Button(this, 286, cy, { w: 32, h: 36, label: '+', color: C.green, size: 17, onTap: this.list.guard(() => this.changeQty(p.id, 1)) }),
        new Button(this, 326, cy, { w: 40, h: 36, label: '+10', color: C.greenDark, size: 12, onTap: this.list.guard(() => this.changeQty(p.id, 10)) }),
      ]);
    });
    this.list.setHeight(items.length * ROW_H + 8);

    const check = checkCart(s, this.cart, this.supplierId);
    const sp = supplier(this.supplierId);
    this.cartText.setText(`Giỏ: ${formatMoney(check.total)} · Tiền: ${formatMoney(s.money)} · Kho ${check.cells}/${warehouseCapacity(s)} ô`);
    this.cartWarn.setText(
      !check.ok && check.reason === 'money' ? `Thiếu ${formatMoney(check.missing)}`
        : !check.ok && check.reason === 'space' ? 'Kho đầy'
          : !check.ok && check.reason === 'min-order' ? `Đơn tối thiểu ${formatMoney(sp.minOrder)} (thiếu ${formatMoney(check.missing)})`
            : sp.delayDays > 0 && Object.keys(this.cart).length ? `Giao 15:00 ngày ${s.day + sp.delayDays}`
              : '',
    );
    this.buyBtn.setText(sp.delayDays > 0 ? 'Đặt hàng' : 'Nhập hàng');
    this.buyBtn.setEnabled(check.ok && !this.busy);
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
    const sp = supplier(this.supplierId);
    const cart = { ...this.cart };
    const total = checkCart(G.state, cart, this.supplierId).total;
    if (G.liveSnapshot) {
      this.busy = true;
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
    toast(this, `Đã nhập hàng: -${formatMoney(total)}\nGiờ bày hàng lên kệ nhé!`, H * 0.5, C.greenDark);
    // Nhập xong chuyển luôn sang bày kệ, như buổi sáng.
    this.setTab('arrange');
  }

  // ---------- Bày kệ ----------

  private buildArrange(): void {
    this.arrangeLayer = this.add.container(0, 0);
    this.shelves = new ShelfView(this, SHELF_TOP, {
      onSlotTap: (r, c) => this.onSlotTap(r, c),
      onRefill: (r, c) => this.shelfAction({ type: 'refillShelf', shelf: r, slot: c }, () => refillSlot(G.state, r, c)),
      onRemove: (r, c) => this.shelfAction({ type: 'clearShelf', shelf: r, slot: c }, () => clearSlot(G.state, r, c)),
    }, G.state);
    const g = this.add.graphics();
    g.fillStyle(C.floorB, 1).fillRect(0, FLOOR_Y, W, FOOT_Y - FLOOR_Y);
    g.fillStyle(C.woodDark, 1).fillRect(0, FLOOR_Y, W, 4);
    this.whLabel = txt(this, 12, FLOOR_Y + 9, '', { size: 14, bold: true, color: HEX.white });
    this.hint = txt(this, 12, FLOOR_Y + 30, '', { size: 11, color: HEX.cream, wrap: W - 24 });
    this.chips = new ScrollArea(this, CHIP_TOP, FOOT_Y - 4);

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, FOOT_Y, W, H - FOOT_Y);
    const note = txt(this, 12, FOOT_Y + 10, 'Bày xong bấm "Bán tiếp" để mở lại tiệm.', { size: 11, color: HEX.cream });
    const auto = new Button(this, 76, H - 30, { w: 132, h: 46, label: '✨ Tự bày', color: C.blue, onTap: () => this.autoArrange() });
    const resume = new Button(this, W - 84, H - 30, { w: 152, h: 48, label: 'Bán tiếp ▶', color: C.red, size: 17, onTap: () => this.close() });
    this.arrangeLayer.add([this.shelves, g, this.whLabel, this.hint, foot, note, auto, resume]);
  }

  private renderArrange(): void {
    const s = G.state;
    this.shelves.render(s, { mode: 'arrange' });
    this.whLabel.setText(`📦 Kho · ${warehouseCellsUsed(s.warehouse)}/${warehouseCapacity(s)} ô`);
    this.hint.setText(this.selected
      ? `Chạm ô kệ để bày ${product(this.selected).name}`
      : 'Chạm món rồi chạm ô kệ (ô trống hoặc thay món). Hàng 🔐 chạm là vào quầy.');
    this.chips.clear();
    const items = Object.entries(warehouseTotals(s)).filter(([, q]) => q > 0);
    if (!items.length) {
      this.chips.add(txt(this, W / 2, 30, 'Kho trống. Qua tab "Nhập hàng" để mua thêm.', { size: 13, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: 300 }));
      this.chips.setHeight(60);
      return;
    }
    items.forEach(([id, q], i) => {
      const x = 31 + (i % CHIP_COLS) * 59.5;
      const y = CHIP_H / 2 + 4 + Math.floor(i / CHIP_COLS) * (CHIP_H + 6);
      const p = product(id);
      const sel = this.selected === id;
      const bg = this.add.graphics();
      bg.fillStyle(sel ? C.yellow : C.slot, 1).fillRoundedRect(-CHIP_W / 2, -CHIP_H / 2, CHIP_W, CHIP_H, 10);
      bg.lineStyle(sel ? 3 : 2, sel ? C.red : C.slotEdge, 1).strokeRoundedRect(-CHIP_W / 2, -CHIP_H / 2, CHIP_W, CHIP_H, 10);
      const parts: Phaser.GameObjects.GameObject[] = [bg, productIcon(this, 0, -8, p, 32), txt(this, 0, CHIP_H / 2 - 10, `x${q}`, { size: 12, bold: true, origin: [0.5, 0.5] })];
      if (p.behindCounter) parts.push(txt(this, -CHIP_W / 2 + 3, -CHIP_H / 2 + 2, '🔐', { size: 10, emoji: true }));
      const chip = this.add.container(x, y, parts).setSize(CHIP_W, CHIP_H).setInteractive({ useHandCursor: true });
      chip.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (ptr.getDistance() > 10 || !this.chips.inView(ptr.worldY)) return;
        play('tap');
        if (p.behindCounter) { this.toCounter(id); return; }
        this.selected = sel ? null : id;
        this.renderArrange();
      });
      this.chips.add(chip);
    });
    this.chips.setHeight(Math.ceil(items.length / CHIP_COLS) * (CHIP_H + 6) + 8);
  }

  private onSlotTap(r: number, c: number): void {
    const slot = G.state.shelves[r]?.[c];
    if (!slot) return;
    if (this.selected) {
      const id = this.selected;
      this.shelfAction({ type: 'assignShelf', shelf: r, slot: c, productId: id }, () => assignSlot(G.state, r, c, id), () => {
        if (warehouseQty(G.state, id) <= 0) this.selected = null;
      });
    } else if (slot.productId) {
      this.shelfAction({ type: 'refillShelf', shelf: r, slot: c }, () => refillSlot(G.state, r, c));
    } else {
      toast(this, 'Chọn một món trong kho trước', H * 0.62);
    }
  }

  /** Hàng sau quầy: nạp vào ô quầy đang bày món đó, không có thì dùng ô quầy trống. */
  private toCounter(id: string): void {
    const counter = G.state.counter;
    let index = counter.findIndex((slot) => slot.productId === id);
    if (index < 0) index = counter.findIndex((slot) => !slot.productId || slot.qty === 0);
    if (index < 0) { toast(this, 'Quầy đã kín món khác. Sắp lại quầy vào buổi sáng.', H * 0.62, C.redDark); return; }
    const assign = counter[index].productId === id;
    this.shelfAction(
      assign ? { type: 'refillCounter', slot: index } : { type: 'assignCounter', slot: index, productId: id },
      () => (assign ? refillCounterSlot(G.state, index) : assignCounterSlot(G.state, index, id)),
      () => toast(this, `Đã đưa ${product(id).name} vào quầy`, H * 0.62, C.greenDark),
    );
  }

  private autoArrange(): void {
    if (G.liveSnapshot) { void this.liveCommand({ type: 'autoArrange' }).then(() => this.renderArrange()); return; }
    const unplaced = autoArrange(G.state);
    play('pick');
    persist();
    this.renderArrange();
    if (unplaced.length) {
      const groups = [...new Set(unplaced.map((id) => ZONE_NAMES[product(id).category as Exclude<Category, 'counter'>]?.toLowerCase() ?? 'sau quầy'))].join(', ');
      toast(this, `Không đủ kệ/tủ cho nhóm: ${groups} (${unplaced.length} món)`, H * 0.62, C.redDark);
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
