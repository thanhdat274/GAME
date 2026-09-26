import Phaser from 'phaser';
import type { Customer } from '../core/customers';
import type { CustomerType } from '../core/data';
import { DATA, product, type Category } from '../core/data';
import { DaySession, endDay } from '../core/day';
import { canGiveCredit } from '../core/ledger';
import { claimQuest, questDef, questDone, questProgress, questsUnlocked } from '../core/quests';
import { formatClock, formatMoney, warehouseQty } from '../core/state';
import { orderTotal } from '../core/customers';
import { G, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { dispatchLiveCommand, startLivePulses, stopLivePulses, suspendLiveShop } from '../services/liveShop';
import { cloudSaveEnabled } from '../services/firebase';
import { bakeStatic, bill, customerSprite, drawShopInterior, productIcon, setWalkFrame } from '../ui/art';
import { Hud, HUD_H } from '../ui/hud';
import { ShelfView } from '../ui/shelves';
import { play, setSoundEnabled, startMusic, stopMusic, vibrate } from '../ui/sound';
import { Bar, Button, dialog, floatText, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const SHELF_TOP = HUD_H + 10;
const FLOOR_Y = 262;
const COUNTER_Y = 330;
const FEET_Y = 352;
const PANEL_Y = 398;
const QUEUE_X = [78, 150, 222, 294, 330];
const DOOR_X = W + 16;
const CUSTOMER_SCALE = 1.5;
type SaleZone = Exclude<Category, 'counter'>;
const ZONE_X: Record<SaleZone, number> = { dry: 60, snack: 175, household: 290, drink: 118, fresh: 232, frozen: 320 };
const ZONE_BUTTON: Record<SaleZone, string> = { dry: 'Nạp đồ khô', snack: 'Nạp ăn vặt', household: 'Nạp đồ dùng', drink: 'Nạp đồ uống', fresh: 'Nạp đồ tươi', frozen: 'Nạp đông lạnh' };

/** Khách quen (hàng xóm) dùng ngoại hình riêng: tạo loại khách ảo có id riêng để cache texture. */
function lookOf(c: Customer): CustomerType {
  if (!c.look || !c.name) return c.type;
  const slug = c.name.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
  return { ...c.type, ...c.look, id: `${c.type.id}_${slug}` };
}

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
  private counterTimerText: Phaser.GameObjects.Text | null = null;
  private counterPulseTween: Phaser.Tweens.Tween | null = null;
  private counterRequestBar: Bar | null = null;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private zoneRefillButtons: { zone: SaleZone; button: Button }[] = [];
  private questBtn: Button | null = null;
  private counterBtn: Button | null = null;
  private questsDoneSeen = new Set<string>();
  private renderAcc = 0;
  private ending = false;

  constructor() {
    super('Shop');
  }

  create(): void {
    setPlayClockRunning(true);
    setupCamera(this);
    this.views.clear();
    this.walkers.clear();
    this.panelMode = '';
    this.pauseLayer = null;
    this.ending = false;
    this.zoneRefillButtons = [];
    this.questBtn = null;
    this.counterBtn = null;
    this.questsDoneSeen = new Set((G.state.quests?.list ?? []).filter((q) => q.claimed || questDone(G.state, questDef(q.id))).map((q) => q.id));
    const s = G.state;
    this.session = G.liveSnapshot?.dayRuntime
      ? DaySession.restore(s, G.liveSnapshot.dayRuntime)
      : new DaySession(s);
    if (G.liveSnapshot) startLivePulses();
    // Chỉ bản dev: cho phép kiểm thử trên trình duyệt truy cập phiên bán (không có trong bản build).
    if (import.meta.env.DEV) (window as unknown as { __thdhShop?: ShopScene }).__thdhShop = this;

    // Tường, sàn gạch và quầy là hình tĩnh: gộp vào RenderTexture để giảm chi phí vẽ mỗi khung hình.
    bakeStatic(this, [drawShopInterior(this, HUD_H, FLOOR_Y, PANEL_Y)], 0);
    this.shelves = new ShelfView(this, SHELF_TOP, {
      onSlotTap: (r, c) => this.onSlotTap(r, c),
      onRefill: (r, c) => {
        if (G.liveSnapshot) void this.liveCommand({ type: 'startRefill', shelf: r, slot: c });
        else if (this.session.startRefill(r, c)) play('step');
      },
      onScroll: (atCounter) => this.counterBtn?.setVisible(!atCounter),
    }, s);
    // Tiệm nhiều kệ: kéo một ngón để xem kệ phía sau, nút này đưa khung nhìn về các kệ sát quầy.
    this.counterBtn = new Button(this, W - 58, SHELF_TOP + 3 * 64 - 8, { w: 100, h: 26, label: '↓ Về quầy', size: 11, color: C.blue, onTap: () => this.shelves.scrollToCounter() });
    this.counterBtn.setDepth(260).setVisible(!this.shelves.atCounter);
    this.drawCounter();
    this.addZoneRefillButtons();
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
    const onLiveUpdated = () => this.syncLiveSnapshot();
    window.addEventListener('thdh-live-updated', onLiveUpdated);
    this.events.once('shutdown', () => {
      this.game.events.off('hidden', this.onHidden, this);
      window.removeEventListener('thdh-orientation', this.onOrientation);
      window.removeEventListener('thdh-live-updated', onLiveUpdated);
      stopLivePulses();
      this.session.events.clear();
    });
    if (s.settings.sound) startMusic();
    if (s.clock > DATA.balance.openMinute + 5) toast(this, `Tiếp tục bán lúc ${formatClock(s.clock)}`);
  }

  private drawCounter(): void {
    const g = this.add.graphics();
    g.fillStyle(C.woodLight, 1).fillRect(0, COUNTER_Y, W - 56, 10);
    g.fillStyle(C.wood, 1).fillRect(0, COUNTER_Y + 10, W - 56, PANEL_Y - COUNTER_Y - 10);
    for (let x = 16; x < W - 56; x += 40) g.fillStyle(C.woodDark, 1).fillRect(x, COUNTER_Y + 16, 2, PANEL_Y - COUNTER_Y - 22);
    bakeStatic(this, [g], 200);
    txt(this, 22, COUNTER_Y - 10, '🧾', { size: 22, emoji: true, origin: [0.5, 0.5] }).setDepth(201);
    txt(this, W - 90, COUNTER_Y + 30, 'QUẦY', { size: 12, bold: true, color: '#f6e3c4', origin: [0.5, 0.5] }).setDepth(201);
  }

  /** Nút nạp cả khu (hiện khi quầy vắng khách), tối đa 6 khu xếp 2 hàng. */
  private addZoneRefillButtons(): void {
    const zones = (Object.keys(ZONE_BUTTON) as SaleZone[]).filter((zone) => G.state.zones.some((item) => item === zone));
    const many = zones.length > 3;
    zones.forEach((zone, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const button = new Button(this, 54 + col * 102, many ? 280 + row * 29 : 286, {
        w: 96,
        h: many ? 26 : 32,
        label: ZONE_BUTTON[zone],
        color: C.wood,
        size: 10,
        onTap: () => {
          if (G.liveSnapshot) void this.liveCommand({ type: 'refillZone', zone });
          else if (this.session.refillZone(zone)) play('step');
          else toast(this, 'Khu này chưa có ô cần nạp');
        },
      });
      this.zoneRefillButtons.push({ zone, button });
    });
    if (questsUnlocked(G.state)) {
      this.questBtn = new Button(this, W - 26, 286, { w: 40, h: 34, label: '🎯', size: 16, color: C.blue, onTap: () => this.showQuests() });
      this.questBtn.setDepth(210);
    }
  }

  /** Bảng nhiệm vụ nổi trong lúc bán (tạm dừng mô phỏng khi mở). */
  private showQuests(): void {
    const s = G.state;
    if (!s.quests) return;
    if (!G.liveSnapshot) this.session.paused = true;
    const resume = () => { if (!G.liveSnapshot && !this.pauseLayer) this.session.paused = false; };
    const lines = s.quests.list.map((entry) => {
      const q = questDef(entry.id);
      const progress = Math.min(q.target, questProgress(s, q));
      const mark = entry.claimed ? '✅' : questDone(s, q) ? '🎁' : '▫️';
      const shown = q.metric === 'revenue' ? `${Math.round((progress / q.target) * 100)}%` : q.metric === 'noSpoil' || q.metric === 'leftAtMost' ? 'cuối ngày' : `${progress}/${q.target}`;
      return `${mark} ${q.text} · ${shown}`;
    }).join('\n');
    const claimable = s.quests.list.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.claimed && questDone(s, questDef(entry.id)));
    const buttons = claimable.length
      ? [{ label: `Nhận ${claimable.length} thưởng`, color: C.green, onTap: () => {
        let money = 0;
        for (const { index } of claimable) {
          const r = claimQuest(G.state, index);
          if (r.ok) money += r.money;
        }
        if (money) { play('coin'); floatText(this, W / 2, 240, `🎯 +${formatMoney(money)}`, HEX.green, 18); }
        if (!G.liveSnapshot) persist();
        resume();
      } }, { label: 'Đóng', color: C.grey, onTap: resume }]
      : [{ label: 'Đóng', color: C.grey, onTap: resume }];
    dialog(this, { icon: '🎯', title: 'Nhiệm vụ hôm nay', body: lines, buttons, width: 320 });
  }

  private shelfOpts() {
    const front = this.session.front;
    const highlight = front?.status === 'scanning'
      ? new Set(front.order.filter((l) => l.picked > l.scanned).map((l) => l.productId))
      : undefined;
    return { mode: 'sell' as const, highlight, refilling: (r: number, c: number) => this.session.isRefilling(r, c) };
  }

  private syncLiveSnapshot(): void {
    const snapshot = G.liveSnapshot;
    if (!snapshot) return;
    if (G.state.phase !== 'open' || !snapshot.dayRuntime) {
      this.scene.start(sceneForPhase());
      return;
    }
    this.session.events.clear();
    for (const view of this.views.values()) {
      this.tweens.killTweensOf(view.sprite);
      view.sprite.destroy();
      view.bar.destroy();
    }
    this.views.clear();
    this.walkers.clear();
    this.session = DaySession.restore(G.state, snapshot.dayRuntime);
    this.wireEvents();
    for (const [index, customer] of this.session.shoppers.entries()) {
      this.addCustomer(customer);
      const view = this.views.get(customer.id)!;
      view.sprite.setPosition([70, 175, 280][index % 3], FEET_Y - 46);
    }
    for (const customer of [...this.session.entrants, ...this.session.ready, ...this.session.queue]) this.addCustomer(customer);
    this.layoutQueue();
    this.panelMode = '';
    this.renderPanel(true);
    this.shelves.render(G.state, this.shelfOpts());
    this.hud.refresh();
  }

  private async liveCommand(command: import('../core/liveSession').LiveShopCommand): Promise<void> {
    try {
      await dispatchLiveCommand(command);
    } catch (error) {
      toast(this, error instanceof Error ? error.message : 'Không gửi được thao tác lên phiên chung.', 470, C.red);
    }
  }

  // ---------- Sự kiện từ core ----------

  private wireEvents(): void {
    const e = this.session.events;
    e.on('customerArrived', (c) => this.addCustomer(c));
    e.on('customerBrowse', ({ customer, zone, tiles }) => {
      const v = this.views.get(customer.id);
      if (!v) return;
      const x = ZONE_X[zone as SaleZone] ?? 175;
      v.sprite.setY(FEET_Y - 48).setFlipX(x > v.sprite.x);
      const walker = this.startWalking(v.sprite, lookOf(customer));
      const seconds = DATA.balance.zoneWalkSeconds + Math.max(0, tiles - 3) * DATA.balance.walkSecondsPerTile;
      this.tweens.add({ targets: v.sprite, x, duration: seconds * 1000, onComplete: () => this.stopWalking(walker) });
    });
    e.on('priceComplaint', ({ customer, productId }) => {
      const v = this.views.get(customer.id);
      floatText(this, v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, `💸 Đắt quá! (${product(productId).name})`, HEX.red, 12);
    });
    e.on('notCold', ({ customer }) => {
      const v = this.views.get(customer.id);
      floatText(this, v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, '🥵 Không lạnh à?', '#1f5fa0', 12);
    });
    e.on('catPetted', (customer) => {
      const v = this.views.get(customer.id);
      floatText(this, v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, '🐱❤️', HEX.red, 16);
    });
    e.on('debtRepaid', ({ name, amount }) => {
      play('coin');
      toast(this, `📒 ${name} ghé trả nợ +${formatMoney(amount)}`, 300, C.greenDark);
    });
    e.on('delivery', ({ supplierId, held }) => {
      play('door');
      const name = DATA.suppliers.find((sp) => sp.id === supplierId)?.name ?? 'Mối sỉ';
      toast(this, `🚚 ${name} giao hàng tới!${held ? `\n${held} món không vừa kho → hàng chờ` : ''}`, 300, held ? C.redDark : C.greenDark);
      this.driveTruck();
    });
    e.on('bargainRequested', () => this.renderPanel(true));
    e.on('creditRequested', () => this.renderPanel(true));
    e.on('bargainResolved', ({ customer, accepted, left }) => {
      const v = this.views.get(customer.id);
      floatText(this, v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, accepted ? '🥰 Cảm ơn nha!' : left ? '😤 Thôi khỏi mua!' : '😒 Ừ thì mua...', accepted ? HEX.green : HEX.red, 13);
      this.renderPanel(true);
    });
    e.on('creditResolved', ({ customer, granted, amount }) => {
      const v = this.views.get(customer.id);
      floatText(this, v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, granted ? `📒 Ghi sổ ${formatMoney(amount)}` : '😞 Thôi vậy...', granted ? '#1f5fa0' : HEX.red, 13);
      this.renderPanel(true);
    });
    e.on('basketReady', () => { this.layoutQueue(); this.renderPanel(true); });
    e.on('customerFront', () => this.renderPanel(true));
    e.on('itemTaken', ({ customer, productId, shelf, slot }) => {
      play('pick');
      this.shelves.pop(shelf, slot);
      this.flyItem(productId, shelf, slot, customer);
      this.renderPanel(true);
    });
    e.on('itemMissing', ({ customer }) => {
      play('wrong');
      vibrate(60);
      const v = this.views.get(customer.id);
      if (v) floatText(this, v.sprite.x, v.sprite.y - 70, '🙁 Hết!', HEX.red, 13);
    });
    e.on('itemScanned', () => this.renderPanel(true));
    e.on('counterRequested', ({ customer, productId, seconds }) => {
      const v = this.views.get(customer.id);
      floatText(this, v?.sprite.x ?? W / 2, FEET_Y - 78, `Sau quầy: ${product(productId).name} · ${seconds}s`, '#1f5fa0', 12);
      this.renderPanel(true);
    });
    e.on('counterServed', () => { play('pick'); this.renderPanel(true); });
    e.on('counterWrong', ({ customer }) => {
      play('wrong'); vibrate(60);
      const v = this.views.get(customer.id);
      if (v) floatText(this, v.sprite.x, v.sprite.y - 70, 'Sai món!', HEX.red, 13);
    });
    e.on('counterExpired', () => this.renderPanel(true));
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

  /** Xe giao hàng chạy ngang tới cửa. */
  private driveTruck(): void {
    const truck = txt(this, -30, FLOOR_Y + 30, '🚚', { size: 30, emoji: true, origin: [0.5, 0.5] }).setDepth(250);
    this.tweens.add({ targets: truck, x: W + 40, duration: 2200, ease: 'Sine.easeInOut', onComplete: () => truck.destroy() });
  }

  private addCustomer(c: Customer): void {
    play('door');
    const sprite = customerSprite(this, DOOR_X, FEET_Y, lookOf(c)).setScale(CUSTOMER_SCALE / 2).setDepth(100);
    if (c.name) floatText(this, W - 60, FEET_Y - 80, `👋 ${c.name} ghé tiệm`, '#6b4220', 12);
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
        const walker = this.startWalking(v.sprite, lookOf(c));
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
      const walker = this.startWalking(v.sprite, lookOf(c));
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
    const from = this.shelves.slotCenter(shelf, slot);
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
    const slot = G.state.shelves[r][c];
    const inWh = slot.productId ? warehouseQty(G.state, slot.productId) : 0;
    toast(this, inWh > 0 ? 'Khách tự lấy hàng · bấm + xanh để nạp kệ' : 'Kệ trống hoặc đã hết hàng', 300);
  }

  // ---------- Bảng dưới cùng ----------

  private renderPanel(force = false): void {
    const c = this.session.front;
    const mode = !c ? (this.session.closed ? 'closed' : 'idle') : c.status === 'paying' ? `pay-${c.id}` : c.status === 'bargain' || c.status === 'credit' ? `${c.status}-${c.id}` : `scan-${c.id}`;
    if (!force && mode === this.panelMode) return;
    const keepPay = mode === this.panelMode && mode.startsWith('pay');
    this.panelMode = mode;
    if (keepPay) {
      this.renderTray();
      return;
    }
    this.panelLayer.removeAll(true);
    this.counterPulseTween?.remove();
    this.counterPulseTween = null;
    this.trayText = null;
    this.trayBills = null;
    this.counterTimerText = null;
    this.counterRequestBar = null;
    this.panelLayer.add(panel(this, 6, PANEL_Y + 4, W - 12, H - PANEL_Y - 10));
    if (!c) {
      const msg = this.session.closed ? '🌙 Đã đóng cửa. Đang dọn tiệm...' : '⏳ Đang chờ khách...\nTranh thủ nạp kệ bằng nút + xanh nhé!';
      this.panelLayer.add(txt(this, W / 2, PANEL_Y + 110, msg, { size: 15, origin: [0.5, 0.5], align: 'center', color: HEX.muted }));
      return;
    }
    if (c.status === 'paying') this.renderPaying(c);
    else if (c.status === 'bargain') this.renderBargain(c);
    else if (c.status === 'credit') this.renderCredit(c);
    else this.renderScanning(c);
  }

  private who(c: Customer): string {
    return c.name ?? c.type.name;
  }

  /** Khách mặc cả: Bớt / Không bớt. */
  private renderBargain(c: Customer): void {
    const L = this.panelLayer;
    const total = orderTotal(c, G.state);
    const after = Math.max(1000, Math.round((total * (100 - (c.bargainPct ?? 0))) / 100 / 1000) * 1000);
    L.add(txt(this, W / 2, PANEL_Y + 40, `🙏 ${this.who(c)}: "Bớt cho cô ${c.bargainPct}% nha con!"`, { size: 15, bold: true, origin: [0.5, 0.5], align: 'center', wrap: W - 40 }));
    L.add(txt(this, W / 2, PANEL_Y + 84, `Đơn ${formatMoney(total)} → ${formatMoney(after)}`, { size: 16, bold: true, origin: [0.5, 0.5], color: HEX.ink }));
    L.add(txt(this, W / 2, PANEL_Y + 112, 'Không bớt: khách có thể bỏ về, hoặc mua mà không vui (tối đa 3 sao).', { size: 11, origin: [0.5, 0.5], align: 'center', wrap: W - 50, color: HEX.muted }));
    const answer = (accept: boolean) => () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'resolveBargain', accept });
      else this.session.resolveBargain(accept);
    };
    L.add(new Button(this, W / 2 - 80, PANEL_Y + 170, { w: 140, h: 52, label: '🤝 Bớt', color: C.green, size: 17, onTap: answer(true) }));
    L.add(new Button(this, W / 2 + 80, PANEL_Y + 170, { w: 140, h: 52, label: 'Không bớt', color: C.red, size: 16, onTap: answer(false) }));
  }

  /** Khách xin ghi sổ: Cho nợ / Không cho. */
  private renderCredit(c: Customer): void {
    const L = this.panelLayer;
    const total = orderTotal(c, G.state);
    const allowed = canGiveCredit(G.state, total);
    L.add(txt(this, W / 2, PANEL_Y + 40, `📒 ${this.who(c)}: "Ghi sổ giùm, mai mốt trả nghen!"`, { size: 15, bold: true, origin: [0.5, 0.5], align: 'center', wrap: W - 40 }));
    L.add(txt(this, W / 2, PANEL_Y + 84, `Nợ ${formatMoney(total)} · hạn 3 ngày`, { size: 16, bold: true, origin: [0.5, 0.5] }));
    L.add(txt(this, W / 2, PANEL_Y + 112, allowed ? 'Không cho: khách bỏ về và chấm 2 sao.' : 'Sổ nợ đã đầy (tối đa 20% tiền mặt).', { size: 12, origin: [0.5, 0.5], align: 'center', wrap: W - 50, color: allowed ? HEX.muted : HEX.red }));
    const answer = (grant: boolean) => () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'resolveCredit', grant });
      else this.session.resolveCredit(grant);
    };
    L.add(new Button(this, W / 2 - 80, PANEL_Y + 170, { w: 140, h: 52, label: allowed ? '📒 Cho nợ' : 'Sổ nợ đã đầy', color: C.blue, size: allowed ? 17 : 13, onTap: answer(true) }).setEnabled(allowed));
    L.add(new Button(this, W / 2 + 80, PANEL_Y + 170, { w: 140, h: 52, label: 'Không cho', color: C.red, size: 16, onTap: answer(false) }));
  }

  private renderScanning(c: Customer): void {
    const L = this.panelLayer;
    L.add(txt(this, 18, PANEL_Y + 14, `🛒 Giỏ của ${this.who(c)}:`, { size: 15, bold: true }));
    const n = c.order.length;
    const cw = Math.min(100, (W - 24) / n - 8);
    const x0 = W / 2 - ((n - 1) * (cw + 8)) / 2;
    c.order.forEach((l, i) => {
      const x = x0 + i * (cw + 8);
      const y = PANEL_Y + 92;
      const p = product(l.productId);
      const isCounterWaiting = !!(l.counterLine && c.counterRequestLeft !== null);
      const isOutOfStock = l.picked === 0 && !isCounterWaiting;
      const done = l.picked > 0 && l.scanned >= l.picked;

      const bgColor = done ? 0xd9f2dd : isOutOfStock ? 0xfcf1ed : C.slot;
      const borderColor = done ? C.green : isOutOfStock ? 0xde7d70 : C.slotEdge;

      const g = this.add.graphics();
      g.fillStyle(bgColor, 1).fillRoundedRect(x - cw / 2, y - 46, cw, 92, 12);
      g.lineStyle(2, borderColor, 1).strokeRoundedRect(x - cw / 2, y - 46, cw, 92, 12);
      L.add(g);

      const icon = productIcon(this, x, y - 14, p, 44);
      if (isOutOfStock) icon.setAlpha(0.45);
      L.add(icon);

      L.add(txt(this, x, y + 22, p.name, { size: cw < 90 ? 9 : 11, origin: [0.5, 0.5], color: isOutOfStock ? HEX.muted : HEX.ink, wrap: cw - 8 }));

      let status = '';
      let statusColor = HEX.ink;
      if (isCounterWaiting) {
        status = `⏱ ${Math.ceil(c.counterRequestLeft!)}s`;
        statusColor = HEX.ink;
      } else if (isOutOfStock) {
        status = l.declined === 'price' ? '💸 Chê đắt' : l.declined === 'cold' ? '🥵 Không lạnh' : cw < 85 ? `Thiếu x${l.qty}` : `❌ Hết hàng`;
        statusColor = HEX.red;
      } else if (done) {
        status = `✓ x${l.scanned}`;
        statusColor = HEX.green;
      } else if (l.scanned > 0) {
        status = `Quét ${l.scanned}/${l.picked}`;
        statusColor = HEX.ink;
      } else {
        status = `x${l.picked}`;
        statusColor = HEX.ink;
      }

      const statusText = txt(this, x, y + 37, status, { size: cw < 90 ? 11 : 14, bold: true, origin: [0.5, 0.5], color: statusColor });
      L.add(statusText);

      if (isCounterWaiting) {
        this.counterTimerText = statusText;
        this.counterRequestBar = new Bar(this, x - cw / 2 + 8, y + 42, cw - 16, 4, C.green, C.slotEdge).setDepth(302);
        this.counterRequestBar.set(c.counterRequestLeft! / Math.max(1, c.counterRequestSeconds));
        L.add(this.counterRequestBar);
      }
      if (l.picked > l.scanned && !l.counterLine) {
        const hit = this.add.rectangle(x, y, cw, 92, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => {
          if (G.liveSnapshot) void this.liveCommand({ type: 'scanItem', productId: l.productId });
          else if (this.session.scanItem(l.productId)) play('pick');
        });
        L.add(hit);
      }
    });
    const anyPicked = c.order.some((l) => l.picked > l.scanned && !l.counterLine);
    const request = c.order.find((l) => l.counterLine && c.counterRequestLeft !== null);
    if (request) {
      const slots = G.state.counter;
      slots.forEach((slot, i) => {
        const x = 46 + i * 78;
        const label = slot.productId ? `${product(slot.productId).name}\n×${slot.qty}` : 'Trống';
        const counterButton = new Button(this, x, PANEL_Y + 174, {
          w: 70,
          h: 44,
          label,
          color: slot.productId === request.productId ? C.green : C.grey,
          size: 10,
          onTap: () => {
            if (G.liveSnapshot) { void this.liveCommand({ type: 'serveCounter', slot: i }); return; }
            const result = this.session.serveCounterRequest(i);
            if (result === 'wrong' || result === 'empty') this.tweens.add({ targets: counterButton, x: x + 4, yoyo: true, repeat: 3, duration: 40, onComplete: () => counterButton.setX(x) });
          },
        });
        if (slot.productId === request.productId) this.counterPulseTween = this.tweens.add({ targets: counterButton, scale: 1.04, yoyo: true, repeat: -1, duration: 380 });
        L.add(counterButton);
      });
    }
    const cartValue = c.order.reduce((sum, line) => sum + (line.value ?? line.picked * product(line.productId).price), 0);
    L.add(txt(this, 18, PANEL_Y + 142, `Giỏ: ${formatMoney(cartValue)}`, { size: 12, color: HEX.muted }));
    if (!request) L.add(
      new Button(this, W - 82, PANEL_Y + 178, {
        w: 136,
        h: 48,
        label: 'Quét hết ✓',
        color: C.red,
        onTap: () => {
          if (G.liveSnapshot) void this.liveCommand({ type: 'scanAll' });
          else if (this.session.scanAll()) play('pick');
        },
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
        if (G.liveSnapshot) void this.liveCommand({ type: 'addBill', value: v });
        else this.session.addBill(v);
      });
      L.add(b);
    });

    const by = PANEL_Y + 204;
    const undo = new Button(this, 58, by, { w: 92, h: 44, label: '↩ Bỏ tờ', color: C.grey, size: 13, onTap: () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'undoBill' }); else this.session.undoBill();
    } });
    L.add(undo);
    L.add(new Button(this, 158, by, { w: 92, h: 44, label: '🧮 Tự tính', color: C.blue, size: 13, onTap: () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'autoChange' }); else this.session.autoChange();
    } }));
    L.add(new Button(this, W - 72, by, { w: 124, h: 48, label: 'Đưa ✓', color: C.green, size: 17, onTap: () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'giveChange' }); else this.session.giveChange();
    } }));
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
    if (!G.liveSnapshot) this.session.update(dtMs / 1000);
    this.renderAcc += dtMs;
    if (this.renderAcc >= 100) {
      this.renderAcc = 0;
      this.hud.refresh();
      this.shelves.render(G.state, this.shelfOpts());
      this.renderPanel();
      const canShowZoneActions = this.session.customers.length === 0;
      this.zoneRefillButtons.forEach(({ zone, button }) => button.setVisible(canShowZoneActions && G.state.zones.some((item) => item === zone)));
      this.checkQuestProgress();
    }
    this.session.customers.forEach((c) => {
      const v = this.views.get(c.id);
      if (!v) return;
      const r = c.patience / c.patienceMax;
      v.bar.setPosition(v.sprite.x - 18, v.sprite.y - 70);
      v.bar.set(r, r > 0.5 ? C.green : r > 0.25 ? C.yellow : C.red);
    });
    const requestLeft = this.session.front?.counterRequestLeft;
    if (this.counterTimerText?.active && requestLeft != null) {
      this.counterTimerText.setText(`⏱ ${Math.ceil(requestLeft)}s`);
      this.counterRequestBar?.set(requestLeft / Math.max(1, this.session.front?.counterRequestSeconds ?? 1), requestLeft <= 2 ? C.red : C.green);
    }
  }

  /** Báo khi một nhiệm vụ vừa xong trong ngày. */
  private checkQuestProgress(): void {
    const s = G.state;
    if (!s.quests) return;
    for (const entry of s.quests.list) {
      if (this.questsDoneSeen.has(entry.id)) continue;
      const q = questDef(entry.id);
      if (!questDone(s, q)) continue;
      this.questsDoneSeen.add(entry.id);
      play('levelup');
      toast(this, `🎯 Xong nhiệm vụ: ${q.text}!\nBấm 🎯 để nhận thưởng.`, 240, C.greenDark);
      if (this.questBtn) this.tweens.add({ targets: this.questBtn, scale: 1.25, yoyo: true, repeat: 3, duration: 180 });
    }
  }

  private finishDay(): void {
    if (this.ending) return;
    this.ending = true;
    if (G.liveSnapshot) {
      this.scene.start('Summary');
      return;
    }
    endDay(G.state);
    persist();
    stopMusic();
    toast(this, '🌙 Hết ngày! Đóng cửa tiệm...', 300);
    this.time.delayedCall(1200, () => this.scene.start('Summary'));
  }

  // ---------- Tạm dừng ----------

  private onHidden(): void {
    if (!G.liveSnapshot) persist();
    this.pause();
  }

  private onOrientation = (): void => this.pause();

  private pause(): void {
    if (this.pauseLayer || this.ending) return;
    if (!G.liveSnapshot) this.session.paused = true;
    setPlayClockRunning(false);
    if (!G.liveSnapshot) persist();
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
        if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoChange', value: G.state.settings.autoChange });
        else persist();
        // Khách đang chờ thối mà vừa bật tự động thì thối luôn.
        if (G.state.settings.autoChange) {
          if (G.liveSnapshot) void this.liveCommand({ type: 'autoChange' }); else this.session.autoChange();
        }
      },
    });
    L.add(autoBtn);
    const scanLabel = () => (G.state.settings.autoScan ? '📦 Tự quét giỏ: Bật' : '🧺 Tự quét giỏ: Tắt');
    const scanBtn = new Button(this, W / 2, 322, {
      w: 220,
      h: 44,
      label: scanLabel(),
      color: C.blue,
      onTap: () => {
        G.state.settings.autoScan = !G.state.settings.autoScan;
        scanBtn.setText(scanLabel());
        if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoScan', value: G.state.settings.autoScan });
        else persist();
      },
    });
    L.add(scanBtn);
    const sound = new Button(this, W / 2, 376, {
      w: 220,
      h: 44,
      label: G.state.settings.sound ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt',
      color: C.wood,
      onTap: () => {
        G.state.settings.sound = !G.state.settings.sound;
        setSoundEnabled(G.state.settings.sound);
        sound.setText(G.state.settings.sound ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt');
        if (!G.liveSnapshot) persist();
      },
    });
    L.add(sound);
    if (cloudSaveEnabled()) L.add(new Button(this, W / 2, 430, {
      w: 220,
      h: 44,
      label: '☁️ Tài khoản và đồng bộ',
      color: C.blue,
      onTap: () => {
        if (!G.liveSnapshot) persist();
        else suspendLiveShop();
        stopMusic();
        this.scene.start('Title', { login: false });
      },
    }));
    L.add(
      new Button(this, W / 2, 484, {
        w: 220,
        h: 44,
        label: '🏠 Về màn chính',
        color: C.grey,
        onTap: () => {
          if (!G.liveSnapshot) persist();
          else suspendLiveShop();
          stopMusic();
          this.scene.start('Title');
        },
      }),
    );
    L.add(
      txt(this, W / 2, 528, 'Tắt tự thối để tự chọn tờ tiền và có cơ hội nhận tip.\nĐã lưu tiến trình.', {
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
    if (!G.liveSnapshot) this.session.paused = false;
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
  }
}
