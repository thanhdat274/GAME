import Phaser from 'phaser';
import { DATA, hasFeature, product, supplier, type Category, type Product } from '../core/data';
import { activeShopType } from '../core/shopTypes';
import { openShop, setManagerMode } from '../core/day';
import { shiftsWithoutCashier } from '../core/schedule';
import { letGo, retainStaff } from '../core/staff';
import { MAX_SHELVES, formatMoney, priceOf, shelfCount, totalQty, unlockedProducts, warehouseQty, warehouseTotals } from '../core/state';
import {
  assignCounterSlot, assignSlot, autoArrange, bulkDiscounted, buyStock, checkCart, costTrend, hasPlaceFor, refillCounterSlot,
  isPerishable, refillSlot, setClearance, slotFreshness, suggestCart, clearSlot, supplierUnlocked, unitCost, warehouseCapacity,
  warehouseCellsUsed, type Cart,
} from '../core/stock';
import { unrepliedCount } from '../core/reviews';
import { G, persist, sceneForPhase, setPlayClockRunning } from '../game';
import { dispatchLiveCommand } from '../services/liveShop';
import { suspendLiveShop } from '../services/liveShop';
import { productIcon, productName } from '../ui/art';
import { Hud, HUD_H } from '../ui/hud';
import { ROW_PITCH, SHELF_VIEW_ROWS, ShelfView, ZONE_NAMES, placeErrorText } from '../ui/shelves';
import { play, setSoundEnabled, stopMusic, vibrate } from '../ui/sound';
import { Culler, KineticScroll, clipInteractive, snap } from '../ui/scroll';
import { Button, dialog, panel, rowLayout, toast } from '../ui/widgets';
import { openBackupMenu } from '../ui/backupCode';
import { C, H, HEX, W, setEdgeColors, setupCamera, txt } from '../ui/theme';
import { checkForUpdate, manualCheckMessage } from '../ui/updateBanner';
import { cloudSaveEnabled, firebaseConfigured, hasAuthHint } from '../services/firebase';
import { scheduleEvents } from '../core/eventScheduler';
import { openBills, taxBillOverdue } from '../core/tax';
import { internalSuppliers } from '../core/internalSupply';
import { cookedPortions, soakLabel } from '../core/stickyRice';

type Tab = 'buy' | 'arrange';

/** Hướng dẫn ngắn khi một hệ thống mới mở khóa (hiện 1 lần, buổi sáng hôm sau). */
const TUTORIALS: Record<string, { icon: string; title: string; body: string }> = {
  land: { icon: '🏗️', title: 'Mở rộng tiệm', body: 'Vào ☰ Tiệm → Sắp xếp để mở Đất A, đặt thêm kệ và kéo thả nội thất.' },
  fridge: { icon: '🧊', title: 'Tủ lạnh 1/2 cánh', body: 'Chọn tủ lạnh 1 cánh (1×1, sức chứa 8 ô, 3.000đ điện/ngày) hoặc 2 cánh (2 ô, sức chứa 24 ô, 8.000đ điện/ngày) trong chế độ Sắp xếp.' },
  quests: { icon: '🎯', title: 'Nhiệm vụ hằng ngày', body: 'Mỗi ngày có 3 nhiệm vụ. Xong thì vào ☰ Tiệm → Nhiệm vụ để nhận thưởng.' },
  pricing: { icon: '💲', title: 'Chỉnh giá bán', body: 'Tăng giá thì lãi hơn nhưng khách dễ chê. Chỉnh ở ☰ Tiệm → Giá bán.' },
  anh_ba: { icon: '🚚', title: 'Đại lý Anh Ba', body: 'Rẻ hơn 10% nhưng giao 15:00 hôm sau, đơn tối thiểu 200.000đ. Chọn ở tab Nhập hàng.' },
  fresh: { icon: '🥚', title: 'Hàng tươi có hạn dùng', body: 'Trứng, bánh mì, rau... hết hạn cuối ngày sẽ hỏng. Ô sắp hết hạn có nhãn vàng/đỏ; chạm ô hết hạn hôm nay để bán xả.' },
  credit: { icon: '📒', title: 'Khách ghi sổ', body: 'Hàng xóm quen có thể xin nợ. Theo dõi và nhắc nợ ở ☰ Tiệm → Sổ nợ.' },
  warehouse: { icon: '📦', title: 'Nâng cấp kho', body: 'Vào ☰ Tiệm → Kho để nâng lên kệ sắt 50 ô, hoặc đặt kệ kho trong chế độ Sắp xếp.' },
  decor: { icon: '🪴', title: 'Trang trí', body: 'Đồ trang trí tăng thu hút, khách tới đông hơn. Mua ở ☰ Tiệm → Trang trí.' },
  freezer: { icon: '❄️', title: 'Tủ đông', body: 'Kem, xúc xích, há cảo... chỉ bày được trong tủ đông (8.000đ điện/ngày).' },
  bargain: { icon: '🙏', title: 'Khách mặc cả', body: 'Bà nội trợ có thể xin bớt 5–15%. Bớt thì khách vui; không bớt thì có thể bỏ về.' },
  company: { icon: '🏢', title: 'Lên doanh nghiệp', body: 'Có thể thành lập công ty ở ☰ Tiệm → Sổ thuế: mất ngưỡng miễn thuế, nộp VAT khấu trừ + thuế TNDN trên lãi; đổi lại được chiết khấu 5% ở mối có hóa đơn, khách công ty ghé nhiều hơn, đơn tiệc trả cao hơn.' },
  tax: { icon: '🧾', title: 'Đăng ký hộ kinh doanh', body: 'Tiệm đã lớn, phải đóng thuế như ngoài đời! Doanh thu mỗi năm dưới ngưỡng thì miễn thuế; vượt ngưỡng thì nộp VAT + thuế TNCN theo % doanh thu, chốt mỗi tháng. Xem ở ☰ Tiệm → Sổ thuế. Có thêm mối Chợ đầu mối: rẻ nhưng không có hóa đơn.' },
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

interface MorningChip {
  id: string;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  qty: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text | null;
  cw: number;
  ch: number;
  shownQty: number;
  shownSel: boolean | null;
  shownTag: string;
}

const LIST_TOP = 100;
const FOOT_H = 104;
const FOOT_Y = H - FOOT_H;
const LIST_BOTTOM = FOOT_Y - 4;
const ROW_H = 74;
/** Chiều cao hàng món chưa mở khóa (không có nút +/-, khỏi cần chỗ cho hàng nút). */
const LOCKED_ROW_H = 68;
const CHIP_VIEW_BOTTOM = FOOT_Y - 4;
/** Thứ tự và nhãn các nhóm hàng trong lưới kho (tab Bày kệ): hàng tươi sống / mau hỏng lên trước. */
const CHIP_GROUPS: { cat: Category; icon: string; name: string; note: string; color: string }[] = [
  { cat: 'fresh', icon: '🥬', name: 'Đồ tươi sống', note: 'mau hỏng, bán trước', color: '#c8f7c5' },
  { cat: 'frozen', icon: '🧊', name: 'Đông lạnh', note: 'để tủ đông', color: '#cfe8ff' },
  { cat: 'drink', icon: '🥤', name: 'Đồ uống', note: 'ngon hơn khi để tủ lạnh', color: '#d7f0ff' },
  { cat: 'dry', icon: '🍚', name: 'Đồ khô', note: 'để lâu được', color: '#ffe7b3' },
  { cat: 'snack', icon: '🍬', name: 'Ăn vặt', note: '', color: '#ffd6e8' },
  { cat: 'household', icon: '🧴', name: 'Đồ dùng', note: 'không hết hạn', color: '#e6e0ff' },
  { cat: 'counter', icon: '🔐', name: 'Sau quầy', note: '', color: '#f0e0c8' },
];
const GROUP_H = 24;
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
  bg?: Phaser.GameObjects.Graphics;
}

type ProductFilter = Category | 'all';
interface FilterRow { p: Product; category: Category; height: number; y: number; locked: boolean }

export class MorningScene extends Phaser.Scene {
  private hud!: Hud;
  private tab: Tab = 'buy';
  private cart: Cart = {};
  private rows: Row[] = [];
  private filterRows: FilterRow[] = [];
  private visibleFilterRows: FilterRow[] = [];
  private visibleWindowKey = '';
  private categoryFilter: ProductFilter = 'all';
  private categoryBtns: { filter: ProductFilter; button: Button }[] = [];
  private buyLayer!: Phaser.GameObjects.Container;
  private arrangeLayer!: Phaser.GameObjects.Container;
  private list!: Phaser.GameObjects.Container;
  private filterEmptyText: Phaser.GameObjects.Text | null = null;
  private listH = 0;
  private listScroll: KineticScroll | null = null;
  private resetListCuller: (() => void) | null = null;
  private cartText!: Phaser.GameObjects.Text;
  private cartWarn!: Phaser.GameObjects.Text;
  private buyBtn!: Button;
  private tabBtns!: Record<Tab, Button>;
  private shelves!: ShelfView;
  private chips!: Phaser.GameObjects.Container;
  /** Ô kho / tiêu đề nhóm đã dựng, theo khóa `chế độ:id`; render chỉ cập nhật phần đổi thay vì dựng lại. */
  private chipViews = new Map<string, MorningChip>();
  private chipHeads = new Map<string, { head: Phaser.GameObjects.Text; line: Phaser.GameObjects.Graphics; title: string }>();
  private chipEmpty: Phaser.GameObjects.Text | null = null;
  /** Cuộn lưới hàng trong kho (tab Bày kệ). */
  private chipScroll: KineticScroll | null = null;
  private chipCuller: Culler | null = null;
  private chipMask: Phaser.GameObjects.Graphics | null = null;
  private chipOffset = 0;
  private chipTop = 0;
  private chipMax = 0;
  /** Món đang được giữ để kéo thả lên kệ. */
  private chipDrag: { id: string; ghost: Phaser.GameObjects.Container } | null = null;
  private counterPanel!: Phaser.GameObjects.Container;
  private counterTabBtn!: Button;
  private whLabel!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private selected: string | null = null;
  private counterMode = false;
  /** Tiệm chỉ bán ở quầy (tiệm xôi): không có kệ, tab thứ hai là quầy xôi thay cho bày kệ. */
  private counterShop = false;
  private xoiPanel!: Phaser.GameObjects.Container;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private supplierId = 'co_tu';
  private supplierBtns: Record<string, Button> = {};
  private supplierNote: Phaser.GameObjects.Text | null = null;
  private listTop = LIST_TOP;
  private menuBtn!: Button;

  private get shelfRows(): number {
    return SHELF_VIEW_ROWS;
  }
  private get shelfTop(): number {
    return 104;
  }
  private get whTop(): number {
    return this.shelfTop + this.shelfRows * ROW_PITCH + 14;
  }
  private get chipViewTop(): number {
    return this.whTop + 50;
  }
  /** Dải ô sau quầy nằm dưới dòng hướng dẫn (whTop + 34…48), không đè lên nó. */
  private get counterSlotY(): number {
    return this.whTop + 78;
  }
  private get counterChipY(): number {
    return this.whTop + 138;
  }

  constructor() {
    super('Morning');
  }

  create(data: { gift?: number }): void {
    setPlayClockRunning(true);
    scheduleEvents(G.state);
    setupCamera(this);
    setEdgeColors('#3b2618', '#2b1d14');
    const onLiveUpdated = () => {
      if (!G.liveSnapshot) return;
      if (G.state.phase !== 'morning') this.scene.start(sceneForPhase());
      else { this.hud?.refresh(); this.refresh(); }
    };
    window.addEventListener('thdh-live-updated', onLiveUpdated);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener('thdh-live-updated', onLiveUpdated));
    this.cart = {};
    this.categoryFilter = 'all';
    this.filterRows = [];
    this.visibleFilterRows = [];
    this.visibleWindowKey = '';
    this.categoryBtns = [];
    this.selected = null;
    this.pauseLayer = null;
    const g = this.add.graphics();
    g.fillStyle(C.wall, 1).fillRect(0, HUD_H, W, H - HUD_H);
    this.hud = new Hud(this, G.state, { subtitle: 'Buổi sáng', onPause: () => this.pause() });

    const phase2 = G.state.level >= 5;
    this.counterShop = activeShopType(G.state).def.service === 'counter';
    this.tabBtns = {
      buy: new Button(this, phase2 ? 68 : 90, 68, { w: phase2 ? 116 : 156, h: 34, radius: 5, label: '🛒 Nhập hàng', size: 13.5, onTap: () => this.setTab('buy') }),
      arrange: new Button(this, phase2 ? 192 : 270, 68, { w: phase2 ? 116 : 156, h: 34, radius: 5, label: this.counterShop ? '🍙 Quầy xôi' : '🧺 Bày kệ', size: 13.5, onTap: () => this.setTab('arrange') }),
    };
    this.menuBtn = new Button(this, 305, 68, { w: 90, h: 34, radius: 5, label: '☰ Tiệm', size: 13.5, color: C.blue, onTap: () => this.openShopMenu() });
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
    const unreplied = unrepliedCount(s);
    items.push({ label: `⭐ Đánh giá${unreplied ? ` (${unreplied})` : ''}`, color: C.wood, onTap: go('Reviews') });
    if (hasFeature(s.level, 'quests')) items.push({ label: '🎯 Nhiệm vụ', color: C.wood, onTap: go('Quests') });
    if (hasFeature(s.level, 'pricing')) items.push({ label: '💲 Giá bán', color: C.wood, onTap: go('Prices') });
    if (hasFeature(s.level, 'credit')) items.push({ label: '📒 Sổ nợ', color: C.wood, onTap: go('Ledger') });
    if (hasFeature(s.level, 'tax')) {
      const bills = openBills(s);
      const late = bills.some((bill) => taxBillOverdue(s, bill));
      items.push({ label: `🧾 Sổ thuế${bills.length ? ` (${bills.length})` : ''}`, color: late ? C.red : C.wood, onTap: go('Tax') });
    }
    if (hasFeature(s.level, 'decor')) items.push({ label: '🪴 Trang trí', color: C.wood, onTap: go('Decor') });
    if (hasFeature(s.level, 'staff')) items.push({ label: '👥 Nhân sự', color: C.blue, onTap: go('Staff') });
    if (hasFeature(s.level, 'schedule')) items.push({ label: '📅 Xếp ca', color: C.blue, onTap: go('Schedule') });
    if (hasFeature(s.level, 'stocker') || hasFeature(s.level, 'autorestock')) items.push({ label: '⚙️ Quy tắc', color: C.blue, onTap: go('Rules') });
    if (hasFeature(s.level, 'analytics')) items.push({ label: '📊 Phân tích', color: C.blue, onTap: go('Analytics') });
    if (hasFeature(s.level, 'calendar')) items.push({ label: '🗓️ Lịch', color: C.blue, onTap: go('Calendar') });
    const xoiShop = s.stores.find((store) => store.id === s.activeStoreId)?.shopType === 'xoi';
    if (hasFeature(s.level, 'food_corner') || xoiShop) items.push({ label: xoiShop ? '🍙 Bếp xôi' : '🍳 Bếp & quầy nước', color: C.green, onTap: go('Kitchen') });
    if (hasFeature(s.level, 'branches') || hasFeature(s.level, 'shop_xoi')) items.push({ label: '🗺️ Bản đồ thành phố', color: C.blue, onTap: go('Branches') });
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
    const supplierLabel = txt(this, 14, 94, '🧑‍🌾 Mối sỉ Cô Tư · giao ngay', { size: 12, color: HEX.muted });
    const hasInternalSuppliers = internalSuppliers(G.state).length > 0;
    this.supplierBtns = {};
    this.supplierNote = null;
    const hasWholesaleTabs = supplierUnlocked(G.state, 'anh_ba');
    if (hasWholesaleTabs) {
      supplierLabel.setVisible(false);
      const unlocked = DATA.suppliers.filter((sp) => supplierUnlocked(G.state, sp.id));
      const row = rowLayout(unlocked.length, { gap: 8 });
      unlocked.forEach((sp, i) => {
        const b = new Button(this, row.x(i), 106, { w: row.w, h: 28, size: 11, radius: 5, label: `${sp.icon} ${sp.name}`, color: C.wood, onTap: () => { this.supplierId = sp.id; this.refresh(); } });
        this.supplierBtns[sp.id] = b;
        this.buyLayer.add(b);
      });
      // Dòng ghi chú mối đang chọn nằm dưới hàng nút mối sỉ (có giới hạn độ rộng để tự xuống dòng nếu dài).
      this.supplierNote = txt(this, 14, 126, '', { size: 10, color: HEX.muted, wrap: W - 28 });
      this.buyLayer.add(this.supplierNote);
    }
    const filters: { id: ProductFilter; label: string }[] = [
      { id: 'all', label: 'Tất cả' }, { id: 'dry', label: 'Đồ khô' }, { id: 'snack', label: 'Ăn vặt' },
      { id: 'household', label: 'Đồ dùng' }, { id: 'drink', label: 'Đồ uống' }, { id: 'fresh', label: 'Đồ tươi' },
      { id: 'frozen', label: 'Đông lạnh' }, { id: 'counter', label: 'Sau quầy' }, { id: 'food', label: 'Đồ ăn' },
      { id: 'beverage', label: 'Pha chế' },
    ];
    const gridTop = hasWholesaleTabs ? 164 : 132;
    const cols = 5;
    const gap = 3;
    const buttonW = (W - 20 - gap * (cols - 1)) / cols;
    filters.forEach(({ id, label }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const button = new Button(this, 10 + buttonW / 2 + col * (buttonW + gap), gridTop + row * 27, {
        w: buttonW, h: 24, radius: 4, label, size: 10,
        color: id === this.categoryFilter ? C.red : C.wood,
        onTap: () => this.setProductFilter(id),
      });
      this.categoryBtns.push({ filter: id, button });
      this.buyLayer.add(button);
    });
    if (hasInternalSuppliers) {
      this.buyLayer.add(new Button(this, W / 2, gridTop + 66, { w: 160, h: 26, radius: 5, label: '🏪 Hàng nhà mình', size: 11, color: C.blue, onTap: () => this.scene.start('Internal', { back: 'Morning' }) }));
    }
    // Supplier note, category filters, and internal supply each get their own row.
    this.listTop = gridTop + 2 * 27 + (hasInternalSuppliers ? 48 : 14);
    this.list = this.add.container(0, this.listTop + 16);
    const maskG = this.make.graphics({}, false).fillRect(0, this.listTop + 14, W, LIST_BOTTOM - this.listTop - 14);
    this.list.setMask(maskG.createGeometryMask());
    this.filterEmptyText = txt(this, W / 2, 30, 'Không có mặt hàng trong nhóm này.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] }).setVisible(false);
    this.list.add(this.filterEmptyText);
    this.buyLayer.add([supplierLabel, this.list]);

    const unlocked = unlockedProducts(G.state.level, G.state);
    const unlockedIds = new Set(unlocked.map((p) => p.id));
    this.rows = [];
    this.filterRows = [];
    this.visibleFilterRows = [];
    this.visibleWindowKey = '';
    let y = 0;
    for (const p of [...unlocked, ...DATA.products.filter((item) => !unlockedIds.has(item.id))]) {
      const locked = !unlockedIds.has(p.id);
      const height = locked ? LOCKED_ROW_H : ROW_H;
      this.filterRows.push({ p, category: p.category, height, y, locked });
      y += height;
    }
    this.visibleFilterRows = this.filterRows;
    this.listH = y + 10;
    this.enableListScroll();

    const foot = this.add.graphics();
    foot.fillStyle(C.hud, 1).fillRoundedRect(0, FOOT_Y, W, FOOT_H, { tl: 8, tr: 8, bl: 0, br: 0 });
    foot.fillStyle(C.woodLight, 1).fillRect(0, FOOT_Y, W, 4);
    foot.fillStyle(0x1a120b, 0.4).fillRect(0, FOOT_Y + 4, W, 2);
    foot.lineStyle(1.5, 0x24150b, 1).strokeRoundedRect(0, FOOT_Y, W, FOOT_H, { tl: 8, tr: 8, bl: 0, br: 0 });

    this.cartText = txt(this, 12, FOOT_Y + 9, '', { size: 12.5, bold: true, color: HEX.cream });
    this.cartWarn = txt(this, 12, FOOT_Y + 28, '', { size: 10.5, color: '#ffb4a8', wrap: W - 24 });
    const suggest = new Button(this, 49, H - 28, {
      w: 78,
      h: 38,
      radius: 5,
      label: '🪄 Gợi ý',
      color: C.blue,
      size: 12.5,
      onTap: () => {
        this.cart = suggestCart(G.state, this.supplierId);
        if (Object.keys(this.cart).length === 0) toast(this, 'Hàng còn đủ, hoặc hết tiền/chỗ kho rồi!', H * 0.5);
        this.refresh();
      },
    });
    const clear = new Button(this, 126, H - 28, { w: 64, h: 38, radius: 5, label: 'Xóa giỏ', color: C.grey, size: 11.5, onTap: () => this.clearCart() });
    this.buyBtn = new Button(this, 256, H - 28, { w: 172, h: 40, radius: 5, label: 'Nhập hàng', color: C.green, size: 15, onTap: () => this.buy() });
    this.buyLayer.add([foot, this.cartText, this.cartWarn, suggest, clear, this.buyBtn]);
  }

  private enableListScroll(): void {
    const top = this.listTop + 16;
    const viewTop = this.listTop + 14;
    const culler = new Culler(this.cameras.main);
    const setList = (offset: number) => {
      this.list.y = snap(top - offset);
      this.renderVisibleProductRows(false, offset);
      culler.cull(this.list, viewTop, LIST_BOTTOM);
    };
    this.resetListCuller = () => { culler.reset(); this.visibleWindowKey = ''; setList(0); };
    this.listScroll = new KineticScroll(this, {
      inView: (y) => y > this.listTop && y < LIST_BOTTOM,
      enabled: () => this.tab === 'buy',
      get: () => top - this.list.y,
      set: setList,
      max: () => Math.max(0, this.listH - (LIST_BOTTOM - top)),
    });
    setList(0);
  }

  private renderVisibleProductRows(force: boolean, offset = this.listTop + 16 - this.list.y): void {
    const viewport = LIST_BOTTOM - (this.listTop + 16);
    const startY = Math.max(0, offset - ROW_H * 2);
    const endY = offset + viewport + ROW_H * 2;
    let start = 0;
    while (start < this.visibleFilterRows.length && this.visibleFilterRows[start].y + this.visibleFilterRows[start].height < startY) start++;
    let end = start;
    while (end < this.visibleFilterRows.length && this.visibleFilterRows[end].y <= endY) end++;
    const key = `${start}:${end}`;
    if (!force && key === this.visibleWindowKey) return;
    this.visibleWindowKey = key;
    this.list.removeAll(true);
    this.rows = [];
    if (!this.visibleFilterRows.length) {
      this.filterEmptyText = txt(this, W / 2, 30, 'Không có mặt hàng trong nhóm này.', { size: 12, color: HEX.muted, origin: [0.5, 0.5] });
      this.list.add(this.filterEmptyText);
      return;
    }
    this.filterEmptyText = null;
    for (let i = start; i < end; i++) this.renderProductRow(this.visibleFilterRows[i]);
  }

  private renderProductRow(model: FilterRow): void {
    const { p, y, height: rowH, locked: isLocked } = model;
    const centerY = rowH / 2 - 1;
    const root = this.add.container(0, y + centerY).setSize(W, rowH);
    const bg = this.add.graphics();
    bg.fillStyle(0x1a120b, 0.15).fillRoundedRect(8, 3.5 - centerY, W - 16, rowH - 6, 6);
    bg.fillStyle(isLocked ? 0xeadbc3 : C.panel, 1).fillRoundedRect(8, 2 - centerY, W - 16, rowH - 6, 6);
    bg.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(9, 3 - centerY, W - 18, rowH - 8, 5);
    bg.lineStyle(1.5, C.panelEdge, 0.95).strokeRoundedRect(8, 2 - centerY, W - 16, rowH - 6, 6);
    const icon = productIcon(this, 33, 0, p, isLocked ? 38 : 40);
    const name = txt(this, 58, 10 - centerY, p.name, { size: 13.5, bold: true });
    const price = txt(this, 58, 29 - centerY, `Nhập ${formatMoney(p.cost)} · bán ${formatMoney(priceOf(p.id, G.state))}`, { size: 10.5, color: HEX.muted });
    const info = txt(this, 58, 47 - centerY, '', { size: 10, color: HEX.green, wrap: W - 160 });
    root.add([bg, icon, name, price, info]);
    this.list.add(root);

    if (isLocked) {
      icon.setAlpha(0.4);
      name.setAlpha(0.5);
      const eventNames: Record<string, string> = { tet: 'Tết', mid_autumn: 'Trung thu', back_to_school: 'Khai giảng' };
      const eventActive = p.eventOnly && G.state.activeEvents.some((event) => event.id === p.eventOnly);
      const eventStocked = p.eventOnly && G.state.warehouse.some((lot) => lot.productId === p.id && lot.qty > 0)
        || p.eventOnly && G.state.shelves.some((row) => row.some((slot) => slot.productId === p.id && slot.qty > 0));
      const reason = p.unlockLevel > G.state.level
        ? `🔒 Mở ở level ${p.unlockLevel}`
        : p.eventOnly && !eventActive && !eventStocked
          ? `🔒 Chỉ bán dịp ${eventNames[p.eventOnly] ?? 'sự kiện'}`
          : `🔒 Không bán ở chi nhánh này`;
      info.setText(reason).setColor(HEX.grey);
      return;
    }

    const stepperG = this.add.graphics();
    stepperG.fillStyle(0xd5ddcc, 1).fillRoundedRect(248, -13, 32, 26, 3);
    stepperG.lineStyle(1, 0x828f78, 1).strokeRoundedRect(248, -13, 32, 26, 3);
    const minus = new Button(this, 232, 0, { w: 26, h: 26, radius: 4, label: '−', color: C.woodLight, size: 15, onTap: () => this.changeQty(p.id, -1) });
    const qty = txt(this, 264, 0, '0', { size: 14, bold: true, color: '#5a6652', origin: [0.5, 0.5] });
    const plus = new Button(this, 296, 0, { w: 26, h: 26, radius: 4, label: '+', color: C.green, size: 15, onTap: () => this.changeQty(p.id, 1) });
    const plus10 = new Button(this, 332, 0, { w: 32, h: 28, radius: 4, label: '+10', color: C.greenDark, size: 11, onTap: () => this.changeQty(p.id, 10) });
    const lack = txt(this, 58 + name.width + 8, 11 - centerY, '', { size: 9.5, bold: true, color: HEX.white });
    lack.setBackgroundColor(HEX.red).setPadding(4, 1, 4, 1);
    root.add([stepperG, minus, qty, plus, plus10, lack]);
    this.rows.push({ p, qty, info, lack, minus, plus, plus10, price, bg });
  }

  private setProductFilter(filter: ProductFilter): void {
    this.categoryFilter = filter;
    let y = 0;
    this.visibleFilterRows = [];
    for (const row of this.filterRows) {
      if (filter !== 'all' && row.category !== filter) continue;
      row.y = y;
      this.visibleFilterRows.push(row);
      y += row.height;
    }
    this.listH = y + 10;
    for (const { filter: id, button } of this.categoryBtns) button.setColor(id === filter ? C.red : C.wood);
    this.listScroll?.stop();
    this.resetListCuller?.();
  }

  private changeQty(id: string, delta: number): void {
    // Nút đã cuộn ra ngoài vùng danh sách (bị che), hoặc chạm là để cuộn / dừng trôi, thì không nhận.
    if (this.listScroll?.blockTap) return;
    const y = this.input.activePointer.worldY;
    if (y < this.listTop + 14 || y > LIST_BOTTOM) return;
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
    toast(this, this.counterShop
      ? `Đã nhập nguyên liệu: -${formatMoney(res.total)}\nVào Bếp xôi để ngâm, hấp và làm món.`
      : `Đã nhập hàng: -${formatMoney(res.total)}\nGiờ bày hàng lên kệ nhé!`, H * 0.5, C.greenDark);
    persist();
    // Nhập xong thì chuyển luôn sang bày kệ (bước tiếp theo trong buổi sáng).
    this.setTab('arrange');
  }

  // ---------- Bày kệ ----------

  private buildArrange(): void {
    this.arrangeLayer = this.add.container(0, 0);
    this.shelves = new ShelfView(this, this.shelfTop, {
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
    }, G.state, this.shelfRows);
    const g = this.add.graphics();
    g.fillStyle(C.floorB, 1).fillRect(0, this.whTop, W, H - this.whTop);
    g.fillStyle(C.woodDark, 1).fillRect(0, this.whTop, W, 4);
    this.whLabel = txt(this, 12, this.whTop + 10, '', { size: 14, bold: true, color: HEX.white });
    // Dòng hướng dẫn nằm riêng dưới tiêu đề kho để không bị nút "Sau quầy" che.
    this.hint = txt(this, 12, this.whTop + 34, '', { size: 11, color: HEX.cream });
    this.counterPanel = this.add.container(0, 0);
    this.chips = this.add.container(0, 0);
    this.chipViews = new Map();
    this.chipHeads = new Map();
    this.chipEmpty = null;
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
    this.counterTabBtn = new Button(this, W - 58, this.whTop + 18, {
      w: 104,
      h: 30,
      radius: 5,
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
    foot.fillStyle(C.woodLight, 1).fillRect(0, LIST_BOTTOM + 4, W, 4);
    foot.fillStyle(0x1a120b, 0.4).fillRect(0, LIST_BOTTOM + 8, W, 2);

    const auto = new Button(this, 86, H - 38, {
      w: 148,
      h: 46,
      radius: 5,
      label: this.counterShop ? '🍙 Bếp xôi' : '✨ Tự bày',
      color: C.blue,
      size: 14,
      onTap: () => {
        if (this.counterShop) { this.scene.start('Kitchen'); return; }
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
    const open = new Button(this, 264, H - 38, { w: 172, h: 48, radius: 5, label: 'Mở cửa ▶', color: C.red, size: 16.5, onTap: () => this.tryOpen() });
    this.xoiPanel = this.add.container(0, 0);
    this.shelves.setVisible(!this.counterShop);
    this.arrangeLayer.add([this.shelves, this.xoiPanel, g, this.whLabel, this.hint, this.counterTabBtn, this.counterPanel, this.chips, foot, auto, open]);
  }

  /** Tiệm xôi: vùng kệ thay bằng tóm tắt quầy xôi, nếp chín và mẻ ngâm, kèm nút vào Bếp xôi. */
  private renderXoiPanel(): void {
    const s = G.state;
    this.xoiPanel.removeAll(true);
    const top = this.shelfTop;
    const h = this.whTop - top - 10;
    this.xoiPanel.add(panel(this, 10, top, W - 20, h));
    this.xoiPanel.add(txt(this, 22, top + 12, '🍙 QUẦY XÔI', { size: 13, bold: true, color: HEX.muted }));
    const dishes = new Map<string, number>();
    for (const slot of s.counter) if (slot.productId && slot.qty > 0) dishes.set(slot.productId, (dishes.get(slot.productId) ?? 0) + slot.qty);
    const dishText = dishes.size
      ? [...dishes.entries()].map(([id, qty]) => `${product(id).icon} ${product(id).name} ×${qty}`).join(' · ')
      : 'Quầy chưa có món nào · khách gọi sẽ phải chờ';
    this.xoiPanel.add(txt(this, 22, top + 36, dishText, { size: 12, bold: dishes.size > 0, color: dishes.size ? HEX.ink : HEX.red, wrap: W - 44 }));
    const menu = s.activeRecipes.filter((id) => activeShopType(s).allowsRecipe(id) && !DATA.recipes.find((r) => r.id === id)?.packaged).length;
    const soak = s.soakBatches.length ? s.soakBatches.map((b) => soakLabel(b, s.day, s.clock)).join('\n') : 'Chưa có mẻ nếp nào đang ngâm';
    const info = `Món đang mở bán: ${menu} · Nếp chín: ${cookedPortions(s)} phần\n${soak}`;
    this.xoiPanel.add(txt(this, 22, top + 78, info, { size: 11, color: HEX.muted, wrap: W - 44 }));
    this.xoiPanel.add(new Button(this, W / 2, top + h - 30, { w: 200, h: 40, radius: 5, label: '🍙 Vào Bếp xôi', color: C.green, size: 14, onTap: () => this.scene.start('Kitchen') }));
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
    const used = new Set<string>();
    const mode = this.counterMode ? 'c' : 'w';
    const items = Object.entries(warehouseTotals(G.state)).filter(([id, q]) => q > 0 && !!product(id).behindCounter === this.counterMode);
    if (items.length === 0) {
      const message = this.counterMode ? 'Chưa có hàng sau quầy trong kho.' : 'Kho trống. Qua tab "Nhập hàng" để mua hàng.';
      this.chipEmpty ??= txt(this, W / 2, 0, '', { size: 13, color: HEX.cream, origin: [0.5, 0.5], align: 'center', wrap: 300 });
      this.chips.add(this.chipEmpty);
      this.chipEmpty.setText(message).setY(this.counterMode ? this.counterChipY + 20 : this.whTop + 70).setVisible(true);
      this.dropUnusedChips(used);
      this.counterPanel.setVisible(G.state.level >= 3 && this.counterMode);
      this.chipTop = this.counterMode ? this.counterChipY - 36 : this.chipViewTop;
      this.chipMax = 0;
      this.chipMask?.clear().fillStyle(0xffffff).fillRect(0, this.chipTop, W, CHIP_VIEW_BOTTOM - this.chipTop);
      this.chipCuller?.reset();
      this.setChipOffset(0);
      if (this.counterMode) this.renderCounterSlots();
      return;
    }
    this.chipEmpty?.setVisible(false);
    // Chế độ sau quầy: hàng ô quầy chiếm phần trên nên chip trong kho nhỏ hơn, 6 cột.
    const cols = this.counterMode ? 6 : 5;
    const ch = this.counterMode ? 60 : 66;
    const pitch = this.counterMode ? 66 : 72;
    // Kho thường: tiêu đề nhóm đầu tiên bắt đầu ngay dưới mép khung cuộn, không bị dòng hướng dẫn che.
    const firstY = this.counterMode ? this.counterChipY : this.chipViewTop + 4 + ch / 2;
    // Chia theo nhóm hàng (tươi sống, đông lạnh, đồ uống, đồ khô...), mỗi nhóm một tiêu đề; trong nhóm xếp theo tên.
    const order = (cat: Category) => { const i = CHIP_GROUPS.findIndex((g) => g.cat === cat); return i < 0 ? CHIP_GROUPS.length : i; };
    const groups = new Map<Category, [string, number][]>();
    for (const item of items) {
      const cat = product(item[0]).category;
      const list = groups.get(cat);
      if (list) list.push(item);
      else groups.set(cat, [item]);
    }
    const sorted = [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]));
    const showHeaders = sorted.length > 1 || !this.counterMode;
    // Hạn sớm nhất của từng món trong kho (hàng mau hỏng).
    const soonest = new Map<string, number>();
    for (const lot of G.state.warehouse) if (lot.qty > 0 && lot.exp !== null) soonest.set(lot.productId, Math.min(soonest.get(lot.productId) ?? Infinity, lot.exp));
    let top = firstY - ch / 2;
    for (const [cat, list] of sorted) {
      list.sort((a, b) => product(a[0]).name.localeCompare(product(b[0]).name, 'vi'));
      if (showHeaders) {
        const g = CHIP_GROUPS.find((item) => item.cat === cat);
        const title = `${g?.icon ?? '📦'} ${g?.name ?? ZONE_NAMES[cat as keyof typeof ZONE_NAMES] ?? cat} · ${list.length} món${g?.note ? ` · ${g.note}` : ''}`;
        const key = `${mode}:#${cat}`;
        used.add(key);
        let h = this.chipHeads.get(key);
        if (!h) {
          const line = this.add.graphics();
          line.fillStyle(0x000000, 0.18).fillRect(8, GROUP_H - 5, W - 16, 1.5);
          h = { head: txt(this, 12, 0, title, { size: 11, bold: true, color: g?.color ?? HEX.cream }), line, title };
          this.chipHeads.set(key, h);
          this.chips.add([h.line, h.head]);
        } else if (h.title !== title) {
          h.title = title;
          h.head.setText(title);
        }
        h.head.setY(top + 2);
        h.line.setY(top);
        top += GROUP_H;
      }
      list.forEach(([id, q], i) => {
        const x = this.counterMode ? 31 + (i % cols) * 59.5 : 42 + (i % cols) * 69;
        const y = top + ch / 2 + Math.floor(i / cols) * pitch;
        const key = `${mode}:${id}`;
        used.add(key);
        this.updateChip(this.chipViews.get(key) ?? this.createChip(key, id), q, x, y, soonest.get(id));
      });
      top += Math.ceil(list.length / cols) * pitch + 2;
    }
    this.dropUnusedChips(used);
    // Khung cuộn: phần trên là ô quầy khi ở chế độ sau quầy.
    this.chipTop = this.counterMode ? this.counterChipY - 36 : this.chipViewTop;
    const bottom = top - (pitch - ch) + 8;
    this.chipMax = Math.max(0, bottom - CHIP_VIEW_BOTTOM);
    this.chipMask?.clear().fillStyle(0xffffff).fillRect(0, this.chipTop, W, CHIP_VIEW_BOTTOM - this.chipTop);
    this.chipCuller?.reset();
    this.setChipOffset(this.chipOffset);
    this.renderCounterSlots();
  }

  /** Hủy ô / tiêu đề của món đã hết hàng hoặc thuộc chế độ kia (kho ↔ sau quầy). */
  private dropUnusedChips(used: Set<string>): void {
    for (const [key, view] of this.chipViews) if (!used.has(key)) { view.root.destroy(); this.chipViews.delete(key); }
    for (const [key, h] of this.chipHeads) if (!used.has(key)) { h.head.destroy(); h.line.destroy(); this.chipHeads.delete(key); }
  }

  /** Dựng một ô món trong lưới kho (chỉ khi món mới xuất hiện); số lượng / nhãn hạn / viền chọn cập nhật ở updateChip. */
  private createChip(key: string, id: string): MorningChip {
    const p = product(id);
    const cw = this.counterMode ? 54 : 60;
    const ch = this.counterMode ? 60 : 66;
    const bg = this.add.graphics();
    const iconSize = this.counterMode ? 26 : 30;
    const icon = productIcon(this, 0, -ch / 2 + iconSize / 2 + 3, p, iconSize);
    const qty = txt(this, cw / 2 - 3, -ch / 2 + iconSize + 3, '', { size: 10, bold: true, color: HEX.white, origin: [1, 1] })
      .setBackgroundColor('#3b2618cc').setPadding(3, 0, 3, 0);
    const name = productName(this, 0, ch / 2 - 1, p, cw - 4, { size: this.counterMode ? 8 : 9, origin: [0.5, 1] });
    const root = this.add.container(0, 0, [bg, icon, name, qty]).setSize(cw, ch);
    let hold: Phaser.Time.TimerEvent | null = null;
    // Món đã cuộn ra ngoài khung (bị che) thì không nhận chạm, và cũng không chặn chạm vào kệ / nút phía trên.
    const inFrameY = (worldY: number) => worldY >= this.chipTop && worldY <= CHIP_VIEW_BOTTOM;
    const inFrame = (ptr: Phaser.Input.Pointer) => inFrameY(ptr.worldY);
    clipInteractive(root, inFrameY);
    root.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      hold?.remove();
      // Tiệm xôi không có kệ: kho chỉ để xem, không chọn hay kéo món.
      if (!inFrame(ptr) || this.counterShop) return;
      hold = this.time.delayedCall(CHIP_HOLD_MS, () => {
        // Giữ yên (không cuộn) thì nhấc món lên để kéo thả.
        if (!ptr.isDown || ptr.getDistance() > 8 || this.chipScroll?.moving || this.chipDrag) return;
        this.chipScroll?.cancel();
        this.chipDrag = { id, ghost: productIcon(this, ptr.worldX, ptr.worldY, p, 40).setDepth(800).setAlpha(0.9) };
        vibrate(15);
        play('tap');
      });
    });
    root.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      hold?.remove();
      if (ptr.getDistance() > 10 || this.chipScroll?.blockTap || !inFrame(ptr) || this.counterShop) return;
      this.selected = this.selected === id ? null : id;
      play('tap');
      this.refresh();
    });
    this.chips.add(root);
    const view: MorningChip = { id, root, bg, qty, tag: null, cw, ch, shownQty: -1, shownSel: null, shownTag: '' };
    this.chipViews.set(key, view);
    return view;
  }

  /** Cập nhật ô kho đã có: vị trí, số lượng, viền chọn, nhãn hạn (hàng mau hỏng: số ngày còn bán được; hôm nay = bán nốt trong ngày). */
  private updateChip(v: MorningChip, q: number, x: number, y: number, exp?: number): void {
    if (v.root.x !== x || v.root.y !== y) v.root.setPosition(x, y);
    if (v.shownQty !== q) { v.shownQty = q; v.qty.setText(`x${q}`); }
    const id = v.id;
    const sel = this.selected === id;
    if (v.shownSel !== sel) {
      v.shownSel = sel;
      const { cw, ch } = v;
      v.bg.clear();
      v.bg.fillStyle(sel ? C.yellow : C.slot, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 10);
      v.bg.lineStyle(sel ? 3 : 2, sel ? C.red : C.slotEdge, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 10);
    }
    const left = exp !== undefined && isPerishable(product(id)) ? exp - G.state.day : null;
    const tag = left === null ? '' : left <= 0 ? 'hôm nay' : `${left}n`;
    if (v.shownTag !== tag) {
      v.shownTag = tag;
      if (!tag) v.tag?.setVisible(false);
      else {
        if (!v.tag) {
          v.tag = txt(this, v.cw / 2 - 3, -v.ch / 2 + 3, '', { size: 9, bold: true, color: HEX.white, origin: [1, 0] }).setPadding(3, 1, 3, 1);
          v.root.add(v.tag);
        }
        v.tag.setText(tag).setBackgroundColor(left! <= 1 ? '#d84a3a' : left! <= 3 ? '#e08a00' : '#4a8f3c').setVisible(true);
      }
    }
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
    } else if (p.behindCounter && this.counterMode && Math.abs(ptr.worldY - this.counterSlotY) <= 26) {
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
    band.fillStyle(C.woodDark, 0.35).fillRoundedRect(6, this.counterSlotY - 27, W - 12, 54, 10);
    band.fillStyle(C.woodDark, 1).fillRect(12, this.counterChipY - 42, W - 24, 2);
    this.counterPanel.add(band);
    this.counterPanel.add(txt(this, 30, this.counterSlotY, 'SAU\nQUẦY', { size: 10, bold: true, color: HEX.cream, origin: [0.5, 0.5], align: 'center' }));
    G.state.counter.forEach((slot, i) => {
      const x = COUNTER_X0 + i * COUNTER_DX;
      const y = this.counterSlotY;
      const bg = this.add.graphics();
      bg.fillStyle(C.slot, 1).fillRoundedRect(x - 29, y - 24, 58, 48, 8);
      bg.lineStyle(1, C.slotEdge, 1).strokeRoundedRect(x - 29, y - 24, 58, 48, 8);
      this.counterPanel.add(bg);
      if (slot.productId) {
        const p = product(slot.productId);
        this.counterPanel.add(productIcon(this, x, y - 8, p, 22));
        this.counterPanel.add(productName(this, x, y + 23, p, 56, { lines: 1, origin: [0.5, 1] }));
        this.counterPanel.add(txt(this, x + 27, y - 22, `x${slot.qty}`, { size: 9, bold: true, color: slot.qty > 0 ? HEX.white : HEX.cream, origin: [1, 0] })
          .setBackgroundColor(slot.qty > 0 ? '#3b2618cc' : '#c0392bcc').setPadding(2, 0, 2, 0));
      } else {
        this.counterPanel.add(txt(this, x, y, '+', { size: 18, bold: true, color: HEX.muted, origin: [0.5, 0.5] }));
      }
      const hit = this.add.zone(x, y, 60, 50).setInteractive({ useHandCursor: true });
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
    // Tiệm chỉ bán ở quầy (tiệm xôi): cần món đang mở bán và có sẵn ở quầy thay vì hàng trên kệ.
    if (activeShopType(G.state).def.service === 'counter') {
      const menu = G.state.activeRecipes.filter((id) => activeShopType(G.state).allowsRecipe(id) && !DATA.recipes.find((r) => r.id === id)?.packaged);
      const ready = G.state.counter.some((slot) => slot.qty > 0 && DATA.recipes.some((r) => r.output === slot.productId));
      if (!menu.length || !ready) {
        dialog(this, {
          icon: '🍙',
          title: !menu.length ? 'Chưa mở bán món nào' : 'Quầy chưa có xôi',
          body: !menu.length ? 'Chưa mở bán món nào thì không có khách ghé. Vào Bếp xôi để mở bán món.' : 'Khách gọi mà quầy chưa có xôi sẽ phải chờ. Vào Bếp xôi hấp nếp và làm sẵn vài phần?',
          buttons: [
            { label: 'Vào bếp', color: C.green, onTap: () => this.scene.start('Kitchen') },
            { label: 'Vẫn mở', color: C.red, onTap: go },
          ],
        });
        return;
      }
      go();
      return;
    }
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
      for (const { filter, button } of this.categoryBtns) button.setColor(filter === this.categoryFilter ? C.red : C.wood);
      this.supplierNote?.setText(supplier(this.supplierId).note);
      for (const r of this.rows) {
        const q = this.cart[r.p.id] ?? 0;
        r.qty.setText(String(q)).setColor(q > 0 ? HEX.green : HEX.muted);
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
      this.cartText.setText(`Giỏ: ${formatMoney(check.total)} · Tiền: ${formatMoney(s.money)} · Kho: ${check.cells}/${warehouseCapacity(s)} ô`);
      this.cartWarn.setText(
        !check.ok && check.reason === 'money' ? `⚠️ Thiếu ${formatMoney(check.missing)}`
          : !check.ok && check.reason === 'space' ? '⚠️ Kho đầy, không đủ chỗ chứa'
            : !check.ok && check.reason === 'min-order' ? `⚠️ Đơn tối thiểu ${formatMoney(sp.minOrder)} (thiếu ${formatMoney(check.missing)})`
              : sp.delayDays > 0 && Object.keys(this.cart).length ? `🚚 Giao 15:00 ngày ${s.day + sp.delayDays} · dư kho vào hàng chờ`
                : sp.invoice === false ? '⚠️ Chợ không xuất hóa đơn: thanh tra thuế có thể phạt'
                  : Object.keys(this.cart).length ? '✓ Hàng giao ngay vào kho' : '',
      );
      this.buyBtn.setText(sp.delayDays > 0 ? 'Đặt hàng' : 'Nhập hàng');
      this.buyBtn.setEnabled(check.ok);
    } else if (this.counterShop) {
      this.renderXoiPanel();
      this.whLabel.setText(`📦 Kho nguyên liệu · ${warehouseCellsUsed(s.warehouse)}/${warehouseCapacity(s)} ô${s.deliveries.length ? ' · 🚚 chờ giao' : ''}`);
      this.hint.setText('Nguyên liệu dùng ở Bếp xôi · không cần bày kệ');
      this.counterTabBtn.setVisible(false);
      this.counterMode = false;
      this.renderChips();
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
    const panelH = (hasCloud ? 470 : 414) + 50;
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

    y += 50;
    L.add(new Button(this, W / 2, y, {
      w: 220,
      h: 42,
      label: '🔄 Kiểm tra cập nhật',
      color: C.woodDark,
      onTap: () => { void checkForUpdate().then((r) => toast(this, manualCheckMessage(r))); },
    }));

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
    L.add(new Button(this, W / 2, y, { w: 220, h: 42, label: '💾 Mã sao lưu', color: C.woodDark, onTap: () => openBackupMenu(this, () => this.scene.start(sceneForPhase())) }));

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
