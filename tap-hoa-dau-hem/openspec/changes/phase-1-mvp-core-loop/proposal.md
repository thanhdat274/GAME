## Why

Chưa có game. Cần một bản MVP chơi được trên điện thoại để kiểm chứng vòng chơi cốt lõi "nhập hàng → bày kệ → bán & thối tiền → tổng kết/lên level" có vui không, trước khi đầu tư vào mở rộng đất, nhân viên hay sự kiện. Mọi giai đoạn sau đều dựng trên nền móng (kiến trúc, dữ liệu, lưu game) của giai đoạn này.

## What Changes

- Tạo project Vite + TypeScript + Phaser 3, chạy dạng PWA, màn hình dọc, tự co giãn theo điện thoại.
- Màn hình tiêu đề "Tạp Hóa Đầu Hẻm" (Chơi tiếp / Chơi mới / Cách chơi / Âm thanh).
- Danh mục 14 mặt hàng khởi điểm (đồ khô, ăn vặt, đồ dùng) định nghĩa bằng JSON.
- Buổi sáng nhập hàng từ "Mối sỉ Cô Tư" với ngân sách và giới hạn kho 20 ô.
- Tiệm 2 kệ (6 ô/kệ), kéo hàng từ kho lên kệ.
- Khách đi vào, có bong bóng yêu cầu 1–3 món, thanh kiên nhẫn; chạm món trên kệ để lấy.
- Tự động thối tiền (mặc định); tắt đi để chơi mini-game thối tiền bằng các tờ tiền Việt Nam, thối đúng + nhanh được tip.
- Chu kỳ ngày (08:00–20:00 trong game ≈ 3 phút thật) và màn tổng kết cuối ngày.
- Hệ thống EXP, level 1–4, sao đánh giá tiệm, mở khóa mặt hàng/kệ theo level.
- Lưu/tải game tự động bằng localStorage.
- Build tĩnh và deploy lên Vercel, thêm thẻ game vào cổng game hiện có.

## Capabilities

### New Capabilities
- `game-shell`: Khởi động game, các scene, responsive dọc 9:16, PWA, âm thanh, màn tiêu đề và hướng dẫn.
- `product-catalog`: Định nghĩa mặt hàng (giá nhập, giá bán mặc định, nhóm, kích thước, level mở khóa).
- `restock-purchasing`: Nhập hàng buổi sáng từ mối sỉ, ngân sách, giới hạn kho.
- `shelf-display`: Kệ hàng, ô kệ, bày hàng từ kho lên kệ, trạng thái kệ trống.
- `customer-flow`: Sinh khách, yêu cầu mua, kiên nhẫn, lấy hàng, khách bỏ về.
- `checkout-change`: Tính tiền, khách trả tiền, mini-game thối tiền, tip.
- `day-cycle`: Các pha trong ngày, đồng hồ game, tổng kết cuối ngày.
- `progression`: EXP, level, sao đánh giá, mở khóa theo level.
- `save-system`: Lưu/tải tự động, phiên bản dữ liệu lưu, chơi mới.

### Modified Capabilities
(không có - đây là giai đoạn đầu tiên)

## Impact

- Code mới hoàn toàn trong `tap-hoa-dau-hem/` (src/core, src/scenes, src/data, public/assets).
- Phụ thuộc mới: phaser, vite, typescript, vitest, vite-plugin-pwa.
- Cần asset pixel art: tiệm, kệ, 14 icon hàng, 4 kiểu khách, tờ tiền, UI.
- Cổng game gốc (`GAME/dist/index.html`) thêm 1 thẻ dẫn tới game.
