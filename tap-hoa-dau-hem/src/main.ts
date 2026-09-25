import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import { G, persist } from './game';
import { BootScene } from './scenes/BootScene';
import { HowToScene } from './scenes/HowToScene';
import { MorningScene } from './scenes/MorningScene';
import { ShopScene } from './scenes/ShopScene';
import { SummaryScene } from './scenes/SummaryScene';
import { TitleScene } from './scenes/TitleScene';
import { installRoundedRectFix } from './ui/roundrect';
import { H, W, ZOOM } from './ui/theme';

installRoundedRectFix();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W * ZOOM,
  height: H * ZOOM,
  backgroundColor: '#2b1d14',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false },
  input: { activePointers: 2 },
  scene: [BootScene, TitleScene, HowToScene, MorningScene, ShopScene, SummaryScene],
});

// Lưu khi rời tab / tắt ứng dụng (chỉ khi đã vào game để không ghi đè bằng trạng thái mặc định).
const inGame = () => ['Morning', 'Shop', 'Summary'].some((k) => game.scene.isActive(k));
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
