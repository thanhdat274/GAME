import Phaser from 'phaser';
import { DATA, supplier } from '../core/data';
import { formatMoney, priceOf, shelfQty, unlockedProducts, warehouseQty } from '../core/state';
import { buyStock, checkCart, hasPlaceFor, suggestCart, supplierUnlocked, unitCost, warehouseCapacity, type Cart } from '../core/stock';
import { G, persist } from '../game';
import { dispatchLiveCommand } from '../services/liveShop';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const ROW_H = 62;
const FOOT_Y = H - 96;

/** Nhập thêm hàng giữa giờ bán: phủ lên màn bán hàng, tiệm tạm dừng tới khi quay lại. */
export class RestockScene extends Phaser.Scene {
  private cart: Cart = {};
  private supplierId = 'co_tu';
  private list!: ScrollArea;
  private supplierBtns: Record<string, Button> = {};
  private cartText!: Phaser.GameObjects.Text;
  private cartWarn!: Phaser.GameObjects.Text;
  private buyBtn!: Button;
  private busy = false;

  constructor() {
    super('Restock');
  }

  create(): void {
    setupCamera(this);
    this.cart = {};
    this.busy = false;
    this.supplierBtns = {};
    if (!supplierUnlocked(G.state, this.supplierId)) this.supplierId = 'co_tu';
    pageFrame(this, '📦 Nhập thêm hàng', () => this.close(), '⏸ Tiệm đang tạm dừng');

    const suppliers = DATA.suppliers.filter((sp) => supplierUnlocked(G.state, sp.id));
    if (suppliers.length > 1) {
      suppliers.forEach((sp, i) => {
        this.supplierBtns[sp.id] = new Button(this, 64 + i * 118, PAGE_TOP + 14, { w: 112, h: 24, size: 11, label: `${sp.icon} ${sp.name}`, color: C.wood, onTap: () => {
          this.supplierId = sp.id;
          this.cart = {};
          this.render();
        } });
      });
    } else {
      txt(this, 14, PAGE_TOP + 6, '🧑‍🌾 Mối sỉ Cô Tư · giao ngay vào kho', { size: 12, color: HEX.muted });
    }

    this.list = new ScrollArea(this, PAGE_TOP + 34, FOOT_Y - 4);
    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, FOOT_Y, W, H - FOOT_Y);
    this.cartText = txt(this, 12, FOOT_Y + 8, '', { size: 12, bold: true, color: HEX.cream });
    this.cartWarn = txt(this, 12, FOOT_Y + 26, '', { size: 11, color: '#ffb4a8', wrap: W - 150 });
    new Button(this, 60, H - 24, { w: 100, h: 36, label: '🪄 Gợi ý', color: C.blue, size: 13, onTap: () => {
      this.cart = suggestCart(G.state, this.supplierId);
      if (!Object.keys(this.cart).length) toast(this, 'Hàng còn đủ, hoặc hết tiền/chỗ kho rồi!', H * 0.5);
      this.render();
    } });
    new Button(this, 150, H - 24, { w: 68, h: 36, label: 'Xóa giỏ', color: C.grey, size: 12, onTap: () => { this.cart = {}; this.render(); } });
    this.buyBtn = new Button(this, W - 74, H - 24, { w: 128, h: 40, label: 'Nhập hàng', color: C.green, size: 15, onTap: () => void this.buy() });
    this.render();
  }

  private products() {
    return unlockedProducts(G.state.level, G.state).filter((p) => p.behindCounter || hasPlaceFor(G.state, p));
  }

  private render(): void {
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
        txt(this, 56, y + 40, `${p.behindCounter ? 'Quầy' : 'Kệ'} ${onShelf} · Kho ${inWh}${missed ? ` · thiếu ${missed}` : ''}`, { size: 10, bold: missed > 0, color: missed > 0 ? HEX.red : onShelf + inWh === 0 ? HEX.red : HEX.green }),
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
              : 'Vào kho ngay · về tiệm bấm + để nạp kệ',
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
    this.render();
  }

  private async buy(): Promise<void> {
    const sp = supplier(this.supplierId);
    const cart = { ...this.cart };
    const total = checkCart(G.state, cart, this.supplierId).total;
    if (G.liveSnapshot) {
      this.busy = true;
      try {
        await dispatchLiveCommand({ type: 'buyStock', cart, supplierId: this.supplierId });
      } catch (error) {
        toast(this, error instanceof Error ? error.message : 'Không gửi được thao tác lên phiên chung.', H * 0.5, C.red);
        return;
      } finally {
        this.busy = false;
      }
    } else {
      const res = buyStock(G.state, cart, this.supplierId);
      if (!res.ok) { this.render(); return; }
      persist();
    }
    this.cart = {};
    play('cash');
    toast(this, sp.delayDays > 0 ? `Đã đặt ${sp.name}: -${formatMoney(total)}\nXe giao 15:00 ngày ${G.state.day + sp.delayDays}.` : `Đã nhập hàng: -${formatMoney(total)}\nVề tiệm bấm + xanh để nạp kệ.`, H * 0.5, C.greenDark);
    this.render();
  }

  private close(): void {
    const shop = this.scene.get('Shop') as Phaser.Scene & { resumeFromRestock?: () => void };
    this.scene.stop('Restock');
    this.scene.resume('Shop');
    shop.resumeFromRestock?.();
  }
}
