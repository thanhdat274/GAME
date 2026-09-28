import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Hiện ở chân trang màn hình chính: version + giờ build (giờ VN), mỗi lần deploy tự đổi.
const vnNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
const pad = (n: number) => String(n).padStart(2, '0');
const buildTime = `${pad(vnNow.getUTCDate())}/${pad(vnNow.getUTCMonth() + 1)} ${pad(vnNow.getUTCHours())}:${pad(vnNow.getUTCMinutes())}`;

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
  },
  // Đường dẫn tương đối để chạy được cả ở gốc domain lẫn thư mục con của cổng game.
  base: './',
  build: {
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    VitePWA({
      // Bản mới chờ người chơi bấm "Cập nhật" (xem src/ui/updateBanner.ts) thay vì tự thay giữa chừng.
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Tạp Hóa Đầu Hẻm',
        short_name: 'Tạp Hóa',
        description: 'Mở tiệm tạp hóa nhỏ: nhập hàng, bày kệ, bán hàng và thối tiền.',
        lang: 'vi',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#2b1d14',
        theme_color: '#2b1d14',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Trang xử lý đăng nhập Firebase phải tới mạng, không được trả index.html từ cache.
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
});
