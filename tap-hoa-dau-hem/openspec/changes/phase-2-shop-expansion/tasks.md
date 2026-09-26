## 1. Nền tảng dữ liệu và bản lưu v3

- [ ] 1.1 Mở rộng kiểu `GameState` cho lưới mặt bằng, nội thất, lô hàng, sổ nợ, nhiệm vụ, trang trí
- [ ] 1.2 Chuyển kho sang mô hình lô hàng (FEFO), cập nhật mọi chỗ gọi kho cũ; test
- [ ] 1.3 Viết `migrate_2_to_3` từ save self-service v2 + fixture bản lưu v2 mẫu; test giữ nguyên tiền, level, hàng, khu kệ, hàng sau quầy và cài đặt
- [ ] 1.4 Xuất/nhập mã sao lưu (JSON → nén → base64), màn Cài đặt có nút Xuất/Nhập
- [ ] 1.5 Thêm trường mới vào `products.json` + 16 mặt hàng; cập nhật test kiểm tra dữ liệu
- [ ] 1.6 Nâng `levels.json` lên L9 với bảng mở khóa L5–L9; hệ thống hướng dẫn tính năng mới hiện 1 lần

## 2. Mặt bằng và chế độ Sắp xếp

- [ ] 2.1 Core: lưới 6x8, `land.json` (Đất A/B/C), mở khóa đất theo level + tiền; test
- [ ] 2.2 Core: `furniture.json`, đặt/xoay/di chuyển/bán nội thất theo footprint, kiểm tra chồng lấn; test
- [ ] 2.3 Core: BFS kiểm tra lối đi cửa → quầy → từng kệ; test các bố cục bị chặn
- [ ] 2.4 Scene: vẽ lưới, đất khóa (mờ + ổ khóa + giá), hiệu ứng dỡ rào khi mở
- [ ] 2.5 Build mode: kéo thả nội thất, tô xanh/đỏ, nút Xong/Hủy, chỉ có ở Buổi sáng
- [ ] 2.6 Camera cuộn dọc bằng một ngón (ngưỡng 8px), quầy + khay tiền ghim ở dưới, nút "Về quầy"
- [ ] 2.7 Khách tự chọn hàng tìm đường trên lưới (A* đơn giản) tới từng khu có món cần rồi tới quầy; giữ luật Phase 1a: khách lấy hàng, người chơi chỉ nạp kệ và quét tại quầy
- [ ] 2.8 Gộp nội thất tĩnh vào RenderTexture; kiểm thử 60fps với 5 khách trên 375x812

## 3. Kho và thiết bị lạnh

- [ ] 3.1 Core: bậc kho + kệ kho cộng sức chứa; nâng cấp kho; test
- [ ] 3.2 Màn Kho: danh sách lô, bộ lọc nhóm / "Sắp hết hạn", dọn bỏ lô
- [ ] 3.3 Core: ô lạnh, ràng buộc `requiresCold`, giảm 50% sức mua với `prefersCold` để kệ thường; test
- [ ] 3.4 Tiền điện cuối ngày, thêm dòng vào tổng kết
- [ ] 3.5 Asset: tủ lạnh, tủ đông, kệ sắt, kệ kho, icon hàng mới

## 4. Hàng tươi và hạn dùng

- [ ] 4.1 Core: tạo lô có hạn khi nhập, `expireLots(day)` cuối ngày, ghi tổn thất; test
- [ ] 4.2 Nhãn vàng trên ô kệ chứa hàng sắp hết hạn, nhãn đỏ khi hết hạn hôm nay
- [ ] 4.3 Bán xả 30%/50% cho ô kệ, tăng xác suất mua; test
- [ ] 4.4 Tổng kết: mục "Hàng hỏng" và mẹo nhập hàng

## 5. Mối sỉ và giá

- [ ] 5.1 Core: `suppliers.json`, giá dao động ±15% theo seed ngày, chiết khấu ≥ 50 đơn vị; test
- [ ] 5.2 Core: đơn giao trễ của Anh Ba, xe giao lúc 15:00 hôm sau, hàng chờ khi kho đầy; test
- [ ] 5.3 UI: tab mối sỉ, mũi tên giá tăng/giảm, nhãn "-5%", xe giao hàng chạy tới cửa
- [ ] 5.4 Core: giá bán 80–150% giá gợi ý, xác suất mua theo độ nhạy kiểu khách, hệ số sinh khách khi giá rẻ; test
- [ ] 5.5 UI chỉnh giá bước 500đ, bong bóng "Đắt quá!", báo cáo chê giá ở tổng kết

## 6. Khách mới và sổ nợ

- [ ] 6.1 Core: khách có tên cố định (hàng xóm), lưu danh sách khách quen
- [ ] 6.2 Core: sổ nợ (cho nợ, hạn mức 20% tiền mặt, trả đúng/trễ/quỵt, nhắc nợ); test xác suất bằng mô phỏng
- [ ] 6.3 UI: hộp chọn Cho nợ / Không cho, màn Sổ nợ, hiệu ứng trả nợ
- [ ] 6.4 Core + UI: khách mặc cả (Bớt / Không bớt)
- [ ] 6.5 Số khách chờ tối đa tăng theo đất đã mở

## 7. Nhiệm vụ, thành tựu, trang trí

- [ ] 7.1 Core: `quests.json`, rút 3 nhiệm vụ/ngày theo level, theo dõi tiến độ qua event bus, đổi 1 lần/ngày; test
- [ ] 7.2 UI: bảng nhiệm vụ trên HUD, nút Nhận, hiệu ứng thưởng
- [ ] 7.3 Core + UI: thành tựu trọn đời, màn thành tựu
- [ ] 7.4 Core: `decor.json`, điểm thu hút và hệ số sinh khách; mèo quầy +2 giây kiên nhẫn
- [ ] 7.5 Cửa hàng nội thất và trang trí (mua, bán lại 50%)

## 8. Cân bằng và phát hành

- [ ] 8.1 Mở rộng script mô phỏng: 30 ngày, kiểm tra lãi, tốc độ lên L9 (mục tiêu 20–30 ngày), tỉ lệ hàng hỏng < 10% với chiến lược hợp lý
- [ ] 8.2 Kiểm thử trên điện thoại: build mode, cuộn camera, khách tự đi theo khu theo luồng Phase 1a và người chơi nạp hàng/quét tại quầy khi tiệm lớn
- [ ] 8.3 Test migrate bằng bản lưu thật của người chơi thử giai đoạn 1
- [ ] 8.4 Deploy, thu phản hồi, cập nhật `balance.json` trước khi sang giai đoạn 3
