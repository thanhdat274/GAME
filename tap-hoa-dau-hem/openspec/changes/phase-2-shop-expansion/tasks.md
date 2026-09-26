## 1. Nền tảng dữ liệu và bản lưu v3

- [x] 1.1 Mở rộng kiểu `GameState` cho lưới mặt bằng, nội thất, lô hàng, sổ nợ, nhiệm vụ, trang trí
- [x] 1.2 Chuyển kho sang mô hình lô hàng (FEFO), cập nhật mọi chỗ gọi kho cũ; test
- [x] 1.3 Viết `migrate_2_to_3` từ save self-service v2 + fixture bản lưu v2 mẫu; test giữ nguyên tiền, level, hàng, khu kệ, hàng sau quầy và cài đặt
- [x] 1.4 Xuất/nhập mã sao lưu (JSON → nén → base64), màn Cài đặt có nút Xuất/Nhập
- [x] 1.5 Thêm trường mới vào `products.json` + 16 mặt hàng; cập nhật test kiểm tra dữ liệu
- [x] 1.6 Nâng `levels.json` lên L9 với bảng mở khóa L5–L9; hệ thống hướng dẫn tính năng mới hiện 1 lần

## 2. Mặt bằng và chế độ Sắp xếp

- [x] 2.1 Core: lưới 6x8, `land.json` (Đất A/B/C), mở khóa đất theo level + tiền; test
- [x] 2.2 Core: `furniture.json`, đặt/xoay/di chuyển/bán nội thất theo footprint, kiểm tra chồng lấn; test
- [x] 2.3 Core: BFS kiểm tra lối đi cửa → quầy → từng kệ; test các bố cục bị chặn
- [x] 2.4 Scene: vẽ lưới, đất khóa (mờ + ổ khóa + giá), hiệu ứng dỡ rào khi mở
- [x] 2.5 Build mode: kéo thả nội thất, tô xanh/đỏ, nút Xong/Hủy, chỉ có ở Buổi sáng
- [ ] 2.6 Camera cuộn dọc bằng một ngón (ngưỡng 8px), quầy + khay tiền ghim ở dưới, nút "Về quầy"
- [x] 2.7 Khách tự chọn hàng tìm đường trên lưới (A* đơn giản) tới từng khu có món cần rồi tới quầy; giữ luật Phase 1a: khách lấy hàng, người chơi chỉ nạp kệ và quét tại quầy
- [ ] 2.8 Gộp nội thất tĩnh vào RenderTexture; kiểm thử 60fps với 5 khách trên 375x812

## 3. Kho và thiết bị lạnh

- [x] 3.1 Core: bậc kho + kệ kho cộng sức chứa; nâng cấp kho; test
- [x] 3.2 Màn Kho: danh sách lô, bộ lọc nhóm / "Sắp hết hạn", dọn bỏ lô
- [x] 3.3 Core: ô lạnh, ràng buộc `requiresCold`, giảm 50% sức mua với `prefersCold` để kệ thường; test
- [x] 3.4 Tiền điện cuối ngày, thêm dòng vào tổng kết
- [ ] 3.5 Asset: tủ lạnh, tủ đông, kệ sắt, kệ kho, icon hàng mới

## 4. Hàng tươi và hạn dùng

- [x] 4.1 Core: tạo lô có hạn khi nhập, `expireLots(day)` cuối ngày, ghi tổn thất; test
- [x] 4.2 Nhãn vàng trên ô kệ chứa hàng sắp hết hạn, nhãn đỏ khi hết hạn hôm nay
- [x] 4.3 Bán xả 30%/50% cho ô kệ, tăng xác suất mua; test
- [x] 4.4 Tổng kết: mục "Hàng hỏng" và mẹo nhập hàng

## 5. Mối sỉ và giá

- [x] 5.1 Core: `suppliers.json`, giá dao động ±15% theo seed ngày, chiết khấu ≥ 50 đơn vị; test
- [x] 5.2 Core: đơn giao trễ của Anh Ba, xe giao lúc 15:00 hôm sau, hàng chờ khi kho đầy; test
- [x] 5.3 UI: tab mối sỉ, mũi tên giá tăng/giảm, nhãn "-5%", xe giao hàng chạy tới cửa
- [x] 5.4 Core: giá bán 80–150% giá gợi ý, xác suất mua theo độ nhạy kiểu khách, hệ số sinh khách khi giá rẻ; test
- [x] 5.5 UI chỉnh giá bước 500đ, bong bóng "Đắt quá!", báo cáo chê giá ở tổng kết

## 6. Khách mới và sổ nợ

- [x] 6.1 Core: khách có tên cố định (hàng xóm), lưu danh sách khách quen
- [x] 6.2 Core: sổ nợ (cho nợ, hạn mức 20% tiền mặt, trả đúng/trễ/quỵt, nhắc nợ); test xác suất bằng mô phỏng
- [x] 6.3 UI: hộp chọn Cho nợ / Không cho, màn Sổ nợ, hiệu ứng trả nợ
- [x] 6.4 Core + UI: khách mặc cả (Bớt / Không bớt)
- [x] 6.5 Số khách chờ tối đa tăng theo đất đã mở

## 7. Nhiệm vụ, thành tựu, trang trí

- [x] 7.1 Core: `quests.json`, rút 3 nhiệm vụ/ngày theo level, theo dõi tiến độ qua event bus, đổi 1 lần/ngày; test
- [x] 7.2 UI: bảng nhiệm vụ trên HUD, nút Nhận, hiệu ứng thưởng
- [x] 7.3 Core + UI: thành tựu trọn đời, màn thành tựu
- [x] 7.4 Core: `decor.json`, điểm thu hút và hệ số sinh khách; mèo quầy +2 giây kiên nhẫn
- [x] 7.5 Cửa hàng nội thất và trang trí (mua, bán lại 50%)

## 8. Cân bằng và phát hành

- [x] 8.1 Mở rộng script mô phỏng: 30 ngày, kiểm tra lãi, tốc độ lên L9 (mục tiêu 20–30 ngày), tỉ lệ hàng hỏng < 10% với chiến lược hợp lý
- [ ] 8.2 Kiểm thử trên điện thoại: build mode, cuộn camera, khách tự đi theo khu theo luồng Phase 1a và người chơi nạp hàng/quét tại quầy khi tiệm lớn
- [ ] 8.3 Test migrate bằng bản lưu thật của người chơi thử giai đoạn 1
- [ ] 8.4 Deploy, thu phản hồi, cập nhật `balance.json` trước khi sang giai đoạn 3

### Ghi nhận triển khai 26/09/2026

- Core (thuần TypeScript, có test): `layout.ts` (lưới 6×8, đất A/B/C, đặt/xoay/di chuyển/bán nội thất, BFS lối đi, đường đi ngắn nhất), kho theo lô FEFO + hàng chờ + bậc kho/kệ kho (`stock.ts`), `pricing.ts`, `ledger.ts`, `quests.ts` (nhiệm vụ + thành tựu), `decor.ts`; `DaySession` thêm chê giá, "không lạnh", bán xả, mặc cả, ghi sổ, khách trả nợ trong ngày, xe giao 15:00, mèo quầy; bản lưu v3 + `migrate_2_to_3` + mã sao lưu `THDH1:`.
- Dữ liệu: 16 món mới, L5–L9, `land.json`, `furniture.json`, `suppliers.json`, `quests.json`, `decor.json`, cân bằng trong `balance.json`.
- UI: màn Sắp xếp (`BuildScene`), Kho, Giá bán, Sổ nợ, Nhiệm vụ/Thành tựu, Trang trí; menu ☰ Tiệm; hướng dẫn tính năng mới (gộp khi mở nhiều cùng lúc); kệ/tủ lạnh/tủ đông cuộn dọc; nhãn hạn "MAI"/"HẠN" và "-50%"; bảng Bớt/Không bớt, Cho nợ/Không cho; 🎯 nhiệm vụ khi bán; tổng kết thêm hàng hỏng, tiền điện, nợ, chê giá, lãi ròng, thành tựu; Xuất/Nhập mã sao lưu trong menu Tạm dừng.
- Test: `tests/phase2.test.ts` (45 test) + fixture `tests/fixtures/save-v2.json`; toàn bộ 192 test qua; build production và Functions qua.
- Mô phỏng 8.1 (`npm run playtest -- 30 5`): người chơi dùng Gợi ý lên L9 ở ngày ~21–22, hàng tươi hỏng 7–9%, lãi ròng dương (145–218 nghìn/ngày cuối). Bot "người mới" tự nhập theo cảm tính hỏng ~75% hàng tươi — tổng kết đã có mẹo nhập ít hàng tươi.
- Chơi thử trình duyệt 375×812 (giả lập, không phải điện thoại thật): nạp bản v2 L7 → migrate, mở Đất A, mua/kéo/xoay tủ lạnh, chặn lối đi bị từ chối, nhập hàng Cô Tư, bán xả, mặc cả, ghi sổ, tổng kết, các màn quản lý. Lỗi tìm thấy và đã sửa: tổng đơn lẻ 500đ không thối được (nay làm tròn 1.000đ), "Tự bày" tranh kệ qua lại giữa các khu, 7 hộp hướng dẫn liên tiếp, dòng khách chê giá hiện nhầm "Hết hàng".
- Chưa làm / điều chỉnh so với kế hoạch: 2.6 dùng cuộn danh sách kệ một ngón (ngưỡng 8px) và quầy luôn ghim dưới, chưa có nút "Về quầy" và camera cuộn cả mặt bằng lúc bán; 2.7 khách tính thời gian đi theo đường BFS trên lưới nhưng hình vẽ lúc bán vẫn đi theo làn khu hàng; 2.8 chưa gộp RenderTexture/đo 60fps; 3.5 tủ/kệ trong màn Sắp xếp dùng emoji, chưa có pixel art riêng. Các mục 8.2–8.4 cần điện thoại thật, bản lưu người chơi thật và deploy.

