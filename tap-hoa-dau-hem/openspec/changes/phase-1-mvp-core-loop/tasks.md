## 1. Khởi tạo dự án

- [x] 1.1 Tạo project Vite + TypeScript trong `tap-hoa-dau-hem/`, cài phaser, vitest, vite-plugin-pwa
- [x] 1.2 Cấu hình Phaser: logic 360x640 (canvas 720x1280 + camera zoom 2 cho chữ nét), Scale.FIT + autoCenter; chặn zoom double-tap trong index.html
- [x] 1.3 Tạo cấu trúc thư mục `src/core`, `src/data`, `src/scenes`, `src/ui`, `public/assets`
- [x] 1.4 Thêm script `dev`, `build`, `test`, `preview`; chạy được scene trống trên điện thoại qua mạng LAN (`vite --host`)

## 2. Lõi dữ liệu và trạng thái

- [x] 2.1 Viết kiểu `GameState` và hàm `createNewGame()` (300.000đ, level 1, ngày 1, kho 20 ô, 2 kệ × 6 ô)
- [x] 2.2 Viết `products.json` với 14 mặt hàng và hàm kiểm tra dữ liệu (test báo lỗi thiếu trường / giá bán < giá nhập)
- [x] 2.3 Viết `levels.json`, `customers.json`, `balance.json` theo design D6
- [x] 2.4 Viết event bus có kiểu và RNG mulberry32 có seed, kèm test
- [x] 2.5 Viết `save.ts`: lưu/tải/migrate/.bak, bọc try/catch; test với localStorage giả

## 3. Nhập hàng và kho

- [x] 3.1 Core: `buyStock(cart)` kiểm tra tiền và ô kho, test các trường hợp đủ/thiếu tiền, kho đầy
- [x] 3.2 Scene Buổi sáng: danh sách mặt hàng theo level, nút +/- số lượng (bước 1 và 10), giỏ hàng, tổng tiền
- [x] 3.3 Hiện "Còn: X · Hôm qua bán: Y" cho từng món
- [x] 3.4 Kiểm thử màn nhập hàng trên 375x812: cuộn danh sách mượt, nút đủ to

## 4. Kệ hàng

- [x] 4.1 Core: gán ô kệ, nạp từ kho, trả hàng về kho; test
- [x] 4.2 Scene Tiệm: vẽ nền tiệm, 2 kệ, quầy thu ngân (asset tạm bằng hình khối)
- [x] 4.3 Kéo thả hàng từ khay kho vào ô kệ ở buổi sáng; chạm để nạp lại trong lúc bán
- [x] 4.4 Biểu tượng "Hết hàng" và số lượng trên từng ô

## 5. Khách hàng

- [x] 5.1 Core: đường cong mật độ khách theo giờ, giới hạn 3 khách chờ, hệ số sao ±20%; test mô phỏng 1 ngày
- [x] 5.2 Core: sinh yêu cầu 1–3 món theo sở thích kiểu khách và mặt hàng đã mở khóa; test không sinh món chưa mở khóa
- [x] 5.3 Core: kiên nhẫn theo tick, lấy đúng/sai, thiếu một phần, bỏ về; test
- [x] 5.4 Scene: sprite khách đi vào quầy, bong bóng yêu cầu, thanh kiên nhẫn đổi màu, hoạt ảnh vui/buồn/lắc đầu
- [x] 5.5 Chạm ô kệ để bỏ hàng vào túi khách, gợi ý nhấp nháy món cần lấy ở level 1–2

## 6. Tính tiền và thối tiền

- [x] 6.1 Core: chọn tờ khách đưa, tính tiền thối, kiểm tra thối đúng/thiếu/thừa, tính tip theo thời gian; test bảng nhiều ca
- [x] 6.2 UI ngăn kéo tiền 8 mệnh giá, khay thối, nút Hoàn tác và Đưa
- [x] 6.3 Nút "Tự tính" + cài đặt "Tự thối tiền" mặc định bật từ level 1 (sau phản hồi chơi thử)
- [x] 6.4 Hiệu ứng tiền bay vào két, số tiền nổi (+15.000đ, +2.000đ tip)

## 7. Chu kỳ ngày và tổng kết

- [x] 7.1 Core: máy trạng thái Sáng → Bán → Tổng kết, đồng hồ 08:00–20:00 trong 180 giây, tick 100ms; tạm dừng
- [x] 7.2 HUD: tiền, ngày, đồng hồ, sao, thanh EXP, nút tạm dừng
- [x] 7.3 Màn tổng kết: doanh thu, vốn, lãi, tip, khách, sao, EXP, món bán chạy
- [x] 7.4 Cơ chế "Bà gửi tiền" chống kẹt vốn

## 8. Level và mở khóa

- [x] 8.1 Core: cộng EXP, kiểm tra lên level, áp dụng mở khóa từ levels.json, giới hạn level 4; test
- [x] 8.2 Hiệu ứng "Lên cấp!", popup "Mặt hàng mới!", xem trước phần thưởng khi chạm thanh EXP
- [x] 8.3 Sao tiệm trung bình 20 khách gần nhất hiển thị trên HUD

## 9. Vỏ game

- [x] 9.1 Scene Boot với thanh tải, scene Tiêu đề (Chơi tiếp/Chơi mới/Cách chơi/Âm thanh)
- [x] 9.2 Đoạn mở đầu 3 câu thoại "về quê giữ tiệm của bà"
- [x] 9.3 Màn "Cách chơi" 4 trang có hình
- [x] 9.4 Tự lưu khi chuyển pha, lên level, `visibilitychange`; xác nhận "Chơi mới"
- [x] 9.5 Thông báo xoay dọc khi màn hình ngang trên thiết bị cảm ứng
- [x] 9.6 Âm thanh: tiếng bước chân, "ting" két tiền, lên cấp, nhạc nền lặp; nút tắt

## 10. Đồ họa và cảm giác

- [ ] 10.1 Thay asset tạm bằng pixel art: mặt tiền tiệm, kệ, quầy, 14 icon hàng, 4 kiểu khách, 9 tờ tiền
- [x] 10.2 Tween nhỏ cho nút bấm, rung nhẹ (navigator.vibrate) khi thối sai trên điện thoại
- [x] 10.3 Kiểm thử toàn bộ 1 ngày trên 375x812 và trên desktop, đo 60fps

## 11. Cân bằng, PWA và phát hành

- [x] 11.1 Script mô phỏng 7 ngày với người chơi giả (core thuần) để kiểm tra lãi/ngày và tốc độ lên level (mục tiêu L4 sau 5–7 ngày)
- [x] 11.2 Manifest PWA (tên, icon 192/512, portrait) và service worker cache asset; thử mở khi offline
- [ ] 11.3 Build và deploy Vercel, thêm thẻ "Tạp Hóa Đầu Hẻm" vào cổng game `GAME/dist/index.html`
- [ ] 11.4 Cho 3–5 người chơi thử trên điện thoại, ghi nhận phản hồi trước khi bắt đầu giai đoạn 2
