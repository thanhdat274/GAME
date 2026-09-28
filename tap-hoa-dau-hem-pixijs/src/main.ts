import * as Engine from './engine';
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
import { installUpdateBanner } from './ui/updateBanner';
import { installPerfOverlay } from './ui/perfOverlay';
import { installPowerSaver } from './ui/powerSaver';
import { C, H, W, ZOOM } from './ui/theme';
import { applyPendingCloud, configureCloudApplyGuard, enableOnlineRetry } from './services/sync';

if (!isMaxLevelSimulation) enableOnlineRetry();

// Giới hạn nhịp mặc định trên điện thoại để giảm tải nhiệt; máy tính giữ 60 FPS.
// Có thể ép mức cần so sánh bằng ?fps=30 hoặc ?fps=60 (kết hợp ?perf=1 để đo).
const fpsOverride = new URLSearchParams(window.location.search).get('fps');
const mobileViewport = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600;
const fpsLimit = fpsOverride === '30' ? 30 : fpsOverride === '60' ? 60 : mobileViewport ? 30 : 60;

const game = new Engine.Game({
  parent: 'game',
  width: W,
  height: H,
  // Canvas (W×ZOOM) × (H×ZOOM) điểm ảnh, đúng bằng độ phân giải canvas của bản Phaser.
  resolution: ZOOM,
  backgroundColor: C.bg,
  // ?loop=timeout: chạy vòng lặp bằng setTimeout (giống Phaser forceSetTimeOut) để kiểm thử trong khung ẩn.
  fps: { limit: fpsLimit, forceSetTimeOut: new URLSearchParams(window.location.search).get('loop') === 'timeout' },
  antialias: false,
  scene: [BootScene, TitleScene, HowToScene, MorningScene, ShopScene, SummaryScene, BuildScene, WarehouseScene, StoreMapScene, PricesScene, LedgerScene, TaxScene, QuestsScene, DecorScene, StaffScene, ScheduleScene, RulesScene, AnalyticsScene, CalendarScene, KitchenScene, CookScene, BranchesScene, StoryScene, PrestigeScene, DiningScene, RestockScene, InternalScene, ReviewsScene],
});

if (import.meta.env.DEV) (window as unknown as { __thdhGame?: Engine.Game }).__thdhGame = game;
installPerfOverlay(game);
installPowerSaver(game, fpsLimit);

configureCloudApplyGuard(() => game.scene.isActive('Title') || game.scene.isActive('Morning'));
let cloudScene = '';
game.events.on('step', () => {
  const active = game.scene.getScenes(true).map((scene) => scene.sys.settings.key).join(',');
  if (active !== cloudScene) {
    cloudScene = active;
    applyPendingCloud();
  }
});
window.addEventListener('thdh-cloud-loaded', () => {
  const active = game.scene.isActive('Title') ? 'Title' : 'Morning';
  game.scene.queueOp('stop', active);
  game.scene.queueOp('start', active === 'Title' ? 'Title' : sceneForPhase());
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
