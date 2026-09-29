import Phaser from 'phaser';
import type { Customer } from '../core/customers';
import type { CustomerType } from '../core/data';
import { DATA, hasFeature, product, type Category } from '../core/data';
import { activeShopType } from '../core/shopTypes';
import { DaySession, endDay, runDayHeadless } from '../core/day';
import { orderShortfall, orderUnits, tripSeconds, type PhoneOrder } from '../core/delivery';
import { roleDef, moodLabel } from '../core/staff';
import { canGiveCredit } from '../core/ledger';
import { claimQuest, questDef, questDone, questProgress, questsUnlocked } from '../core/quests';
import { MAX_SHELVES, formatClock, formatMoney, warehouseQty, type Staff } from '../core/state';
import { askable, discountedCashTotal, orderTotal } from '../core/customers';
import { counterSlotLabel, orderLineName, qualityLabel, slotMatch } from '../core/customCups';
import { ensureDiningTables } from '../core/dining';
import { calendarDate } from '../core/calendar';
import { G, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { World, type Entity } from '../core/ecs';
import { dispatchLiveCommand, startLivePulses, stopLivePulses, suspendLiveShop } from '../services/liveShop';
import { cloudSaveEnabled } from '../services/firebase';
import { bakeStatic, bill, customerLook, customerSprite, drawShopInterior, ownerSprite, productIcon, setWalkFrame, staffSprite, updateBill } from '../ui/art';
import { Hud, HUD_H } from '../ui/hud';
import { LiveMap } from '../ui/liveMap';
import { ROW_PITCH, SHELF_VIEW_ROWS, ShelfView } from '../ui/shelves';
import { play, setSoundEnabled, startMusic, stopMusic, vibrate } from '../ui/sound';
import { Bar, Button, dialog, floatText, panel, roundBox, toast } from '../ui/widgets';
import { C, H, HEX, W, setEdgeColors, setupCamera, txt, type TextOpts } from '../ui/theme';
import { checkForUpdate, manualCheckMessage } from '../ui/updateBanner';
import { perfEnabled, recordPerfSection } from '../ui/perfOverlay';
import { setPowerIdle } from '../ui/powerSaver';
import { currentLayout, effectiveViewMode } from '../ui/layout';

const LANDSCAPE = W > H;
const SHELF_TOP = HUD_H + (LANDSCAPE ? 4 : 10);
/** Màn hình đủ cao thì hiện thêm 1 hàng kệ; sàn, quầy và ô bên dưới dời xuống tương ứng. */
const SHELF_ROWS = SHELF_VIEW_ROWS;
const DY = (SHELF_ROWS - MAX_SHELVES) * ROW_PITCH;
const FLOOR_Y = LANDSCAPE ? H - 140 : 262 + DY;
const COUNTER_Y = LANDSCAPE ? H - 92 : 330 + DY;
const FEET_Y = LANDSCAPE ? H - 72 : 352 + DY;
const PANEL_Y = LANDSCAPE ? H - 46 : 398 + DY;
const QUEUE_X = LANDSCAPE ? [0.24, 0.34, 0.44, 0.54, 0.64].map((v) => Math.round(W * v)) : [140, 184, 228, 272, 312];
const DOOR_X = W + 16;
const CUSTOMER_SCALE = 1.5;
type SaleZone = Exclude<Category, 'counter' | 'food' | 'beverage'>;
const ZONE_X: Record<SaleZone, number> = { dry: 60, snack: 175, household: 290, drink: 118, fresh: 232, frozen: 320 };
const ZONE_BUTTON: Record<SaleZone, string> = { dry: 'Nạp đồ khô', snack: 'Nạp ăn vặt', household: 'Nạp đồ dùng', drink: 'Nạp đồ uống', fresh: 'Nạp đồ tươi', frozen: 'Nạp đông lạnh' };

const lookOf = (c: Customer): CustomerType => customerLook(c);

interface CustomerView {
  sprite: Phaser.GameObjects.Image;
}

interface Walker {
  entity: Entity;
  sprite: Phaser.GameObjects.Image;
  type: CustomerType;
}

/** Phaser presentation data stored as ECS components; gameplay remains in DaySession. */
class ShopActorView {
  walking = false;
  constructor(readonly sprite: Phaser.GameObjects.Image, readonly type: CustomerType) {}
}

export class ShopScene extends Phaser.Scene {
  private session!: DaySession;
  private hud!: Hud;
  private shelves!: ShelfView;
  private views = new Map<number, CustomerView>();
  /** Gộp thanh kiên nhẫn của khách vào một Graphics để giảm draw call khi đông khách. */
  private customerBars!: Phaser.GameObjects.Graphics;
  /** Nhân vật đang đi (để đổi khung hình bước chân). */
  private walkers = new Set<Walker>();
  private readonly actorWorld = new World();
  private readonly actorEntities = new Map<number, Entity>();
  private walkFrame: 0 | 1 = 0;
  private panelLayer!: Phaser.GameObjects.Container;
  private panelMode: string = '';
  /** Sự kiện trong khung này đã yêu cầu dựng lại bảng dưới; dựng một lần ở cuối update(). */
  private panelQueued = false;
  /** Dấu vân tay khu nhân viên đã vẽ; trùng thì drawStaff() bỏ qua việc dựng lại. */
  private staffKey = '';
  /**
   * Text của bảng quét hàng được dùng lại giữa các lần dựng lại (mỗi lần quét một món là dựng lại cả bảng).
   * Tạo Text mới phải cấp canvas + texture (~1ms), setText trên Text cũ rẻ hơn nhiều lần.
   */
  private panelTextPool = new Map<string, Phaser.GameObjects.Text[]>();
  private panelTextKeys = new WeakMap<Phaser.GameObjects.Text, string>();
  private trayText: Phaser.GameObjects.Text | null = null;
  private trayBills: Phaser.GameObjects.Container | null = null;
  private readonly trayBillPool: Phaser.GameObjects.Container[] = [];
  private counterTimerText: Phaser.GameObjects.Text | null = null;
  /** Nút Pha ngay của bảng phục vụ hiện tại (để cập nhật số giây còn lại mỗi khung). */
  private brewButton: Button | null = null;
  private counterPulseTween: Phaser.Tweens.Tween | null = null;
  private counterRequestBar: Bar | null = null;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private zoneRefillButtons: { zone: SaleZone; button: Button }[] = [];
  private questBtn: Button | null = null;
  private restockBtn: Button | null = null;
  private counterBtn: Button | null = null;
  private questsDoneSeen = new Set<string>();
  private renderAcc = 0;
  private ending = false;
  /** Nhân viên đứng quầy và huy hiệu nhân viên khác trên mặt quầy. */
  private staffLayer!: Phaser.GameObjects.Container;
  private cashierX = new Map<string, number>();
  /** Chủ tiệm (người chơi) đứng ở quầy của mình, bên cạnh quầy thu ngân. */
  private ownerAvatar: Phaser.GameObjects.Image | null = null;
  /** Vị trí chủ tiệm đứng ở quầy của mình (tự động dịch sang trái khi có thêm thu ngân). */
  private get ownerX(): number {
    return (this.session && this.session.lanes && this.session.lanes.length > 0) ? 116 : 140;
  }
  private phoneBtn: Button | null = null;
  private ordersBtn: Button | null = null;
  private managerStatus: Phaser.GameObjects.Text | null = null;
  private weatherFx: Phaser.GameObjects.TileSprite | null = null;
  /** Dấu vân tay của lần vẽ thanh kiên nhẫn trước; trùng thì bỏ qua clear/vẽ lại. */
  private customerBarsKey = -1;
  private readonly customerBarsBuf: { x: number; y: number; width: number; color: number }[] = [];
  /** Sơ đồ trực tiếp (mặt bằng từ trên xuống, khách và nhân viên đi lại), chỉ để xem. */
  private liveMap!: LiveMap;
  /** Góc nhìn trên xuống để chơi: người chơi chạm ô để đi, tới kệ mới nạp, ở quầy mới tính tiền. */
  private playMap: LiveMap | null = null;
  private mapBtn: Button | null = null;
  /** Che bảng tính tiền khi người chơi đang ở xa quầy (góc nhìn trên xuống). */
  private awayCover: Phaser.GameObjects.Container | null = null;
  private awayText: Phaser.GameObjects.Text | null = null;
  /** Số giây người chơi không chạm màn hình; đủ ngưỡng trong cài đặt thì game chơi hộ quầy. */
  private idleSec = 0;
  private idleAuto = false;
  private idleBadge: Phaser.GameObjects.Container | null = null;
  private deliveryReminder: Phaser.GameObjects.Text | null = null;
  private deliveryReminderAcc = 0;
  private hotbarLayer: Phaser.GameObjects.Container | null = null;
  private hotbarRestockBtn: Button | null = null;
  private hotbarQuestBtn: Button | null = null;
  private ambientFx: Phaser.GameObjects.Rectangle | null = null;
  private interiorRt: Phaser.GameObjects.RenderTexture | null = null;
  private counterRt: Phaser.GameObjects.RenderTexture | null = null;
  private counterTexts: Phaser.GameObjects.GameObject[] = [];
  private reflowSession: DaySession | null = null;
  private reopenPauseAfterReflow = false;

  constructor() {
    super('Shop');
  }

  create(): void {
    setPlayClockRunning(true);
    setupCamera(this);
    setEdgeColors('#3b2618', '#2b1d14');
    this.views.clear();
    this.trayBillPool.length = 0;
    this.walkers.clear();
    this.actorEntities.clear();
    this.actorWorld.clear();
    this.panelMode = '';
    this.pauseLayer = null;
    this.ending = false;
    this.zoneRefillButtons = [];
    this.questBtn = null;
    this.restockBtn = null;
    this.counterBtn = null;
    this.questsDoneSeen = new Set((G.state.quests?.list ?? []).filter((q) => q.claimed || questDone(G.state, questDef(q.id))).map((q) => q.id));
    const s = G.state;
    this.session = this.reflowSession ?? (G.liveSnapshot?.dayRuntime
      ? DaySession.restore(s, G.liveSnapshot.dayRuntime)
      : new DaySession(s));
    this.reflowSession = null;
    this.customerBars = this.add.graphics().setDepth(150).setName('customer-patience-bars');
    this.customerBarsKey = -1;
    if (G.liveSnapshot) startLivePulses();
    // Chỉ bản dev: cho phép kiểm thử trên trình duyệt truy cập phiên bán (không có trong bản build).
    if (import.meta.env.DEV) (window as unknown as { __thdhShop?: ShopScene }).__thdhShop = this;

    // Tường, sàn gạch và quầy là hình tĩnh: gộp vào RenderTexture để giảm chi phí vẽ mỗi khung hình.
    this.interiorRt = bakeStatic(this, [drawShopInterior(this, HUD_H, FLOOR_Y, PANEL_Y)], 0);
    this.drawDayEffects(s);
    this.shelves = new ShelfView(this, SHELF_TOP, {
      onSlotTap: (r, c) => this.onSlotTap(r, c),
      onRefill: (r, c) => {
        if (G.liveSnapshot) void this.liveCommand({ type: 'startRefill', shelf: r, slot: c });
        else if (this.session.startRefill(r, c)) play('step');
      },
      onScroll: (atCounter) => this.counterBtn?.setVisible(!LANDSCAPE && !atCounter && !this.topDown),
    }, s, SHELF_ROWS);
    // Tiệm nhiều kệ: kéo một ngón để xem kệ phía sau, nút này đưa khung nhìn về các kệ sát quầy.
    this.counterBtn = new Button(this, W - 58, SHELF_TOP + SHELF_ROWS * ROW_PITCH - 8, { w: 100, h: 26, label: '↓ Về quầy', size: 11, color: C.blue, onTap: () => this.shelves.scrollToCounter() });
    this.counterBtn.setDepth(260).setVisible(!LANDSCAPE && !this.shelves.atCounter);
    this.playMap = null;
    this.awayCover = null;
    this.liveMap = new LiveMap(this, this.session, {
      mode: 'watch',
      onSwitchMode: G.liveSnapshot ? undefined : () => { this.liveMap.close(); this.setViewMode('topdown'); },
    });
    if (!LANDSCAPE) {
      this.mapBtn = new Button(this, 26, COUNTER_Y + 44, { w: 44, h: 40, label: '🗺️\nSơ đồ', size: 9, color: C.blue, onTap: () => this.liveMap.open() }).setDepth(260);
    }
    this.drawCounter();
    this.addZoneRefillButtons();
    this.hud = new Hud(this, s, {
      onPause: () => this.pause(),
      // Controlled comparison path: HTML/CSS text stays outside WebGL; default remains Phaser.
      htmlText: new URLSearchParams(window.location.search).get('shop-dom') === '1',
      // Xem lộ trình level giữa giờ bán thì dừng giờ (trừ khi đang ở menu tạm dừng hoặc chơi chung).
      onOverlay: (open) => { if (!G.liveSnapshot && !this.pauseLayer && !this.ending) this.session.paused = open; },
    });
    this.panelLayer = this.add.container(0, 0).setDepth(300);
    this.staffLayer = this.add.container(0, 0).setDepth(205);
    this.staffKey = '';
    this.panelQueued = false;
    this.panelTextPool.clear();
    this.cashierX.clear();
    this.phoneBtn = null;
    this.ordersBtn = null;
    this.managerStatus = null;
    this.drawStaff();
    this.applyViewMode();
    this.deliveryReminder = txt(this, LANDSCAPE ? 104 : W - 8, HUD_H + 4, '', { size: 9, bold: true, color: HEX.cream, origin: LANDSCAPE ? [0, 0] : [1, 0] }).setDepth(280).setBackgroundColor('#3b2618dd').setPadding(4, 2, 4, 2);
    this.updateDeliveryReminder();
    if (LANDSCAPE) {
      this.ambientFx = this.add.rectangle(0, HUD_H, W, H - HUD_H, 0x000000, 0)
        .setOrigin(0, 0)
        .setDepth(265);
      this.drawLandscapeHotbar();
      this.updateAmbientFx();
    }
    if (this.topDown && !G.state.tutorialsSeen.includes('topdown')) this.topDownTutorial();

    this.wireEvents();
    this.idleSec = 0;
    this.idleAuto = false;
    this.idleBadge = this.add.container(W / 2, PANEL_Y - 12).setDepth(350).setVisible(false);
    this.idleBadge.add([
      this.add.rectangle(0, 0, 250, 24, 0x2b1d14, 0.85).setStrokeStyle(1, C.yellow),
      txt(this, 0, 0, '🤖 Đang chơi hộ · chạm màn hình để tự chơi', { size: 11, bold: true, color: HEX.cream, origin: [0.5, 0.5] }),
    ]);
    this.input.on('pointerdown', () => this.onPlayerInput());
    const onPlayKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === 'Escape') {
        if (this.liveMap.visible) this.liveMap.close();
        else if (this.pauseLayer) this.resume();
        else this.pause();
        event.preventDefault();
        return;
      }
      if (this.pauseLayer) return;
      if (event.key.toLowerCase() === 'm') {
        if (this.liveMap.visible) this.liveMap.close();
        else this.liveMap.open();
        event.preventDefault();
        return;
      }
      if (this.liveMap.visible) return;
      if (event.key === '1') {
        if (this.topDown) this.playMap?.walkToCounter();
        event.preventDefault();
        return;
      }
      if (event.key === '2') {
        if (activeShopType(G.state).def.service === 'counter') this.openKitchen();
        else this.openRestock();
        event.preventDefault();
        return;
      }
      if (event.key === '3') {
        if (this.liveMap.visible) this.liveMap.close();
        else this.liveMap.open();
        event.preventDefault();
        return;
      }
      if (event.key === '4') {
        if (questsUnlocked(G.state)) this.showQuests();
        else if (hasFeature(G.state.level, 'dining')) this.openDining();
        event.preventDefault();
        return;
      }
      if (event.key === '5') {
        if (questsUnlocked(G.state) && hasFeature(G.state.level, 'dining')) this.openDining();
        event.preventDefault();
        return;
      }
      if (!this.topDown || G.liveSnapshot) return;
      const handled = this.playMap?.handlePlayKey(event.key) ?? false;
      if (handled) event.preventDefault();
    };
    this.input.keyboard?.on('keydown', onPlayKey);
    this.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        this.walkFrame = this.walkFrame === 0 ? 1 : 0;
        for (const [, actor] of this.actorWorld.query(ShopActorView)) {
          if (actor.walking && actor.sprite.active) setWalkFrame(actor.sprite, actor.type, this.walkFrame);
        }
      },
    });
    this.renderPanel(true);
    this.shelves.render(s, this.shelfOpts());
    if (this.reopenPauseAfterReflow) {
      this.reopenPauseAfterReflow = false;
      this.time.delayedCall(0, () => this.pause());
    }

    this.game.events.on('hidden', this.onHidden, this);
    const onViewportChanged = () => {
      const next = effectiveViewMode(currentLayout().profile, G.state.settings.viewMode, !!G.liveSnapshot);
      const active = this.topDown ? 'topdown' : 'side';
      if (active !== next) this.applyViewMode();
    };
    window.addEventListener('resize', onViewportChanged);
    const onLiveUpdated = () => this.syncLiveSnapshot();
    window.addEventListener('thdh-live-updated', onLiveUpdated);
    // Shop bị pause khi mở Dining/Restock...: trả nhịp FPS đầy đủ cho scene phía trên.
    const leaveIdle = () => setPowerIdle(false);
    this.events.on('pause', leaveIdle);
    this.events.on('sleep', leaveIdle);
    this.events.once('shutdown', () => {
      leaveIdle();
      this.events.off('pause', leaveIdle);
      this.events.off('sleep', leaveIdle);
      this.actorEntities.clear();
      this.actorWorld.clear();
      this.input.keyboard?.off('keydown', onPlayKey);
      this.game.events.off('hidden', this.onHidden, this);
      window.removeEventListener('resize', onViewportChanged);
      window.removeEventListener('thdh-live-updated', onLiveUpdated);
      stopLivePulses();
      this.session.events.clear();
      this.hotbarLayer?.destroy();
      this.hotbarLayer = null;
      this.ambientFx?.destroy();
      this.ambientFx = null;
    });
    if (s.settings.sound) startMusic();
    if (s.clock > DATA.balance.openMinute + 5) toast(this, `Tiếp tục bán lúc ${formatClock(s.clock)}`);
  }

  /** Event/season artwork is created only for the current day; no seasonal textures are loaded on ordinary days. */
  private drawDayEffects(state: typeof G.state): void {
    const events = state.activeEvents.filter((event) => event.day <= state.day && event.endsDay >= state.day);
    if (events.some((event) => event.id === 'power_outage')) {
      this.add.rectangle(W / 2, H / 2, W, H, 0x171521, 0.42).setDepth(190).setName('blackout-overlay');
      this.add.text(W - 24, HUD_H + 18, '⚡ CÚP ĐIỆN', { fontFamily: 'sans-serif', fontSize: '10px', color: '#ffe0a3', backgroundColor: '#302833', padding: { x: 5, y: 3 } }).setOrigin(1, 0).setDepth(191);
    }
    this.weatherFx = null;
    if (events.some((event) => event.id === 'heavy_rain')) {
      // Mưa chỉ hiện ở ngưỡng cửa bên phải; không phủ lên không gian bên trong tiệm.
      this.weatherFx = this.add.tileSprite(W - 50, FLOOR_Y + 24, 46, Math.max(24, PANEL_Y - FLOOR_Y - 36), this.rainTexture()).setOrigin(0, 0).setDepth(189).setAlpha(0.65);
    }
    const date = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear });
    const seasonal = date.month === 1 ? { label: '✿', color: 0xffce58 }
      : date.month === 5 || date.month === 6 || date.month === 7 ? { label: '☀', color: 0xffe082 }
        : date.month === 8 ? { label: '☾', color: 0xffdc81 }
          : date.month === 9 ? { label: '✎', color: 0xffe3a3 }
            : null;
    if (seasonal) {
      const trim = this.add.graphics().setDepth(1);
      trim.fillStyle(seasonal.color, 0.85).fillCircle(14, HUD_H + 22, 9);
      this.add.text(14, HUD_H + 21, seasonal.label, { fontFamily: 'sans-serif', fontSize: '12px', color: '#593d29' }).setOrigin(0.5).setDepth(2);
    }
  }

  /**
   * Mưa là một ô họa tiết vẽ sẵn một lần rồi trượt trên GPU (một quad), thay cho việc
   * clear + vẽ lại 24 nét Graphics mỗi 50ms. Mật độ và vận tốc giữ như bản cũ.
   */
  private rainTexture(): string {
    const key = 'fx-rain-tile';
    if (this.textures.exists(key)) return key;
    const size = 128;
    const g = this.make.graphics({}, false);
    g.lineStyle(1, 0xa9dcff, 0.56);
    for (const [x, y] of [[20, 12], [92, 58], [54, 104]]) g.lineBetween(x, y, x - 4, y + 9);
    g.generateTexture(key, size, size);
    g.destroy();
    return key;
  }

  private scrollRain(dtMs: number): void {
    if (!this.weatherFx) return;
    // Bản cũ dịch (+5, +9) mỗi 70ms ≈ (71, 129) px/giây.
    const sec = Math.min(dtMs, 250) / 1000;
    this.weatherFx.tilePositionX -= 71 * sec;
    this.weatherFx.tilePositionY -= 129 * sec;
  }

  private drawCounter(): void {
    const g = this.add.graphics();
    g.fillStyle(C.woodLight, 1).fillRect(0, COUNTER_Y, W - 56, 10);
    g.fillStyle(C.wood, 1).fillRect(0, COUNTER_Y + 10, W - 56, PANEL_Y - COUNTER_Y - 10);
    for (let x = 16; x < W - 56; x += 40) g.fillStyle(C.woodDark, 1).fillRect(x, COUNTER_Y + 16, 2, PANEL_Y - COUNTER_Y - 22);
    this.counterRt = bakeStatic(this, [g], 200);
    this.counterTexts = [
      txt(this, 22, COUNTER_Y - 10, '🧾', { size: 22, emoji: true, origin: [0.5, 0.5] }).setDepth(201),
      txt(this, W - 90, COUNTER_Y + 30, 'QUẦY', { size: 12, bold: true, color: '#f6e3c4', origin: [0.5, 0.5] }).setDepth(201),
    ];
  }

  /** Bộ máy tính tiền pixel art (màn hình + bàn phím + ngăn kéo) đặt trên mặt quầy, chỗ chủ tiệm đứng. */
  private drawCashRegister(g: Phaser.GameObjects.Graphics, cx: number): void {
    const screenW = 30;
    const screenH = 20;
    const top = COUNTER_Y + 12;
    // Màn hình CRT cũ kiểu máy tính tiền thập niên 90, hợp phong cách hoài niệm của tiệm.
    g.fillStyle(0x241a12, 1).fillRect(cx - screenW / 2 - 3, top, screenW + 6, screenH + 6);
    g.fillStyle(0x2f6b3a, 1).fillRect(cx - screenW / 2, top + 3, screenW, screenH);
    g.fillStyle(0x7ee08a, 0.85).fillRect(cx - screenW / 2 + 3, top + 6, screenW - 12, 2);
    g.fillStyle(0x7ee08a, 0.6).fillRect(cx - screenW / 2 + 3, top + 11, screenW - 8, 2);
    g.fillStyle(0x7ee08a, 0.6).fillRect(cx - screenW / 2 + 3, top + 16, screenW - 16, 2);
    // Chân đế màn hình
    g.fillStyle(0x241a12, 1).fillRect(cx - 4, top + screenH + 6, 8, 5);
    g.fillStyle(0x3a2c1c, 1).fillRect(cx - 12, top + screenH + 11, 24, 3);
    // Bàn phím
    g.fillStyle(0xcfc2a0, 1).fillRoundedRect(cx - 16, top + 32, 32, 10, 2);
    g.fillStyle(0xb7a97e, 1);
    for (let kx = cx - 13; kx < cx + 13; kx += 5) g.fillRect(kx, top + 34, 3, 3);
    // Ngăn kéo đựng tiền
    g.fillStyle(0x8d8d8d, 1).fillRoundedRect(cx - 18, top + 44, 36, 8, 2);
    g.fillStyle(0x5c5c5c, 1).fillRect(cx - 14, top + 47, 28, 2);
    g.fillStyle(0xc0392b, 1).fillRect(cx - 3, top + 44, 6, 2);
  }

  /** Nút nạp cả khu (hiện khi quầy vắng khách), tối đa 6 khu xếp 2 hàng. */
  private addZoneRefillButtons(): void {
    const zones = (Object.keys(ZONE_BUTTON) as SaleZone[]).filter((zone) => G.state.zones.some((item) => item === zone));
    const many = zones.length > 3;
    zones.forEach((zone, index) => {
      if (LANDSCAPE) {
        const button = new Button(this, W - 74, HUD_H + 46 + index * 30, {
          w: 136, h: 26, label: ZONE_BUTTON[zone], color: C.wood, size: 9,
          onTap: () => {
            if (G.liveSnapshot) void this.liveCommand({ type: 'refillZone', zone });
            else if (this.session.refillZone(zone)) play('step');
            else toast(this, 'Khu này chưa có ô cần nạp');
          },
        });
        this.zoneRefillButtons.push({ zone, button });
        return;
      }
      const col = index % 3;
      const row = Math.floor(index / 3);
      const button = new Button(this, 54 + col * 102, many ? 280 + DY + row * 29 : 286 + DY, {
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
    if (!LANDSCAPE && questsUnlocked(G.state)) {
      this.questBtn = new Button(this, W - 26, 286 + DY, { w: 40, h: 34, label: '🎯', size: 16, color: C.blue, onTap: () => this.showQuests() });
      this.questBtn.setDepth(270);
    }
    // Luôn hiện: tạm dừng tiệm để nhập thêm hàng và bày lên kệ (hoặc vào bếp ở tiệm xôi).
    const counterShop = activeShopType(G.state).def.service === 'counter';
    const restockAction = () => (counterShop ? this.openKitchen() : this.openRestock());
    if (!LANDSCAPE) {
      this.restockBtn = new Button(this, W - 26, 324 + DY, { w: 44, h: 36, label: counterShop ? '🍙' : '📦', size: 18, color: C.green, onTap: restockAction });
      this.restockBtn.setDepth(270);
      this.add.text(W - 26, 344 + DY, counterShop ? 'Vào bếp' : 'Nhập hàng', { fontFamily: 'sans-serif', fontSize: '8px', color: '#fff6e2', backgroundColor: '#2f7a3d', padding: { x: 2, y: 1 } }).setOrigin(0.5, 0).setDepth(271);
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
        if (money) { play('coin'); floatText(this, W / 2, 240 + DY, `🎯 +${formatMoney(money)}`, HEX.green, 18); }
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
    }
    this.views.clear();
    this.walkers.clear();
    this.actorEntities.clear();
    this.actorWorld.clear();
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
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, `💸 Đắt quá! (${product(productId).name})`, HEX.red, 12);
    });
    e.on('notCold', ({ customer }) => {
      const v = this.views.get(customer.id);
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, '🥵 Không lạnh à?', '#1f5fa0', 12);
    });
    e.on('catPetted', (customer) => {
      const v = this.views.get(customer.id);
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, '🐱❤️', HEX.red, 16);
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
    e.on('bargainRequested', () => this.queuePanel());
    e.on('creditRequested', () => this.queuePanel());
    e.on('bargainResolved', ({ customer, accepted, left }) => {
      const v = this.views.get(customer.id);
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, accepted ? '🥰 Cảm ơn nha!' : left ? '😤 Thôi khỏi mua!' : '😒 Ừ thì mua...', accepted ? HEX.green : HEX.red, 13);
      this.queuePanel();
    });
    e.on('creditResolved', ({ customer, granted, amount }) => {
      const v = this.views.get(customer.id);
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74, granted ? `📒 Ghi sổ ${formatMoney(amount)}` : '😞 Thôi vậy...', granted ? '#1f5fa0' : HEX.red, 13);
      this.queuePanel();
    });
    e.on('basketReady', () => { this.layoutQueue(); this.queuePanel(); });
    e.on('customerFront', () => this.queuePanel());
    e.on('itemTaken', ({ customer, productId, shelf, slot }) => {
      play('pick');
      this.shelves.pop(shelf, slot);
      this.flyItem(productId, shelf, slot, customer);
      this.queuePanel();
    });
    e.on('itemMissing', ({ customer }) => {
      play('wrong');
      vibrate(60);
      const v = this.views.get(customer.id);
      if (v) this.sideFloat(v.sprite.x, v.sprite.y - 70, '🙁 Hết!', HEX.red, 13);
      // Nhắc nút nhập hàng khi khách hỏi món đã hết.
      const targetBtn = this.hotbarRestockBtn ?? this.restockBtn;
      if (targetBtn && !this.tweens.isTweening(targetBtn)) this.tweens.add({ targets: targetBtn, scale: 1.15, yoyo: true, repeat: 2, duration: 160 });
    });
    e.on('stockAsking', () => this.queuePanel());
    e.on('stockAsked', ({ customer, productId, found, missing }) => {
      const v = this.views.get(customer.id);
      const name = product(productId).name;
      if (found > 0) play('pick');
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 74,
        found > 0 ? `📦 Kho còn ${name}!${missing > 0 ? ` (thiếu ${missing})` : ''}` : `🙁 Hết ${name} thật rồi`, found > 0 ? HEX.green : HEX.red, 12);
      this.queuePanel();
    });
    e.on('itemScanned', () => this.queuePanel());
    e.on('counterRequested', ({ customer, productId, seconds, variantId }) => {
      const v = this.views.get(customer.id);
      this.sideFloat(v?.sprite.x ?? W / 2, FEET_Y - 78, `Sau quầy: ${orderLineName({ productId, variantId })} · ${seconds}s`, '#1f5fa0', 12);
      this.queuePanel();
    });
    e.on('counterServed', () => { play('pick'); this.queuePanel(); });
    e.on('counterWrong', ({ customer }) => {
      play('wrong'); vibrate(60);
      const v = this.views.get(customer.id);
      if (v) this.sideFloat(v.sprite.x, v.sprite.y - 70, 'Sai món!', HEX.red, 13);
    });
    e.on('counterVariant', ({ customer, fit }) => {
      const v = this.views.get(customer.id);
      if (!v || fit === 'exact') return;
      this.sideFloat(v.sprite.x, v.sprite.y - 70, fit === 'worse' ? 'Ly chưa đúng ý · −1 sao' : 'Được ly xịn hơn', fit === 'worse' ? HEX.red : HEX.green, 12);
    });
    e.on('brewStarted', () => { play('pick'); this.queuePanel(); });
    e.on('brewDone', ({ customer, quality, by }) => {
      play('pick');
      const v = this.views.get(customer.id);
      if (v && quality !== undefined) this.sideFloat(v.sprite.x, v.sprite.y - 70, `${by ? by + ': ' : ''}${qualityLabel(quality)}`, quality >= 0.95 ? HEX.green : HEX.ink, 12);
      this.queuePanel();
    });
    e.on('brewCancelled', ({ customer }) => {
      const v = this.views.get(customer.id);
      if (v) this.sideFloat(v.sprite.x, v.sprite.y - 70, 'Khách bỏ đi · mẻ bị bỏ', HEX.red, 12);
      this.queuePanel();
    });
    e.on('counterExpired', () => this.queuePanel());
    e.on('paymentStarted', () => this.queuePanel());
    e.on('trayChanged', () => this.renderTray());
    e.on('changeResult', ({ result, given, customer, auto }) => {
      if (auto && customer.changeDue > 0) {
        const v = this.views.get(customer.id);
        this.sideFloat(v?.sprite.x ?? 80, 306 + DY, `🧮 Thối ${formatMoney(customer.changeDue)}`, '#1f5fa0', 13);
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
      this.sideFloat(x, 266 + DY, `+${formatMoney(amount)}`, HEX.green, 17);
      if (tip > 0) this.time.delayedCall(250, () => this.sideFloat(x + 40, 248 + DY, `+${formatMoney(tip)} tip`, '#b7791f', 14));
    });
    e.on('invoice', ({ customer, issued }) => {
      const v = this.views.get(customer.id);
      this.sideFloat(v?.sprite.x ?? W / 2, (v?.sprite.y ?? FEET_Y) - 90, issued ? '🧾 Xuất hóa đơn' : '🧾 Không có hóa đơn!', issued ? HEX.green : HEX.red, 13);
    });
    e.on('customerLeft', ({ customer, reason, stars }) => this.removeCustomer(customer, reason, stars));
    e.on('refillDone', () => play('pick'));
    e.on('closing', () => {
      play('door');
      const early = G.state.today.closedEarlyAt;
      toast(this, early !== undefined
        ? `🚪 Đóng cửa sớm lúc ${formatClock(early)}. Tính tiền nốt khách đang chờ rồi nghỉ.`
        : `${formatClock(DATA.balance.closeMinute)} rồi! Đóng cửa sau khi phục vụ nốt khách.`, 300);
      this.queuePanel();
    });
    e.on('dayEnded', () => this.finishDay());
    // ---------- Giai đoạn 3 ----------
    e.on('staffArrived', (st) => { this.drawStaff(); this.layoutQueue(); toast(this, `${roleDef(st.role).icon} ${st.name} vào ca`, 300, C.greenDark); });
    e.on('staffLeft', () => { this.drawStaff(); this.layoutQueue(); });
    e.on('lanesChanged', () => { this.drawStaff(); this.layoutQueue(); this.queuePanel(); });
    e.on('staffTired', (st) => this.sideFloat(this.cashierX.get(st.id) ?? 120, COUNTER_Y - 8, `💦 ${st.name} mệt`, '#1f5fa0', 12));
    e.on('staffMistake', ({ staff, kind, amount }) => {
      this.sideFloat(this.cashierX.get(staff.id) ?? W / 2, COUNTER_Y - 8, kind === 'over' ? `😅 Thối dư ${formatMoney(amount)}` : `😠 Khách: thối thiếu!`, HEX.red, 12);
    });
    e.on('staffLevelUp', (st) => { play('levelup'); toast(this, `⭐ ${st.name} lên cấp ${st.level}!`, 240, C.greenDark); this.drawStaff(); });
    e.on('staffRefill', ({ shelf, slot, qty }) => {
      const at = this.shelves.slotCenter(shelf, slot);
      this.sideFloat(at.x, at.y, `🧺+${qty}`, HEX.green, 12);
    });
    e.on('staffServed', ({ customer }) => {
      const v = this.views.get(customer.id);
      if (v) this.sideFloat(v.sprite.x, 266 + DY, `+${formatMoney(customer.total)}`, HEX.green, 14);
    });
    e.on('thiefFleeing', (c) => this.thiefRuns(c));
    e.on('thiefCaught', ({ by, fine }) => {
      play(by === 'player' ? 'coin' : 'error');
      vibrate(80);
      const who = by === 'camera' ? '🚨 Camera báo động!' : by === 'staff' ? '👀 Nhân viên phát hiện trộm!' : '✋ Bắt quả tang!';
      toast(this, `${who}\nTrả hàng + bồi thường ${formatMoney(fine)}`, 240, C.greenDark);
    });
    e.on('thiefEscaped', ({ cost }) => { play('wrong'); toast(this, `🏃 Kẻ trộm chạy mất! Mất ${formatMoney(cost)} tiền hàng`, 240, C.red); });
    // Góc nhìn ngang không có bong bóng trên đầu: báo nhắc nhở bằng dòng chữ nổi.
    e.on('queueScold', ({ by }) => {
      if (this.topDown || this.liveMap.visible) return;
      const who = by === 'player' ? 'Bạn' : this.session.staffOf(by)?.name ?? 'Thu ngân';
      this.sideFloat(W / 2, 240 + DY, `🗯️ ${who}: "Chen gì mà chen, ra sau xếp hàng!"`, HEX.red, 12);
    });
    e.on('counterfeit', ({ by, bill, action }) => {
      const who = by === 'player' ? 'Bạn' : this.session.staffOf(by)?.name ?? 'Thu ngân';
      play(action === 'police' ? 'error' : 'wrong');
      toast(this, action === 'police'
        ? `🚓 ${who} phát hiện tờ ${formatMoney(bill)} giả!\nĐã báo công an, người dùng tiền giả bị đưa đi.`
        : `💸 ${who} phát hiện tờ ${formatMoney(bill)} giả, trả lại cho khách${action === 'left' ? ' — khách bỏ đi' : ' đổi tờ khác'}.`, 240, action === 'police' ? C.blue : C.red);
    });
    e.on('rowdy', ({ by, guard }) => {
      if (this.topDown || this.liveMap.visible) return;
      const who = by === 'player' ? 'Bạn' : this.session.staffOf(by)?.name ?? 'Nhân viên';
      this.sideFloat(W / 2, 200 + DY, `${guard ? '💂' : '🗯️'} ${who}: "Giữ trật tự giùm nha!"`, HEX.red, 12);
    });
    e.on('phoneRing', () => { play('door'); vibrate(40); this.updatePhone(); });
    e.on('phoneOrderUpdate', () => this.updatePhone());
    e.on('incident', (i) => {
      if (i.kind === 'complaint' && !G.state.today.managerDay) toast(this, `😠 ${i.text}`, 300, C.redDark);
      if (G.state.today.managerDay) this.queuePanel();
    });
  }

  // ---------- Nhân viên ----------

  /** Vị trí đứng của thu ngân theo quầy của họ (bên phải quầy chung). */
  private laneX(index: number): number {
    return 222 + index * 58;
  }

  private drawStaff(): void {
    if (!this.staffLayer) return;
    // staffArrived/staffLeft/lanesChanged/lên cấp bắn khá thường xuyên; hình chỉ đổi khi quầy, mặt hoặc danh sách người đổi.
    const faceOf = (st: Staff) => (this.session.workerOf(st.id)?.tired ? '💦' : moodLabel(st.mood).icon);
    const lanesKey = this.session.lanes.map((lane) => {
      const st = this.session.staffOf(lane.staffId);
      return st ? `${st.id}:${lane.closing ? 1 : 0}:${faceOf(st)}` : '-';
    }).join(',');
    const othersKey = this.session.presentStaff().map((st) => `${st.id}:${st.role}:${this.session.workerOf(st.id)?.tired ? 1 : 0}`).join(',');
    const key = `${lanesKey}|${othersKey}`;
    if (key === this.staffKey && this.staffLayer.list.length) return;
    this.staffKey = key;
    this.staffLayer.removeAll(true);
    this.cashierX.clear();

    // Máy tính tiền (POS CRT) đặt trên mặt quầy cho quầy của Bạn và từng quầy nhân viên
    const regG = this.add.graphics();
    this.drawCashRegister(regG, this.ownerX - 28);
    this.session.lanes.forEach((_lane, i) => {
      this.drawCashRegister(regG, this.laneX(i) - 28);
    });
    this.staffLayer.add(regG);

    this.ownerAvatar = ownerSprite(this, this.ownerX, PANEL_Y + 2).setScale(0.75).setFlipX(true);
    this.ownerAvatar.setVisible(this.session.playerAway <= 0);
    this.staffLayer.add([
      this.ownerAvatar,
      txt(this, this.ownerX, COUNTER_Y + 50, 'Bạn', { size: 9, bold: true, color: HEX.cream, origin: [0.5, 0.5] }),
    ]);
    this.session.lanes.forEach((lane, i) => {
      const st = this.session.staffOf(lane.staffId);
      if (!st) return;
      const x = this.laneX(i);
      this.cashierX.set(st.id, x);
      const sprite = staffSprite(this, x, PANEL_Y + 2, st).setScale(0.75).setFlipX(true);
      if (lane.closing) sprite.setAlpha(0.6);
      const w = this.session.workerOf(st.id);
      const face = w?.tired ? '💦' : moodLabel(st.mood).icon;
      this.staffLayer.add([
        sprite,
        txt(this, x, COUNTER_Y + 50, st.name.split(' ').slice(-1)[0], { size: 9, bold: true, color: HEX.cream, origin: [0.5, 0.5] }),
        txt(this, x + 14, COUNTER_Y + 4, face, { size: 11, emoji: true, origin: [0.5, 0.5] }),
      ]);
    });
    // Nhân viên khác đang có mặt: huy hiệu nhỏ góc trái mặt quầy.
    const others = this.session.presentStaff().filter((st) => st.role !== 'guard' && (st.role !== 'cashier' || !this.cashierX.has(st.id)));
    others.forEach((st, i) => {
      const w = this.session.workerOf(st.id);
      const label = `${roleDef(st.role).icon}${st.name.split(' ').slice(-1)[0]}${w?.tired ? '💦' : ''}`;
      this.staffLayer.add(txt(this, 8 + i * 58, COUNTER_Y + 44, label, { size: 9, bold: true, color: HEX.cream }).setBackgroundColor('#5a3a22').setPadding(2, 1, 2, 1));
    });
    const guard = this.session.presentStaff().find((st) => st.role === 'guard');
    if (guard && !this.topDown) {
      const x = W - 30;
      this.staffLayer.add([
        staffSprite(this, x, FLOOR_Y + 16, guard).setScale(0.62),
        txt(this, x, FLOOR_Y + 52, `💂 ${guard.name.split(' ').slice(-1)[0]} · cửa/xe`, { size: 9, bold: true, color: HEX.cream, origin: [0.5, 0.5] }).setBackgroundColor('#5a3a22').setPadding(3, 1, 3, 1),
      ]);
    }
  }

  /** Kẻ trộm chạy ra cửa: chạm vào trong 3 giây để bắt. */
  private thiefRuns(c: Customer): void {
    const v = this.views.get(c.id);
    if (!v) return;
    play('error');
    vibrate(120);
    // Góc nhìn trên xuống: bắt trộm bằng cách chạy lại gần trên sơ đồ.
    if (this.topDown) return;
    v.sprite.setTint(0xff9a8a).setY(FEET_Y - 20).setFlipX(true);
    const mark = txt(this, v.sprite.x, v.sprite.y - 70, '🚨 Chạm để bắt!', { size: 12, bold: true, color: HEX.red, origin: [0.5, 0.5], stroke: '#ffffff' }).setDepth(900);
    this.tweens.killTweensOf(v.sprite);
    const walker = this.startWalking(v.sprite, lookOf(c));
    const seconds = DATA.balance.security.catchWindowSeconds;
    this.tweens.add({ targets: v.sprite, x: DOOR_X, duration: seconds * 1000, onUpdate: () => mark.setPosition(v.sprite.x, v.sprite.y - 70), onComplete: () => { this.stopWalking(walker); mark.destroy(); } });
    v.sprite.setInteractive({ useHandCursor: true });
    v.sprite.once('pointerdown', () => {
      mark.destroy();
      if (!this.session.catchThief(c.id)) return;
    });
    this.time.delayedCall(seconds * 1000 + 50, () => { if (mark.active) mark.destroy(); });
  }

  // ---------- Điện thoại bàn / giao hàng ----------

  private updatePhone(): void {
    const ringing = this.session.phoneOrders.find((o) => o.status === 'ringing');
    if (ringing && !this.phoneBtn) {
      this.phoneBtn = new Button(this, W - 26, 248 + DY, { w: 44, h: 34, label: '☎️', size: 18, color: C.red, onTap: () => this.answerPhone() }).setDepth(270);
      this.tweens.add({ targets: this.phoneBtn, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 90 });
    } else if (!ringing && this.phoneBtn) {
      this.tweens.killTweensOf(this.phoneBtn);
      this.phoneBtn.destroy();
      this.phoneBtn = null;
    }
    const waiting = this.session.phoneOrders.filter((o) => o.status === 'accepted' && !o.courier);
    const courier = G.state.staff.some((st) => st.role === 'delivery' && this.session.workerOf(st.id)?.present);
    if (waiting.length && !courier && !this.ordersBtn) {
      this.ordersBtn = new Button(this, W - 70, 212 + DY, { w: 124, h: 30, label: '', size: 11, color: C.blue, onTap: () => this.selfDeliver() }).setDepth(270);
    }
    if (this.ordersBtn && (!waiting.length || courier)) {
      this.ordersBtn.destroy();
      this.ordersBtn = null;
    }
    this.ordersBtn?.setText(`🛵 ${waiting.length} đơn chờ giao`);
  }

  private orderText(o: PhoneOrder): string {
    const items = Object.entries(o.items).map(([id, q]) => `${q} ${product(id).name.toLowerCase()}`).join(', ');
    return `${o.name} (${o.place}) đặt: ${items}.\nTiền hàng ${formatMoney(o.value)} + ship ${formatMoney(o.fee)} · giao trước ${formatClock(o.deadline)}`;
  }

  private answerPhone(): void {
    const o = this.session.phoneOrders.find((x) => x.status === 'ringing');
    if (!o) return;
    if (!G.liveSnapshot) this.session.paused = true;
    const resume = () => { if (!G.liveSnapshot && !this.pauseLayer) this.session.paused = false; this.updatePhone(); };
    const short = orderShortfall(G.state, o.items);
    const shortText = short.length ? `\n❌ Thiếu: ${short.map((x) => `${x.missing} ${product(x.productId).name.toLowerCase()}`).join(', ')}` : '';
    const buttons = short.length
      ? [{ label: 'Không đủ hàng · từ chối', color: C.grey, onTap: () => { this.session.declineOrder(o.id); resume(); } }]
      : [
        { label: `✓ Nhận (${orderUnits(o)} món)`, color: C.green, onTap: () => {
          this.session.acceptOrder(o.id);
          play('pick');
          resume();
          this.updatePhone();
        } },
        { label: 'Từ chối', color: C.grey, onTap: () => { this.session.declineOrder(o.id); resume(); } },
      ];
    dialog(this, { icon: '☎️', title: 'Đơn giao hàng', body: this.orderText(o) + shortText, buttons, width: 320 });
  }

  private selfDeliver(): void {
    const o = this.session.phoneOrders.find((x) => x.status === 'accepted' && !x.courier);
    if (!o) return;
    const secs = Math.round(tripSeconds(o.distance));
    dialog(this, {
      icon: '🛵',
      title: `Tự đi giao cho ${o.name}?`,
      body: `Đi về mất khoảng ${secs} giây. Quầy của bạn bỏ trống trong lúc đó (khách mới sang quầy nhân viên hoặc phải chờ).\nHạn giao ${formatClock(o.deadline)}.`,
      buttons: [
        { label: 'Đi giao ngay', color: C.green, onTap: () => { if (this.session.selfDeliver(o.id)) { play('door'); this.renderPanel(true); } this.updatePhone(); } },
        { label: 'Để sau', color: C.grey },
      ],
    });
  }

  // ---------- Chế độ quản lý ----------

  private get managerView(): boolean {
    return G.state.today.managerDay && !this.session.playerLaneOpen() && !this.session.front;
  }

  private renderManager(): void {
    const L = this.panelLayer;
    const s = G.state;
    if (LANDSCAPE) {
      const { x: rx, y: ry, w: rw, h: rh } = this.railBounds;
      L.add(txt(this, rx + 14, ry + 12, '🧑‍💼 Nhân viên quản lý', { size: 13, bold: true, color: HEX.cream }));
      this.managerStatus = txt(this, rx + 14, ry + 36, '', { size: 10, color: HEX.muted, wrap: rw - 24 });
      L.add(this.managerStatus);
      this.updateManagerStatus();
      DATA.balance.manager.speeds.forEach((sp, i) => {
        L.add(new Button(this, rx + 24 + i * 44, ry + 82, { w: 38, h: 26, label: `x${sp}`, size: 11, color: s.manager.speed === sp ? C.red : C.wood, onTap: () => {
          s.manager.speed = sp;
          this.renderPanel(true);
        } }));
      });
      L.add(new Button(this, rx + rw - 48, ry + 82, { w: 84, h: 26, label: '⏭ Bỏ ngày', size: 11, color: C.blue, onTap: () => this.skipDay() }));
      const open = this.session.openIncidents().slice(0, 2);
      open.forEach((inc, i) => {
        const y = ry + 116 + i * 36;
        L.add(txt(this, rx + 14, y, inc.text, { size: 10, wrap: rw - 96, color: inc.kind === 'thief' || inc.kind === 'noCashier' ? HEX.red : HEX.ink }));
        if (inc.kind === 'thief') L.add(new Button(this, rx + rw - 38, y + 8, { w: 72, h: 24, label: '🚨 Bắt!', size: 11, color: C.red, onTap: () => { this.session.resolveIncident(inc.id, 'catch'); this.renderPanel(true); } }));
        else if (inc.kind === 'complaint') L.add(new Button(this, rx + rw - 38, y + 8, { w: 72, h: 24, label: 'Xin lỗi', size: 10, color: C.green, onTap: () => { this.session.resolveIncident(inc.id, 'apologize'); this.renderPanel(true); } }));
        else L.add(new Button(this, rx + rw - 38, y + 8, { w: 72, h: 24, label: 'Đã biết', size: 10, color: C.grey, onTap: () => { this.session.resolveIncident(inc.id, 'dismiss'); this.renderPanel(true); } }));
      });
      if (!open.length) L.add(txt(this, rx + rw / 2, ry + 140, 'Không có sự cố.', { size: 11, color: HEX.muted, origin: [0.5, 0.5] }));
      L.add(new Button(this, rx + rw / 2, ry + rh - 22, { w: rw - 24, h: 32, label: '🙋 Xuống quầy tự bán', size: 12, color: C.wood, onTap: () => {
        s.today.managerDay = false;
        s.manager.enabled = false;
        s.manager.speed = 1;
        persist();
        this.renderPanel(true);
      } }));
      return;
    }
    if (LANDSCAPE) {
      const y = H - 44;
      L.add(panel(this, 6, y, W - 154, 38));
      L.add(txt(this, 16, y + 10, '🧑‍💼 Nhân viên', { size: 9, bold: true }));
      this.managerStatus = txt(this, 102, y + 8, '', { size: 8, color: HEX.muted, wrap: 174 });
      L.add(this.managerStatus);
      this.updateManagerStatus();
      const speedX = W > 680 ? 296 : 240;
      DATA.balance.manager.speeds.forEach((sp, i) => {
        L.add(new Button(this, speedX + i * 40, y + 19, { w: 36, h: 24, label: `x${sp}`, size: 9, color: s.manager.speed === sp ? C.red : C.wood, onTap: () => {
          s.manager.speed = sp;
          this.renderPanel(true);
        } }));
      });
      L.add(new Button(this, 438, y + 19, { w: 96, h: 28, label: '⏭ Bỏ ngày', size: 9, color: C.blue, onTap: () => this.skipDay() }));
      return;
    }
    L.add(txt(this, 18, PANEL_Y + 12, '🧑‍💼 Nhân viên đang lo tiệm', { size: 15, bold: true }));
    this.managerStatus = txt(this, 18, PANEL_Y + 38, '', { size: 11, color: HEX.muted, wrap: W - 36 });
    L.add(this.managerStatus);
    this.updateManagerStatus();
    DATA.balance.manager.speeds.forEach((sp, i) => {
      L.add(new Button(this, 48 + i * 64, PANEL_Y + 98, { w: 54, h: 32, label: `x${sp}`, size: 14, color: s.manager.speed === sp ? C.red : C.wood, onTap: () => {
        s.manager.speed = sp;
        this.renderPanel(true);
      } }));
    });
    L.add(new Button(this, W - 78, PANEL_Y + 98, { w: 124, h: 34, label: '⏭ Bỏ qua ngày', size: 13, color: C.blue, onTap: () => this.skipDay() }));
    const open = this.session.openIncidents().slice(0, 2);
    open.forEach((inc, i) => {
      const y = PANEL_Y + 136 + i * 32;
      L.add(txt(this, 18, y, inc.text, { size: 10, wrap: W - 150, color: inc.kind === 'thief' || inc.kind === 'noCashier' ? HEX.red : HEX.ink }));
      if (inc.kind === 'thief') L.add(new Button(this, W - 60, y + 8, { w: 96, h: 28, label: '🚨 Bắt!', size: 12, color: C.red, onTap: () => { this.session.resolveIncident(inc.id, 'catch'); this.renderPanel(true); } }));
      else if (inc.kind === 'complaint') L.add(new Button(this, W - 60, y + 8, { w: 96, h: 28, label: `Xin lỗi + bù`, size: 11, color: C.green, onTap: () => { this.session.resolveIncident(inc.id, 'apologize'); this.renderPanel(true); } }));
      else L.add(new Button(this, W - 60, y + 8, { w: 96, h: 28, label: 'Đã biết', size: 11, color: C.grey, onTap: () => { this.session.resolveIncident(inc.id, 'dismiss'); this.renderPanel(true); } }));
    });
    if (!open.length) L.add(txt(this, W / 2, PANEL_Y + 158, 'Không có sự cố. Sự cố (trộm, phàn nàn, hết hàng) sẽ hiện ở đây.', { size: 11, color: HEX.muted, origin: [0.5, 0.5], align: 'center', wrap: W - 60 }));
    L.add(new Button(this, W / 2, PANEL_Y + 212, { w: 180, h: 36, label: '🙋 Xuống quầy tự bán', size: 13, color: C.wood, onTap: () => {
      s.today.managerDay = false;
      s.manager.enabled = false;
      s.manager.speed = 1;
      persist();
      this.renderPanel(true);
    } }));
  }

  private updateManagerStatus(): void {
    if (!this.managerStatus?.active) return;
    const lanes = this.session.lanes;
    const waiting = lanes.reduce((total, lane) => total + lane.queue.length, 0);
    this.managerStatus.setText(`${lanes.length ? `${lanes.length} quầy đang mở · ${waiting} khách đang chờ` : 'Chưa có thu ngân trong ca này'}\nĐã phục vụ ${G.state.today.served} khách · doanh thu ${formatMoney(G.state.today.revenue)}`);
  }

  /** "Bỏ qua ngày": chạy hết ngày không hiển thị rồi sang tổng kết. */
  private skipDay(): void {
    dialog(this, { icon: '⏭', title: 'Bỏ qua ngày?', body: 'Nhân viên bán nốt ngày hôm nay, bạn xem ngay tổng kết.', buttons: [
      { label: 'Thôi', color: C.grey },
      { label: 'Bỏ qua', color: C.blue, onTap: () => {
        this.session.events.clear();
        runDayHeadless(this.session);
        for (const v of this.views.values()) { this.tweens.killTweensOf(v.sprite); v.sprite.destroy(); }
        this.views.clear();
        this.actorEntities.clear();
        this.actorWorld.clear();
        this.finishDay();
      } },
    ] });
  }

  /** Xe giao hàng chạy ngang tới cửa. */
  private driveTruck(): void {
    if (this.topDown) {
      const tricycle = txt(this, -24, HUD_H + 54, '🛺', { size: 26, emoji: true, origin: [0.5, 0.5] }).setDepth(250);
      this.tweens.chain({ targets: tricycle, tweens: [
        { x: 52, duration: 1000, ease: 'Sine.easeOut' },
        { x: 52, duration: 1800 },
        { x: -32, duration: 1000, ease: 'Sine.easeIn' },
      ], onComplete: () => tricycle.destroy() });
      return;
    }
    const truck = txt(this, -30, FLOOR_Y + 30, '🚚', { size: 30, emoji: true, origin: [0.5, 0.5] }).setDepth(250);
    this.tweens.add({ targets: truck, x: W + 40, duration: 2200, ease: 'Sine.easeInOut', onComplete: () => truck.destroy() });
  }

  private addCustomer(c: Customer): void {
    play('door');
    const sprite = customerSprite(this, DOOR_X, FEET_Y, lookOf(c)).setScale(CUSTOMER_SCALE / 2).setDepth(100);
    if (c.name) this.sideFloat(W - 60, FEET_Y - 80, `👋 ${c.name} ghé tiệm`, '#6b4220', 12);
    this.views.set(c.id, { sprite });
    const entity = this.actorWorld.create();
    this.actorWorld.add(entity, new ShopActorView(sprite, lookOf(c)));
    this.actorEntities.set(c.id, entity);
    this.layoutQueue();
  }

  private layoutQueue(): void {
    const lanes = this.session.lanes;
    const place = (c: Customer, x: number, y: number) => {
      const v = this.views.get(c.id);
      if (!v) return;
      if (Math.abs(v.sprite.x - x) > 1 || Math.abs(v.sprite.y - y) > 1) {
        this.tweens.killTweensOf(v.sprite);
        const dur = Math.max(120, Math.abs(v.sprite.x - x) * 6);
        v.sprite.setFlipX(x > v.sprite.x).setY(y);
        const walker = this.startWalking(v.sprite, lookOf(c));
        this.tweens.add({ targets: v.sprite, x, duration: dur, ease: 'Linear', onComplete: () => this.stopWalking(walker) });
      }
    };
    // Khách đứng thanh toán thẳng hàng 1-1 với thu ngân tương ứng:
    // Quầy Bạn: vị trí this.ownerX (khách trả tiền đứng đúng đối diện Bạn).
    // Quầy nhân viên: vị trí this.laneX(k) (khách trả tiền đứng đúng đối diện nhân viên).
    // Các khách đợi sau trong hàng xếp lùi dần chéo 2.5D (+14, -5) gọn gàng.
    if (lanes.length) {
      this.session.queue.forEach((c, i) => place(c, this.ownerX + Math.min(i, 3) * 14, FEET_Y - Math.min(i, 3) * 5));
    } else {
      this.session.queue.forEach((c, i) => place(c, QUEUE_X[Math.min(i, QUEUE_X.length - 1)], FEET_Y));
    }
    lanes.forEach((lane, k) => {
      lane.queue.forEach((c, i) => place(c, this.laneX(k) + Math.min(i, 3) * 14, FEET_Y - Math.min(i, 3) * 5));
    });
  }

  private removeCustomer(c: Customer, reason: string, stars: number): void {
    const v = this.views.get(c.id);
    this.views.delete(c.id);
    const entity = this.actorEntities.get(c.id);
    this.actorEntities.delete(c.id);
    if (v && (reason === 'thief' || reason === 'closed')) {
      if (reason === 'closed') this.sideFloat(v.sprite.x, v.sprite.y - 72, '🙂 Mai ghé lại nhé!', HEX.muted, 13);
      this.tweens.killTweensOf(v.sprite);
      this.tweens.add({ targets: v.sprite, x: DOOR_X + 20, alpha: 0, duration: 400, onComplete: () => { v.sprite.destroy(); if (entity !== undefined) this.actorWorld.remove(entity); } });
      if (entity !== undefined) {
        const actor = this.actorWorld.get(entity, ShopActorView);
        if (actor) actor.walking = true;
      }
      this.layoutQueue();
      return;
    }
    if (v) {
      const face = reason === 'served' ? (stars >= 4 ? '😊' : stars >= 3 ? '🙂' : '😐') : reason === 'patience' ? '😠' : '😞';
      const says = reason === 'patience' ? 'Lâu quá!' : reason === 'nothing' ? 'Không có hàng à?' : '';
      const fx = reason === 'served' ? v.sprite.x - 40 : v.sprite.x;
      this.sideFloat(fx, v.sprite.y - 72, `${face} ${says}`.trim(), reason === 'served' ? HEX.green : HEX.red, 14);
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
          this.actorWorld.remove(walker.entity);
          v.sprite.destroy();
        },
      });
    }
    this.layoutQueue();
    this.queuePanel();
  }

  private startWalking(sprite: Phaser.GameObjects.Image, type: CustomerType): Walker {
    for (const w of this.walkers) if (w.sprite === sprite) this.walkers.delete(w);
    let entity = [...this.actorWorld.query(ShopActorView)].find(([, actor]) => actor.sprite === sprite)?.[0];
    if (entity === undefined) {
      entity = this.actorWorld.create();
      this.actorWorld.add(entity, new ShopActorView(sprite, type));
    }
    const actor = this.actorWorld.get(entity, ShopActorView);
    if (actor) actor.walking = true;
    const w = { entity, sprite, type };
    this.walkers.add(w);
    return w;
  }

  private stopWalking(w: Walker): void {
    this.walkers.delete(w);
    const actor = this.actorWorld.get(w.entity, ShopActorView);
    if (actor) actor.walking = false;
    if (w.sprite.active) setWalkFrame(w.sprite, w.type, 0);
  }

  private flyItem(productId: string, shelf: number, slot: number, c: Customer): void {
    if (this.topDown) return;
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

  private get railBounds(): { x: number; y: number; w: number; h: number } {
    if (LANDSCAPE) {
      // The play map owns the 0..404 strip. A compact landscape has no right rail,
      // so the cashier panel becomes a legible, tappable drawer above the hotbar.
      if (currentLayout().profile === 'landscape-compact') {
        const w = Math.min(232, Math.max(196, W - 24));
        const h = Math.min(190, H - HUD_H - 54);
        return { x: W - w - 8, y: H - 44 - h, w, h };
      }
      const x = Math.max(404, W - 260);
      return { x, y: HUD_H + 4, w: W - x - 4, h: H - HUD_H - 46 };
    }
    return { x: 6, y: PANEL_Y + 4, w: W - 12, h: H - PANEL_Y - 10 };
  }

  private drawLandscapeHotbar(): void {
    if (this.hotbarLayer) {
      this.hotbarLayer.destroy();
      this.hotbarLayer = null;
    }
    const L = this.add.container(0, 0).setDepth(290);
    const compact = currentLayout().profile === 'landscape-compact';
    const barH = compact ? 44 : 40;
    const y0 = H - barH;
    const bg = this.add.graphics();
    bg.fillStyle(0x24160d, 0.96).fillRect(0, y0, W, barH);
    bg.lineStyle(1.5, 0x6e4526, 0.9).lineBetween(0, y0, W, y0);
    L.add(bg);

    const counterShop = activeShopType(G.state).def.service === 'counter';
    const hasDining = !G.liveSnapshot && hasFeature(G.state.level, 'dining');
    const hasQuests = questsUnlocked(G.state);

    const actions: { key: string; label: string; color: number; onTap: () => void }[] = [
      { key: '1', label: '1 🏷️ Quầy', color: C.wood, onTap: () => this.playMap?.walkToCounter() },
      { key: '2', label: counterShop ? '2 🍙 Bếp' : '2 📦 Nhập hàng', color: C.green, onTap: () => (counterShop ? this.openKitchen() : this.openRestock()) },
      { key: '3', label: '3 🗺️ Sơ đồ', color: C.blue, onTap: () => (this.liveMap.visible ? this.liveMap.close() : this.liveMap.open()) },
    ];
    let nextNum = 4;
    let questKey = '';
    if (hasQuests) {
      questKey = String(nextNum++);
      actions.push({ key: questKey, label: `${questKey} 🎯 Nhiệm vụ`, color: C.blue, onTap: () => this.showQuests() });
    }
    if (hasDining) {
      const k = String(nextNum++);
      actions.push({ key: k, label: `${k} 🪑 Khu ăn`, color: C.wood, onTap: () => this.openDining() });
    }
    actions.push({ key: 'Esc', label: 'Esc ⏸ Dừng', color: C.grey, onTap: () => this.pause() });

    const gap = compact ? 4 : 8;
    const btnW = Math.min(compact ? 116 : 124, Math.floor((W - 16) / actions.length - gap));
    const totalW = actions.length * (btnW + gap) - gap;
    const startX = Math.round((W - totalW) / 2 + btnW / 2);

    this.hotbarRestockBtn = null;
    this.hotbarQuestBtn = null;
    actions.forEach((act, i) => {
      const bx = startX + i * (btnW + gap);
      const btn = new Button(this, bx, y0 + 19, {
        w: btnW,
        h: compact ? 34 : 32,
        label: act.label,
        size: compact ? 10 : 11,
        color: act.color,
        onTap: act.onTap,
      });
      if (act.key === '2') this.hotbarRestockBtn = btn;
      if (act.key === questKey) this.hotbarQuestBtn = btn;
      L.add(btn);
    });

    this.hotbarLayer = L;
  }

  private updateAmbientFx(): void {
    if (!this.ambientFx || !LANDSCAPE || !this.topDown) {
      this.ambientFx?.setVisible(false);
      return;
    }
    const minute = G.state.clock;
    this.ambientFx.setVisible(true);
    if (minute < 540) {
      const t = Math.max(0, 1 - (minute - 360) / 180);
      this.ambientFx.setFillStyle(0xffd79e, t * 0.10);
    } else if (minute < 930) {
      this.ambientFx.setAlpha(0);
    } else if (minute < 1080) {
      const t = (minute - 930) / 150;
      this.ambientFx.setFillStyle(0xe88438, t * 0.12);
    } else {
      const t = Math.min(1, (minute - 1080) / 120);
      this.ambientFx.setFillStyle(0x1a243b, 0.10 + t * 0.08);
    }
  }

  private renderLandscapeIdle(rx: number, ry: number, rw: number, rh: number): void {
    const L = this.panelLayer;
    const staffed = this.session.lanes.length > 0;
    const counterShop = activeShopType(G.state).def.service === 'counter';
    const msg = this.session.closed
      ? '🌙 Đã đóng cửa. Đang dọn tiệm...'
      : counterShop ? '⏳ Đang chờ khách...\nTranh thủ vào Bếp làm sẵn món!'
        : staffed ? '⏳ Quầy chính đang trống.\nThu ngân đang trực quầy phụ.' : '⏳ Đang chờ khách vào quầy...';
    L.add(txt(this, rx + 14, ry + 12, '🏷️ Quầy thu ngân', { size: 13, bold: true, color: HEX.cream }));
    L.add(txt(this, rx + rw / 2, ry + 56, msg, { size: 11, origin: [0.5, 0.5], align: 'center', color: HEX.muted, wrap: rw - 24 }));

    const managerBtn = !this.session.closed && staffed && G.state.manager.enabled && hasFeature(G.state.level, 'manager') && !G.state.today.managerDay;
    if (managerBtn) {
      L.add(new Button(this, rx + rw / 2, ry + 106, { w: rw - 24, h: 32, label: '🧑‍💼 Để nhân viên lo', size: 12, color: C.green, onTap: () => {
        G.state.today.managerDay = true;
        this.renderPanel(true);
      } }));
    }
    if (!this.session.closed) {
      L.add(new Button(this, rx + rw / 2, ry + (managerBtn ? 146 : 106), { w: rw - 24, h: 32, label: counterShop ? '🍙 Vào bếp làm món' : '📦 Nhập & bày hàng', size: 11, color: C.wood, onTap: () => (counterShop ? this.openKitchen() : this.openRestock()) }));
    }

    L.add(txt(this, rx + 14, ry + rh - 44, `💰 Doanh thu: ${formatMoney(G.state.today.revenue)}`, { size: 10, bold: true, color: HEX.cream }));
    L.add(txt(this, rx + 14, ry + rh - 24, `👥 Phục vụ: ${G.state.today.served} khách`, { size: 10, color: HEX.muted }));
  }

  private renderLandscapeAsking(c: Customer, rx: number, ry: number, rw: number, _rh: number): void {
    const L = this.panelLayer;
    const names = c.order.filter(askable).map((l) => product(l.productId).name.toLowerCase());
    const items = names.join(', ') || 'hàng';
    L.add(txt(this, rx + 14, ry + 12, '🙋 Khách hỏi món:', { size: 13, bold: true, color: HEX.cream }));
    L.add(txt(this, rx + rw / 2, ry + 56, `"${this.who(c)}":\n${this.askSpeech(c, items)}`, { size: 11, bold: true, origin: [0.5, 0.5], align: 'center', wrap: rw - 24 }));
    L.add(txt(this, rx + rw / 2, ry + 120, '🔎 Đang kiểm kho...\nCòn hàng sẽ lấy đưa khách;\nhết thì tính tiền phần còn lại.', { size: 10, origin: [0.5, 0.5], align: 'center', color: HEX.muted, wrap: rw - 24 }));
  }

  private renderLandscapeBargain(c: Customer, rx: number, ry: number, rw: number, rh: number): void {
    const L = this.panelLayer;
    const total = orderTotal(c, G.state);
    const after = discountedCashTotal(total, c.bargainPct ?? 0);
    L.add(txt(this, rx + 14, ry + 12, '🙏 Khách xin bớt giá:', { size: 13, bold: true, color: HEX.cream }));
    L.add(txt(this, rx + rw / 2, ry + 54, `"${this.who(c)}":\n${this.bargainSpeech(c)}`, { size: 11, bold: true, origin: [0.5, 0.5], align: 'center', wrap: rw - 24 }));
    L.add(txt(this, rx + rw / 2, ry + 104, `Đơn ${formatMoney(total)} → ${formatMoney(after)}`, { size: 13, bold: true, origin: [0.5, 0.5], color: HEX.green }));
    L.add(txt(this, rx + rw / 2, ry + 130, 'Không bớt: khách có thể bỏ về hoặc không vui.', { size: 9, origin: [0.5, 0.5], align: 'center', wrap: rw - 24, color: HEX.muted }));
    const answer = (accept: boolean) => () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'resolveBargain', accept });
      else this.session.resolveBargain(accept);
    };
    const bw = Math.floor((rw - 28) / 2);
    L.add(new Button(this, rx + 10 + bw / 2, ry + rh - 22, { w: bw, h: 32, label: '🤝 Bớt', color: C.green, size: 13, onTap: answer(true) }));
    L.add(new Button(this, rx + 18 + bw + bw / 2, ry + rh - 22, { w: bw, h: 32, label: 'Không bớt', color: C.red, size: 12, onTap: answer(false) }));
  }

  private renderLandscapeCredit(c: Customer, rx: number, ry: number, rw: number, rh: number): void {
    const L = this.panelLayer;
    const total = orderTotal(c, G.state);
    const allowed = canGiveCredit(G.state, total);
    L.add(txt(this, rx + 14, ry + 12, '📒 Khách xin ghi sổ:', { size: 13, bold: true, color: HEX.cream }));
    L.add(txt(this, rx + rw / 2, ry + 54, `"${this.who(c)}":\n${this.creditSpeech(c)}`, { size: 11, bold: true, origin: [0.5, 0.5], align: 'center', wrap: rw - 24 }));
    L.add(txt(this, rx + rw / 2, ry + 104, `Nợ ${formatMoney(total)} · hạn 3 ngày`, { size: 13, bold: true, origin: [0.5, 0.5] }));
    L.add(txt(this, rx + rw / 2, ry + 130, allowed ? 'Không cho: khách bỏ về và trừ sao.' : 'Sổ nợ đã đầy (tối đa 20% vốn).', { size: 9, origin: [0.5, 0.5], align: 'center', wrap: rw - 24, color: allowed ? HEX.muted : HEX.red }));
    const answer = (grant: boolean) => () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'resolveCredit', grant });
      else this.session.resolveCredit(grant);
    };
    const bw = Math.floor((rw - 28) / 2);
    L.add(new Button(this, rx + 10 + bw / 2, ry + rh - 22, { w: bw, h: 32, label: allowed ? '📒 Cho nợ' : 'Hết sổ', color: C.blue, size: 12, onTap: answer(true) }).setEnabled(allowed));
    L.add(new Button(this, rx + 18 + bw + bw / 2, ry + rh - 22, { w: bw, h: 32, label: 'Không cho', color: C.red, size: 12, onTap: answer(false) }));
  }

  private renderLandscapeScanning(c: Customer, rx: number, ry: number, rw: number, rh: number): void {
    const L = this.panelLayer;
    L.add(txt(this, rx + 14, ry + 12, `🛒 Giỏ của ${this.who(c)}:`, { size: 13, bold: true, color: HEX.cream }));

    const n = c.order.length;
    const request = c.order.find((l) => l.counterLine && c.counterRequestLeft !== null);
    const anyPicked = c.order.some((l) => l.picked > l.scanned && !l.counterLine);

    const itemH = n > 3 ? 34 : 40;
    const listTop = ry + 36;
    c.order.forEach((l, i) => {
      const y = listTop + i * (itemH + 4);
      if (y + itemH > ry + rh - 56) return;
      const p = product(l.productId);
      const isCounterWaiting = !!(l.counterLine && c.counterRequestLeft !== null);
      const isOutOfStock = l.picked === 0 && !isCounterWaiting;
      const done = l.picked > 0 && l.scanned >= l.picked;

      const bgColor = done ? 0xd9f2dd : isOutOfStock ? 0xfcf1ed : C.slot;
      const borderColor = done ? C.green : isOutOfStock ? 0xde7d70 : C.slotEdge;

      L.add(roundBox(this, rx + 10, y, rw - 20, itemH, { radius: 8, fill: bgColor, stroke: borderColor }));
      const icon = productIcon(this, rx + 24, y + itemH / 2, p, 24);
      if (isOutOfStock) icon.setAlpha(0.45);
      L.add(icon);

      L.add(txt(this, rx + 44, y + 6, orderLineName(l), { size: 10, bold: true, color: isOutOfStock ? HEX.muted : HEX.ink, wrap: rw - 110 }));

      let status = '';
      let statusColor = HEX.ink;
      if (isCounterWaiting) {
        status = `⏱ ${Math.ceil(c.counterRequestLeft!)}s`;
      } else if (isOutOfStock) {
        status = l.declined === 'price' ? '💸 Chê đắt' : l.declined === 'cold' ? '🥵 Không lạnh' : '❌ Hết hàng';
        statusColor = HEX.red;
      } else if (done) {
        status = `✓ x${l.scanned}`;
        statusColor = HEX.green;
      } else if (l.scanned > 0) {
        status = `${l.scanned}/${l.picked}`;
      } else {
        status = `x${l.picked}`;
      }
      L.add(txt(this, rx + rw - 16, y + itemH / 2, status, { size: 11, bold: true, origin: [1, 0.5], color: statusColor }));

      if (isCounterWaiting) {
        const bar = new Bar(this, rx + 44, y + itemH - 8, rw - 64, 3, C.green, C.slotEdge).setDepth(302);
        bar.set(c.counterRequestLeft! / Math.max(1, c.counterRequestSeconds));
        L.add(bar);
      }
      if (l.picked > l.scanned && !l.counterLine) {
        const hit = this.add.rectangle(rx + rw / 2, y + itemH / 2, rw - 20, itemH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => {
          if (G.liveSnapshot) void this.liveCommand({ type: 'scanItem', productId: l.productId });
          else if (this.session.scanItem(l.productId)) play('pick');
        });
        L.add(hit);
      }
    });

    if (request) {
      const slots = G.state.counter;
      const offer = G.liveSnapshot ? null : this.session.brewOffer();
      const brewing = G.liveSnapshot ? null : this.session.brewProgress();
      slots.forEach((slot, i) => {
        const x = rx + 30 + i * 56;
        const label = counterSlotLabel(slot);
        const counterButton = new Button(this, x, ry + rh - 64, {
          w: 50,
          h: 36,
          label,
          color: slotMatch(slot, request) === 'exact' ? C.green : slotMatch(slot, request) === 'product' ? C.yellow : C.grey,
          size: 9,
          onTap: () => {
            if (G.liveSnapshot) { void this.liveCommand({ type: 'serveCounter', slot: i }); return; }
            const result = this.session.serveCounterRequest(i);
            if (result === 'wrong' || result === 'empty') this.tweens.add({ targets: counterButton, x: x + 3, yoyo: true, repeat: 3, duration: 40, onComplete: () => counterButton.setX(x) });
          },
        });
        if (slot.productId === request.productId) this.counterPulseTween = this.tweens.add({ targets: counterButton, scale: 1.04, yoyo: true, repeat: -1, duration: 380 });
        L.add(counterButton);
      });
      if ((offer || brewing) && rx + 30 + slots.length * 56 + 25 <= rx + rw) this.addBrewButton(L, rx + 30 + slots.length * 56, ry + rh - 64, 50, 36, offer, brewing);
    }

    const cartValue = c.order.reduce((sum, line) => sum + (line.value ?? line.picked * product(line.productId).price), 0);
    L.add(txt(this, rx + 14, ry + rh - 48, `Tổng: ${formatMoney(cartValue)}`, { size: 12, bold: true, color: HEX.cream }));

    if (!request) {
      L.add(
        new Button(this, rx + rw / 2, ry + rh - 20, {
          w: rw - 24,
          h: 32,
          label: 'Quét hết ✓',
          color: C.red,
          size: 13,
          onTap: () => {
            if (G.liveSnapshot) void this.liveCommand({ type: 'scanAll' });
            else if (this.session.scanAll()) play('pick');
          },
        }).setEnabled(anyPicked),
      );
    }
  }

  private renderLandscapePaying(c: Customer, rx: number, ry: number, rw: number, rh: number): void {
    const L = this.panelLayer;
    L.add(txt(this, rx + 14, ry + 12, `Đơn: ${formatMoney(c.total)}`, { size: 14, bold: true, color: HEX.cream }));
    if (c.paymentMethod === 'card' || c.paymentMethod === 'transfer') {
      const label = c.paymentMethod === 'card' ? '💳 Khách thanh toán thẻ' : '📲 Khách chuyển khoản';
      L.add(txt(this, rx + rw / 2, ry + 60, label, { size: 13, color: HEX.cream, origin: [0.5, 0.5] }));
      return;
    }

    L.add(txt(this, rx + 14, ry + 32, `Khách đưa: ${formatMoney(c.bill)}`, { size: 11, color: HEX.muted }));
    this.trayText = txt(this, rx + rw - 14, ry + 32, '', { size: 13, bold: true, origin: [1, 0], color: HEX.green });
    this.trayBills = this.add.container(0, 0);
    L.add([this.trayText, this.trayBills]);

    const drawer = DATA.balance.drawer;
    const billW = Math.min(48, Math.floor((rw - 28) / 4));
    const billH = 26;
    const colSpacing = Math.floor((rw - 16) / 4);
    drawer.forEach((v, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = rx + 8 + col * colSpacing + billW / 2;
      const y = ry + 88 + row * (billH + 8);
      const b = bill(this, x, y, v, billW, billH);
      b.setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => b.setScale(0.92));
      b.on('pointerout', () => b.setScale(1));
      b.on('pointerup', () => {
        b.setScale(1);
        play('bill');
        if (G.liveSnapshot) void this.liveCommand({ type: 'addBill', value: v });
        else this.session.addBill(v);
      });
      L.add(b);
    });

    const actionY = ry + rh - 20;
    const bw1 = Math.floor((rw - 28) * 0.28);
    const bw2 = Math.floor((rw - 28) * 0.32);
    const bw3 = rw - 28 - bw1 - bw2;
    L.add(new Button(this, rx + 10 + bw1 / 2, actionY, {
      w: bw1, h: 30, label: '↩ Bỏ', color: C.grey, size: 11, onTap: () => {
        if (G.liveSnapshot) void this.liveCommand({ type: 'undoBill' }); else this.session.undoBill();
      },
    }));
    L.add(new Button(this, rx + 14 + bw1 + bw2 / 2, actionY, {
      w: bw2, h: 30, label: '🧮 Tính', color: C.blue, size: 11, onTap: () => {
        if (G.liveSnapshot) void this.liveCommand({ type: 'autoChange' }); else this.session.autoChange();
      },
    }));
    L.add(new Button(this, rx + 18 + bw1 + bw2 + bw3 / 2, actionY, {
      w: bw3, h: 30, label: 'Đưa ✓', color: C.green, size: 12, onTap: () => {
        if (G.liveSnapshot) void this.liveCommand({ type: 'giveChange' }); else this.session.giveChange();
      },
    }));
    this.renderTray();
  }

  private onSlotTap(r: number, c: number): void {
    if (this.session.paused) return;
    const slot = G.state.shelves[r][c];
    const inWh = slot.productId ? warehouseQty(G.state, slot.productId) : 0;
    toast(this, inWh > 0 ? 'Khách tự lấy hàng · bấm + xanh để nạp kệ' : 'Kệ trống hoặc đã hết hàng', 300);
  }

  // ---------- Bảng dưới cùng ----------

  /** Text bảng dưới lấy từ pool theo đúng kiểu chữ; chỉ dùng cho chữ không bị chỉnh thêm style sau khi tạo. */
  private panelText(x: number, y: number, text: string, o: TextOpts): Phaser.GameObjects.Text {
    const key = `${o.size}|${o.bold ? 1 : 0}|${o.color ?? ''}|${o.wrap ?? ''}|${o.align ?? ''}|${o.origin ?? ''}|${o.emoji ? 1 : 0}|${o.stroke ?? ''}`;
    const pool = this.panelTextPool.get(key);
    let t = pool?.pop();
    while (t && !t.active) t = pool?.pop();
    if (t) return t.setText(text).setPosition(x, y).setVisible(true);
    const created = txt(this, x, y, text, o);
    this.panelTextKeys.set(created, key);
    return created;
  }

  /** Tháo các Text dùng lại được ra khỏi bảng (ẩn, chờ lần dựng sau) trước khi hủy phần còn lại. */
  private recyclePanelTexts(): void {
    for (const child of [...this.panelLayer.list]) {
      if (!(child instanceof Phaser.GameObjects.Text)) continue;
      const key = this.panelTextKeys.get(child);
      if (!key) continue;
      this.panelLayer.remove(child);
      const pool = this.panelTextPool.get(key) ?? [];
      this.panelTextPool.set(key, pool);
      if (pool.length < 12) pool.push(child.setVisible(false));
      else child.destroy();
    }
  }

  /** Gom nhiều sự kiện trong cùng một khung (quét món, khách rời, đổi quầy...) thành một lần dựng lại bảng dưới. */
  /** Nút Pha ngay (hoặc trạng thái Đang pha) trong bảng phục vụ ở quầy. */
  private addBrewButton(L: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, offer: { seconds: number } | null, brewing: { left: number; by?: string } | null): void {
    // Hai nút xếp dọc: Pha ngay (tự pha, chờ hết thời gian) và Pha tay (mini-game, chất lượng theo độ chuẩn).
    const half = Math.floor((h - 2) / 2);
    const label = brewing ? `🧋 ${brewing.by ?? 'Đang pha'} ${Math.ceil(brewing.left)}s` : `🧋 Pha ngay ${offer?.seconds ?? 0}s`;
    const button = new Button(this, x, y - (half + 2) / 2, { w, h: half, label, size: 8, color: brewing ? C.grey : C.blue, onTap: () => { if (!brewing) this.session.startBrew(); } });
    button.setEnabled(!brewing);
    this.brewButton = button;
    L.add(button);
    const hand = new Button(this, x, y + (half + 2) / 2, { w, h: half, label: '✋ Pha tay', size: 8, color: C.green, onTap: () => this.openHandBrew() });
    hand.setEnabled(!brewing && !!offer);
    L.add(hand);
  }

  /** Pha tay ly khách đang gọi: mini-game pha ly phủ lên tiệm (tiệm đứng yên); xong thì ly được giao cho khách với chất lượng theo độ chuẩn. */
  private openHandBrew(): void {
    const offer = this.session.brewOffer();
    if (!offer || this.ending || G.liveSnapshot) return;
    this.session.paused = true;
    setPlayClockRunning(false);
    this.scene.pause('Shop');
    this.scene.launch('Tea', { recipeId: offer.recipeId, variantId: offer.variant || undefined, forCustomer: true, fromShop: true });
  }

  /** Mini-game pha tay xong: giao ly cho khách đầu hàng. */
  handBrewDone(quality: number): void {
    this.session.brewByHand(quality);
  }

  private queuePanel(): void {
    this.panelQueued = true;
  }

  private renderPanel(force = false): void {
    if (force) this.panelQueued = false;
    const c = this.session.front;
    const away = this.session.playerAway > 0;
    this.ownerAvatar?.setVisible(!away);
    const managerKey = this.managerView ? `manager-${G.state.manager.speed}-${this.session.openIncidents().map((i) => i.id).join(',')}` : '';
    const mode = away && !c ? 'away' : managerKey || (!c ? (this.session.closed ? 'closed' : 'idle') : c.status === 'paying' ? `pay-${c.id}` : c.status === 'waiting' && c.askLeft !== undefined && c.order.some(askable) ? `ask-${c.id}` : c.status === 'bargain' || c.status === 'credit' ? `${c.status}-${c.id}` : `scan-${c.id}`);
    if (!force && mode === this.panelMode) return;
    const keepPay = mode === this.panelMode && mode.startsWith('pay');
    this.panelMode = mode;
    if (keepPay) {
      this.renderTray();
      return;
    }
    this.recyclePanelTexts();
    this.panelLayer.removeAll(true);
    this.counterPulseTween?.remove();
    this.counterPulseTween = null;
    this.trayText = null;
    this.trayBills = null;
    this.counterTimerText = null;
    this.brewButton = null;
    this.counterRequestBar = null;
    const { x: rx, y: ry, w: rw, h: rh } = this.railBounds;
    if (LANDSCAPE) {
      const g = this.add.graphics();
      const leftEdge = Math.min(rx - 8, 394);
      g.fillStyle(0x1e120a, 0.98).fillRect(leftEdge, HUD_H, W - leftEdge, H - HUD_H - 40);
      g.lineStyle(1.5, 0x5a3418, 0.8).lineBetween(leftEdge, HUD_H, leftEdge, H - 40);
      this.panelLayer.add(g);
    }
    this.panelLayer.add(panel(this, rx, ry, rw, rh));
    this.managerStatus = null;
    if (mode === 'away') {
      if (LANDSCAPE) {
        this.panelLayer.add(txt(this, rx + rw / 2, ry + 60, '🛵 Bạn đang đi giao hàng...\nQuầy tạm bỏ trống,\nkhách mới xếp sang quầy nhân viên.', { size: 12, origin: [0.5, 0.5], align: 'center', color: HEX.muted, wrap: rw - 24 }));
      } else {
        this.panelLayer.add(txt(this, W / 2, PANEL_Y + 100, '🛵 Bạn đang đi giao hàng...\nQuầy tạm bỏ trống, khách mới xếp sang quầy nhân viên.', { size: 14, origin: [0.5, 0.5], align: 'center', color: HEX.muted, wrap: W - 50 }));
      }
      return;
    }
    if (mode.startsWith('manager')) {
      this.renderManager();
      return;
    }
    if (!c) {
      if (LANDSCAPE) {
        this.renderLandscapeIdle(rx, ry, rw, rh);
      } else {
        const staffed = this.session.lanes.length > 0;
        const counterShop = activeShopType(G.state).def.service === 'counter';
        const msg = this.session.closed
          ? '🌙 Đã đóng cửa. Đang dọn tiệm...'
          : counterShop ? '⏳ Đang chờ khách...\nTranh thủ vào Bếp làm sẵn vài phần nhé!'
            : staffed ? '⏳ Quầy bạn đang trống.\nThu ngân lo quầy bên phải, bạn tranh thủ nạp kệ nhé!' : '⏳ Đang chờ khách...\nTranh thủ nạp kệ bằng nút + xanh nhé!';
        this.panelLayer.add(txt(this, W / 2, PANEL_Y + 100, msg, { size: 15, origin: [0.5, 0.5], align: 'center', color: HEX.muted, wrap: W - 40 }));
        const managerBtn = !this.session.closed && staffed && G.state.manager.enabled && hasFeature(G.state.level, 'manager') && !G.state.today.managerDay;
        if (managerBtn) {
          this.panelLayer.add(new Button(this, W / 2, PANEL_Y + 160, { w: 200, h: 40, label: '🧑‍💼 Để nhân viên lo', size: 14, color: C.green, onTap: () => {
            G.state.today.managerDay = true;
            this.renderPanel(true);
          } }));
        }
        if (!this.session.closed) {
          this.panelLayer.add(new Button(this, W / 2, PANEL_Y + (managerBtn ? 210 : 184), { w: 240, h: 40, label: counterShop ? '🍙 Vào bếp làm món' : '📦 Tạm dừng · nhập & bày hàng', size: 13, color: C.wood, onTap: () => (counterShop ? this.openKitchen() : this.openRestock()) }));
        }
      }
      return;
    }
    if (mode.startsWith('ask')) {
      if (LANDSCAPE) this.renderLandscapeAsking(c, rx, ry, rw, rh);
      else this.renderAsking(c);
    } else if (c.status === 'paying') {
      if (LANDSCAPE) this.renderLandscapePaying(c, rx, ry, rw, rh);
      else this.renderPaying(c);
    } else if (c.status === 'bargain') {
      if (LANDSCAPE) this.renderLandscapeBargain(c, rx, ry, rw, rh);
      else this.renderBargain(c);
    } else if (c.status === 'credit') {
      if (LANDSCAPE) this.renderLandscapeCredit(c, rx, ry, rw, rh);
      else this.renderCredit(c);
    } else {
      if (LANDSCAPE) this.renderLandscapeScanning(c, rx, ry, rw, rh);
      else this.renderScanning(c);
    }
  }

  /** Khách ra quầy hỏi món hết trên kệ, đang kiểm kho. */
  private renderAsking(c: Customer): void {
    const L = this.panelLayer;
    const names = c.order.filter(askable).map((l) => product(l.productId).name.toLowerCase());
    const items = names.join(', ') || 'hàng';
    L.add(txt(this, W / 2, PANEL_Y + 50, `🙋 ${this.who(c)}: ${this.askSpeech(c, items)}`, { size: 15, bold: true, origin: [0.5, 0.5], align: 'center', wrap: W - 40 }));
    L.add(txt(this, W / 2, PANEL_Y + 110, '🔎 Đang kiểm kho...\nCòn thì lấy đưa khách và bày thêm lên kệ; hết thì tính tiền phần còn lại.', { size: 13, origin: [0.5, 0.5], align: 'center', color: HEX.muted, wrap: W - 50 }));
  }

  private who(c: Customer): string {
    return c.name ?? c.type.name;
  }

  private askSpeech(c: Customer, items: string): string {
    const id = c.type.id;
    const name = c.name ?? '';
    if (id === 'sinh_vien') return `"Anh/chị ơi, còn ${items} không ạ? Trên kệ hết rồi."`;
    if (id === 'hoc_sinh') return `"Cô/chú ơi, còn ${items} không ạ? Trên kệ hết rồi."`;
    if (id === 'ong_cu') return `"Còn ${items} không cháu? Trên kệ hết rồi ông tìm không thấy."`;
    if (id === 'xe_om') return `"Còn ${items} không cháu? Nhìn trên kệ thấy hết rồi."`;
    if (id === 'noi_tro') return `"Còn ${items} không con? Trên kệ hết rồi."`;
    if (id === 'ba_ban_hang') return `"Còn ${items} không con ơi? Trên kệ hết trơn rồi."`;
    if (id === 'cong_nhan') return `"Chủ tiệm ơi, còn ${items} không? Trên kệ hết rồi."`;
    if (id === 'thanh_nien') return `"Chủ quán ơi, còn ${items} không? Trên kệ hết sạch rồi."`;
    if (id === 'me_bim') return `"Tiệm còn ${items} không em? Trên kệ hết rồi."`;
    if (id === 'van_phong') return `"Tiệm mình còn ${items} không bạn? Trên kệ hết rồi."`;
    if (id === 'shipper') return `"Tiệm còn ${items} không anh/chị? Trên kệ hết rồi."`;
    if (id === 'khach_du_lich') return `"Tiệm ơi, còn ${items} không ạ? Trên kệ hết rồi."`;
    if (id === 'hang_xom') {
      if (name.includes('Chú') || name.includes('Bác')) return `"Còn ${items} không cháu? Trên kệ hết rồi."`;
      if (name.includes('Cô') || name.includes('Dì')) return `"Còn ${items} không con? Trên kệ hết rồi."`;
      if (name.includes('Anh')) return `"Còn ${items} không em? Trên kệ hết rồi."`;
      return `"Còn ${items} không cháu? Trên kệ hết rồi."`;
    }
    return `"Còn ${items} không ạ? Trên kệ hết rồi."`;
  }

  private bargainSpeech(c: Customer): string {
    const id = c.type.id;
    const pct = c.bargainPct ?? 0;
    const name = c.name ?? '';
    if (id === 'noi_tro') return `"Bớt cho cô ${pct}% nha con, mua mở hàng cho nè!"`;
    if (id === 'ba_ban_hang') return `"Bớt cho cô ${pct}% lấy thảo nha con!"`;
    if (id === 'ong_cu') return `"Bớt cho ông ${pct}% được không cháu?"`;
    if (id === 'sinh_vien') return `"Sinh viên nghèo bớt cho em ${pct}% được không ạ?"`;
    if (id === 'hoc_sinh') return `"Bớt cho em ${pct}% được không cô/chú?"`;
    if (id === 'xe_om') return `"Bớt cho chú ${pct}% nha cháu!"`;
    if (id === 'cong_nhan') return `"Bớt cho anh ${pct}% nha chủ tiệm!"`;
    if (id === 'thanh_nien') return `"Bớt cho em ${pct}% nha chủ quán!"`;
    if (id === 'me_bim') return `"Bớt cho chị ${pct}% nha em!"`;
    if (id === 'van_phong') return `"Bớt cho mình ${pct}% được không bạn?"`;
    if (id === 'shipper') return `"Bớt cho shipper ${pct}% nha shop!"`;
    if (id === 'khach_du_lich') return `"Giảm cho mình ${pct}% được không bạn?"`;
    if (id === 'hang_xom') {
      if (name.includes('Chú') || name.includes('Bác')) {
        const title = name.includes('Chú') ? 'chú' : 'bác';
        return `"Chỗ xóm giềng bớt cho ${title} ${pct}% nha cháu!"`;
      }
      if (name.includes('Cô') || name.includes('Dì')) {
        const title = name.includes('Cô') ? 'cô' : 'dì';
        return `"Chỗ xóm giềng bớt cho ${title} ${pct}% nha con!"`;
      }
      if (name.includes('Anh')) return `"Người quen bớt cho anh ${pct}% nha em!"`;
      return `"Chỗ quen biết bớt cho ${pct}% nghen!"`;
    }
    return `"Bớt cho mình ${pct}% nha tiệm!"`;
  }

  private creditSpeech(c: Customer): string {
    const id = c.type.id;
    const name = c.name ?? '';
    if (id === 'hang_xom') {
      if (name.includes('Chú') || name.includes('Bác')) {
        const title = name.includes('Chú') ? 'chú' : 'bác';
        return `"Ghi sổ giùm ${title}, mai mốt ${title} gửi nghen cháu!"`;
      }
      if (name.includes('Cô') || name.includes('Dì')) {
        const title = name.includes('Cô') ? 'cô' : 'dì';
        return `"Ghi sổ giùm ${title}, mai mốt ${title} ghé trả nghen con!"`;
      }
      if (name.includes('Anh')) return `"Ghi sổ giùm anh, mai mốt anh ghé gửi nghen em!"`;
      return `"Ghi sổ giùm, mai mốt ghé trả nghen!"`;
    }
    if (id === 'sinh_vien') return `"Ghi sổ giùm em bữa nay, đầu tháng có tiền em ghé trả nghen!"`;
    if (id === 'ong_cu') return `"Ghi sổ giùm ông, mai lãnh lương hưu ông trả nghen!"`;
    if (id === 'noi_tro') return `"Ghi sổ giùm cô, mai mốt cô ghé trả nghen con!"`;
    if (id === 'xe_om') return `"Ghi sổ giùm chú, chiều chạy mấy cuốc xong chú ghé trả nghen!"`;
    if (id === 'cong_nhan') return `"Ghi sổ giùm anh, cuối tuần lãnh lương anh ghé gửi nghen!"`;
    return `"Ghi sổ giùm, mai mốt trả nghen!"`;
  }

  /** Khách mặc cả: Bớt / Không bớt. */
  private renderBargain(c: Customer): void {
    const L = this.panelLayer;
    const total = orderTotal(c, G.state);
    const after = discountedCashTotal(total, c.bargainPct ?? 0);
    L.add(txt(this, W / 2, PANEL_Y + 40, `🙏 ${this.who(c)}: ${this.bargainSpeech(c)}`, { size: 15, bold: true, origin: [0.5, 0.5], align: 'center', wrap: W - 40 }));
    L.add(txt(this, W / 2, PANEL_Y + 84, `Đơn ${formatMoney(total)} → ${formatMoney(after)}`, { size: 16, bold: true, origin: [0.5, 0.5], color: HEX.ink }));
    L.add(txt(this, W / 2, PANEL_Y + 112, 'Không bớt: khách có thể bỏ về, hoặc mua mà không vui (tối đa 3 sao).', { size: 11, origin: [0.5, 0.5], align: 'center', wrap: W - 50, color: HEX.muted }));
    const answer = (accept: boolean) => () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'resolveBargain', accept });
      else this.session.resolveBargain(accept);
    };
    const actionY = Math.max(PANEL_Y + 170, H - 38);
    L.add(new Button(this, W / 2 - 80, actionY, { w: 140, h: 52, label: '🤝 Bớt', color: C.green, size: 17, onTap: answer(true) }));
    L.add(new Button(this, W / 2 + 80, actionY, { w: 140, h: 52, label: 'Không bớt', color: C.red, size: 16, onTap: answer(false) }));
  }

  /** Khách xin ghi sổ: Cho nợ / Không cho. */
  private renderCredit(c: Customer): void {
    const L = this.panelLayer;
    const total = orderTotal(c, G.state);
    const allowed = canGiveCredit(G.state, total);
    L.add(txt(this, W / 2, PANEL_Y + 40, `📒 ${this.who(c)}: ${this.creditSpeech(c)}`, { size: 15, bold: true, origin: [0.5, 0.5], align: 'center', wrap: W - 40 }));
    L.add(txt(this, W / 2, PANEL_Y + 84, `Nợ ${formatMoney(total)} · hạn 3 ngày`, { size: 16, bold: true, origin: [0.5, 0.5] }));
    L.add(txt(this, W / 2, PANEL_Y + 112, allowed ? 'Không cho: khách bỏ về và chấm 2 sao.' : 'Sổ nợ đã đầy (tối đa 20% tiền mặt).', { size: 12, origin: [0.5, 0.5], align: 'center', wrap: W - 50, color: allowed ? HEX.muted : HEX.red }));
    const answer = (grant: boolean) => () => {
      if (G.liveSnapshot) void this.liveCommand({ type: 'resolveCredit', grant });
      else this.session.resolveCredit(grant);
    };
    const actionY = Math.max(PANEL_Y + 170, H - 38);
    L.add(new Button(this, W / 2 - 80, actionY, { w: 140, h: 52, label: allowed ? '📒 Cho nợ' : 'Sổ nợ đã đầy', color: C.blue, size: allowed ? 17 : 13, onTap: answer(true) }).setEnabled(allowed));
    L.add(new Button(this, W / 2 + 80, actionY, { w: 140, h: 52, label: 'Không cho', color: C.red, size: 16, onTap: answer(false) }));
  }

  private renderScanning(c: Customer): void {
    const L = this.panelLayer;
    L.add(this.panelText(18, PANEL_Y + 14, `🛒 Giỏ của ${this.who(c)}:`, { size: 15, bold: true }));
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

      L.add(roundBox(this, x - cw / 2, y - 46, cw, 92, { radius: 12, fill: bgColor, stroke: borderColor }));

      const icon = productIcon(this, x, y - 14, p, 44);
      if (isOutOfStock) icon.setAlpha(0.45);
      L.add(icon);

      L.add(this.panelText(x, y + 22, orderLineName(l), { size: cw < 90 ? 9 : 11, origin: [0.5, 0.5], color: isOutOfStock ? HEX.muted : HEX.ink, wrap: cw - 8 }));

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

      const statusText = this.panelText(x, y + 37, status, { size: cw < 90 ? 11 : 14, bold: true, origin: [0.5, 0.5], color: statusColor });
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
      // Món trà: hết đúng ly thì có nút Pha ngay (không dùng trong phiên chia sẻ trực tuyến).
      const offer = G.liveSnapshot ? null : this.session.brewOffer();
      const brewing = G.liveSnapshot ? null : this.session.brewProgress();
      const compact = !!(offer || brewing);
      slots.forEach((slot, i) => {
        const x = (compact ? 38 : 46) + i * (compact ? 68 : 78);
        const label = counterSlotLabel(slot);
        const counterButton = new Button(this, x, PANEL_Y + 174, {
          w: compact ? 62 : 70,
          h: 44,
          label,
          color: slotMatch(slot, request) === 'exact' ? C.green : slotMatch(slot, request) === 'product' ? C.yellow : C.grey,
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
      if (compact) this.addBrewButton(L, 38 + slots.length * 68, PANEL_Y + 174, 62, 44, offer, brewing);
    }
    const cartValue = c.order.reduce((sum, line) => sum + (line.value ?? line.picked * product(line.productId).price), 0);
    L.add(this.panelText(18, PANEL_Y + 142, `Giỏ: ${formatMoney(cartValue)}`, { size: 12, color: HEX.muted }));
    if (!request) {
      const scanY = Math.max(PANEL_Y + 178, H - 38);
      L.add(
        new Button(this, W - 82, scanY, {
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
  }

  private renderPaying(c: Customer): void {
    const L = this.panelLayer;
    const y0 = PANEL_Y + 12;
    L.add(txt(this, 18, y0, `Đơn: ${formatMoney(c.total)}`, { size: 16, bold: true }));
    if (c.paymentMethod === 'card' || c.paymentMethod === 'transfer') {
      const label = c.paymentMethod === 'card' ? '💳 Khách thanh toán bằng thẻ' : '📲 Khách chuyển khoản';
      L.add(txt(this, W / 2, y0 + 48, label, { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
      return;
    }
    L.add(txt(this, 18, y0 + 22, 'Khách đưa:', { size: 13, color: HEX.muted }));
    L.add(bill(this, 128, y0 + 30, c.bill, 64, 30));
    L.add(txt(this, 166, y0 + 30, formatMoney(c.bill), { size: 13, bold: true, origin: [0, 0.5] }));
    this.trayText = txt(this, W - 18, y0, '', { size: 16, bold: true, origin: [1, 0], color: HEX.green });
    L.add(txt(this, W - 18, y0 + 22, 'đang thối', { size: 11, origin: [1, 0], color: HEX.muted }));
    this.trayBills = this.add.container(0, 0);
    L.add([this.trayText, this.trayBills]);

    const by = Math.max(PANEL_Y + 204, H - 34);
    const startY = Math.min(PANEL_Y + 104, by - 96);
    const drawer = DATA.balance.drawer;
    drawer.forEach((v, i) => {
      const x = 50 + (i % 4) * 87;
      const y = startY + Math.floor(i / 4) * 46;
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
    const tray = this.session.tray.slice(-8);
    tray.forEach((value, i) => {
      let note = this.trayBillPool[i];
      if (!note) {
        note = bill(this, 0, 0, value, LANDSCAPE ? 34 : 44, LANDSCAPE ? 18 : 22);
        this.trayBillPool.push(note);
        this.trayBills!.add(note);
      } else {
        updateBill(note, value, LANDSCAPE ? 34 : 44, LANDSCAPE ? 18 : 22);
      }
      if (LANDSCAPE) note.setPosition(404 + 24 + i * 16, HUD_H + 4 + 54);
      else note.setPosition(214 + i * 16, PANEL_Y + 64);
    });
    for (let i = tray.length; i < this.trayBillPool.length; i++) this.trayBillPool[i].setVisible(false);
  }

  // ---------- Vòng lặp ----------

  update(_t: number, dtMs: number): void {
    if (this.ending) return;
    this.scrollRain(dtMs);
    // Chế độ quản lý: tăng tốc x2/x4 (nhiều bước core mỗi khung hình).
    const speed = G.state.today.managerDay ? G.state.manager.speed : 1;
    let measureAt = perfEnabled ? performance.now() : 0;
    if (!G.liveSnapshot) for (let i = 0; i < speed && !this.ending; i++) this.session.update(dtMs / 1000);
    this.tickIdle(dtMs / 1000);
    if (perfEnabled) {
      recordPerfSection('sim', performance.now() - measureAt);
      measureAt = performance.now();
    }
    const gameDt = this.session.paused ? 0 : speed * Math.min(dtMs / 1000, 0.5);
    this.liveMap.update(gameDt);
    if (this.playMap) {
      this.playMap.update(gameDt);
      this.session.playerAtCounter = this.playMap.playerAtCounter;
      const away = !this.playMap.playerAtCounter && this.session.playerAway <= 0 && !this.managerView && !this.idleAuto;
      this.awayCover?.setVisible(away);
      if (away) {
        const staffed = this.session.lanes.some((l) => !l.closing);
        this.awayText?.setText(staffed
          ? 'Thu ngân đang lo quầy: khách mới tự sang quầy thu ngân,\nbạn cứ đi phụ nạp kệ, nấu món.'
          : this.session.queue.length ? `Khách đầu hàng phải chờ bạn quay lại mới tính tiền được.\n(${this.session.queue.length} người đang chờ quầy bạn)` : 'Khách đầu hàng phải chờ bạn quay lại mới tính tiền được.');
      }
    }
    if (perfEnabled) {
      recordPerfSection('map', performance.now() - measureAt);
      measureAt = performance.now();
    }
    if (this.panelQueued) this.renderPanel(true);
    this.renderAcc += dtMs;
    this.deliveryReminderAcc += dtMs;
    if (this.deliveryReminderAcc >= 1000) {
      this.deliveryReminderAcc = 0;
      this.updateDeliveryReminder();
    }
    if (this.renderAcc >= 100) {
      this.renderAcc = 0;
      this.updateManagerStatus();
      this.hud.refresh();
      this.shelves.render(G.state, this.shelfOpts());
      this.renderPanel();
      const canShowZoneActions = this.session.customers.length === 0;
      this.zoneRefillButtons.forEach(({ zone, button }) => button.setVisible(canShowZoneActions && !this.topDown && G.state.zones.some((item) => item === zone)));
      this.checkQuestProgress();
    }
    if (perfEnabled) {
      recordPerfSection('ui', performance.now() - measureAt);
      measureAt = performance.now();
    }
    const side = !this.topDown;
    for (const [, actor] of this.actorWorld.query(ShopActorView)) {
      if (!actor.walking && actor.sprite.active) actor.sprite.setVisible(side);
    }
    this.renderCustomerBars(side);
    const requestLeft = this.session.front?.counterRequestLeft;
    const brewingNow = this.session.brewProgress();
    if (brewingNow && this.counterTimerText?.active) {
      this.counterTimerText.setText(`🧋 ${Math.ceil(brewingNow.left)}s`);
      this.counterRequestBar?.set(brewingNow.progress, C.blue);
      if (this.brewButton?.active) this.brewButton.label.setText(`🧋 ${brewingNow.by ?? 'Đang pha'} ${Math.ceil(brewingNow.left)}s`);
    } else if (this.counterTimerText?.active && requestLeft != null) {
      this.counterTimerText.setText(`⏱ ${Math.ceil(requestLeft)}s`);
      this.counterRequestBar?.set(requestLeft / Math.max(1, this.session.front?.counterRequestSeconds ?? 1), requestLeft <= 2 ? C.red : C.green);
    }
    if (perfEnabled) recordPerfSection('actors', performance.now() - measureAt);
    // Đang mở bảng/menu (game tạm dừng): màn hình gần như tĩnh, cho máy chạy nhịp thấp tới khi chạm lại.
    setPowerIdle(this.session.paused && !G.liveSnapshot);
  }

  private updateDeliveryReminder(): void {
    if (!this.deliveryReminder) return;
    const upcoming = G.state.deliveries
      .filter((delivery) => delivery.arriveDay === G.state.day && delivery.arriveMinute > G.state.clock)
      .sort((a, b) => a.arriveMinute - b.arriveMinute);
    const lines = upcoming.slice(0, 2).map((delivery) => {
      const name = DATA.suppliers.find((entry) => entry.id === delivery.supplierId)?.name ?? 'Mối sỉ';
      return `🚚 ${name} giao lúc ${formatClock(delivery.arriveMinute)}`;
    });
    this.deliveryReminder.setText(lines.join('\n')).setVisible(this.topDown && lines.length > 0);
  }

  /** Vẽ thanh kiên nhẫn theo nhóm thay vì một GameObject Graphics cho mỗi khách. */
  private renderCustomerBars(visible: boolean): void {
    const g = this.customerBars;
    const bars = this.customerBarsBuf;
    let count = 0;
    let key = visible ? 1 : 0;
    if (visible) {
      for (const c of this.session.customers) {
        const sprite = this.views.get(c.id)?.sprite;
        if (!sprite?.active || !sprite.visible) continue;
        const ratio = Phaser.Math.Clamp(c.patience / c.patienceMax, 0, 1);
        const width = ratio > 0 ? Math.round(Math.max(5, 36 * ratio)) : 0;
        const color = ratio > 0.5 ? C.green : ratio > 0.25 ? C.yellow : C.red;
        const x = Math.round(sprite.x - 18);
        const y = Math.round(sprite.y - 70);
        const bar = bars[count] ?? (bars[count] = { x: 0, y: 0, width: 0, color: 0 });
        bar.x = x; bar.y = y; bar.width = width; bar.color = color;
        count++;
        key = (Math.imul(key, 31) + x) | 0;
        key = (Math.imul(key, 31) + y) | 0;
        key = (Math.imul(key, 31) + width * 4 + (color === C.green ? 1 : color === C.yellow ? 2 : 3)) | 0;
      }
    }
    key = (Math.imul(key, 31) + count) | 0;
    // Khách đứng yên và thanh chưa đổi độ dài: giữ nguyên hình đã vẽ, không clear/vẽ lại.
    if (key === this.customerBarsKey) return;
    this.customerBarsKey = key;
    g.clear();
    if (!count) return;
    // Hình chữ nhật thẳng: bo góc 2.5px trên thanh 5px gần như không thấy nhưng sinh ra hàng chục đoạn cung mỗi thanh.
    g.fillStyle(0x000000, 0.35);
    for (let i = 0; i < count; i++) g.fillRect(bars[i].x, bars[i].y, 36, 5);
    for (const color of [C.green, C.yellow, C.red]) {
      g.fillStyle(color, 1);
      for (let i = 0; i < count; i++) {
        const bar = bars[i];
        if (bar.color === color && bar.width > 0) g.fillRect(bar.x, bar.y, bar.width, 5);
      }
    }
  }

  // ---------- Chơi hộ khi rảnh tay ----------

  /** Đếm thời gian không chạm màn hình; giờ tạm dừng (menu, nhập hàng) không tính và đếm lại từ đầu. */
  private tickIdle(dt: number): void {
    if (G.liveSnapshot || this.ending || this.idleAuto) return;
    const limit = G.state.settings.idleAutoPlay ?? 60;
    if (!limit || this.session.paused || G.state.today.managerDay) {
      this.idleSec = 0;
      return;
    }
    this.idleSec += Math.min(dt, 0.5);
    if (this.idleSec >= limit) this.setIdleAuto(true);
  }

  private onPlayerInput(): void {
    this.idleSec = 0;
    if (this.idleAuto) this.setIdleAuto(false);
  }

  /** Bật/tắt người chơi tự động của core: quét giỏ, trả lời mặc cả/ghi sổ, thối tiền, quầy rảnh thì nạp kệ; nhịp như người thật. */
  private setIdleAuto(on: boolean): void {
    this.idleAuto = on;
    this.session.autoPlayer = on;
    this.session.autoPlayerReact = on ? 0.8 : 0;
    this.session.autoRefill = on;
    this.idleBadge?.setVisible(on);
    if (on) {
      toast(this, '🤖 Bạn rảnh tay lâu quá, để game đứng quầy giùm nhé!', 300);
      if (this.idleBadge) this.tweens.add({ targets: this.idleBadge, alpha: 0.55, yoyo: true, repeat: -1, duration: 700 });
    } else {
      if (this.idleBadge) { this.tweens.killTweensOf(this.idleBadge); this.idleBadge.setAlpha(1); }
      toast(this, '✋ Bạn đứng quầy lại rồi', 300);
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
      const targetQuestBtn = this.hotbarQuestBtn ?? this.questBtn;
      if (targetQuestBtn) this.tweens.add({ targets: targetQuestBtn, scale: 1.25, yoyo: true, repeat: 3, duration: 180 });
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

  /** Chữ nổi đặt theo vị trí của góc nhìn ngang; góc trên xuống đã có hiệu ứng riêng trên sơ đồ nên bỏ qua. */
  private sideFloat(x: number, y: number, text: string, color?: string, size?: number): void {
    if (!this.topDown) floatText(this, x, y, text, color, size);
  }

  private get topDown(): boolean {
    return !!this.playMap?.visible;
  }

  /** Rebuild presentation after the logical viewport changes, retaining the live DaySession. */
  reflowForOrientation(): void {
    this.reflowSession = this.session;
    this.reopenPauseAfterReflow = !!this.pauseLayer;
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    this.game.scene.stop('Shop');
    this.game.scene.start('Shop');
  }

  /** Đổi góc nhìn ngay trong ngày (không khởi động lại phiên bán). */
  private setViewMode(mode: 'side' | 'topdown'): void {
    if (mode === 'topdown' && G.liveSnapshot) { toast(this, 'Phiên chơi chung chỉ dùng góc nhìn ngang', 300, C.red); return; }
    G.state.settings.viewMode = mode;
    if (!G.liveSnapshot) persist();
    this.applyViewMode();
    if (mode === 'topdown') this.topDownTutorial();
  }

  /** Hướng dẫn một lần khi bật góc nhìn trên xuống (tạm dừng tiệm trong lúc đọc). */
  private topDownTutorial(): void {
    const s = G.state;
    if (s.tutorialsSeen.includes('topdown')) {
      toast(this, 'Chạm ô để đi · tới kệ mới nạp được\nđứng ở quầy mới tính tiền được', 300, C.greenDark);
      return;
    }
    s.tutorialsSeen.push('topdown');
    if (!G.liveSnapshot) persist();
    this.session.paused = true;
    const staffed = s.staff.some((st) => st.role === 'cashier');
    dialog(this, {
      icon: '🗺️',
      title: 'Góc nhìn trên xuống',
      body: [
        '👆 Chạm ô trống để đi tới đó.',
        '🗄️ Chạm kệ: đi tới sát kệ rồi bấm + để nạp, chạm ô trống để bày món, chạm ô "HẠN" để bán xả.',
        '🍳 Chạm bếp / quầy nước để nấu, 📦 kệ kho để xem kho.',
        '🧾 Chạm quầy để về tính tiền. Rời quầy thì khách đầu hàng phải chờ bạn.',
        staffed ? '👥 Có thu ngân: bạn rời quầy thì khách mới vào quầy thu ngân; khách đang xếp hàng chờ bạn, người tới sớm được mời sang quầy trống.' : '👥 Thuê thu ngân thì bạn được đi lại tự do, khách sẽ sang quầy thu ngân.',
        '🗯️ Ai tới trước tính trước: khách chen hàng sẽ bị người đứng quầy nhắc ra sau.',
        '🚨 Kẻ trộm bỏ chạy: chạy lại gần rồi chạm để bắt.',
      ].join('\n'),
      width: 330,
      buttons: [{ label: 'Bắt đầu', color: C.green, onTap: () => { if (!this.pauseLayer) this.session.paused = false; } }],
    });
  }

  private applyViewMode(): void {
    const profile = currentLayout().profile;
    const top = effectiveViewMode(profile, G.state.settings.viewMode, !!G.liveSnapshot) === 'topdown';
    if (top) {
      if (!this.playMap) {
        this.playMap = new LiveMap(this, this.session, {
          mode: 'play', top: HUD_H, bottom: LANDSCAPE ? H - 44 : PANEL_Y, depth: 262,
          onSwitchMode: () => this.setViewMode('side'),
          onCook: (recipeId) => this.openCook(recipeId),
          onRestock: () => this.openRestock(),
        });
        this.awayCover = this.buildAwayCover();
      }
      if (!this.playMap.visible) this.playMap.open();
    } else {
      this.playMap?.close();
      this.awayCover?.setVisible(false);
      this.session.playerAtCounter = true;
    }
    this.mapBtn?.setVisible(!top);
    this.counterBtn?.setVisible(!top && !this.shelves.atCounter);
    this.hotbarLayer?.setVisible(top && LANDSCAPE);
    this.updateAmbientFx();
    // Phần nhìn ngang nằm dưới sơ đồ: ẩn đi hoàn toàn khi ở góc nhìn trên xuống
    this.shelves.setVisible(!top);
    this.staffLayer.setVisible(!top);
    for (const v of this.views.values()) v.sprite.setVisible(!top);
    this.customerBars.setVisible(!top);
    this.interiorRt?.setVisible(!top);
    this.counterRt?.setVisible(!top);
    this.counterTexts.forEach((t) => (t as unknown as { setVisible: (v: boolean) => void }).setVisible(!top));
    this.ownerAvatar?.setVisible(!top);
    this.weatherFx?.setVisible(!top);
  }

  private buildAwayCover(): Phaser.GameObjects.Container {
    const L = this.add.container(0, 0).setDepth(320).setVisible(false);
    if (LANDSCAPE) {
      const { x: rx, y: ry, w: rw, h: rh } = this.railBounds;
      L.add(panel(this, rx, ry, rw, rh));
      L.add(txt(this, rx + rw / 2, ry + 36, '🚶 Bạn đang ở xa quầy', { size: 14, bold: true, color: HEX.cream, origin: [0.5, 0.5] }));
      this.awayText = txt(this, rx + rw / 2, ry + 80, '', { size: 11, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: rw - 24 });
      L.add(this.awayText);
      L.add(new Button(this, rx + rw / 2, ry + rh - 34, { w: rw - 32, h: 36, label: '🏃 Về quầy', size: 14, color: C.green, onTap: () => this.playMap?.walkToCounter() }));
      return L;
    }
    L.add(this.add.rectangle(W / 2, (PANEL_Y + H) / 2, W, H - PANEL_Y, 0x2b1d14, 1).setInteractive());
    L.add(txt(this, W / 2, PANEL_Y + 70, '🚶 Bạn đang ở xa quầy', { size: 17, bold: true, color: HEX.cream, origin: [0.5, 0.5] }));
    this.awayText = txt(this, W / 2, PANEL_Y + 108, '', { size: 12, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: W - 40 });
    L.add(this.awayText);
    L.add(new Button(this, W / 2, PANEL_Y + 160, { w: 180, h: 44, label: '🏃 Về quầy', size: 15, color: C.green, onTap: () => this.playMap?.walkToCounter() }));
    return L;
  }

  /** Hỏi lại trước khi đóng cửa sớm (việc đột xuất, mệt, trời mưa...). */
  private confirmCloseEarly(): void {
    if (this.session.closed) return;
    const now = formatClock(G.state.clock);
    const waiting = this.session.customers.length;
    const layer = dialog(this, {
      icon: '🚪',
      title: `Đóng cửa sớm lúc ${now}?`,
      body: 'Kéo cửa xuống, không đón khách mới.\n'
        + (waiting ? `${waiting} khách trong tiệm: ai đã lấy hàng thì ra quầy tính tiền nốt, ai chưa lấy gì thì mời về (không bị trừ sao).\n` : '')
        + 'Lương nhân viên, tiền điện vẫn tính cả ngày.',
      buttons: [
        { label: 'Thôi', color: C.grey, onTap: () => undefined },
        { label: 'Đóng cửa', color: C.red, onTap: () => {
          if (G.liveSnapshot) void this.liveCommand({ type: 'closeEarly' });
          else { this.session.closeEarly(); persist(); }
          this.resume();
          this.renderPanel(true);
        } },
      ],
    });
    layer.setDepth(3100);
  }

  private pause(): void {
    if (this.pauseLayer || this.ending) return;
    if (!G.liveSnapshot) this.session.paused = true;
    setPlayClockRunning(false);
    if (!G.liveSnapshot) persist();
    const L = this.add.container(0, 0).setDepth(3000);
    this.events.emit('thdh-hud-overlay', true);
    L.once(Phaser.GameObjects.Events.DESTROY, () => this.events.emit('thdh-hud-overlay', false));
    // Backdrop: dim background and tap-to-resume
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65).setInteractive();
    backdrop.on('pointerdown', () => this.resume());
    L.add(backdrop);

    const hasDining = !G.liveSnapshot && ensureDiningTables(G.state).length > 0;
    const hasManager = !G.liveSnapshot && hasFeature(G.state.level, 'manager');
    const hasCloud = cloudSaveEnabled();
    const counterShop = activeShopType(G.state).def.service === 'counter';
    const hasXoiKitchen = !G.liveSnapshot && counterShop;
    const landscape = W > H;

    const modalW = landscape ? Math.min(540, W - 48) : Math.min(320, W - 28);
    const modalH = landscape ? Math.min(328, H - 20) : Math.min(540, H - 36);
    const modalX = Math.round((W - modalW) / 2);
    const modalY = Math.round((H - modalH) / 2);

    // Modal background card
    L.add(panel(this, modalX, modalY, modalW, modalH));
    // Invisible touch blocker inside panel so clicking within modal doesn't trigger backdrop resume
    const blocker = this.add.zone(modalX + modalW / 2, modalY + modalH / 2, modalW, modalH).setInteractive();
    L.add(blocker);

    // Header bar
    const headerH = 34;
    const headerG = this.add.graphics();
    headerG.fillStyle(C.woodDark, 1).fillRoundedRect(modalX + 2, modalY + 2, modalW - 4, headerH, { tl: 6, tr: 6, bl: 0, br: 0 });
    headerG.lineStyle(1.5, C.panelEdge, 0.9).strokeLineShape(new Phaser.Geom.Line(modalX + 2, modalY + headerH + 2, modalX + modalW - 2, modalY + headerH + 2));
    L.add(headerG);

    // Header Title
    L.add(txt(this, modalX + modalW / 2, modalY + headerH / 2 + 1, '⏸ TẠM DỪNG', { size: 15, bold: true, color: '#fef3c7', origin: [0.5, 0.5] }));

    // Header Close [✕] Button
    const topCloseBtn = new Button(this, modalX + modalW - 20, modalY + headerH / 2 + 1, {
      w: 26,
      h: 24,
      size: 13,
      label: '✕',
      color: C.woodDark,
      onTap: () => this.resume(),
    });
    L.add(topCloseBtn);

    if (landscape) {
      const padX = 14;
      const gap = 12;
      const colW = Math.floor((modalW - 2 * padX - gap) / 2);
      const halfGap = 6;
      const halfW = Math.floor((colW - halfGap) / 2);

      const col0X = modalX + padX + colW / 2;
      const col1X = modalX + padX + colW + gap + colW / 2;

      const rowH = 36;
      const rowGap = 7;
      const startY = modalY + headerH + 10;
      const rowY = (r: number) => startY + rowH / 2 + r * (rowH + rowGap);

      // --- CỘT TRÁI: THAO TÁC TIỆM & TỰ ĐỘNG ---
      // Row 0: Tiếp tục bán hàng (Full width)
      L.add(new Button(this, col0X, rowY(0), {
        w: colW,
        h: rowH,
        label: '▶ Tiếp tục',
        size: 13,
        color: C.green,
        onTap: () => this.resume(),
      }));

      // Row 1: Nhập hàng / Bếp xôi (Full width)
      const restockLabel = hasXoiKitchen
        ? '🍙 Bếp xôi (làm món)'
        : counterShop
          ? '📦 Nhập nguyên liệu'
          : '📦 Nhập & bày hàng';
      L.add(new Button(this, col0X, rowY(1), {
        w: colW,
        h: rowH,
        label: restockLabel,
        size: 12,
        color: hasXoiKitchen ? C.green : C.woodDark,
        onTap: () => (hasXoiKitchen ? this.openKitchen() : this.openRestock()),
      }));

      // Row 2: Nhân viên quản lý (nếu có) hoặc Tự thối tiền
      if (hasManager) {
        const managerLabel = () => G.state.manager.enabled ? '🧑‍💼 Để nhân viên lo: BẬT' : '🧑‍💼 Để nhân viên lo: TẮT';
        const managerBtn = new Button(this, col0X, rowY(2), {
          w: colW,
          h: rowH,
          label: managerLabel(),
          size: 12,
          color: G.state.manager.enabled ? C.green : C.grey,
          onTap: () => {
            const enabled = !G.state.manager.enabled;
            G.state.manager.enabled = enabled;
            G.state.today.managerDay = enabled && this.session.lanes.length > 0;
            if (!enabled) G.state.manager.speed = 1;
            persist();
            managerBtn.setText(managerLabel()).setColor(enabled ? C.green : C.grey);
            this.renderPanel(true);
            if (enabled && !G.state.today.managerDay) toast(this, 'Đã bật cho ngày sau. Ca hiện tại chưa có thu ngân để tự lo.', H * 0.25, C.red);
          },
        });
        L.add(managerBtn);

        // Row 3: Cặp đôi Tự thối & Tự quét
        const autoLabel = () => (G.state.settings.autoChange ? '🧮 Tự thối: Bật' : '✋ Tự thối: Tắt');
        const autoBtn = new Button(this, col0X - (halfW + halfGap) / 2, rowY(3), {
          w: halfW,
          h: rowH,
          label: autoLabel(),
          size: 11,
          color: G.state.settings.autoChange ? C.blue : C.wood,
          onTap: () => {
            G.state.settings.autoChange = !G.state.settings.autoChange;
            autoBtn.setText(autoLabel()).setColor(G.state.settings.autoChange ? C.blue : C.wood);
            if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoChange', value: G.state.settings.autoChange });
            else persist();
            if (G.state.settings.autoChange) {
              if (G.liveSnapshot) void this.liveCommand({ type: 'autoChange' }); else this.session.autoChange();
            }
          },
        });
        L.add(autoBtn);

        const scanLabel = () => (G.state.settings.autoScan ? '📦 Quét: Bật' : '🧺 Quét: Tắt');
        const scanBtn = new Button(this, col0X + (halfW + halfGap) / 2, rowY(3), {
          w: halfW,
          h: rowH,
          size: 11,
          label: scanLabel(),
          color: G.state.settings.autoScan ? C.blue : C.wood,
          onTap: () => {
            G.state.settings.autoScan = !G.state.settings.autoScan;
            scanBtn.setText(scanLabel()).setColor(G.state.settings.autoScan ? C.blue : C.wood);
            if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoScan', value: G.state.settings.autoScan });
            else persist();
          },
        });
        L.add(scanBtn);

        // Row 4: Chơi hộ & Khu ăn (hoặc Chơi hộ full width)
        const idleSteps = [60, 30, 0];
        const idleLabel = () => {
          const v = G.state.settings.idleAutoPlay ?? 60;
          return v ? `🤖 Chơi hộ: ${v >= 60 ? `${v / 60}p` : `${v}s`}` : '🤖 Chơi hộ: Tắt';
        };
        if (hasDining) {
          const idleBtn = new Button(this, col0X - (halfW + halfGap) / 2, rowY(4), {
            w: halfW,
            h: rowH,
            size: 11,
            label: idleLabel(),
            color: (G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood,
            onTap: () => {
              const cur = idleSteps.indexOf(G.state.settings.idleAutoPlay ?? 60);
              G.state.settings.idleAutoPlay = idleSteps[(cur + 1) % idleSteps.length];
              idleBtn.setText(idleLabel()).setColor((G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood);
              persist();
            },
          });
          if (G.liveSnapshot) idleBtn.setEnabled(false);
          L.add(idleBtn);

          L.add(new Button(this, col0X + (halfW + halfGap) / 2, rowY(4), {
            w: halfW,
            h: rowH,
            label: '🪑 Ăn tại chỗ',
            size: 11,
            color: C.wood,
            onTap: () => this.openDining(),
          }));
        } else {
          const idleBtn = new Button(this, col0X, rowY(4), {
            w: colW,
            h: rowH,
            size: 12,
            label: idleLabel(),
            color: (G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood,
            onTap: () => {
              const cur = idleSteps.indexOf(G.state.settings.idleAutoPlay ?? 60);
              G.state.settings.idleAutoPlay = idleSteps[(cur + 1) % idleSteps.length];
              idleBtn.setText(idleLabel()).setColor((G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood);
              persist();
            },
          });
          if (G.liveSnapshot) idleBtn.setEnabled(false);
          L.add(idleBtn);
        }
      } else {
        // Chưa có manager:
        // Row 2: Tự thối tiền (Full width)
        const autoLabel = () => (G.state.settings.autoChange ? '🧮 Tự thối tiền: Bật' : '✋ Tự thối tiền: Tắt');
        const autoBtn = new Button(this, col0X, rowY(2), {
          w: colW,
          h: rowH,
          label: autoLabel(),
          size: 12,
          color: G.state.settings.autoChange ? C.blue : C.wood,
          onTap: () => {
            G.state.settings.autoChange = !G.state.settings.autoChange;
            autoBtn.setText(autoLabel()).setColor(G.state.settings.autoChange ? C.blue : C.wood);
            if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoChange', value: G.state.settings.autoChange });
            else persist();
            if (G.state.settings.autoChange) {
              if (G.liveSnapshot) void this.liveCommand({ type: 'autoChange' }); else this.session.autoChange();
            }
          },
        });
        L.add(autoBtn);

        // Row 3: Cặp đôi Tự quét & Chơi hộ
        const scanLabel = () => (G.state.settings.autoScan ? '📦 Quét: Bật' : '🧺 Quét: Tắt');
        const scanBtn = new Button(this, col0X - (halfW + halfGap) / 2, rowY(3), {
          w: halfW,
          h: rowH,
          size: 11,
          label: scanLabel(),
          color: G.state.settings.autoScan ? C.blue : C.wood,
          onTap: () => {
            G.state.settings.autoScan = !G.state.settings.autoScan;
            scanBtn.setText(scanLabel()).setColor(G.state.settings.autoScan ? C.blue : C.wood);
            if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoScan', value: G.state.settings.autoScan });
            else persist();
          },
        });
        L.add(scanBtn);

        const idleSteps = [60, 30, 0];
        const idleLabel = () => {
          const v = G.state.settings.idleAutoPlay ?? 60;
          return v ? `🤖 Chơi: ${v >= 60 ? `${v / 60}p` : `${v}s`}` : '🤖 Chơi: Tắt';
        };
        const idleBtn = new Button(this, col0X + (halfW + halfGap) / 2, rowY(3), {
          w: halfW,
          h: rowH,
          size: 11,
          label: idleLabel(),
          color: (G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood,
          onTap: () => {
            const cur = idleSteps.indexOf(G.state.settings.idleAutoPlay ?? 60);
            G.state.settings.idleAutoPlay = idleSteps[(cur + 1) % idleSteps.length];
            idleBtn.setText(idleLabel()).setColor((G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood);
            persist();
          },
        });
        if (G.liveSnapshot) idleBtn.setEnabled(false);
        L.add(idleBtn);

        // Row 4: Khu ăn tại chỗ (nếu có)
        if (hasDining) {
          L.add(new Button(this, col0X, rowY(4), {
            w: colW,
            h: rowH,
            label: '🪑 Khu ăn tại chỗ',
            size: 12,
            color: C.wood,
            onTap: () => this.openDining(),
          }));
        }
      }

      // --- CỘT PHẢI: CÀI ĐẶT & HỆ THỐNG ---
      // Row 0: Âm thanh
      const soundBtn = new Button(this, col1X + (halfW + halfGap) / 2, rowY(0), {
        w: halfW,
        h: rowH,
        size: 11,
        label: G.state.settings.sound ? '🔊 Âm: Bật' : '🔇 Âm: Tắt',
        color: G.state.settings.sound ? C.wood : C.grey,
        onTap: () => {
          G.state.settings.sound = !G.state.settings.sound;
          setSoundEnabled(G.state.settings.sound);
          soundBtn.setText(G.state.settings.sound ? '🔊 Âm: Bật' : '🔇 Âm: Tắt').setColor(G.state.settings.sound ? C.wood : C.grey);
          if (!G.liveSnapshot) persist();
        },
      });
      L.add(soundBtn);

      // Row 1: Tài khoản & đồng bộ (nếu có)
      if (hasCloud) {
        L.add(new Button(this, col1X, rowY(1), {
          w: colW,
          h: rowH,
          label: '☁️ Tài khoản và đồng bộ',
          size: 12,
          color: C.blue,
          onTap: () => {
            if (!G.liveSnapshot) persist();
            else suspendLiveShop();
            stopMusic();
            this.scene.start('Title', { login: false });
          },
        }));
      }

      // Row 2: Kiểm tra cập nhật
      const updateRow = hasCloud ? 2 : 1;
      L.add(new Button(this, col1X, rowY(updateRow), {
        w: colW,
        h: rowH,
        label: '🔄 Kiểm tra cập nhật',
        size: 12,
        color: C.woodDark,
        onTap: () => { void checkForUpdate().then((r) => toast(this, manualCheckMessage(r))); },
      }));

      // Row 4: Cặp nút Đóng cửa sớm & Về màn chính
      const exitRow = 4;
      const closeEarlyBtn = new Button(this, col1X - (halfW + halfGap) / 2, rowY(exitRow), {
        w: halfW,
        h: rowH,
        size: 11,
        label: this.session.closed ? '🌙 Đã đóng' : '🚪 Đóng sớm',
        color: C.red,
        onTap: () => this.confirmCloseEarly(),
      }).setEnabled(!this.session.closed);
      L.add(closeEarlyBtn);

      L.add(new Button(this, col1X + (halfW + halfGap) / 2, rowY(exitRow), {
        w: halfW,
        h: rowH,
        size: 11,
        label: '🏠 Về màn chính',
        color: C.grey,
        onTap: () => {
          if (!G.liveSnapshot) persist();
          else suspendLiveShop();
          stopMusic();
          this.scene.start('Title');
        },
      }));

      // Chú thích chân trang
      L.add(txt(this, modalX + modalW / 2, modalY + modalH - 12, '💾 Tiến trình tiệm được tự động lưu liên tục.', {
        size: 11,
        color: HEX.muted,
        origin: [0.5, 0.5],
        align: 'center',
      }));
    } else {
      const padX = 14;
      const colW = modalW - 2 * padX;
      const halfGap = 6;
      const halfW = Math.floor((colW - halfGap) / 2);
      const cx = modalX + modalW / 2;
      const rowH = 40;
      const rowGap = 8;
      let currY = modalY + headerH + 14 + rowH / 2;

      // 1. Tiếp tục
      L.add(new Button(this, cx, currY, {
        w: colW,
        h: rowH,
        label: '▶ Tiếp tục',
        size: 14,
        color: C.green,
        onTap: () => this.resume(),
      }));
      currY += rowH + rowGap;

      // 2. Nhập hàng / Bếp xôi
      const restockLabel = hasXoiKitchen ? '🍙 Bếp xôi' : '📦 Nhập hàng';
      L.add(new Button(this, cx - (halfW + halfGap) / 2, currY, {
        w: halfW,
        h: rowH,
        label: restockLabel,
        size: 11,
        color: hasXoiKitchen ? C.green : C.woodDark,
        onTap: () => (hasXoiKitchen ? this.openKitchen() : this.openRestock()),
      }));
      // 3. Nhân viên (nếu có)
      if (hasManager) {
        const managerLabel = () => G.state.manager.enabled ? '🧑‍💼 Để nhân viên lo: BẬT' : '🧑‍💼 Để nhân viên lo: TẮT';
        const managerBtn = new Button(this, cx, currY, {
          w: colW,
          h: rowH,
          label: managerLabel(),
          size: 13,
          color: G.state.manager.enabled ? C.green : C.grey,
          onTap: () => {
            const enabled = !G.state.manager.enabled;
            G.state.manager.enabled = enabled;
            G.state.today.managerDay = enabled && this.session.lanes.length > 0;
            if (!enabled) G.state.manager.speed = 1;
            persist();
            managerBtn.setText(managerLabel()).setColor(enabled ? C.green : C.grey);
            this.renderPanel(true);
            if (enabled && !G.state.today.managerDay) toast(this, 'Đã bật cho ngày sau. Ca hiện tại chưa có thu ngân để tự lo.', H * 0.25, C.red);
          },
        });
        L.add(managerBtn);
        currY += rowH + rowGap;
      }

      // 4. Tự thối tiền
      const autoLabel = () => (G.state.settings.autoChange ? '🧮 Tự thối tiền: Bật' : '✋ Tự thối tiền: Tắt');
      const autoBtn = new Button(this, cx, currY, {
        w: colW,
        h: rowH,
        label: autoLabel(),
        size: 12,
        color: G.state.settings.autoChange ? C.blue : C.wood,
        onTap: () => {
          G.state.settings.autoChange = !G.state.settings.autoChange;
          autoBtn.setText(autoLabel()).setColor(G.state.settings.autoChange ? C.blue : C.wood);
          if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoChange', value: G.state.settings.autoChange });
          else persist();
          if (G.state.settings.autoChange) {
            if (G.liveSnapshot) void this.liveCommand({ type: 'autoChange' }); else this.session.autoChange();
          }
        },
      });
      L.add(autoBtn);
      currY += rowH + rowGap;

      // 5. Cặp đôi Tự quét & Chơi hộ
      const scanLabel = () => (G.state.settings.autoScan ? '📦 Quét: Bật' : '🧺 Quét: Tắt');
      const scanBtn = new Button(this, cx - (halfW + halfGap) / 2, currY, {
        w: halfW,
        h: rowH,
        size: 11,
        label: scanLabel(),
        color: G.state.settings.autoScan ? C.blue : C.wood,
        onTap: () => {
          G.state.settings.autoScan = !G.state.settings.autoScan;
          scanBtn.setText(scanLabel()).setColor(G.state.settings.autoScan ? C.blue : C.wood);
          if (G.liveSnapshot) void this.liveCommand({ type: 'setPreference', key: 'autoScan', value: G.state.settings.autoScan });
          else persist();
        },
      });
      L.add(scanBtn);

      const idleSteps = [60, 30, 0];
      const idleLabel = () => {
        const v = G.state.settings.idleAutoPlay ?? 60;
        return v ? `🤖 Chơi: ${v >= 60 ? `${v / 60}p` : `${v}s`}` : '🤖 Chơi: Tắt';
      };
      const idleBtn = new Button(this, cx + (halfW + halfGap) / 2, currY, {
        w: halfW,
        h: rowH,
        size: 11,
        label: idleLabel(),
        color: (G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood,
        onTap: () => {
          const cur = idleSteps.indexOf(G.state.settings.idleAutoPlay ?? 60);
          G.state.settings.idleAutoPlay = idleSteps[(cur + 1) % idleSteps.length];
          idleBtn.setText(idleLabel()).setColor((G.state.settings.idleAutoPlay ?? 60) > 0 ? C.blue : C.wood);
          persist();
        },
      });
      if (G.liveSnapshot) idleBtn.setEnabled(false);
      L.add(idleBtn);
      currY += rowH + rowGap;

      // 6. Âm thanh
      const soundBtn = new Button(this, cx + (halfW + halfGap) / 2, currY, {
        w: halfW,
        h: rowH,
        size: 11,
        label: G.state.settings.sound ? '🔊 Âm: Bật' : '🔇 Âm: Tắt',
        color: G.state.settings.sound ? C.wood : C.grey,
        onTap: () => {
          G.state.settings.sound = !G.state.settings.sound;
          setSoundEnabled(G.state.settings.sound);
          soundBtn.setText(G.state.settings.sound ? '🔊 Âm: Bật' : '🔇 Âm: Tắt').setColor(G.state.settings.sound ? C.wood : C.grey);
          if (!G.liveSnapshot) persist();
        },
      });
      L.add(soundBtn);
      currY += rowH + rowGap;

      // 7. Ăn tại chỗ (nếu có)
      if (hasDining) {
        L.add(new Button(this, cx, currY, {
          w: colW,
          h: rowH,
          label: '🪑 Khu ăn tại chỗ',
          size: 12,
          color: C.wood,
          onTap: () => this.openDining(),
        }));
        currY += rowH + rowGap;
      }

      // 8. Tài khoản (nếu có)
      if (hasCloud) {
        L.add(new Button(this, cx, currY, {
          w: colW,
          h: rowH,
          label: '☁️ Tài khoản và đồng bộ',
          size: 12,
          color: C.blue,
          onTap: () => {
            if (!G.liveSnapshot) persist();
            else suspendLiveShop();
            stopMusic();
            this.scene.start('Title', { login: false });
          },
        }));
        currY += rowH + rowGap;
      }

      // 9. Cập nhật
      L.add(new Button(this, cx, currY, {
        w: colW,
        h: rowH,
        label: '🔄 Kiểm tra cập nhật',
        size: 12,
        color: C.woodDark,
        onTap: () => { void checkForUpdate().then((r) => toast(this, manualCheckMessage(r))); },
      }));
      currY += rowH + rowGap;

      // 10. Cặp đôi Đóng cửa & Về màn chính
      const closeEarlyBtn = new Button(this, cx - (halfW + halfGap) / 2, currY, {
        w: halfW,
        h: rowH,
        size: 11,
        label: this.session.closed ? '🌙 Đã đóng' : '🚪 Đóng sớm',
        color: C.red,
        onTap: () => this.confirmCloseEarly(),
      }).setEnabled(!this.session.closed);
      L.add(closeEarlyBtn);

      L.add(new Button(this, cx + (halfW + halfGap) / 2, currY, {
        w: halfW,
        h: rowH,
        size: 11,
        label: '🏠 Về màn chính',
        color: C.grey,
        onTap: () => {
          if (!G.liveSnapshot) persist();
          else suspendLiveShop();
          stopMusic();
          this.scene.start('Title');
        },
      }));
      currY += rowH + 18;

      L.add(txt(this, cx, currY, 'Tắt tự thối để tự chọn tiền và nhận tip.\nTiến trình được tự động lưu.', {
        size: 11,
        color: HEX.muted,
        origin: [0.5, 0.5],
        align: 'center',
        wrap: colW - 10,
      }));
    }
    this.pauseLayer = L;
  }

  private openDining(): void {
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    this.scene.pause('Shop');
    this.scene.launch('Dining');
  }

  /** Tạm dừng bán để nhập thêm hàng: màn Nhập hàng phủ lên, tiệm đứng yên tới khi quay lại. */
  private openRestock(): void {
    if (this.ending) return;
    if (this.session.closed) { toast(this, 'Tiệm đã đóng cửa, mai nhập tiếp nhé!'); return; }
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    if (!G.liveSnapshot) this.session.paused = true;
    setPlayClockRunning(false);
    this.scene.pause('Shop');
    this.scene.launch('Restock');
  }

  /** Tiệm xôi: màn Bếp (ngâm, hấp, làm món) phủ lên tiệm; tiệm đứng yên tới khi quay lại. */
  private openKitchen(): void {
    if (this.ending || G.liveSnapshot) return;
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    this.session.paused = true;
    setPlayClockRunning(false);
    this.scene.pause('Shop');
    this.scene.launch('Kitchen', { fromShop: true });
  }

  /** Nấu kỹ (mini-game) từ góc nhìn trên xuống: màn Bếp phủ lên, tiệm đứng yên tới khi quay lại. */
  private openCook(recipeId: string): void {
    if (this.ending || G.liveSnapshot) return;
    this.session.paused = true;
    setPlayClockRunning(false);
    this.scene.pause('Shop');
    this.scene.launch('Cook', { recipeId, fromShop: true });
  }

  resumeFromRestock(): void {
    this.shelves.render(G.state, this.shelfOpts());
    this.hud.refresh();
    this.renderPanel(true);
    // Trong lúc nhập hàng mà app bị ẩn thì bảng tạm dừng đã mở: giữ nguyên trạng thái dừng.
    if (this.pauseLayer) return;
    if (!G.liveSnapshot) this.session.paused = false;
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
  }

  resumeFromDining(): void {
    this.session.paused = false;
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
  }

  private resume(): void {
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
    if (!G.liveSnapshot) this.session.paused = false;
    setPlayClockRunning(true);
    if (G.state.settings.sound) startMusic();
  }
}
