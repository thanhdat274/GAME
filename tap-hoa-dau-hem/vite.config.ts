import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Đường dẫn tương đối để chạy được cả ở gốc domain lẫn thư mục con của cổng game.
  base: './',
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
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
