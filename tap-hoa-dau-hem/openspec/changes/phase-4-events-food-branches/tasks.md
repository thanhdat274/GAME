## 1. Đợt 4a - Nền tảng: bản lưu v5, lịch, ngăn xếp hiệu ứng

- [ ] 1.1 Tái cấu trúc `GameState` thành dữ liệu chung + `stores[]`; mọi hệ thống nhận `storeId`; test
- [ ] 1.2 `migrate_4_to_5` + fixture; giữ nguyên trạng thái Phase 1a–3; giới hạn kích thước bản lưu < 1MB; test
- [ ] 1.3 Core: lịch 10 ngày/tháng, 12 tháng/năm, mùa và hệ số nhu cầu theo mùa; test
- [ ] 1.4 Core: `EffectStack` gộp hiệu ứng; chuyển các hằng số (sinh khách, nhu cầu, giá sỉ, điện) sang đọc từ EffectStack; test không đổi hành vi khi không có hiệu ứng
- [ ] 1.5 Nâng `levels.json` lên L35 với bảng mở khóa L21–L35
- [ ] 1.6 HUD ngày/tháng/mùa và màn Lịch

## 2. Đợt 4a - Sự kiện

- [ ] 2.1 Định dạng `events.json` + trình kiểm tra dữ liệu (trigger, duration, effects, items, decor, quests, dialog)
- [ ] 2.2 Core: bộ lập lịch sự kiện mùa và rút sự kiện ngẫu nhiên (tối đa 1/ngày, báo trước buổi sáng); test
- [ ] 2.3 Nội dung 5 sự kiện mùa: Tết, Hè, Trung thu, Khai giảng, Mùa bóng đá (hàng, trang trí, nhiệm vụ, hội thoại)
- [ ] 2.4 Nội dung 6 sự kiện ngẫu nhiên: mưa, cúp điện, xả hàng, kiểm tra vệ sinh, trend, đám giỗ
- [ ] 2.5 Máy phát điện (nội thất mới) và logic hỏng đồ đông lạnh khi cúp điện
- [ ] 2.6 Đường tiến độ sự kiện và phần thưởng trang trí độc quyền
- [ ] 2.7 Hiệu ứng hình: mưa, tối đèn khi cúp điện, trang trí theo mùa tải lười
- [ ] 2.8 Kiểm thử Tết + mưa trên điện thoại (hiệu năng khi khách ×1.8); phát hành đợt 4a

## 3. Đợt 4b - Góc đồ ăn

- [ ] 3.1 `recipes.json` + kiểm tra dữ liệu; nguyên liệu mới ở mối sỉ
- [ ] 3.2 Đất E và nội thất bếp (bếp nướng, ấm nước nóng, tủ bánh mì); bảng menu
- [ ] 3.3 Core: đơn món ăn, trừ nguyên liệu, thành phẩm hỏng cuối ngày; test
- [ ] 3.4 Mini-game: nướng xúc xích (thanh kim), mì ly (rót tới vạch), bánh mì (thả theo thứ tự), trứng luộc (hẹn giờ)
- [ ] 3.5 Vai trò Đầu bếp (AI làm món theo chỉ số), thuê miễn phí 3 ngày đầu

## 4. Đợt 4b - Quầy nước và bàn ghế

- [ ] 4.1 Đất F và nội thất quầy nước (quầy, máy xay, máy ép mía)
- [ ] 4.2 Core: công thức theo thứ tự, biến thể (ít đường, nhiều đá), đánh giá Ngon/Tạm được; test
- [ ] 4.3 Mini-game pha chế + thao tác khuấy/lắc/xay; Sổ công thức
- [ ] 4.4 Vai trò Pha chế
- [ ] 4.5 Core: bàn ghế, khách ngồi, gọi thêm, bàn bẩn, dọn bàn; test
- [ ] 4.6 Cân bằng doanh thu góc đồ ăn và quầy nước so với tạp hóa; kiểm thử trên điện thoại; phát hành đợt 4b

## 5. Đợt 4c - Cốt truyện và nhiệm vụ

- [ ] 5.1 `story.json` + màn "Hành trình" + hệ thống hội thoại có chân dung nhân vật
- [ ] 5.2 Viết lại đoạn mở đầu thành chương "Về quê giữ tiệm"; thêm các chương "Tiệm lớn dần", "Có thêm người phụ"
- [ ] 5.3 Chương "Siêu thị đối diện": sprite đối thủ, hiệu ứng −15% khách, mục tiêu, kết thúc
- [ ] 5.4 Chương "Bà về thăm tiệm" và "Lên phố mở chuỗi"
- [ ] 5.5 Nhiệm vụ tuần, tab nhiệm vụ sự kiện, đơn tiệc

## 6. Đợt 4c - Chi nhánh và danh hiệu

- [ ] 6.1 `branches.json` (Chợ, Cổng trường, Khu công nghiệp: giá, hồ sơ nhu cầu, lưới mặc định)
- [ ] 6.2 Màn Bản đồ thành phố, mở chi nhánh, chọn tiệm để ghé
- [ ] 6.3 Core: mô phỏng rút gọn chi nhánh mỗi ngày (dùng lại mô hình thu nhập offline); test
- [ ] 6.4 Vai trò Quản lý chi nhánh và hiệu suất 60% → 75–90%; test
- [ ] 6.5 Chuyển hàng giữa chi nhánh (xe tải, tới sáng hôm sau, giữ hạn dùng); test
- [ ] 6.6 Tổng kết nhiều tab (từng tiệm + tổng chuỗi)
- [ ] 6.7 `titles.json` và danh hiệu sau L35 (+1% doanh thu/sao, tối đa 30%)

## 7. Cân bằng và phát hành cuối

- [ ] 7.1 Mô phỏng 1 năm game (120 ngày) với 4 tiệm: kinh tế không bùng nổ, bản lưu < 1MB, "Bỏ qua ngày" < 1 giây
- [ ] 7.2 Kiểm thử toàn bộ trên điện thoại tầm trung: bản đồ, mini-game nấu và pha chế, sự kiện
- [ ] 7.3 Viết tài liệu thêm sự kiện mới bằng JSON (để cập nhật nội dung hằng tháng)
- [ ] 7.4 Phát hành đợt 4c, cập nhật thẻ game trên cổng game
