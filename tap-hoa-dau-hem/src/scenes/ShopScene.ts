import Phaser from 'phaser';
import type { Customer } from '../core/customers';
import type { CustomerType } from '../core/data';
import { DATA, product } from '../core/data';
import { DaySession, endDay } from '../core/day';
import { formatClock, formatMoney, shelfQty } from '../core/state';
import { G, persist, setPlayClockRunning } from '../game';
import { cloudSaveEnabled } from '../services/firebase';
import { bill, customerSprite, drawShopInterior, productIcon, setWalkFrame } from '../ui/art';
import { Hud, HUD_H } from '../ui/hud';
import { ShelfView, slotCenter } from '../ui/shelves';
import { play, setSoundEnabled, startMusic, stopMusic, vibrate } from '../ui/sound';
import { Bar, Button, floatText, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const SHELF_TOP = HUD_H + 10;
const FLOOR_Y = 262;
const COUNTER_Y = 330;
const FEET_Y = 352;
const PANEL_Y = 398;
const QUEUE_X = [78, 150, 222, 294, 330];
const DOOR_X = W + 16;
const CUSTOMER_SCALE = 1.5;

interface CustomerView {
  sprite: Phaser.GameObjects.Image;
  bar: Bar;
}

interface Walker {
  sprite: Phaser.GameObjects.Image;
  type: CustomerType;
}

export class ShopScene extends Phaser.Scene {
  private session!: DaySession;
  private hud!: Hud;
  private shelves!: ShelfView;
  private views = new Map<number, CustomerView>();
  /** Nhân vật đang đi (để đổi khung hình bước chân). */
  private walkers = new Set<Walker>();
  private walkFrame: 0 | 1 = 0;
  private panelLayer!: Phaser.GameObjects.Container;
  private panelMode: string = '';
  private trayText: Phaser.GameObjects.Text | null = null;
  private trayBills: Phaser.GameObjects.Container | null = null;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private renderAcc = 0;
  private ending = false;

  constructor() {
    super('Shop');
  }

  create(): void {
    setupCamera(this);
    this.views.clear();
    this.walkers.clear();
    this.panelMode = '';
    this.pauseLayer = null;
    this.ending = false;
    const s = G.state;
    this.session = new DaySession(s);

    drawShopInterior(this, HUD_H, FLOOR_Y, PANEL_Y);
    this.shelves = new ShelfView(this, SHELF_TOP, {
      onSlotTap: (r, c) => this.onSlotTap(r, c),
      onRefill: (r, c) => {
        if (this.session.startRefill(r, c)) play('step');
      },
    });
    this.drawCounter();
    this.hud = new Hud(this, s, { onPause: () => this.pause() });
    this.panelLayer = this.add.container(0, 0).setDepth(300);

    this.wireEvents();
    this.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        this.walkFrame = this.walkFrame === 0 ? 1 : 0;
        for (const w of this.walkers) if (w.sprite.active) setWalkFrame(w.sprite, w.type, this.walkFrame);
      },
    });
    this.renderPanel(true);
    this.shelves.render(s, this.shelfOpts());

    this.game.events.on('hidden', this.onHidden, this);
    window.addEventListener('thdh-orientation', this.onOrientation);
    this.events.once('shutdown', () => {
      this.game.events.off('hidden', this.onHidden, this);
      window.removeEventListener('thdh-orientation', this.onOrientation);
      this.session.events.clear();
    });
    if (s.settings.sound) startMusic();
    if (s.clock > DATA.balance.openMinute + 5) toast(this, `Tiếp tục bán lúc ${formatClock(s.clock)}`);
  }

  private drawCounter(): void {
    const g = this.add.graphics().setDepth(200);
    g.fillStyle(C.woodLight, 1).fillRect(0, COUNTER_Y, W - 56, 10);
    g.fillStyle(C.wood, 1).fillRect(0, COUNTER_Y + 10, W - 56, PANEL_Y - COUNTER_Y - 10);
    for (let x = 16; x < W - 56; x += 40) g.fillStyle(C.woodDark, 1).fillRect(x, COUNTER_Y + 16, 2, PANEL_Y - COUNTER_Y - 22);
    txt(this, 22, COUNTER_Y - 10, '🧾', { size: 22, emoji: true, origin: [0.5, 0.5] }).setDepth(201);
    txt(this, W - 90, COUNTER_Y + 30, 'QUẦY', { size: 12, bold: true, color: '#f6e3c4', origin: [0.5, 0.5] }).setDepth(201);
  }

  private shelfOpts() {
    const front = this.session.front;
    const highlight =
      G.state.level <= 2 && front?.status === 'picking'
        ? new Set(front.order.filter((l) => l.picked < l.qty).map((l) => l.productId))
        : undefined;
    return { mode: 'sell' as const, highlight, refilling: (r: number, c: number) => this.session.isRefilling(r, c) };
  }

  // ---------- Sự kiện từ core ----------

  private wireEvents(): void {
    const e = this.session.events;
    e.on('customerArrived', (c) => this.addCustomer(c));
    e.on('customerFront', () => this.renderPanel(true));
    e.on('picked', ({ customer, productId, shelf, slot }) => {
      play('pick');
      this.shelves.pop(shelf, slot);
      this.flyItem(productId, shelf, slot, customer);
      this.renderPanel(true);
    });
    e.on('wrongPick', ({ customer, shelf, slot }) => {
      play('wrong');
      vibrate(60);
      this.shelves.shake(shelf, slot);
      const v = this.views.get(customer.id);
      if (v) floatText(this, v.sprite.x, v.sprite.y - 70, '❌ Không phải!', HEX.red, 13);
    });
    e.on('paymentStarted', () => this.renderPanel(true));
    e.on('trayChanged', () => this.renderTray());
    e.on('changeResult', ({ result, given, customer, auto }) => {
      if (auto && customer.changeDue > 0) {
        const v = this.views.get(customer.id);
        floatText(this, v?.sprite.x ?? 80, 306, `🧮 Thối ${formatMoney(customer.changeDue)}`, '#1f5fa0', 13);
      }
      if (result === 'short') {
        play('error');
        vibrate(120);
        toast(this, `Thiếu tiền rồi! Mới thối ${formatMoney(given)}`, 470, C.red);
      } else if (result === 'over') {
        play('error');
        toast(this, `Thối dư ${formatMoney(given - customer.changeDue)}`, 470, C.redDark);
      }
    });
    e.on('sale', ({ customer, amount, tip }) => {
      play('cash');
      const v = this.views.get(customer.id);
      const x = v?.sprite.x ?? 80;
      floatText(this, x, 266, `+${formatMoney(amount)}`, HEX.green, 17);
      if (tip > 0) this.time.delayedCall(250, () => floatText(this, x + 40, 248, `+${formatMoney(tip)} tip`, '#b7791f', 14));
    });
    e.on('customerLeft', ({ customer, reason, stars }) => this.removeCustomer(customer, reason, stars));
    e.on('refillDone', () => play('pick'));
    e.on('closing', () => {
      play('door');
      toast(this, '20:00 rồi! Đóng cửa sau khi phục vụ nốt khách.', 300);
      this.renderPanel(true);
    });
    e.on('dayEnded', () => this.finishDay());
  }

  private addCustomer(c: Customer): void {
    play('door');
    const sprite = customerSprite(this, DOOR_X, FEET_Y, c.type).setScale(CUSTOMER_SCALE / 2).setDepth(100);
    const bar = new Bar(this, 0, 0, 36, 5, C.green, 0x000000);
    bar.setDepth(150);
    this.views.set(c.id, { sprite, bar });
    this.layoutQueue();
  }

  private layoutQueue(): void {
    this.session.queue.forEach((c, i) => {
      const v = this.views.get(c.id);
      if (!v) return;
      const x = QUEUE_X[Math.min(i, QUEUE_X.length - 1)];
      if (Math.abs(v.sprite.x - x) > 1) {
        this.tweens.killTweensOf(v.sprite);
        const dur = Math.abs(v.sprite.x - x) * 6;
        v.sprite.setFlipX(x > v.sprite.x).setY(FEET_Y);
        const walker = this.startWalking(v.sprite, c.type);
        this.tweens.add({ targets: v.sprite, x, duration: dur, ease: 'Linear', onComplete: () => this.stopWalking(walker) });
      }
    });
  }

  private removeCustomer(c: Customer, reason: string, stars: number): void {
    const v = this.views.get(c.id);
    this.views.delete(c.id);
    if (v) {
      v.bar.destroy();
      const face = reason === 'served' ? (stars >= 4 ? '😊' : stars >= 3 ? '🙂' : '😐') : reason === 'patience' ? '😠' : '😞';
      const says = reason === 'patience' ? 'Lâu quá!' : reason === 'nothing' ? 'Không có hàng à?' : '';
      const fx = reason === 'served' ? v.sprite.x - 40 : v.sprite.x;
      floatText(this, fx, v.sprite.y - 72, `${face} ${says}`.trim(), reason === 'served' ? HEX.green : HEX.red, 14);
      if (reason !== 'served') play('wrong');
      this.tweens.killTweensOf(v.sprite);
      v.sprite.setFlipX(true).setY(FEET_Y);
      const walker = this.startWalking(v.sprite, c.type);
      this.tweens.add({
        targets: v.sprite,
        x: DOOR_X + 20,
        alpha: 0,
        duration: 700,
        delay: 250,
        onComplete: () => {
          this.walkers.delete(walker);
          v.sprite.destroy();
        },
      });
    }
    this.layoutQueue();
    this.renderPanel(true);
  }

  private startWalking(sprite: Phaser.GameObjects.Image, type: CustomerType): Walker {
    for (const w of this.walkers) if (w.sprite === sprite) this.walkers.delete(w);
    const w = { sprite, type };
    this.walkers.add(w);
    return w;
  }

  private stopWalking(w: Walker): void {
    this.walkers.delete(w);
    if (w.sprite.active) setWalkFrame(w.sprite, w.type, 0);
  }

  private flyItem(productId: string, shelf: number, slot: number, c: Customer): void {
    const from = slotCenter(SHELF_TOP, shelf, slot);
    const v = this.views.get(c.id);
    const icon = productIcon(this, from.x, from.y, product(productId), 28).setDepth(400);
    this.tweens.add({
      targets: icon,
      x: v?.sprite.x ?? 80,
      y: COUNTER_Y - 6,
      scale: 0.6,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => icon.destroy(),
    });
  }

  // ---------- Thao tác người chơi ----------

  private onSlotTap(r: number, c: number): void {
    if (this.session.paused) return;
    const res = this.session.pick(r, c);
    if (res === 'empty') {
      const slot = G.state.shelves[r][c];
      const inWh = slot.productId ? G.state.warehouse[slot.productId] ?? 0 : 0;
      toast(this, inWh > 0 ? 'Ô trống, bấm + xanh để nạp hàng' : 'Hết hàng rồi!', 300);
    } else if (res === 'busy') {
      toast(this, 'Đang nạp hàng...', 300);
    }
  }

  // ---------- Bảng dưới cùng ----------

  private renderPanel(force = false): void {
    const c = this.session.front;
    const mode = !c ? (this.session.closed ? 'closed' : 'idle') : c.status === 'paying' ? `pay-${c.id}` : `pick-${c.id}`;
    if (!force && mode === this.panelMode) return;
    const keepPay = mode === this.panelMode && mode.startsWith('pay');
    this.panelMode = mode;
    if (keepPay) {
      this.renderTray();
      return;
    }
    this.panelLayer.removeAll(true);
    this.trayText = null;
    this.trayBills = null;
    this.panelLayer.add(panel(this, 6, PANEL_Y + 4, W - 12, H - PANEL_Y - 10));
    if (!c) {
      const msg = this.session.closed ? '🌙 Đã đóng cửa. Đang dọn tiệm...' : '⏳ Đang chờ khách...\nTranh thủ nạp kệ bằng nút + xanh nhé!';
      this.panelLayer.add(txt(this, W / 2, PANEL_Y + 110, msg, { size: 15, origin: [0.5, 0.5], align: 'center', color: HEX.muted }));
      return;
    }
    if (c.status === 'paying') this.renderPaying(c);
    else this.renderPicking(c);
  }

  private renderPicking(c: Customer): void {
    const L = this.panelLayer;
    L.add(txt(this, 18, PANEL_Y + 14, `🙋 ${c.type.name} cần:`, { size: 15, bold: true }));
    const n = c.order.length;
    const cw = 100;
    const x0 = W / 2 - ((n - 1) * (cw + 8)) / 2;
    c.order.forEach((l, i) => {
      const x = x0 + i * (cw + 8);
      const y = PANEL_Y + 92;
      const p = product(l.productId);
      const done = l.picked >= l.qty;
      const onShelf = shelfQty(G.state, l.productId) > 0;
      const g = this.add.graphics();
      g.fillStyle(done ? 0xd9f2dd : C.slot, 1).fillRoundedRect(x - cw / 2, y - 46, cw, 92, 12);
      g.lineStyle(2, done ? C.green : C.slotEdge, 1).strokeRoundedRect(x - cw / 2, y - 46, cw, 92, 12);
      L.add(g);
      L.add(productIcon(this, x, y - 14, p, 44));
      L.add(txt(this, x, y + 22, p.name, { size: 11, origin: [0.5, 0.5], color: HEX.muted }));
      const status = done ? `✓ x${l.qty}` : `${l.picked}/${l.qty}`;
      L.add(txt(this, x, y + 37, status, { size: 14, bold: true, origin: [0.5, 0.5], color: done ? HEX.green : HEX.ink }));
      if (!done && !onShelf) L.add(txt(this, x + cw / 2 - 6, y - 40, 'Hết!', { size: 11, bold: true, color: HEX.white, origin: [1, 0] }).setBackgroundColor(HEX.red).setPadding(3, 1, 3, 1));
    });
    const anyPicked = c.order.some((l) => l.picked > 0);
    L.add(txt(this, 18, PANEL_Y + 158, anyPicked ? 'Thiếu món? Bấm tính tiền phần đã lấy.' : 'Chạm món trên kệ để bỏ vào túi', { size: 12, color: HEX.muted, wrap: 180 }));
    L.add(
      new Button(this, W - 82, PANEL_Y + 178, {
        w: 136,
        h: 48,
        label: '💵 Tính tiền',
        color: C.red,
        onTap: () => this.session.checkout(),
      }).setEnabled(anyPicked),
    );
  }

  private renderPaying(c: Customer): void {
    const L = this.panelLayer;
    const y0 = PANEL_Y + 12;
    L.add(txt(this, 18, y0, `Đơn: ${formatMoney(c.total)}`, { size: 16, bold: true }));
    L.add(txt(this, 18, y0 + 22, 'Khách đưa:', { size: 13, color: HEX.muted }));
    L.add(bill(this, 128, y0 + 30, c.bill, 64, 30));
    L.add(txt(this, 166, y0 + 30, formatMoney(c.bill), { size: 13, bold: true, origin: [0, 0.5] }));
    this.trayText = txt(this, W - 18, y0, '', { size: 16, bold: true, origin: [1, 0], color: HEX.green });
    L.add(txt(this, W - 18, y0 + 22, 'đang thối', { size: 11, origin: [1, 0], color: HEX.muted }));
    this.trayBills = this.add.container(0, 0);
    L.add([this.trayText, this.trayBills]);

    const drawer = DATA.balance.drawer;
    drawer.forEach((v, i) => {
      const x = 50 + (i % 4) * 87;
      const y = PANEL_Y + 104 + Math.floor(i / 4) * 46;
      const b = bill(this, x, y, v, 80, 40);
      b.setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => b.setScale(0.93));
      b.on('pointerout', () => b.setScale(1));
      b.on('pointerup', () => {
        b.setScale(1);
        play('bill');
        this.session.addBill(v);
      });
      L.add(b);
    });

    const by = PANEL_Y + 204;
    const undo = new Button(this, 58, by, { w: 92, h: 44, label: '↩ Bỏ tờ', color: C.grey, size: 13, onTap: () => this.session.undoBill() });
    L.add(undo);
    L.add(new Button(this, 158, by, { w: 92, h: 44, label: '🧮 Tự tính', color: C.blue, size: 13, onTap: () => this.session.autoChange() }));
    L.add(new Button(this, W - 72, by, { w: 124, h: 48, label: 'Đưa ✓', color: C.green, size: 17, onTap: () => this.session.giveChange() }));
    this.renderTray();
  }

  private renderTray(): void {
    if (!this.trayText || !this.trayBills) return;
    this.trayText.setText(formatMoney(this.session.trayTotal()));
    this.trayBills.removeAll(true);
    const tray = this.session.tray.slice(-8);
    tray.forEach((v, i) => this.trayBills!.add(bill(this, 214 + i * 16, PANEL_Y + 64, v, 44, 22)));
  }

  // ---------- Vòng lặp ----------

  update(_t: number, dtMs: number): void {
    if (this.ending) return;
    this.session.update(dtMs / 1000);
    this.renderAcc += dtMs;
    if (this.renderAcc >= 100) {
      this.renderAcc = 0;
      this.hud.refresh();
      this.shelves.render(G.state, this.shelfOpts());
      this.renderPanel();
    }
    this.session.queue.forEach((c) => {
      const v = this.views.get(c.id);
      if (!v) return;
      const r = c.patience / c.patienceMax;
      v.bar.setPosition(v.sprite.x - 18, v.sprite.y - 70);
      v.bar.set(r, r > 0.5 ? C.green : r > 0.25 ? C.yellow : C.red);
    });
  }

  private finishDay(): void {
    if (this.ending) return;
    this.ending = true;
    endDay(G.state);
    persist();
    stopMusic();
    toast(this, '🌙 Hết ngày! Đóng cửa tiệm...', 300);
    this.time.delayedCall(1200, () => this.scene.start('Summary'));
  }

  // ---------- Tạm dừng ----------

  private onHidden(): void {
    persist();
    this.pause();
  }

  private onOrientation = (): void => this.pause();

  private pause(): void {
    if (this.pauseLayer || this.ending) return;
    this.session.paused = true;
    setPlayClockRunning(false);
    persist();
    const L = this.add.container(0, 0).setDepth(3000);
    L.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive());
    L.add(panel(this, 50, 120, W - 100, 430));
    L.add(txt(this, W / 2, 152, '⏸ Tạm dừng', { size: 22, bold: true, origin: [0.5, 0.5] }));
    L.add(new Button(this, W / 2, 208, { w: 220, h: 50, label: '▶ Tiếp tục', onTap: () => this.resume() }));
    const autoLabel = () => (G.state.settings.autoChange ? '🧮 Tự thối tiền: Bật' : '✋ Tự thối tiền: Tắt');
    const autoBtn = new Button(this, W / 2, 268, {
      w: 220,
      h: 44,
      label: autoLabel(),
      color: C.blue,
      onTap: () => {
        G.state.settings.autoChange = !G.state.settings.autoChange;
        autoBtn.setText(autoLabel());
        persist();
        // Khách đang chờ thối mà vừa bật tự động thì thối luôn.
        if (G.state.settings.autoChange) this.session.autoChange();
      },
    });
    L.add(autoBtn);
    const sound = new Button(this, W / 2, 322, {
      w: 220,
      h: 44,
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
    if (cloudSaveEnabled()) L.add(new Button(this, W / 2, 376, {
      w: 220,
      h: 44,
      label: '☁️ Tài khoản và đồng bộ',
      color: C.blue,
      onTap: () => {
        persist();
        stopMusic();
        this.scene.start('Title', { login: false });
      },
    }));
    L.add(
      new Button(this, W / 2, 430, {
        w: 220,
        h: 44,
        label: '🏠 Về màn chính',
        color: C.grey,
        onTap: () => {
          persist();
          stopMusic();
          this.scene.start('Title');
        },
      }),
    );
    L.add(
      txt(this, W / 2, 500, 'Tắt tự thối để tự chọn tờ tiền và có cơ hội nhận tip.\nĐã lưu tiến trình.', {
        size: 12,
        color: HEX.muted,
        origin: [0.5, 0.5],
        align: 'center',
        wrap: 230,
      }),
    );
    this.pauseLayer = L;
  }

  private resume(): void {
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    this.session.paused = false;
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
  }
}
