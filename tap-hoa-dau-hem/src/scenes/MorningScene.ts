import Phaser from 'phaser';
import { DATA, product, type Product } from '../core/data';
import { openShop } from '../core/day';
import { shelfCount, totalQty, unlockedProducts, formatMoney } from '../core/state';
import { assignCounterSlot, assignSlot, autoArrange, buyStock, checkCart, suggestCart, clearSlot, refillCounterSlot, refillSlot, warehouseCapacity, warehouseCellsUsed, type Cart } from '../core/stock';
import { G, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { dispatchLiveCommand } from '../services/liveShop';
import { suspendLiveShop } from '../services/liveShop';
import { productIcon } from '../ui/art';
import { Hud, HUD_H } from '../ui/hud';
import { ShelfView } from '../ui/shelves';
import { play, setSoundEnabled, stopMusic } from '../ui/sound';
import { Button, dialog, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';
import { cloudSaveEnabled, firebaseConfigured, hasAuthHint } from '../services/firebase';

type Tab = 'buy' | 'arrange';

const LIST_TOP = 100;
const LIST_BOTTOM = 548;
const ROW_H = 66;

interface Row {
  p: Product;
  qty: Phaser.GameObjects.Text;
  info: Phaser.GameObjects.Text;
  /** Nhãn đỏ "thiếu N" cạnh tên món. */
  lack: Phaser.GameObjects.Text;
  minus: Button;
  plus: Button;
  plus10: Button;
}

export class MorningScene extends Phaser.Scene {
  private hud!: Hud;
  private tab: Tab = 'buy';
  private cart: Cart = {};
  private rows: Row[] = [];
  private buyLayer!: Phaser.GameObjects.Container;
  private arrangeLayer!: Phaser.GameObjects.Container;
  private list!: Phaser.GameObjects.Container;
  private listH = 0;
  private cartText!: Phaser.GameObjects.Text;
  private cartWarn!: Phaser.GameObjects.Text;
  private buyBtn!: Button;
  private tabBtns!: Record<Tab, Button>;
  private shelves!: ShelfView;
  private chips!: Phaser.GameObjects.Container;
  private counterPanel!: Phaser.GameObjects.Container;
  private counterTabBtn!: Button;
  private whLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private selected: string | null = null;
  private counterMode = false;
  private pauseLayer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Morning');
  }

  create(data: { gift?: number }): void {
    setPlayClockRunning(true);
    setupCamera(this);
    const onLiveUpdated = () => {
      if (!G.liveSnapshot) return;
      if (G.state.phase !== 'morning') this.scene.start(sceneForPhase());
      else { this.hud?.refresh(); this.refresh(); }
    };
    window.addEventListener('thdh-live-updated', onLiveUpdated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('thdh-live-updated', onLiveUpdated));
    this.cart = {};
    this.selected = null;
    this.pauseLayer = null;
    const g = this.add.graphics();
    g.fillStyle(C.wall, 1).fillRect(0, HUD_H, W, H - HUD_H);
    this.hud = new Hud(this, G.state, { subtitle: 'Buổi sáng', onPause: () => this.pause() });

    this.tabBtns = {
      buy: new Button(this, W / 4 + 4, 74, { w: W / 2 - 16, h: 38, label: '🛒 Nhập hàng', size: 14, onTap: () => this.setTab('buy') }),
      arrange: new Button(this, (W * 3) / 4 - 4, 74, { w: W / 2 - 16, h: 38, label: '🧺 Bày kệ', size: 14, onTap: () => this.setTab('arrange') }),
    };

    this.buildBuy();
    this.buildArrange();
    // Có hàng trong kho mà kệ còn trống thì mở thẳng tab bày kệ.
    const hasStock = Object.keys(G.state.warehouse).length > 0;
    this.setTab(hasStock ? 'arrange' : 'buy');

    this.time.delayedCall(250, () => this.showMorningPopups(data?.gift ?? 0));
  }

  private showMorningPopups(gift: number): void {
    const s = G.state;
    const unlockCounter = s.announcedLevel < 3 && s.level >= 3;
    const newProducts = s.announcedLevel < s.level ? unlockedProducts(s.level).filter((p) => p.unlockLevel > s.announcedLevel) : [];
    const showNew = () => {
      if (s.announcedLevel >= s.level) {
        this.showLoginPrompt();
        return;
      }
      s.announcedLevel = s.level;
      persist();
      if (newProducts.length === 0) {
        this.showLoginPrompt();
        return;
      }
      play('levelup');
      dialog(this, {
        icon: '🆕',
        title: 'Mặt hàng mới!',
        body: [
          ...newProducts.map((p) => `${p.icon} ${p.name} · bán ${formatMoney(p.price)}`),
          ...(unlockCounter ? ['🔐 Đã mở khu hàng Sau quầy.'] : []),
        ].join('\n'),
        buttons: [{ label: 'Tuyệt!', onTap: () => this.showLoginPrompt() }],
      });
    };
    if (gift > 0) {
      play('coin');
      dialog(this, {
        icon: '👵',
        title: 'Bà gửi tiền',
        body: `Bà nghe nói tiệm hết vốn. Bà gửi cháu ${formatMoney(gift)}, nhập hàng từ từ thôi nghen!`,
        buttons: [{ label: 'Cảm ơn bà!', onTap: showNew }],
      });
    } else {
      showNew();
    }
  }

  private showLoginPrompt(): void {
    if (G.state.day < 4 || G.state.loginPromptSeen || hasAuthHint() || !cloudSaveEnabled() || !firebaseConfigured()) return;
    dialog(this, { icon: '☁️', title: 'Giữ tiến trình khi đổi máy', body: 'Bạn có thể đăng nhập Google để lưu bản sao tiến trình trên cloud. Vẫn chơi khách bình thường nếu muốn.', buttons: [
      { label: 'Đăng nhập Google', color: C.green, onTap: () => {
        G.state.loginPromptSeen = true;
        persist();
        this.scene.start('Title', { login: true });
      } },
      { label: 'Để sau', color: C.blue },
      { label: 'Không nhắc nữa', color: C.grey, onTap: () => {
        G.state.loginPromptSeen = true;
        persist();
      } },
    ] });
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.tabBtns.buy.setColor(t === 'buy' ? C.red : C.wood);
    this.tabBtns.arrange.setColor(t === 'arrange' ? C.red : C.wood);
    this.buyLayer.setVisible(t === 'buy');
    this.arrangeLayer.setVisible(t === 'arrange');
    this.selected = null;
    this.refresh();
  }

  // ---------- Nhập hàng ----------

  private buildBuy(): void {
    this.buyLayer = this.add.container(0, 0);
    const supplier = txt(this, 12, 98, '🧑‍🌾 Mối sỉ Cô Tư · giao ngay', { size: 12, color: HEX.muted });
    this.list = this.add.container(0, LIST_TOP + 16);
    const maskG = this.make.graphics({}, false).fillRect(0, LIST_TOP + 14, W, LIST_BOTTOM - LIST_TOP - 14);
    this.list.setMask(maskG.createGeometryMask());
    this.buyLayer.add([supplier, this.list]);

    const unlocked = unlockedProducts(G.state.level);
    const locked = DATA.products.filter((p) => !unlocked.includes(p));
    this.rows = [];
    let y = 0;
    for (const p of [...unlocked, ...locked]) {
      const isLocked = locked.includes(p);
      const bg = this.add.graphics();
      bg.fillStyle(isLocked ? 0xeadbc3 : C.panel, 1).fillRoundedRect(8, y + 2, W - 16, ROW_H - 6, 10);
      bg.lineStyle(1, C.panelEdge, 1).strokeRoundedRect(8, y + 2, W - 16, ROW_H - 6, 10);
      const icon = productIcon(this, 34, y + ROW_H / 2 - 1, p, 40);
      const name = txt(this, 60, y + 8, p.name, { size: 14, bold: true });
      const price = txt(this, 60, y + 27, `Nhập ${formatMoney(p.cost)} · bán ${formatMoney(p.price)}`, { size: 11, color: HEX.muted });
      const info = txt(this, 60, y + 43, '', { size: 11, color: HEX.green });
      this.list.add([bg, icon, name, price, info]);
      if (isLocked) {
        icon.setAlpha(0.4);
        name.setAlpha(0.5);
        info.setText(`🔒 Mở ở level ${p.unlockLevel}`).setColor(HEX.grey);
        y += ROW_H;
        continue;
      }
      const cy = y + ROW_H / 2 - 1;
      const minus = new Button(this, 218, cy, { w: 34, h: 40, label: '−', color: C.woodLight, size: 18, onTap: () => this.changeQty(p.id, -1) });
      const qty = txt(this, 252, cy, '0', { size: 16, bold: true, origin: [0.5, 0.5] });
      const plus = new Button(this, 284, cy, { w: 34, h: 40, label: '+', color: C.green, size: 18, onTap: () => this.changeQty(p.id, 1) });
      const plus10 = new Button(this, 326, cy, { w: 42, h: 40, label: '+10', color: C.greenDark, size: 13, onTap: () => this.changeQty(p.id, 10) });
      this.list.add([minus, qty, plus, plus10]);
      const lack = txt(this, 60 + name.width + 6, y + 11, '', { size: 10, bold: true, color: HEX.white });
      lack.setBackgroundColor(HEX.red).setPadding(4, 1, 4, 1);
      this.list.add(lack);
      this.rows.push({ p, qty, info, lack, minus, plus, plus10 });
      y += ROW_H;
    }
    this.listH = y + 10;
    this.enableListScroll();

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, LIST_BOTTOM + 4, W, H - LIST_BOTTOM - 4);
    this.cartText = txt(this, 12, LIST_BOTTOM + 14, '', { size: 13, bold: true, color: HEX.cream });
    this.cartWarn = txt(this, 12, LIST_BOTTOM + 36, '', { size: 12, color: '#ffb4a8' });
    const suggest = new Button(this, 62, H - 26, {
      w: 104,
      h: 36,
      label: '🪄 Gợi ý',
      color: C.blue,
      size: 13,
      onTap: () => {
        this.cart = suggestCart(G.state);
        if (Object.keys(this.cart).length === 0) toast(this, 'Hàng còn đủ, hoặc hết tiền/chỗ kho rồi!', H * 0.5);
        this.refresh();
      },
    });
    const clear = new Button(this, 154, H - 26, { w: 68, h: 36, label: 'Xóa giỏ', color: C.grey, size: 12, onTap: () => this.clearCart() });
    this.buyBtn = new Button(this, W - 80, H - 40, { w: 140, h: 52, label: 'Nhập hàng', color: C.green, size: 16, onTap: () => this.buy() });
    this.buyLayer.add([foot, this.cartText, this.cartWarn, suggest, clear, this.buyBtn]);
  }

  private enableListScroll(): void {
    let startY = 0;
    let startListY = 0;
    let active = false;
    const minY = () => Math.min(LIST_TOP + 16, LIST_BOTTOM - this.listH);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      active = this.tab === 'buy' && p.worldY > LIST_TOP && p.worldY < LIST_BOTTOM;
      startY = p.worldY;
      startListY = this.list.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!active || !p.isDown) return;
      this.list.y = Phaser.Math.Clamp(startListY + (p.worldY - startY), minY(), LIST_TOP + 16);
    });
    this.input.on('pointerup', () => (active = false));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      if (this.tab === 'buy') this.list.y = Phaser.Math.Clamp(this.list.y - dy * 0.5, minY(), LIST_TOP + 16);
    });
  }

  private changeQty(id: string, delta: number): void {
    // Nút đã cuộn ra ngoài vùng danh sách (bị che) thì không nhận chạm.
    const y = this.input.activePointer.worldY;
    if (y < LIST_TOP + 14 || y > LIST_BOTTOM) return;
    const next = Math.max(0, (this.cart[id] ?? 0) + delta);
    const trial = { ...this.cart, [id]: next };
    const check = checkCart(G.state, trial);
    if (delta > 0 && !check.ok && check.reason === 'space') {
      play('error');
      toast(this, 'Kho đầy rồi!', H * 0.5, C.red);
      return;
    }
    if (next === 0) delete this.cart[id];
    else this.cart[id] = next;
    this.refresh();
  }

  private clearCart(): void {
    this.cart = {};
    this.refresh();
  }

  private buy(): void {
    if (G.liveSnapshot) {
      void this.liveCommand({ type: 'buyStock', cart: { ...this.cart } }, () => { this.cart = {}; this.setTab('arrange'); });
      return;
    }
    const res = buyStock(G.state, this.cart);
    if (!res.ok) return;
    this.cart = {};
    play('cash');
    toast(this, `Đã nhập hàng: -${formatMoney(res.total)}\nGiờ bày hàng lên kệ nhé!`, H * 0.5, C.greenDark);
    persist();
    // Nhập xong thì chuyển luôn sang bày kệ (bước tiếp theo trong buổi sáng).
    this.setTab('arrange');
  }

  // ---------- Bày kệ ----------

  private buildArrange(): void {
    this.arrangeLayer = this.add.container(0, 0);
    this.shelves = new ShelfView(this, 102, {
      onSlotTap: (r, c) => this.onSlotTap(r, c),
      onRefill: (r, c) => {
        if (G.liveSnapshot) { void this.liveCommand({ type: 'refillShelf', shelf: r, slot: c }); return; }
        refillSlot(G.state, r, c);
        play('pick');
        this.afterArrange();
      },
      onRemove: (r, c) => {
        if (G.liveSnapshot) { void this.liveCommand({ type: 'clearShelf', shelf: r, slot: c }); return; }
        clearSlot(G.state, r, c);
        play('tap');
        this.afterArrange();
      },
    });
    const g = this.add.graphics();
    g.fillStyle(C.floorB, 1).fillRect(0, 300, W, 250);
    g.fillStyle(C.woodDark, 1).fillRect(0, 300, W, 4);
    this.whLabel = txt(this, 12, 310, '', { size: 14, bold: true, color: HEX.white });
    this.hint = txt(this, W - 12, 312, '', { size: 11, color: HEX.cream, origin: [1, 0] });
    this.counterPanel = this.add.container(0, 0);
    this.chips = this.add.container(0, 0);
    this.counterTabBtn = new Button(this, W - 58, 318, {
      w: 104,
      h: 30,
      label: '🔐 Sau quầy',
      size: 11,
      color: C.wood,
      onTap: () => {
        if (G.state.level < 3) return;
        this.counterMode = !this.counterMode;
        this.selected = null;
        this.refresh();
      },
    });
    this.counterTabBtn.setVisible(G.state.level >= 3);

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRect(0, LIST_BOTTOM + 4, W, H - LIST_BOTTOM - 4);
    const auto = new Button(this, 80, H - 40, {
      w: 140,
      h: 50,
      label: '✨ Tự bày',
      color: C.blue,
      onTap: () => {
        if (G.liveSnapshot) { void this.liveCommand({ type: 'autoArrange' }); return; }
        autoArrange(G.state);
        play('pick');
        this.afterArrange();
      },
    });
    const open = new Button(this, W - 90, H - 40, { w: 160, h: 54, label: 'Mở cửa ▶', color: C.red, size: 18, onTap: () => this.tryOpen() });
    this.arrangeLayer.add([this.shelves, g, this.whLabel, this.hint, this.counterTabBtn, this.counterPanel, this.chips, foot, auto, open]);
  }

  private onSlotTap(r: number, c: number): void {
    if (r >= shelfCount(G.state.level)) {
      toast(this, 'Kệ này mở ở level 3');
      return;
    }
    const slot = G.state.shelves[r][c];
    if (this.selected) {
      if (product(this.selected).behindCounter) {
        toast(this, 'Hàng sau quầy: chọn một ô quầy bên dưới');
        return;
      }
      try {
        if (G.liveSnapshot) { void this.liveCommand({ type: 'assignShelf', shelf: r, slot: c, productId: this.selected }); return; }
        assignSlot(G.state, r, c, this.selected);
      } catch (e) {
        if (e instanceof Error && e.message === 'wrong-zone') {
          toast(this, 'Sai khu hàng! Hãy chọn đúng kệ cùng nhóm.');
          return;
        }
        throw e;
      }
      play('pick');
      if ((G.state.warehouse[this.selected] ?? 0) <= 0) this.selected = null;
      this.afterArrange();
    } else if (slot.productId) {
      if (G.liveSnapshot) { void this.liveCommand({ type: 'refillShelf', shelf: r, slot: c }); return; }
      if (refillSlot(G.state, r, c) > 0) play('pick');
      this.afterArrange();
    } else {
      toast(this, 'Chọn một món trong kho trước', H * 0.62);
    }
  }

  private afterArrange(): void {
    persist();
    this.refresh();
  }

  private async liveCommand(command: import('../core/liveSession').LiveShopCommand, onSuccess?: () => void): Promise<void> {
    try {
      await dispatchLiveCommand(command);
      onSuccess?.();
    } catch (error) {
      toast(this, error instanceof Error ? error.message : 'Không gửi được thao tác lên phiên chung.', H * 0.5, C.red);
    }
  }

  private renderChips(): void {
    this.chips.removeAll(true);
    const items = Object.entries(G.state.warehouse).filter(([id, q]) => q > 0 && !!product(id).behindCounter === this.counterMode);
    if (items.length === 0) {
      const message = this.counterMode ? 'Chưa có hàng sau quầy trong kho.' : 'Kho trống. Qua tab "Nhập hàng" để mua hàng.';
      this.chips.add(txt(this, W / 2, 420, message, { size: 13, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: 300 }));
      this.counterPanel.setVisible(G.state.level >= 3 && this.counterMode);
      if (this.counterMode) this.renderCounterSlots();
      return;
    }
    items.forEach(([id, q], i) => {
      const x = 42 + (i % 5) * 69;
      const y = 390 + Math.floor(i / 5) * 72;
      const p = product(id);
      const sel = this.selected === id;
      const bg = this.add.graphics();
      bg.fillStyle(sel ? C.yellow : C.slot, 1).fillRoundedRect(-30, -32, 60, 66, 10);
      bg.lineStyle(sel ? 3 : 2, sel ? C.red : C.slotEdge, 1).strokeRoundedRect(-30, -32, 60, 66, 10);
      const icon = productIcon(this, 0, -8, p, 36);
      const label = txt(this, 0, 22, `x${q}`, { size: 12, bold: true, origin: [0.5, 0.5] });
      const chip = this.add.container(x, y, [bg, icon, label]).setSize(60, 66).setInteractive({ useHandCursor: true, draggable: true });
      chip.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (ptr.getDistance() > 10) return;
        this.selected = sel ? null : id;
        play('tap');
        this.refresh();
      });
      let ghost: Phaser.GameObjects.Container | null = null;
      chip.on('dragstart', () => {
        ghost = productIcon(this, x, y, p, 40).setDepth(800).setAlpha(0.9);
      });
      chip.on('drag', (ptr: Phaser.Input.Pointer) => ghost?.setPosition(ptr.worldX, ptr.worldY));
      chip.on('dragend', (ptr: Phaser.Input.Pointer) => {
        ghost?.destroy();
        ghost = null;
        const target = this.shelves.slotAt(ptr.worldX, ptr.worldY);
        if (target && target.shelf < shelfCount(G.state.level)) {
          if (p.behindCounter) {
            toast(this, 'Hàng sau quầy: thả vào một ô quầy bên dưới');
            return;
          }
          try {
            if (G.liveSnapshot) { void this.liveCommand({ type: 'assignShelf', shelf: target.shelf, slot: target.slot, productId: id }); return; }
            assignSlot(G.state, target.shelf, target.slot, id);
          } catch (e) {
            if (e instanceof Error && e.message === 'wrong-zone') toast(this, 'Sai khu hàng!');
            else throw e;
            return;
          }
          play('pick');
          this.afterArrange();
        } else if (p.behindCounter && this.counterMode && ptr.worldY >= 310 && ptr.worldY < 375) {
          const counterSlot = Math.floor((ptr.worldX - 48) / 68);
          if (counterSlot >= 0 && counterSlot < G.state.counter.length) {
            if (G.liveSnapshot) { void this.liveCommand({ type: 'assignCounter', slot: counterSlot, productId: id }); return; }
            assignCounterSlot(G.state, counterSlot, id);
            this.afterArrange();
          }
        }
      });
      this.chips.add(chip);
    });
    this.renderCounterSlots();
  }

  private renderCounterSlots(): void {
    this.counterPanel.removeAll(true);
    const unlocked = G.state.level >= 3;
    this.counterPanel.setVisible(unlocked && this.counterMode);
    if (!unlocked) return;
    this.counterPanel.add(txt(this, 12, 334, 'SAU QUẦY', { size: 9, bold: true, color: HEX.cream }));
    G.state.counter.forEach((slot, i) => {
      const x = 82 + i * 68;
      const y = 338;
      const bg = this.add.graphics();
      bg.fillStyle(C.slot, 1).fillRoundedRect(x - 27, y - 20, 54, 40, 8);
      bg.lineStyle(1, C.slotEdge, 1).strokeRoundedRect(x - 27, y - 20, 54, 40, 8);
      this.counterPanel.add(bg);
      if (slot.productId) {
        this.counterPanel.add(productIcon(this, x, y - 2, product(slot.productId), 27));
        this.counterPanel.add(txt(this, x + 24, y + 15, `x${slot.qty}`, { size: 9, bold: true, origin: [1, 1] }));
      } else {
        this.counterPanel.add(txt(this, x, y, '+', { size: 18, bold: true, color: HEX.muted, origin: [0.5, 0.5] }));
      }
      const hit = this.add.zone(x, y, 58, 44).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (this.selected) {
          if (!product(this.selected).behindCounter) {
            toast(this, 'Chỉ đặt hàng sau quầy vào đây.');
            return;
          }
          if (G.liveSnapshot) { void this.liveCommand({ type: 'assignCounter', slot: i, productId: this.selected }); return; }
          assignCounterSlot(G.state, i, this.selected);
          if ((G.state.warehouse[this.selected] ?? 0) <= 0) this.selected = null;
        } else if (slot.productId) {
          if (G.liveSnapshot) { void this.liveCommand({ type: 'refillCounter', slot: i }); return; }
          refillCounterSlot(G.state, i);
        }
        this.afterArrange();
      });
      this.counterPanel.add(hit);
    });
  }

  private tryOpen(): void {
    const onShelf = G.state.shelves.slice(0, shelfCount(G.state.level)).some((row) => row.some((s) => s.qty > 0));
    const go = () => {
      if (G.liveSnapshot) {
        void this.liveCommand({ type: 'openShop' }, () => {
          play('door');
          this.scene.start('Shop');
        });
        return;
      }
      openShop(G.state);
      persist();
      play('door');
      this.scene.start('Shop');
    };
    if (!onShelf) {
      dialog(this, {
        icon: '🤔',
        title: 'Kệ còn trống trơn',
        body: 'Khách vào mà không có hàng sẽ bỏ về. Vẫn mở cửa?',
        buttons: [
          { label: 'Bày kệ đã', color: C.grey },
          { label: 'Vẫn mở', color: C.red, onTap: go },
        ],
      });
      return;
    }
    go();
  }

  // ---------- Vẽ lại ----------

  private refresh(): void {
    const s = G.state;
    this.hud.refresh();
    if (this.tab === 'buy') {
      for (const r of this.rows) {
        const q = this.cart[r.p.id] ?? 0;
        r.qty.setText(String(q));
        const missed = s.yesterdayMissed[r.p.id] ?? 0;
        r.info.setText(`Còn: ${totalQty(s, r.p.id)} · Hôm qua bán: ${s.yesterdaySold[r.p.id] ?? 0}`);
        r.lack.setText(`thiếu ${missed}`).setVisible(missed > 0);
        r.minus.setEnabled(q > 0);
      }
      const check = checkCart(s, this.cart);
      this.cartText.setText(`Giỏ: ${formatMoney(check.total)} · Kho: ${check.cells}/${warehouseCapacity()} ô`);
      this.cartWarn.setText(!check.ok && check.reason === 'money' ? `Thiếu ${formatMoney(check.missing)}` : !check.ok && check.reason === 'space' ? 'Kho đầy' : '');
      this.buyBtn.setEnabled(check.ok);
    } else {
      this.shelves.render(s, { mode: 'arrange' });
      this.whLabel.setText(`📦 Kho · ${warehouseCellsUsed(s.warehouse)}/${warehouseCapacity()} ô`);
      this.hint.setText(this.selected ? (this.counterMode ? `Chạm ô quầy để đặt ${product(this.selected).name}` : `Chạm ô kệ để bày ${product(this.selected).name}`) : (this.counterMode ? 'Chạm món sau quầy rồi chọn ô quầy' : 'Chạm món rồi chạm ô kệ (hoặc kéo thả)'));
      this.counterTabBtn.setVisible(s.level >= 3);
      this.counterTabBtn.setText(this.counterMode ? '📦 Kho hàng' : '🔐 Sau quầy');
      this.renderChips();
    }
  }

  // ---------- Tạm dừng ----------

  private pause(): void {
    if (this.pauseLayer) return;
    setPlayClockRunning(false);
    persist();
    const L = this.add.container(0, 0).setDepth(3000);
    L.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive());

    const hasCloud = cloudSaveEnabled();
    const panelH = hasCloud ? 420 : 364;
    const panelY = H / 2 - panelH / 2;

    L.add(panel(this, 50, panelY, W - 100, panelH));
    L.add(txt(this, W / 2, panelY + 30, '⏸ Tạm dừng', { size: 22, bold: true, origin: [0.5, 0.5] }));

    let y = panelY + 76;
    L.add(
      new Button(this, W / 2, y, {
        w: 220,
        h: 46,
        label: '▶ Tiếp tục',
        color: C.green,
        onTap: () => this.resume(),
      }),
    );

    y += 54;
    const sound = new Button(this, W / 2, y, {
      w: 220,
      h: 42,
      label: G.state.settings.sound ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt',
      color: C.wood,
      onTap: () => {
        G.state.settings.sound = !G.state.settings.sound;
        setSoundEnabled(G.state.settings.sound);
        sound.setText(G.state.settings.sound ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt');
        persist();
      },
    });
    L.add(sound);

    y += 50;
    const autoLabel = () => (G.state.settings.autoChange ? '🧮 Tự thối tiền: Bật' : '✋ Tự thối tiền: Tắt');
    const autoBtn = new Button(this, W / 2, y, {
      w: 220,
      h: 42,
      label: autoLabel(),
      color: C.woodDark,
      onTap: () => {
        G.state.settings.autoChange = !G.state.settings.autoChange;
        autoBtn.setText(autoLabel());
        if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoChange', value: G.state.settings.autoChange });
        else persist();
      },
    });
    L.add(autoBtn);

    if (hasCloud) {
      y += 50;
      L.add(
        new Button(this, W / 2, y, {
          w: 220,
          h: 42,
          label: '☁️ Tài khoản và đồng bộ',
          color: C.blue,
          onTap: () => {
            persist();
            if (G.liveSnapshot) suspendLiveShop();
            stopMusic();
            this.scene.start('Title', { login: false });
          },
        }),
      );
    }

    y += 52;
    L.add(
      new Button(this, W / 2, y, {
        w: 220,
        h: 44,
        label: '🏠 Về màn chính',
        color: C.grey,
        onTap: () => {
          persist();
          if (G.liveSnapshot) suspendLiveShop();
          stopMusic();
          this.scene.start('Title');
        },
      }),
    );

    L.add(
      txt(this, W / 2, y + 36, 'Tiến trình đã được lưu an toàn.', {
        size: 11,
        color: HEX.muted,
        origin: [0.5, 0.5],
        align: 'center',
      }),
    );

    this.pauseLayer = L;
  }

  private resume(): void {
    setPlayClockRunning(true);
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
  }
}
