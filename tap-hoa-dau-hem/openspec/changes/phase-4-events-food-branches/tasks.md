## 1. Đợt 4a - Nền tảng: bản lưu v5, lịch, ngăn xếp hiệu ứng

- [x] 1.1 Tái cấu trúc `GameState` thành dữ liệu chung + `stores[]` theo hướng "tráo tiệm": các trường của tiệm đang mở giữ ở `GameState` (danh sách `STORE_KEYS`), tiệm khác lưu snapshot trong `stores[]`, chuyển tiệm bằng `activateStore`/`syncActiveStore`; chi nhánh không mở chạy mô phỏng rút gọn; test (`tests/phase4.test.ts`)
- [x] 1.2 `migrate_4_to_5` + fixture; giữ nguyên trạng thái Phase 1a–3; giới hạn kích thước bản lưu < 1MB; test
- [x] 1.3 Core: lịch 10 ngày/tháng, 12 tháng/năm, mùa và hệ số nhu cầu theo mùa; test
- [x] 1.4 Core: `EffectStack` gộp hiệu ứng; chuyển các hằng số (sinh khách, nhu cầu, giá sỉ, điện) sang đọc từ EffectStack; test không đổi hành vi khi không có hiệu ứng
- [x] 1.5 Nâng `levels.json` lên L35 với bảng mở khóa L21–L35
- [x] 1.6 HUD ngày/tháng/mùa và màn Lịch

## 2. Đợt 4a - Sự kiện

- [x] 2.1 Định dạng `events.json` + trình kiểm tra dữ liệu (trigger, duration, effects, items, decor, quests, dialog)
- [x] 2.2 Core: bộ lập lịch sự kiện mùa và rút sự kiện ngẫu nhiên (tối đa 1/ngày, báo trước buổi sáng); test
- [x] 2.3 Nội dung 5 sự kiện mùa: Tết, Hè, Trung thu, Khai giảng, Mùa bóng đá (hàng, trang trí, nhiệm vụ, hội thoại)
- [x] 2.4 Nội dung 6 sự kiện ngẫu nhiên: mưa, cúp điện, xả hàng, kiểm tra vệ sinh, trend, đám giỗ
- [x] 2.5 Máy phát điện (nội thất mới) và logic hỏng đồ đông lạnh khi cúp điện
- [x] 2.6 Đường tiến độ sự kiện và phần thưởng trang trí độc quyền
- [x] 2.7 Hiệu ứng hình: mưa, tối đèn khi cúp điện, trang trí theo mùa tải lười
- [x] 2.8 Kiểm thử Tết + mưa trên điện thoại (hiệu năng khi khách ×1.8); phát hành đợt 4a

## 3. Đợt 4b - Góc đồ ăn

- [x] 3.1 `recipes.json` + kiểm tra dữ liệu; nguyên liệu mới ở mối sỉ
- [x] 3.2 Đất E và nội thất bếp (bếp nướng, ấm nước nóng, tủ bánh mì); bảng menu
- [x] 3.3 Core: đơn món ăn, trừ nguyên liệu, thành phẩm hỏng cuối ngày; test
- [x] 3.4 Mini-game: nướng xúc xích (thanh kim), mì ly (rót tới vạch), bánh mì (thả theo thứ tự), trứng luộc (hẹn giờ)
- [x] 3.5 Vai trò Đầu bếp (AI làm món theo chỉ số), thuê miễn phí 3 ngày đầu

## 4. Đợt 4b - Quầy nước và bàn ghế

- [x] 4.1 Đất F và nội thất quầy nước (quầy, máy xay, máy ép mía)
- [x] 4.2 Core: công thức theo thứ tự, biến thể (ít đường, nhiều đá), đánh giá Ngon/Tạm được; test (`tests/phase4.test.ts`, đã thử trên trình duyệt)
- [x] 4.3 Mini-game pha chế + thao tác khuấy/lắc/xay; Sổ công thức (đã thử trên trình duyệt; sửa lỗi CookScene không reset bước khi chế biến món thứ hai)
- [x] 4.4 Vai trò Pha chế
- [x] 4.5 Core: bàn ghế, khách ngồi, gọi thêm, bàn bẩn, dọn bàn; test (`tests/phase4.test.ts`)
- [x] 4.6 Cân bằng doanh thu góc đồ ăn và quầy nước so với tạp hóa; kiểm thử trên điện thoại; phát hành đợt 4b

## 5. Đợt 4c - Cốt truyện và nhiệm vụ

- [x] 5.1 `story.json` + màn "Hành trình" + hệ thống hội thoại có chân dung nhân vật
- [x] 5.2 Viết lại đoạn mở đầu thành chương "Về quê giữ tiệm"; thêm các chương "Tiệm lớn dần", "Có thêm người phụ"
- [x] 5.3 Chương "Siêu thị đối diện": sprite đối thủ, hiệu ứng −15% khách, mục tiêu, kết thúc
- [x] 5.4 Chương "Bà về thăm tiệm" và "Lên phố mở chuỗi"
- [x] 5.5 Nhiệm vụ tuần, tab nhiệm vụ sự kiện, đơn tiệc

## 6. Đợt 4c - Chi nhánh và danh hiệu

- [x] 6.1 `branches.json` (Chợ, Cổng trường, Khu công nghiệp: giá, hồ sơ nhu cầu, lưới mặc định)
- [x] 6.2 Màn Bản đồ thành phố, mở chi nhánh, chọn tiệm để ghé
- [x] 6.3 Core: mô phỏng rút gọn chi nhánh mỗi ngày (dùng lại mô hình thu nhập offline); test
- [x] 6.4 Vai trò Quản lý chi nhánh và hiệu suất 60% → 75–90%; test
- [x] 6.5 Chuyển hàng giữa chi nhánh (xe tải, tới sáng hôm sau, giữ hạn dùng); test
- [x] 6.6 Tổng kết nhiều tab (từng tiệm + tổng chuỗi)
- [x] 6.7 `titles.json` và danh hiệu sau L35 (+1% doanh thu/sao, tối đa 30%)

## 7. Cân bằng và phát hành cuối

- [x] 7.1 Mô phỏng 1 năm game (120 ngày) với 4 tiệm: kinh tế không bùng nổ, bản lưu < 1MB, "Bỏ qua ngày" < 1 giây (`tests/yearSimulation.test.ts`: 46tr → 85,9tr, save 73KB, bỏ qua ngày tối đa 399ms; 27/09/2026)
- [x] 7.2 Kiểm thử toàn bộ trên điện thoại tầm trung: bản đồ, mini-game nấu và pha chế, sự kiện
- [x] 7.3 Viết tài liệu thêm sự kiện mới bằng JSON (để cập nhật nội dung hằng tháng)
- [x] 7.4 Phát hành đợt 4c, cập nhật thẻ game trên cổng game
