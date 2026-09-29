import Phaser from 'phaser';
import { G, persist, sceneForPhase } from './game';
import { isMaxLevelSimulation } from './core/simulationMode';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { DecorScene } from './scenes/DecorScene';
import { MaintenanceScene } from './scenes/MaintenanceScene';
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
import { CityScene } from './scenes/CityScene';
import { TeaScene } from './scenes/TeaScene';
import { StoryScene } from './scenes/StoryScene';
import { PrestigeScene } from './scenes/PrestigeScene';
import { DiningScene } from './scenes/DiningScene';
import { RestockScene } from './scenes/RestockScene';
import { InternalScene } from './scenes/InternalScene';
import { installRoundedRectFix } from './ui/roundrect';
import { installUpdateBanner } from './ui/updateBanner';
import { installPerfOverlay } from './ui/perfOverlay';
import { installPowerSaver } from './ui/powerSaver';
import { H, W, ZOOM, computeGameDimensions, setGameSize } from './ui/theme';
import { applyDisplayOrientation, applyLandscapeViewport } from './ui/orientation';
import { applyPendingCloud, configureCloudApplyGuard, enableOnlineRetry } from './services/sync';

installRoundedRectFix();
applyDisplayOrientation();
applyLandscapeViewport();
const initialGameDimensions = computeGameDimensions();
setGameSize(initialGameDimensions.width, initialGameDimensions.height);
if (!isMaxLevelSimulation) enableOnlineRetry();

// Giới hạn nhịp mặc định trên điện thoại để giảm tải nhiệt; máy tính giữ 60 FPS.
// Có thể ép mức cần so sánh bằng ?fps=30 hoặc ?fps=60 (kết hợp ?perf=1 để đo).
const fpsOverride = new URLSearchParams(window.location.search).get('fps');
const mobileViewport = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 600;
const fpsLimit = fpsOverride === '30' ? 30 : fpsOverride === '60' ? 60 : mobileViewport ? 30 : 60;
const shopDomTest = new URLSearchParams(window.location.search).get('shop-dom') === '1';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W * ZOOM,
  height: H * ZOOM,
  backgroundColor: '#2b1d14',
  // Giới hạn 30 FPS trên điện thoại giúp máy không render nhanh hơn mức cần thiết.
  fps: { limit: fpsLimit },
  // Căn giữa bằng flex của #game (index.html); để Phaser căn nữa thì canvas bị đẩy lệch hai lần.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.NO_CENTER },
  // Game dùng pixel art; tắt MSAA để giảm chi phí render trên thiết bị yếu.
  render: { antialias: false, roundPixels: false },
  // Chỉ tạo DOM layer trong lượt thử HUD HTML/CSS; mặc định không thêm DOM container.
  dom: shopDomTest ? { createContainer: true } : undefined,
  input: { activePointers: 2 },
  scene: [BootScene, TitleScene, HowToScene, MorningScene, ShopScene, SummaryScene, BuildScene, WarehouseScene, StoreMapScene, PricesScene, LedgerScene, TaxScene, QuestsScene, DecorScene, MaintenanceScene, StaffScene, ScheduleScene, RulesScene, AnalyticsScene, CalendarScene, KitchenScene, CookScene, TeaScene, BranchesScene, CityScene, StoryScene, PrestigeScene, DiningScene, RestockScene, InternalScene, ReviewsScene],
});

// Phaser's default pointer transform assumes an unrotated canvas. Map physical
// touch coordinates through the quarter-turn used by the virtual viewport.
const pointerTransform = game.input.transformPointer.bind(game.input);
game.input.transformPointer = (pointer, pageX, pageY, wasMove) => {
  const rotation = document.body.dataset.virtualOrientation;
  if (rotation !== 'landscape' && rotation !== 'portrait') {
    pointerTransform(pointer, pageX, pageY, wasMove);
    return;
  }
  const rect = game.canvas.getBoundingClientRect();
  const x = rotation === 'landscape'
    ? (pageY - rect.top) * game.scale.width / rect.height
    : (rect.bottom - pageY) * game.scale.width / rect.height;
  const y = rotation === 'landscape'
    ? (rect.right - pageX) * game.scale.height / rect.width
    : (pageX - rect.left) * game.scale.height / rect.width;
  const previous = pointer.position;
  pointer.prevPosition.copy(previous);
  const smooth = wasMove ? pointer.smoothFactor : 0;
  previous.set(smooth ? x * smooth + previous.x * (1 - smooth) : x, smooth ? y * smooth + previous.y * (1 - smooth) : y);
};

// Chỉ bản dev: đo FPS khi kiểm thử hiệu năng trên trình duyệt.
if (import.meta.env.DEV) (window as unknown as { __thdhGame?: Phaser.Game }).__thdhGame = game;
installPerfOverlay(game, () => G.state);
installPowerSaver(game, fpsLimit);

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
const inGame = () => ['Morning', 'Shop', 'Summary', 'Warehouse', 'StoreMap', 'Prices', 'Ledger', 'Quests', 'Decor', 'Staff', 'Schedule', 'Rules', 'Analytics', 'Calendar', 'Kitchen', 'Cook', 'Tea', 'Branches', 'City', 'Story', 'Prestige', 'Restock', 'Internal'].some((k) => game.scene.isActive(k));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && inGame()) persist();
});
window.addEventListener('pagehide', () => {
  if (inGame()) persist();
});

// Chặn cử chỉ zoom của iOS Safari.
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Có bản mới: hiện nút "Cập nhật" (lưu game rồi tải lại để lấy giao diện mới).
if (import.meta.env.PROD) installUpdateBanner(() => { if (inGame()) persist(); });

// Cập nhật kích thước canvas và bố cục khi xoay màn hình (orientation change / resize).
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
const resizeGame = () => {
    applyLandscapeViewport();
    const dims = computeGameDimensions();
    if (dims.width !== W || dims.height !== H) {
      setGameSize(dims.width, dims.height);
      game.scale.setGameSize(W * ZOOM, H * ZOOM);
      const activeScenes = game.scene.getScenes(true);
      for (const sc of activeScenes) {
        if (sc.scene.key === 'Shop') {
          (sc as ShopScene).reflowForOrientation();
        } else if (sc.scene.key === 'Morning') {
          (sc as MorningScene).reflowForOrientation();
        } else if (sc.scene.key !== 'Boot' && sc.scene.key !== 'Title') {
          try {
            sc.scene.restart();
          } catch {
            // ignore
          }
        }
      }
    }
};
const handleViewportChange = () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { resizeTimer = null; resizeGame(); }, 150);
};
window.addEventListener('resize', handleViewportChange);
window.addEventListener('thdh-display-orientation', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = null;
  resizeGame();
});

// Để debug trên điện thoại qua console.
(window as unknown as { thdh: unknown }).thdh = { game, G };
