## 1. Đợt A - Nền: truy cập tiệm bất kỳ, loại cửa hàng, bản lưu v6

- [ ] 1.1 Core: kiểu `StoreData` + `storeView(state, storeId)` trả state khi là tiệm đang đứng và snapshot đã gõ kiểu khi là tiệm khác; test đọc/ghi kho tiệm không đứng rồi `activateStore` thấy thay đổi
- [ ] 1.2 Chuyển `takeLots`/thêm lô, `prepareRecipe`, `expirePreparedFood` sang nhận `StoreData`; 277 test cũ vẫn xanh
- [ ] 1.3 `shopTypes.json` (`grocery`, `xoi`) + `shopTypes.ts` (`shopTypeOf(store)`, `ShopTypeBehavior`) + trình kiểm tra dữ liệu gộp vào `validate:recipes`; test tham chiếu sai bị báo lỗi
- [ ] 1.4 `StoreSnapshot.shopType`; `branches.json` thêm trường `shopType` và mục `xoi` (L31, 700.000đ, layout mặc định); `openBranch` dùng layout và loại tiệm; giới hạn chuỗi 5 tiệm (sửa cả thông báo ở `BranchesScene`); test
- [ ] 1.5 Bản lưu v6: `internalOrders`, `recurringOrders`, `soakBatches`, `cookedRice` (thêm vào `STORE_KEYS`); `migrate_5_to_6` + fixture v5 có 3 tiệm; sao lưu `save_backup_v5`; test kích thước < 1 MB với 5 tiệm
- [ ] 1.6 Lọc màn Sắp xếp, Nhập hàng, Kệ theo loại tiệm; kiểm thử trên màn hình điện thoại 375x812 rằng tạp hóa và chi nhánh cũ không đổi

## 2. Đợt B - Tiệm xôi: nguyên liệu, ngâm, hấp, món

- [ ] 2.1 `products.json`: nếp, đậu xanh, hành phi, chà bông, lạp xưởng, dừa nạo, bao gói (mở L31) và thành phẩm `xoi_*_tp`, `xoi_*_goi`; `levels.json` L31 thêm `shop_xoi` và đổi nhãn
- [ ] 2.2 `balance.json › stickyRice` (thời gian ngâm tối thiểu/tối đa, kg → phần, phút giữ nóng, trừ chất lượng nếp nguội)
- [ ] 2.3 Core `stickyRice.ts`: đặt mẻ ngâm, kiểm tra sẵn sàng/hỏng, hấp mẻ ra `cookedRice`, giữ nóng/nguội, hỏng cuối ngày; test từng trạng thái
- [ ] 2.4 `recipes.json`: xôi đậu xanh, xôi mặn, xôi trứng, xôi dừa + biến thể "Thêm topping" + đầu ra gói; `prepareRecipe` lấy nguyên liệu ảo `nep_chin` từ `cookedRice` (mẻ cũ nhất trước); test thiếu topping, nếp nguội
- [ ] 2.5 Nội thất `furniture.json`: thùng ngâm, xửng hấp, quầy xôi (mượn sprite có sẵn đúng footprint)

## 3. Đợt B - Tiệm xôi: khách, mini-game, màn chơi

- [ ] 3.1 `customers.json` + `shopTypes.json`: khách người đi làm/học sinh/công nhân, đường cong mật độ cao điểm 5h–10h; `DaySim` đọc mật độ và luồng "gọi món ở quầy" từ `ShopTypeBehavior`; test mật độ 6h30 > 14h
- [ ] 3.2 `ShopScene` chế độ tiệm xôi: khách xếp hàng ở quầy, bong bóng gọi món, giao món từ quầy; không có đi kệ
- [ ] 3.3 `XoiPrepPanel`: thùng ngâm (đặt kg, đồng hồ), xửng hấp (nút hấp), bộ đếm nếp chín và đồng hồ giữ nóng
- [ ] 3.4 Mini-game hấp (giữ lửa trong vùng xanh) trong `KitchenScene`; chất lượng ghi vào mẻ
- [ ] 3.5 Mini-game múc và rắc topping theo thứ tự, và mini-game gói lá/hộp
- [ ] 3.6 Khu Tiệm xôi trên `BranchesScene` + hướng dẫn ngâm nếp một lần vào sáng hôm sau khi mở; nút "Ngâm cho mai" ở tổng kết
- [ ] 3.7 Chơi thử một ngày tiệm xôi trên màn hình điện thoại 375x812 (ngâm → hấp → bán cao điểm → tổng kết); đo FPS lúc cao điểm

## 4. Đợt C - Đặt hàng nội bộ

- [ ] 4.1 Core `internalSupply.ts`: `internalSuppliers(state)`, tạo/hủy đơn, trạng thái, tính giá vốn + phí xe, bút toán `internal_transfer`; test đơn đủ, thiếu, hủy
- [ ] 4.2 Đơn định kỳ: sinh đơn mỗi sáng, tự tạm dừng sau 3 lần `short`; dọn đơn cũ sau 7 ngày; test
- [ ] 4.3 `BranchShipment.arriveMinute`; giao xôi gói lúc 7h cùng ngày vào `holding` tạp hóa; `pullFromStore` kéo nguyên liệu từ kho tạp hóa (FEFO) tới sáng hôm sau; test giữ hạn dùng
- [ ] 4.4 UI Nhập hàng: mối "Tiệm xôi nhà mình" / "Tạp hóa nhà mình" có số lượng khả dụng, năng lực làm/ngày, công tắc đặt định kỳ
- [ ] 4.5 UI tiệm xôi: bảng Đơn nội bộ (giờ chở, đã lấp/cần), nút "Giao cho đơn" sau khi làm món gói
- [ ] 4.6 Ghi chú buổi sáng ở tiệm nhận khi giao thiếu hoặc đơn định kỳ bị tạm dừng
- [ ] 4.7 Kiểm thử đặt và nhận đơn hai chiều trên màn hình điện thoại 375x812

## 5. Đợt C - Thợ nấu xôi và mô phỏng sản xuất

- [ ] 5.1 Vai trò Thợ nấu xôi trong `staff.json` (mở L31, miễn lương 3 ngày đầu); AI khi đứng chơi: ngâm, hấp, ưu tiên đơn nội bộ (có công tắc tắt ưu tiên)
- [ ] 5.2 Core `simulateProductionDay` tất định chạy đầu ngày cho tiệm `production` vắng chủ (hỏng/hấp mẻ, năng lực theo thợ, lấp đơn trước, bán lẻ, tự ngâm cho mai, lương, 50% EXP); test cùng seed ra cùng kết quả, không có thợ thì không sản xuất
- [ ] 5.3 `simulateBranches` rẽ nhánh theo `sim` của loại tiệm; tạp hóa vắng chủ bán `floor(qty × efficiency)` xôi gói được giao, phần còn lại hỏng; test chuỗi hỗn hợp
- [ ] 5.4 Thu nhập offline nhiều ngày chạy lặp mô phỏng sản xuất; test 100 ngày × 5 tiệm dưới 200 ms
- [ ] 5.5 Tổng kết: hộp tiệm xôi (làm/bán/giao/hỏng) và dòng chi phí nội bộ ở tạp hóa; cảnh báo "không có thợ" trên bản đồ
- [ ] 5.6 Kiểm thử chơi ở tạp hóa 3 ngày với tiệm xôi vắng chủ và đơn định kỳ trên màn hình điện thoại 375x812

## 6. Cân bằng và phát hành

- [ ] 6.1 Mở rộng `npm run playtest` với kịch bản chuỗi có tiệm xôi; mục tiêu lãi tiệm xôi ≈ 60–80% chi nhánh Chợ, đơn định kỳ tăng lãi tạp hóa 5–10%, hàng hỏng < 10%
- [ ] 6.2 Test so sánh mô phỏng vắng chủ với playtest đứng chơi cùng seed, sai lệch không quá 20%
- [ ] 6.3 Cập nhật `openspec/STATUS.md` và tài liệu thêm loại cửa hàng bằng JSON (`docs/shop-types-json.md`)
- [ ] 6.4 Chơi thử trên điện thoại thật (migrate bản lưu v5 có chi nhánh, mở tiệm xôi, một tuần game), rồi deploy và thu phản hồi
