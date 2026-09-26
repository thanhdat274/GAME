import Phaser from 'phaser';
import { DATA, hasFeature, product, supplier, type Category, type Product } from '../core/data';
import { openShop, setManagerMode } from '../core/day';
import { shiftsWithoutCashier } from '../core/schedule';
import { letGo, retainStaff } from '../core/staff';
import { exportBackupCode, importBackupCode } from '../core/save';
import { MAX_SHELVES, formatMoney, priceOf, shelfCount, totalQty, unlockedProducts, warehouseQty, warehouseTotals } from '../core/state';
import {
  assignCounterSlot, assignSlot, autoArrange, bulkDiscounted, buyStock, checkCart, costTrend, hasPlaceFor, refillCounterSlot,
  refillSlot, setClearance, slotFreshness, suggestCart, clearSlot, supplierUnlocked, unitCost, warehouseCapacity,
  warehouseCellsUsed, type Cart,
} from '../core/stock';
import { G, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { dispatchLiveCommand } from '../services/liveShop';
import { suspendLiveShop } from '../services/liveShop';
import { productIcon } from '../ui/art';
import { Hud, HUD_H } from '../ui/hud';
import { ShelfView, ZONE_NAMES, placeErrorText } from '../ui/shelves';
import { play, setSoundEnabled, stopMusic, vibrate } from '../ui/sound';
import { Culler, KineticScroll, snap } from '../ui/scroll';
import { Button, dialog, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';
import { cloudSaveEnabled, firebaseConfigured, hasAuthHint } from '../services/firebase';
import { scheduleEvents } from '../core/eventScheduler';

type Tab = 'buy' | 'arrange';

/** Hướng dẫn ngắn khi một hệ thống mới mở khóa (hiện 1 lần, buổi sáng hôm sau). */
const TUTORIALS: Record<string, { icon: string; title: string; body: string }> = {
  land: { icon: '🏗️', title: 'Mở rộng tiệm', body: 'Vào ☰ Tiệm → Sắp xếp để mở Đất A, đặt thêm kệ và kéo thả nội thất.' },
  fridge: { icon: '🧊', title: 'Tủ lạnh', body: 'Đồ uống để tủ lạnh bán chạy hơn. Mua tủ lạnh trong chế độ Sắp xếp; mỗi tủ tốn 5.000đ tiền điện/ngày.' },
  quests: { icon: '🎯', title: 'Nhiệm vụ hằng ngày', body: 'Mỗi ngày có 3 nhiệm vụ. Xong thì vào ☰ Tiệm → Nhiệm vụ để nhận thưởng.' },
  pricing: { icon: '💲', title: 'Chỉnh giá bán', body: 'Tăng giá thì lãi hơn nhưng khách dễ chê. Chỉnh ở ☰ Tiệm → Giá bán.' },
  anh_ba: { icon: '🚚', title: 'Đại lý Anh Ba', body: 'Rẻ hơn 10% nhưng giao 15:00 hôm sau, đơn tối thiểu 200.000đ. Chọn ở tab Nhập hàng.' },
  fresh: { icon: '🥚', title: 'Hàng tươi có hạn dùng', body: 'Trứng, bánh mì, rau... hết hạn cuối ngày sẽ hỏng. Ô sắp hết hạn có nhãn vàng/đỏ; chạm ô hết hạn hôm nay để bán xả.' },
  credit: { icon: '📒', title: 'Khách ghi sổ', body: 'Hàng xóm quen có thể xin nợ. Theo dõi và nhắc nợ ở ☰ Tiệm → Sổ nợ.' },
  warehouse: { icon: '📦', title: 'Nâng cấp kho', body: 'Vào ☰ Tiệm → Kho để nâng lên kệ sắt 50 ô, hoặc đặt kệ kho trong chế độ Sắp xếp.' },
  decor: { icon: '🪴', title: 'Trang trí', body: 'Đồ trang trí tăng thu hút, khách tới đông hơn. Mua ở ☰ Tiệm → Trang trí.' },
  freezer: { icon: '❄️', title: 'Tủ đông', body: 'Kem, xúc xích, há cảo... chỉ bày được trong tủ đông (8.000đ điện/ngày).' },
  bargain: { icon: '🙏', title: 'Khách mặc cả', body: 'Bà nội trợ có thể xin bớt 5–15%. Bớt thì khách vui; không bớt thì có thể bỏ về.' },
  staff: { icon: '👥', title: 'Thuê nhân viên', body: 'Tiệm đông rồi! Vào ☰ Tiệm → Nhân sự để thuê thu ngân. Bé Lan đang chờ ở bảng tuyển dụng.' },
  warehouse_big: { icon: '🏬', title: 'Kho tổng', body: 'Nâng kho lên 120 ô ở ☰ Tiệm → Kho hàng.' },
  refill_staff: { icon: '🧺', title: 'Nhân viên bổ sung kệ', body: 'Thêm chỗ thứ 2. Nhân viên bổ sung kệ tự nạp ô vơi dưới 40%.' },
  schedule: { icon: '📅', title: 'Xếp ca', body: 'Ca sáng 08–14, ca chiều 14–20. Cho nhân viên nghỉ ít nhất 1 ngày/tuần để họ vui. Xem ☰ Tiệm → Xếp ca.' },
  stocker: { icon: '📦', title: 'Nhân viên kho · sơ đồ kệ', body: 'Chốt sơ đồ kệ ở ☰ Tiệm → Quy tắc; nhân viên kho sẽ bày theo sơ đồ trước giờ mở cửa.' },
  mini_mart: { icon: '🏪', title: 'Mini Mart', body: 'Mở Đất D để có thêm 12 ô, quầy thu ngân 2, kệ đôi và xe đẩy. Coi chừng trộm vặt: chạm vào kẻ trộm trong 3 giây để bắt!' },
  autorestock: { icon: '⚙️', title: 'Đặt hàng tự động', body: 'Tạo quy tắc "còn dưới X thì nhập Y" ở ☰ Tiệm → Quy tắc. Chạy mỗi buổi sáng.' },
  camera: { icon: '📷', title: 'Camera an ninh', body: 'Lắp camera ở ☰ Tiệm → Nhân sự để tự phát hiện 80% kẻ trộm.' },
  delivery: { icon: '☎️', title: 'Giao hàng tận nhà', body: 'Điện thoại bàn sẽ reo trong ngày. Nhận đơn rồi để nhân viên giao hàng chạy xe, hoặc tự đi giao.' },
  analytics: { icon: '📊', title: 'Phân tích', body: 'Xem doanh thu 7 ngày, món bán chạy/ế, giờ đông khách và hiệu suất nhân viên ở ☰ Tiệm → Phân tích.' },
  manager: { icon: '🧑‍💼', title: 'Chế độ quản lý', body: 'Bật "Để nhân viên lo" ở ☰ Tiệm: tiệm tự chạy, bạn tăng tốc x2/x4 hoặc bỏ qua ngày. Rời game vẫn có thu nhập (tối đa 8 giờ).' },
};

const LIST_TOP = 100;
const LIST_BOTTOM = 548;
const ROW_H = 66;
/** Tâm hàng ô quầy và hàng chip đầu tiên khi bật chế độ "Sau quầy". */
const COUNTER_SLOT_Y = 382;
const COUNTER_CHIP_Y = 452;
/** Khung nhìn lưới hàng trong kho ở tab Bày kệ. */
const CHIP_VIEW_TOP = 356;
const CHIP_VIEW_BOTTOM = 550;
/** Giữ bao lâu (ms) thì nhấc món lên để kéo thả (vuốt nhanh là cuộn). */
const CHIP_HOLD_MS = 280;
const COUNTER_X0 = 96;
const COUNTER_DX = 72;

interface Row {
  p: Product;
  qty: Phaser.GameObjects.Text;
  info: Phaser.GameObjects.Text;
  /** Nhãn đỏ "thiếu N" cạnh tên món. */
  lack: Phaser.GameObjects.Text;
  minus: Button;
  plus: Button;
  plus10: Button;
  price: Phaser.GameObjects.Text;
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
  private listScroll: KineticScroll | null = null;
  private cartText!: Phaser.GameObjects.Text;
  private cartWarn!: Phaser.GameObjects.Text;
  private buyBtn!: Button;
  private tabBtns!: Record<Tab, Button>;
  private shelves!: ShelfView;
  private chips!: Phaser.GameObjects.Container;
  /** Cuộn lưới hàng trong kho (tab Bày kệ). */
  private chipScroll: KineticScroll | null = null;
  private chipCuller: Culler | null = null;
  private chipMask: Phaser.GameObjects.Graphics | null = null;
  private chipOffset = 0;
  private chipTop = CHIP_VIEW_TOP;
  private chipMax = 0;
  /** Món đang được giữ để kéo thả lên kệ. */
  private chipDrag: { id: string; ghost: Phaser.GameObjects.Container } | null = null;
  private counterPanel!: Phaser.GameObjects.Container;
  private counterTabBtn!: Button;
  private whLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private selected: string | null = null;
  private counterMode = false;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private supplierId = 'co_tu';
  private supplierBtns: Record<string, Button> = {};
  private menuBtn!: Button;

  constructor() {
    super('Morning');
  }

  create(data: { gift?: number }): void {
    setPlayClockRunning(true);
    scheduleEvents(G.state);
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

    const phase2 = G.state.level >= 5;
    const tabW = phase2 ? 128 : W / 2 - 16;
    this.tabBtns = {
      buy: new Button(this, phase2 ? 70 : W / 4 + 4, 74, { w: tabW, h: 38, label: '🛒 Nhập hàng', size: 14, onTap: () => this.setTab('buy') }),
      arrange: new Button(this, phase2 ? 204 : (W * 3) / 4 - 4, 74, { w: tabW, h: 38, label: '🧺 Bày kệ', size: 14, onTap: () => this.setTab('arrange') }),
    };
    this.menuBtn = new Button(this, W - 44, 74, { w: 76, h: 38, label: '☰ Tiệm', size: 14, color: C.blue, onTap: () => this.openShopMenu() });
    this.menuBtn.setVisible(phase2);

    this.buildBuy();
    this.buildArrange();
    // Có hàng trong kho mà kệ còn trống thì mở thẳng tab bày kệ.
    const hasStock = G.state.warehouse.length > 0;
    this.setTab(hasStock ? 'arrange' : 'buy');

    this.time.delayedCall(250, () => this.showMorningPopups(data?.gift ?? 0));
  }

  /** Hướng dẫn tính năng mới mở (mỗi tính năng 1 lần) kèm mũi tên chỉ nút ☰ Tiệm. */
  private showTutorials(done: () => void): void {
    const s = G.state;
    const pending = Object.keys(TUTORIALS).filter((id) => hasFeature(s.level, id) && !s.tutorialsSeen.includes(id));
    if (!pending.length) { done(); return; }
    s.tutorialsSeen.push(...pending);
    persist();
    const arrow = txt(this, this.menuBtn.x, this.menuBtn.y + 34, '⬆', { size: 26, bold: true, color: HEX.red, origin: [0.5, 0.5] }).setDepth(2500);
    this.tweens.add({ targets: arrow, y: arrow.y + 8, yoyo: true, repeat: -1, duration: 350 });
    const close = () => { arrow.destroy(); done(); };
    if (pending.length === 1) {
      const t = TUTORIALS[pending[0]];
      dialog(this, { icon: t.icon, title: `Mới: ${t.title}`, body: t.body, buttons: [{ label: 'Đã hiểu', onTap: close }] });
      return;
    }
    // Nhiều tính năng mở cùng lúc (vd bản lưu cũ lên thẳng level cao): gộp vào một hộp.
    const body = pending.map((id) => `${TUTORIALS[id].icon} ${TUTORIALS[id].title}`).join('\n') + '\n\nXem các tính năng ở nút ☰ Tiệm.';
    dialog(this, { icon: '✨', title: 'Tính năng mới đã mở', body, buttons: [{ label: 'Đã hiểu', onTap: close }] });
  }

  private showMorningPopups(gift: number): void {
    const s = G.state;
    const unlockCounter = s.announcedLevel < 3 && s.level >= 3;
    const newProducts = s.announcedLevel < s.level ? unlockedProducts(s.level, s).filter((p) => p.unlockLevel > s.announcedLevel) : [];
    const afterNew = () => this.showTutorials(() => this.showNotes(() => this.showQuits(() => this.showHolding())));
    const showNew = () => {
      if (s.announcedLevel >= s.level) {
        afterNew();
        return;
      }
      s.announcedLevel = s.level;
      persist();
      if (newProducts.length === 0) {
        afterNew();
        return;
      }
      play('levelup');
      dialog(this, {
        icon: '🆕',
        title: 'Mặt hàng mới!',
        body: [
          ...newProducts.slice(0, 8).map((p) => `${p.icon} ${p.name} · bán ${formatMoney(priceOf(p.id, s))}`),
          ...(unlockCounter ? ['🔐 Đã mở khu hàng Sau quầy.'] : []),
        ].join('\n'),
        buttons: [{ label: 'Tuyệt!', onTap: afterNew }],
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

  /** Thông báo buổi sáng: tự nhập hàng, nhân viên mệt, nợ lương... */
  private showNotes(done: () => void): void {
    const notes = G.state.morningNotes;
    if (!notes.length) { done(); return; }
    G.state.morningNotes = [];
    persist();
    dialog(this, { icon: '📋', title: 'Sáng nay', body: notes.slice(0, 8).join('\n'), buttons: [{ label: 'Đã biết', onTap: done }], width: 320 });
  }

  /** Nhân viên xin nghỉ: "Tăng lương giữ lại" (+15% lương, +30 tâm trạng) hoặc để đi. */
  private showQuits(done: () => void): void {
    const st = G.state.staff.find((x) => x.quitting);
    if (!st) { done(); return; }
    const raise = Math.round((st.wage * (1 + DATA.balance.staff.mood.retainRaise)) / 1000) * 1000;
    dialog(this, {
      icon: '😞',
      title: `${st.name} xin nghỉ việc`,
      body: `"Dạo này em mệt quá chủ ơi..."\nTăng lương lên ${formatMoney(raise)}/ngày để giữ lại?`,
      buttons: [
        { label: '💰 Tăng lương giữ lại', color: C.green, onTap: () => { retainStaff(G.state, st.id); persist(); this.showQuits(done); } },
        { label: 'Để đi', color: C.grey, onTap: () => { letGo(G.state, st.id); persist(); this.showQuits(done); } },
      ],
    });
  }

  /** Hàng Anh Ba giao hôm qua không vừa kho: nhắc dọn trước khi mở cửa. */
  private showHolding(): void {
    const held = G.state.holding.reduce((sum, lot) => sum + lot.qty, 0);
    if (!held) { this.showLoginPrompt(); return; }
    dialog(this, { icon: '🚚', title: 'Hàng chờ chưa vào kho', body: `Còn ${held} món chưa có chỗ trong kho. Dọn chỗ hoặc bỏ bớt trước khi mở cửa.`, buttons: [
      { label: 'Để sau', color: C.grey },
      { label: 'Mở kho', color: C.green, onTap: () => this.scene.start('Warehouse') },
    ] });
  }

  /** Menu các màn quản lý (2 cột để vừa màn dọc), chỉ hiện mục đã mở khóa. */
  private openShopMenu(): void {
    const s = G.state;
    const go = (key: string) => () => { persist(); this.scene.start(key); };
    const items: { label: string; color: number; onTap: () => void }[] = [];
    if (hasFeature(s.level, 'land')) items.push({ label: '🏗️ Sắp xếp', color: C.green, onTap: go('Build') });
    items.push({ label: '🗺️ Sơ đồ tiệm', color: C.wood, onTap: go('StoreMap') });
    items.push({ label: '📦 Kho hàng', color: C.wood, onTap: go('Warehouse') });
    if (hasFeature(s.level, 'quests')) items.push({ label: '🎯 Nhiệm vụ', color: C.wood, onTap: go('Quests') });
    if (hasFeature(s.level, 'pricing')) items.push({ label: '💲 Giá bán', color: C.wood, onTap: go('Prices') });
    if (hasFeature(s.level, 'credit')) items.push({ label: '📒 Sổ nợ', color: C.wood, onTap: go('Ledger') });
    if (hasFeature(s.level, 'decor')) items.push({ label: '🪴 Trang trí', color: C.wood, onTap: go('Decor') });
    if (hasFeature(s.level, 'staff')) items.push({ label: '👥 Nhân sự', color: C.blue, onTap: go('Staff') });
    if (hasFeature(s.level, 'schedule')) items.push({ label: '📅 Xếp ca', color: C.blue, onTap: go('Schedule') });
    if (hasFeature(s.level, 'stocker') || hasFeature(s.level, 'autorestock')) items.push({ label: '⚙️ Quy tắc', color: C.blue, onTap: go('Rules') });
    if (hasFeature(s.level, 'analytics')) items.push({ label: '📊 Phân tích', color: C.blue, onTap: go('Analytics') });
    if (hasFeature(s.level, 'calendar')) items.push({ label: '🗓️ Lịch', color: C.blue, onTap: go('Calendar') });
    if (hasFeature(s.level, 'food_corner')) items.push({ label: '🍳 Bếp & quầy nước', color: C.green, onTap: go('Kitchen') });
    if (hasFeature(s.level, 'branches')) items.push({ label: '🗺️ Bản đồ thành phố', color: C.blue, onTap: go('Branches') });
    items.push({ label: '📖 Hành trình', color: C.blue, onTap: go('Story') });
    if (hasFeature(s.level, 'prestige')) items.push({ label: '🏆 Danh hiệu', color: C.yellow, onTap: go('Prestige') });
    const L = this.add.container(0, 0).setDepth(2000);
    const close = () => L.destroy();
    L.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive().on('pointerup', close));
    const rows = Math.ceil(items.length / 2);
    const manager = hasFeature(s.level, 'manager');
    const h = 96 + rows * 48 + (manager ? 58 : 0) + 50;
    const top = H / 2 - h / 2;
    L.add(this.add.rectangle(W / 2, top + h / 2, W - 40, h, 0xffffff, 0.001).setInteractive());
    L.add(panel(this, 20, top, W - 40, h));
    L.add(txt(this, W / 2, top + 22, '☰ Quản lý tiệm', { size: 18, bold: true, origin: [0.5, 0.5] }));
    const next = DATA.levels.levels.find((l) => l.level === s.level + 1);
    L.add(txt(this, W / 2, top + 46, next ? `Level ${next.level}: ${next.label}` : 'Đã mở mọi tính năng giai đoạn 3.', { size: 11, color: HEX.muted, origin: [0.5, 0.5], align: 'center', wrap: W - 70 }));
    items.forEach((it, i) => {
      const x = W / 2 + (i % 2 === 0 ? -76 : 76);
      const y = top + 86 + Math.floor(i / 2) * 48;
      L.add(new Button(this, x, y, { w: 144, h: 40, label: it.label, size: 13, color: it.color, onTap: () => { close(); it.onTap(); } }));
    });
    let y = top + 86 + rows * 48;
    if (manager) {
      const label = () => (s.manager.enabled ? '🧑‍💼 Để nhân viên lo: BẬT' : '🧑‍💼 Để nhân viên lo: tắt');
      const btn = new Button(this, W / 2, y + 4, {
        w: W - 80, h: 42, label: label(), size: 14, color: s.manager.enabled ? C.green : C.grey,
        onTap: () => {
          setManagerMode(s, !s.manager.enabled);
          persist();
          btn.setText(label()).setColor(s.manager.enabled ? C.green : C.grey);
          const empty = shiftsWithoutCashier(s, s.day);
          if (s.manager.enabled && empty.length) toast(this, `⚠️ ${empty.map((sh) => DATA.balance.staff.shifts[sh].name).join(', ')} hôm nay không có thu ngân — bạn phải tự đứng quầy.`, H * 0.25, C.red);
        },
      });
      L.add(btn);
      y += 58;
    }
    L.add(new Button(this, W / 2, y + 4, { w: 140, h: 38, label: 'Đóng', size: 14, color: C.grey, onTap: close }));
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
    const supplierLabel = txt(this, 12, 98, '🧑‍🌾 Mối sỉ Cô Tư · giao ngay', { size: 12, color: HEX.muted });
    this.supplierBtns = {};
    if (supplierUnlocked(G.state, 'anh_ba')) {
      supplierLabel.setVisible(false);
      DATA.suppliers.forEach((sp, i) => {
        const b = new Button(this, 64 + i * 118, 104, { w: 112, h: 22, size: 11, label: `${sp.icon} ${sp.name}`, color: C.wood, onTap: () => { this.supplierId = sp.id; this.refresh(); } });
        this.supplierBtns[sp.id] = b;
        this.buyLayer.add(b);
      });
    }
    this.list = this.add.container(0, LIST_TOP + 16);
    const maskG = this.make.graphics({}, false).fillRect(0, LIST_TOP + 14, W, LIST_BOTTOM - LIST_TOP - 14);
    this.list.setMask(maskG.createGeometryMask());
    this.buyLayer.add([supplierLabel, this.list]);

    const unlocked = unlockedProducts(G.state.level, G.state);
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
      const price = txt(this, 60, y + 27, `Nhập ${formatMoney(p.cost)} · bán ${formatMoney(priceOf(p.id, G.state))}`, { size: 11, color: HEX.muted });
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
      this.rows.push({ p, qty, info, lack, minus, plus, plus10, price });
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
        this.cart = suggestCart(G.state, this.supplierId);
        if (Object.keys(this.cart).length === 0) toast(this, 'Hàng còn đủ, hoặc hết tiền/chỗ kho rồi!', H * 0.5);
        this.refresh();
      },
    });
    const clear = new Button(this, 154, H - 26, { w: 68, h: 36, label: 'Xóa giỏ', color: C.grey, size: 12, onTap: () => this.clearCart() });
    this.buyBtn = new Button(this, W - 80, H - 40, { w: 140, h: 52, label: 'Nhập hàng', color: C.green, size: 16, onTap: () => this.buy() });
    this.buyLayer.add([foot, this.cartText, this.cartWarn, suggest, clear, this.buyBtn]);
  }

  private enableListScroll(): void {
    const top = LIST_TOP + 16;
    const viewTop = LIST_TOP + 14;
    const culler = new Culler(this.cameras.main);
    const setList = (offset: number) => {
      this.list.y = snap(top - offset);
      culler.cull(this.list, viewTop, LIST_BOTTOM);
    };
    this.listScroll = new KineticScroll(this, {
      inView: (y) => y > LIST_TOP && y < LIST_BOTTOM,
      enabled: () => this.tab === 'buy',
      get: () => top - this.list.y,
      set: setList,
      max: () => Math.max(0, this.listH - (LIST_BOTTOM - top)),
    });
    setList(0);
  }

  private changeQty(id: string, delta: number): void {
    // Nút đã cuộn ra ngoài vùng danh sách (bị che), hoặc chạm là để cuộn / dừng trôi, thì không nhận.
    if (this.listScroll?.blockTap) return;
    const y = this.input.activePointer.worldY;
    if (y < LIST_TOP + 14 || y > LIST_BOTTOM) return;
    const next = Math.max(0, (this.cart[id] ?? 0) + delta);
    const trial = { ...this.cart, [id]: next };
    const check = checkCart(G.state, trial, this.supplierId);
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
      void this.liveCommand({ type: 'buyStock', cart: { ...this.cart }, supplierId: this.supplierId }, () => { this.cart = {}; this.setTab('arrange'); });
      return;
    }
    const res = buyStock(G.state, this.cart, this.supplierId);
    if (!res.ok) return;
    this.cart = {};
    play('cash');
    const sp = supplier(this.supplierId);
    if (sp.delayDays > 0) {
      toast(this, `Đã đặt ${sp.name}: -${formatMoney(res.total)}\nXe giao 15:00 ngày ${G.state.day + sp.delayDays}.`, H * 0.5, C.greenDark);
      persist();
      this.refresh();
      return;
    }
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
    }, G.state);
    const g = this.add.graphics();
    g.fillStyle(C.floorB, 1).fillRect(0, 300, W, 250);
    g.fillStyle(C.woodDark, 1).fillRect(0, 300, W, 4);
    this.whLabel = txt(this, 12, 310, '', { size: 14, bold: true, color: HEX.white });
    // Dòng hướng dẫn nằm riêng dưới tiêu đề kho để không bị nút "Sau quầy" che.
    this.hint = txt(this, 12, 336, '', { size: 11, color: HEX.cream });
    this.counterPanel = this.add.container(0, 0);
    this.chips = this.add.container(0, 0);
    this.chipMask = this.make.graphics({}, false);
    this.chips.setMask(this.chipMask.createGeometryMask());
    this.chipCuller = new Culler(this.cameras.main);
    this.chipOffset = 0;
    this.chipScroll = new KineticScroll(this, {
      inView: (y) => y >= this.chipTop && y <= CHIP_VIEW_BOTTOM,
      enabled: () => this.tab === 'arrange' && !this.chipDrag,
      get: () => this.chipOffset,
      set: (v) => this.setChipOffset(v),
      max: () => this.chipMax,
    });
    // Kéo thả món (sau khi giữ): hình món đi theo ngón tay, thả lên ô kệ / ô quầy.
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => this.chipDrag?.ghost.setPosition(ptr.worldX, ptr.worldY));
    this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (!this.chipDrag) return;
      const { id, ghost } = this.chipDrag;
      ghost.destroy();
      this.chipDrag = null;
      this.dropChip(id, ptr);
    });
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
        const unplaced = autoArrange(G.state);
        play('pick');
        this.afterArrange();
        if (unplaced.length) {
          const groups = [...new Set(unplaced.map((id) => ZONE_NAMES[product(id).category as Exclude<Category, 'counter'>].toLowerCase()))].join(', ');
          toast(this, `Không đủ kệ/tủ cho nhóm: ${groups} (${unplaced.length} món)\nMua thêm ở ☰ Tiệm → Sắp xếp.`, H * 0.62, C.redDark);
        }
      },
    });
    const open = new Button(this, W - 90, H - 40, { w: 160, h: 54, label: 'Mở cửa ▶', color: C.red, size: 18, onTap: () => this.tryOpen() });
    this.arrangeLayer.add([this.shelves, g, this.whLabel, this.hint, this.counterTabBtn, this.counterPanel, this.chips, foot, auto, open]);
  }

  private onSlotTap(r: number, c: number): void {
    if (r < MAX_SHELVES && r >= shelfCount(G.state.level)) {
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
        if (e instanceof Error) {
          play('error');
          toast(this, placeErrorText(e.message));
          return;
        }
        throw e;
      }
      play('pick');
      if (warehouseQty(G.state, this.selected) <= 0) this.selected = null;
      this.afterArrange();
    } else if (slot.productId && slot.qty > 0 && slotFreshness(slot, G.state.day) === 'today') {
      this.askClearance(r, c);
    } else if (slot.productId) {
      if (G.liveSnapshot) { void this.liveCommand({ type: 'refillShelf', shelf: r, slot: c }); return; }
      if (refillSlot(G.state, r, c) > 0) play('pick');
      this.afterArrange();
    } else {
      toast(this, 'Chọn một món trong kho trước', H * 0.62);
    }
  }

  /** Ô chứa hàng hết hạn hôm nay: đề nghị bán xả 30% / 50%. */
  private askClearance(r: number, c: number): void {
    const slot = G.state.shelves[r][c];
    const p = product(slot.productId!);
    const apply = (pct: number | null) => () => {
      if (G.liveSnapshot) { void this.liveCommand({ type: 'setClearance', shelf: r, slot: c, pct }); return; }
      setClearance(G.state, r, c, pct);
      this.afterArrange();
    };
    dialog(this, { icon: '⏰', title: `${p.name} hết hạn hôm nay`, body: 'Bán xả để khách lấy nhanh hơn trước khi hàng hỏng cuối ngày.', buttons: [
      { label: 'Bán xả 30%', color: C.blue, onTap: apply(30) },
      { label: 'Bán xả 50%', color: C.red, onTap: apply(50) },
      { label: slot.clearance ? 'Bỏ bán xả' : 'Nạp thêm hàng', color: C.grey, onTap: () => {
        if (slot.clearance) { apply(null)(); return; }
        refillSlot(G.state, r, c);
        this.afterArrange();
      } },
    ] });
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
    const items = Object.entries(warehouseTotals(G.state)).filter(([id, q]) => q > 0 && !!product(id).behindCounter === this.counterMode);
    if (items.length === 0) {
      const message = this.counterMode ? 'Chưa có hàng sau quầy trong kho.' : 'Kho trống. Qua tab "Nhập hàng" để mua hàng.';
      this.chips.add(txt(this, W / 2, this.counterMode ? COUNTER_CHIP_Y + 20 : 420, message, { size: 13, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: 300 }));
      this.counterPanel.setVisible(G.state.level >= 3 && this.counterMode);
      this.chipTop = this.counterMode ? COUNTER_CHIP_Y - 36 : CHIP_VIEW_TOP;
      this.chipMax = 0;
      this.chipMask?.clear().fillStyle(0xffffff).fillRect(0, this.chipTop, W, CHIP_VIEW_BOTTOM - this.chipTop);
      this.chipCuller?.reset();
      this.setChipOffset(0);
      if (this.counterMode) this.renderCounterSlots();
      return;
    }
    // Chế độ sau quầy: hàng ô quầy chiếm phần trên nên chip trong kho nhỏ hơn, 6 cột.
    const cols = this.counterMode ? 6 : 5;
    const cw = this.counterMode ? 54 : 60;
    const ch = this.counterMode ? 60 : 66;
    items.forEach(([id, q], i) => {
      const x = this.counterMode ? 31 + (i % cols) * 59.5 : 42 + (i % cols) * 69;
      const y = this.counterMode ? COUNTER_CHIP_Y + Math.floor(i / cols) * 66 : 390 + Math.floor(i / cols) * 72;
      const p = product(id);
      const sel = this.selected === id;
      const bg = this.add.graphics();
      bg.fillStyle(sel ? C.yellow : C.slot, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 10);
      bg.lineStyle(sel ? 3 : 2, sel ? C.red : C.slotEdge, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 10);
      const icon = productIcon(this, 0, -8, p, this.counterMode ? 32 : 36);
      const label = txt(this, 0, ch / 2 - 11, `x${q}`, { size: 12, bold: true, origin: [0.5, 0.5] });
      const chip = this.add.container(x, y, [bg, icon, label]).setSize(cw, ch).setInteractive({ useHandCursor: true });
      let hold: Phaser.Time.TimerEvent | null = null;
      // Món đã cuộn ra ngoài khung (bị che) thì không nhận chạm.
      const inFrame = (ptr: Phaser.Input.Pointer) => ptr.worldY >= this.chipTop && ptr.worldY <= CHIP_VIEW_BOTTOM;
      chip.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        hold?.remove();
        if (!inFrame(ptr)) return;
        hold = this.time.delayedCall(CHIP_HOLD_MS, () => {
          // Giữ yên (không cuộn) thì nhấc món lên để kéo thả.
          if (!ptr.isDown || ptr.getDistance() > 8 || this.chipScroll?.moving || this.chipDrag) return;
          this.chipScroll?.cancel();
          this.chipDrag = { id, ghost: productIcon(this, ptr.worldX, ptr.worldY, p, 40).setDepth(800).setAlpha(0.9) };
          vibrate(15);
          play('tap');
        });
      });
      chip.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        hold?.remove();
        if (ptr.getDistance() > 10 || this.chipScroll?.blockTap || !inFrame(ptr)) return;
        this.selected = sel ? null : id;
        play('tap');
        this.refresh();
      });
      this.chips.add(chip);
    });
    // Khung cuộn: phần trên là ô quầy khi ở chế độ sau quầy.
    this.chipTop = this.counterMode ? COUNTER_CHIP_Y - 36 : CHIP_VIEW_TOP;
    const rows = Math.ceil(items.length / cols);
    const firstY = this.counterMode ? COUNTER_CHIP_Y : 390;
    const bottom = firstY + (rows - 1) * (this.counterMode ? 66 : 72) + ch / 2 + 8;
    this.chipMax = Math.max(0, bottom - CHIP_VIEW_BOTTOM);
    this.chipMask?.clear().fillStyle(0xffffff).fillRect(0, this.chipTop, W, CHIP_VIEW_BOTTOM - this.chipTop);
    this.chipCuller?.reset();
    this.setChipOffset(this.chipOffset);
    this.renderCounterSlots();
  }

  private setChipOffset(v: number): void {
    this.chipOffset = Phaser.Math.Clamp(v, 0, this.chipMax);
    this.chips.y = snap(-this.chipOffset);
    this.chipCuller?.cull(this.chips, this.chipTop, CHIP_VIEW_BOTTOM);
  }

  /** Thả món đang kéo: lên ô kệ, hoặc lên ô quầy khi ở chế độ sau quầy. */
  private dropChip(id: string, ptr: Phaser.Input.Pointer): void {
    const p = product(id);
    const target = this.shelves.slotAt(ptr.worldX, ptr.worldY);
    if (target && !(target.shelf < MAX_SHELVES && target.shelf >= shelfCount(G.state.level))) {
      if (p.behindCounter) {
        toast(this, 'Hàng sau quầy: thả vào một ô quầy bên dưới');
        return;
      }
      try {
        if (G.liveSnapshot) { void this.liveCommand({ type: 'assignShelf', shelf: target.shelf, slot: target.slot, productId: id }); return; }
        assignSlot(G.state, target.shelf, target.slot, id);
      } catch (e) {
        if (e instanceof Error) toast(this, placeErrorText(e.message));
        else throw e;
        return;
      }
      play('pick');
      this.afterArrange();
    } else if (p.behindCounter && this.counterMode && Math.abs(ptr.worldY - COUNTER_SLOT_Y) <= 26) {
      const counterSlot = Math.round((ptr.worldX - COUNTER_X0) / COUNTER_DX);
      if (counterSlot >= 0 && counterSlot < G.state.counter.length) {
        if (G.liveSnapshot) { void this.liveCommand({ type: 'assignCounter', slot: counterSlot, productId: id }); return; }
        assignCounterSlot(G.state, counterSlot, id);
        this.afterArrange();
      }
    }
  }

  private renderCounterSlots(): void {
    this.counterPanel.removeAll(true);
    const unlocked = G.state.level >= 3;
    this.counterPanel.setVisible(unlocked && this.counterMode);
    if (!unlocked) return;
    const band = this.add.graphics();
    band.fillStyle(C.woodDark, 0.35).fillRoundedRect(6, COUNTER_SLOT_Y - 27, W - 12, 54, 10);
    band.fillStyle(C.woodDark, 1).fillRect(12, COUNTER_CHIP_Y - 42, W - 24, 2);
    this.counterPanel.add(band);
    this.counterPanel.add(txt(this, 30, COUNTER_SLOT_Y, 'SAU\nQUẦY', { size: 10, bold: true, color: HEX.cream, origin: [0.5, 0.5], align: 'center' }));
    G.state.counter.forEach((slot, i) => {
      const x = COUNTER_X0 + i * COUNTER_DX;
      const y = COUNTER_SLOT_Y;
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
          if (warehouseQty(G.state, this.selected) <= 0) this.selected = null;
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
    if (G.state.holding.length) {
      dialog(this, { icon: '🚚', title: 'Còn hàng chờ', body: 'Hàng giao tới chưa vào kho. Cất vào kho hoặc bỏ bớt trước khi mở cửa.', buttons: [
        { label: 'Đóng', color: C.grey },
        { label: 'Mở kho', color: C.green, onTap: () => this.scene.start('Warehouse') },
      ] });
      return;
    }
    const onShelf = G.state.shelves.some((row) => row.some((s) => s.qty > 0));
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
      for (const [id, b] of Object.entries(this.supplierBtns)) b.setColor(id === this.supplierId ? C.red : C.wood);
      for (const r of this.rows) {
        const q = this.cart[r.p.id] ?? 0;
        r.qty.setText(String(q));
        const missed = s.yesterdayMissed[r.p.id] ?? 0;
        const cost = unitCost(s, r.p.id, this.supplierId);
        const trend = costTrend(s, r.p.id, this.supplierId);
        const bulk = bulkDiscounted(q);
        r.price.setText(`Nhập ${formatMoney(cost)}${trend < 0 ? '▼' : trend > 0 ? '▲' : ''}${bulk ? ' -5%' : ''} · bán ${formatMoney(priceOf(r.p.id, s))}`);
        r.price.setColor(bulk || trend < 0 ? HEX.green : trend > 0 ? HEX.red : HEX.muted);
        const noPlace = !r.p.behindCounter && !hasPlaceFor(s, r.p);
        const extra = noPlace ? ` · ❄ cần ${r.p.requiresCold === 'freezer' ? 'tủ đông' : 'tủ lạnh'}` : r.p.shelfLifeDays ? ` · hạn ${r.p.shelfLifeDays} ngày` : '';
        r.info.setText(`Còn: ${totalQty(s, r.p.id)} · Hôm qua bán: ${s.yesterdaySold[r.p.id] ?? 0}${extra}`);
        r.info.setColor(noPlace ? HEX.red : HEX.green);
        r.lack.setText(`thiếu ${missed}`).setVisible(missed > 0);
        r.minus.setEnabled(q > 0);
      }
      const check = checkCart(s, this.cart, this.supplierId);
      const sp = supplier(this.supplierId);
      this.cartText.setText(`Giỏ: ${formatMoney(check.total)} · Kho: ${check.cells}/${warehouseCapacity(s)} ô`);
      this.cartWarn.setText(
        !check.ok && check.reason === 'money' ? `Thiếu ${formatMoney(check.missing)}`
          : !check.ok && check.reason === 'space' ? 'Kho đầy'
            : !check.ok && check.reason === 'min-order' ? `Đơn tối thiểu ${formatMoney(sp.minOrder)} (thiếu ${formatMoney(check.missing)})`
              : sp.delayDays > 0 && Object.keys(this.cart).length ? `Giao 15:00 ngày ${s.day + sp.delayDays} · dư kho vào hàng chờ` : '',
      );
      this.buyBtn.setText(sp.delayDays > 0 ? 'Đặt hàng' : 'Nhập hàng');
      this.buyBtn.setEnabled(check.ok);
    } else {
      this.shelves.render(s, { mode: 'arrange' });
      this.whLabel.setText(`📦 Kho · ${warehouseCellsUsed(s.warehouse)}/${warehouseCapacity(s)} ô${s.deliveries.length ? ' · 🚚 chờ giao' : ''}`);
      this.hint.setText(this.selected ? (this.counterMode ? `Chạm ô quầy để đặt ${product(this.selected).name}` : `Chạm ô kệ để bày ${product(this.selected).name}`) : (this.counterMode ? 'Chạm món sau quầy rồi chọn ô quầy' : 'Chạm món rồi chạm ô kệ (hoặc giữ rồi kéo thả)'));
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
    const panelH = hasCloud ? 470 : 414;
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

    y += 50;
    L.add(new Button(this, W / 2, y, { w: 220, h: 42, label: '💾 Mã sao lưu', color: C.woodDark, onTap: () => this.backupMenu() }));

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

  /** Xuất / nhập mã sao lưu: phương án chuyển máy khi không đăng nhập Google. */
  private backupMenu(): void {
    dialog(this, { icon: '💾', title: 'Mã sao lưu', body: 'Xuất mã để chép tiến trình sang máy khác, hoặc dán mã từ máy cũ.', buttons: [
      { label: '📤 Xuất mã', color: C.green, onTap: () => { void this.exportCode(); } },
      { label: '📥 Nhập mã', color: C.blue, onTap: () => this.importCode() },
      { label: 'Đóng', color: C.grey },
    ] });
  }

  private async exportCode(): Promise<void> {
    persist();
    const code = await exportBackupCode(G.state);
    try {
      await navigator.clipboard.writeText(code);
      toast(this, `Đã sao chép mã (${code.length} ký tự).\nDán vào ô "Nhập mã" trên máy mới.`, H * 0.3, C.greenDark);
    } catch {
      window.prompt('Sao chép mã sao lưu này:', code);
    }
  }

  private importCode(): void {
    const code = window.prompt('Dán mã sao lưu vào đây:');
    if (!code) return;
    void importBackupCode(code).then((state) => {
      dialog(this, { icon: '⚠️', title: 'Ghi đè tiến trình?', body: `Mã: Ngày ${state.day} · Lv ${state.level} · ${formatMoney(state.money)}.\nTiến trình hiện tại (Ngày ${G.state.day}, Lv ${G.state.level}) sẽ bị thay.`, buttons: [
        { label: 'Hủy', color: C.grey },
        { label: 'Ghi đè', color: C.red, onTap: () => {
          state.sync = { ...G.state.sync, dirty: true };
          G.state = state;
          persist();
          this.scene.start(sceneForPhase());
        } },
      ] });
    }).catch((error: unknown) => toast(this, error instanceof Error ? error.message : 'Mã không hợp lệ.', H * 0.3, C.red));
  }

  private resume(): void {
    setPlayClockRunning(true);
    this.pauseLayer?.destroy();
    this.pauseLayer = null;
  }
}
