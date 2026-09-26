import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { G, persist, sceneForPhase } from './game';
import { BootScene } from './scenes/BootScene';
import { BuildScene } from './scenes/BuildScene';
import { DecorScene } from './scenes/DecorScene';
import { LedgerScene } from './scenes/LedgerScene';
import { PricesScene } from './scenes/PricesScene';
import { QuestsScene } from './scenes/QuestsScene';
import { WarehouseScene } from './scenes/WarehouseScene';
import { HowToScene } from './scenes/HowToScene';
import { MorningScene } from './scenes/MorningScene';
import { ShopScene } from './scenes/ShopScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';
import { installRoundedRectFix } from './ui/roundrect';
import { H, W, ZOOM } from './ui/theme';
import { applyPendingCloud, configureCloudApplyGuard, enableOnlineRetry } from './services/sync';

installRoundedRectFix();
enableOnlineRetry();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W * ZOOM,
  height: H * ZOOM,
  backgroundColor: '#2b1d14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 2 },
  scene: [BootScene, TitleScene, HowToScene, MorningScene, ShopScene, SummaryScene, BuildScene, WarehouseScene, PricesScene, LedgerScene, QuestsScene, DecorScene],
});

// Chỉ bản dev: đo FPS khi kiểm thử hiệu năng trên trình duyệt.
if (import.meta.env.DEV) (window as unknown as { __thdhGame?: Phaser.Game }).__thdhGame = game;

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
const inGame = () => ['Morning', 'Shop', 'Summary', 'Warehouse', 'Prices', 'Ledger', 'Quests', 'Decor'].some((k) => game.scene.isActive(k));
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

if (import.meta.env.PROD) registerSW({ immediate: true });

// Để debug trên điện thoại qua console.
(window as unknown as { thdh: unknown }).thdh = { game, G };
