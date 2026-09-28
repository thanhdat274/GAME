import Phaser from 'phaser';
import { G, persist, sceneForPhase } from './game';
import { isMaxLevelSimulation } from './core/simulationMode';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { DecorScene } from './scenes/DecorScene';
import { LedgerScene } from './scenes/LedgerScene';
import { TaxScene } from './scenes/TaxScene';
import { PricesScene } from './scenes/PricesScene';
import { QuestsScene } from './scenes/QuestsScene';
import { WarehouseScene } from './scenes/WarehouseScene';
import { StoreMapScene } from './scenes/StoreMapScene';
import { HowToScene } from './scenes/HowToScene';
import { MorningScene } from './scenes/MorningScene';
import { ShopScene } from './scenes/ShopScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';
import { StaffScene } from './scenes/StaffScene';
import { ScheduleScene } from './scenes/ScheduleScene';
import { RulesScene } from './scenes/RulesScene';
import { ReviewsScene } from './scenes/ReviewsScene';
import { AnalyticsScene } from './scenes/AnalyticsScene';
import { CalendarScene } from './scenes/CalendarScene';
import { CookScene, KitchenScene } from './scenes/KitchenScene';
import { BranchesScene } from './scenes/BranchesScene';
import { StoryScene } from './scenes/StoryScene';
import { PrestigeScene } from './scenes/PrestigeScene';
import { DiningScene } from './scenes/DiningScene';
import { RestockScene } from './scenes/RestockScene';
import { InternalScene } from './scenes/InternalScene';
import { installRoundedRectFix } from './ui/roundrect';
import { installUpdateBanner } from './ui/updateBanner';
import { installPerfOverlay } from './ui/perfOverlay';
import { H, W, ZOOM } from './ui/theme';
import { applyPendingCloud, configureCloudApplyGuard, enableOnlineRetry } from './services/sync';

installRoundedRectFix();
if (!isMaxLevelSimulation) enableOnlineRetry();

// Mặc định giữ nhịp 60 FPS cho chuyển động mượt trên màn hình cảm ứng.
// Có thể so sánh mức tiết kiệm pin bằng ?fps=30 (kết hợp ?perf=1 để đo).
const fpsOverride = new URLSearchParams(window.location.search).get('fps');
const fpsLimit = fpsOverride === '30' ? 30 : 60;
const shopDomTest = new URLSearchParams(window.location.search).get('shop-dom') === '1';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W * ZOOM,
  height: H * ZOOM,
  backgroundColor: '#2b1d14',
  // Cho phép chuyển động 60 FPS trên điện thoại; dùng ?fps=30 để so sánh nhiệt/pin.
  fps: { limit: fpsLimit },
  // Căn giữa bằng flex của #game (index.html); để Phaser căn nữa thì canvas bị đẩy lệch hai lần.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
  // Game dùng pixel art; tắt MSAA để giảm chi phí render trên thiết bị yếu.
  render: { antialias: false, roundPixels: false },
  // Chỉ tạo DOM layer trong lượt thử HUD HTML/CSS; mặc định không thêm DOM container.
  dom: shopDomTest ? { createContainer: true } : undefined,
  input: { activePointers: 2 },
  scene: [BootScene, TitleScene, HowToScene, MorningScene, ShopScene, SummaryScene, BuildScene, WarehouseScene, StoreMapScene, PricesScene, LedgerScene, TaxScene, QuestsScene, DecorScene, StaffScene, ScheduleScene, RulesScene, AnalyticsScene, CalendarScene, KitchenScene, CookScene, BranchesScene, StoryScene, PrestigeScene, DiningScene, RestockScene, InternalScene, ReviewsScene],
});

// Chỉ bản dev: đo FPS khi kiểm thử hiệu năng trên trình duyệt.
if (import.meta.env.DEV) (window as unknown as { __thdhGame?: Phaser.Game }).__thdhGame = game;
installPerfOverlay(game);

configureCloudApplyGuard(() => game.scene.isActive('Title') || game.scene.isActive('Morning'));
let cloudScene = '';
game.events.on('step', () => {
  const active = game.scene.getScenes(true).map((scene) => scene.scene.key).join(',');
  if (active !== cloudScene) {
    cloudScene = active;
    applyPendingCloud();
  }
});
window.addEventListener('thdh-cloud-loaded', () => {
  const active = game.scene.isActive('Title') ? 'Title' : 'Morning';
  game.scene.stop(active);
  game.scene.start(active === 'Title' ? 'Title' : sceneForPhase());
});

// Lưu khi rời tab / tắt ứng dụng (chỉ khi đã vào game để không ghi đè bằng trạng thái mặc định).
const inGame = () => ['Morning', 'Shop', 'Summary', 'Warehouse', 'StoreMap', 'Prices', 'Ledger', 'Quests', 'Decor', 'Staff', 'Schedule', 'Rules', 'Analytics', 'Calendar', 'Kitchen', 'Cook', 'Branches', 'Story', 'Prestige', 'Restock', 'Internal'].some((k) => game.scene.isActive(k));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && inGame()) persist();
});
window.addEventListener('pagehide', () => {
  if (inGame()) persist();
});

// Xoay ngang trên điện thoại: tạm dừng (lớp phủ "Xoay dọc" nằm trong index.html).
const landscape = window.matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 600px)');
landscape.addEventListener('change', (e) => {
  if (e.matches) window.dispatchEvent(new Event('thdh-orientation'));
});

// Chặn cử chỉ zoom của iOS Safari.
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Có bản mới: hiện nút "Cập nhật" (lưu game rồi tải lại để lấy giao diện mới).
if (import.meta.env.PROD) installUpdateBanner(() => { if (inGame()) persist(); });

// Để debug trên điện thoại qua console.
(window as unknown as { thdh: unknown }).thdh = { game, G };
