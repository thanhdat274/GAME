## 1. Đợt A - Nền: truy cập tiệm bất kỳ, loại cửa hàng, bản lưu v6

- [x] 1.1 Core: kiểu `StoreData` + `storeView(state, storeId)` trả state khi là tiệm đang đứng và snapshot đã gõ kiểu khi là tiệm khác; test đọc/ghi kho tiệm không đứng rồi `activateStore` thấy thay đổi
- [x] 1.2 Chuyển `takeLots`/thêm lô, `prepareRecipe`, `expirePreparedFood` sang nhận `StoreData`; 277 test cũ vẫn xanh (nay 441 test)
- [x] 1.3 `shopTypes.json` (`grocery`, `xoi`) + `shopTypes.ts` (`shopTypeOf(store)`, `ShopTypeBehavior`) + trình kiểm tra dữ liệu gộp vào `validate:recipes`; test tham chiếu sai bị báo lỗi — `xoi` mới tham chiếu nội thất/khách có sẵn; xửng hấp, thùng ngâm, món xôi thêm ở 2.1–2.5
- [x] 1.4 `StoreSnapshot.shopType`; `branches.json` thêm trường `shopType` và mục `xoi` (L29, 700.000đ, layout mặc định có 1 bàn 2 chỗ); `openBranch` dùng layout và loại tiệm; giới hạn chuỗi đọc từ `balance.json › chain.maxStores` = 6 (sửa cả thông báo ở `BranchesScene`); test — khu `xoi` khóa bằng tính năng `shop_xoi` (thêm vào L29 ở 2.1) nên đợt A chưa hiện với người chơi
- [x] 1.5 Bản lưu v6: `internalOrders`, `recurringOrders`, `soakBatches`, `cookedRice` (thêm vào `STORE_KEYS`); `migrate_5_to_6` + fixture v5 có 3 tiệm; sao lưu `save_backup_v5`; test kích thước < 1 MB với 6 tiệm — bản trước migrate giữ qua `thdh.save.premigrate` (14 ngày) có sẵn, không thêm khóa `save_backup_v5` riêng
- [x] 1.6 Lọc màn Sắp xếp, Nhập hàng, Kệ theo loại tiệm; kiểm thử trên màn hình điện thoại 375x812 rằng tạp hóa và chi nhánh cũ không đổi — lọc qua `unlockedProducts` và `buyFixture`/catalog Sắp xếp; chạy bản build ở 375×812 với bản lưu v5 3 tiệm: màn Buổi sáng và Nhập hàng tạp hóa như cũ

## 2. Đợt B - Tiệm xôi: nguyên liệu, ngâm, hấp, món

- [x] 2.1 `products.json`: nếp, đậu xanh, hành phi, chà bông, lạp xưởng, dừa nạo, bao gói (mở L29) và thành phẩm `xoi_*_tp`, `xoi_*_goi`; `levels.json` L29 thêm `shop_xoi` và đổi nhãn — trà đá thêm mới, sữa đậu nành dùng mặt hàng có sẵn; `nep_chin` là mặt hàng ảo (recipeOnly) để tính giá vốn
- [x] 2.2 `balance.json › stickyRice` (thời gian ngâm tối thiểu/tối đa, kg → phần, phút giữ nóng, trừ chất lượng nếp nguội)
- [x] 2.3 Core `stickyRice.ts`: đặt mẻ ngâm, kiểm tra sẵn sàng/hỏng, hấp mẻ ra `cookedRice`, giữ nóng/nguội, hỏng cuối ngày; test từng trạng thái — `tests/stickyRice.test.ts`
- [x] 2.4 `recipes.json`: xôi đậu xanh, xôi mặn, xôi trứng, xôi dừa + biến thể "Thêm topping" + đầu ra gói; `prepareRecipe` lấy nguyên liệu ảo `nep_chin` từ `cookedRice` (mẻ cũ nhất trước); test thiếu topping, nếp nguội — biến thể có `extraIngredients`; xôi gói là 4 công thức `*_goi` có `packaged: true`
- [x] 2.5 Nội thất `furniture.json`: thùng ngâm, xửng hấp, quầy trưng bày xôi (footprint riêng 1×1); layout mặc định tiệm xôi có quầy thu ngân, thùng ngâm, xửng hấp, quầy trưng bày và bàn 2 chỗ

## 3. Đợt B - Tiệm xôi: khách, mini-game, màn chơi

- [x] 3.1 `customers.json` + `shopTypes.json`: khách người đi làm/học sinh/công nhân, đường cong mật độ cao điểm 5h–10h; `DaySim` đọc mật độ và luồng "gọi món ở quầy" từ `ShopTypeBehavior`; test mật độ 6h30 > 14h — dùng lại khách văn phòng/học sinh/công nhân có sẵn; tiệm xôi mở cùng giờ chung 8h–20h nên cao điểm đặt 8h–10h (không phải 5h–10h); khách gọi 1–3 món, phục vụ lần lượt
- [x] 3.2 `ShopScene` chế độ tiệm xôi: khách xếp hàng ở quầy, bong bóng gọi món, giao món từ quầy; không có đi kệ — dùng lại ShopScene: khách không đi kệ, xếp hàng gọi món ở quầy; bảng tạm dừng có "🍙 Bếp xôi"; mở cửa kiểm tra món/quầy thay cho kệ trống
- [x] 3.3 `XoiPrepPanel`: thùng ngâm (đặt kg, đồng hồ), xửng hấp (nút hấp), bộ đếm nếp chín và đồng hồ giữ nóng — nằm trong màn Bếp xôi (buổi sáng và giữa giờ bán); đã xem trên trình duyệt 375×812: ngâm 1/5 kg, danh sách mẻ + đồng hồ, nút Hấp
- [x] 3.4 Mini-game hấp (giữ lửa trong vùng xanh) trong `KitchenScene`; chất lượng ghi vào mẻ — giữ nút lửa, thanh độ chín theo `stickyRice.steamSeconds`; chưa chơi thử được vì trình duyệt nhúng chỉ 1 FPS
- [x] 3.5 Mini-game múc và rắc topping theo thứ tự, và mini-game gói lá/hộp — múc nếp rồi rắc topping bằng chế độ chạm theo thứ tự có sẵn; món gói thêm 3 lần vuốt (có nút mũi tên dự phòng); chưa chơi thử (1 FPS)
- [x] 3.6 Bàn ghế ở tiệm xôi: `dineInChance`, đồ uống kèm (trà đá, sữa đậu nành trong `products.json`), khách chọn ngồi/mang đi, bàn bẩn và dọn bàn dùng `dining.ts`; hết bàn thì đổi sang mang đi; test — đồ uống kèm lấy thẳng từ kho khi khách vừa ngồi; tạp hóa giữ tỉ lệ ngồi 100% như cũ
- [x] 3.7 Khu Tiệm xôi trên `BranchesScene`; Bản đồ mở từ `shop_xoi` hoặc `branches` và chỉ hiện khu đủ level + hướng dẫn ngâm nếp một lần vào sáng hôm sau khi mở; nút "Ngâm cho mai" ở tổng kết — Bản đồ ở L29 chỉ hiện Tiệm chính + Tiệm xôi; mẻ ngâm khởi đầu 3 kg + ghi chú buổi sáng; hướng dẫn ngâm/hấp khi mở Bếp xôi lần đầu; nút "Ngâm N kg cho mai" ở tổng kết
- [x] 3.8 `KitchenScene` lọc menu theo loại tiệm: tạp hóa không có món xôi và hiện gợi ý đặt từ tiệm xôi; test
- [ ] 3.9 Chơi thử một ngày tiệm xôi trên màn hình điện thoại 375x812 (ngâm → hấp → bán cao điểm, có khách ngồi ăn và dọn bàn → tổng kết); đo FPS lúc cao điểm — luồng một ngày headless đã có test, viewport/FPS điện thoại chưa đo

## 4. Đợt C - Đặt hàng nội bộ

- [x] 4.1 Core `internalSupply.ts`: sinh mối từ `supplies`/`sourcesFrom`, tạo/hủy đơn, trạng thái, giá vốn + phí xe và báo giá vốn chuyển nội bộ riêng; không cần `truck`; test đủ, thiếu, hủy
- [x] 4.2 Đơn định kỳ: sinh đơn mỗi sáng, tự tạm dừng sau 3 lần `short`; dọn đơn cũ sau 7 ngày; test
- [x] 4.3 Giao xôi gói vào ô sau quầy riêng tạp hóa lúc 7h trước giờ mở; kéo nguyên liệu từ kho tạp hóa theo FEFO tới sáng hôm sau, giữ hạn dùng; hỗ trợ `BranchShipment.arriveMinute`; test
- [x] 4.4 UI Nhập hàng: mối "Tiệm xôi nhà mình" / "Tạp hóa nhà mình" có số lượng khả dụng, năng lực làm/ngày, công tắc đặt định kỳ; truy cập từ tab Nhập hàng
- [x] 4.5 UI tiệm xôi: bảng Hàng nhà mình hiển thị giờ giao và số đã lấp/cần; nút "Giao ... cho đơn" gom món gói ở quầy vào đơn
- [x] 4.6 Ghi chú buổi sáng ở tiệm nhận khi giao thiếu hoặc đơn định kỳ bị tạm dừng
- [ ] 4.7 Kiểm thử đặt và nhận đơn hai chiều trên màn hình điện thoại 375x812 — core test hai chiều qua; đã mở UI Hàng nhà mình trên trình duyệt nhưng chưa đặt/nhận đơn bằng UI ở viewport yêu cầu

## 5. Đợt C - Thợ nấu xôi và mô phỏng sản xuất

- [x] 5.1 Vai trò Thợ nấu xôi L29, miễn lương 3 ngày đầu; thợ tự ngâm/hấp, ưu tiên đơn nội bộ; có công tắc tắt ưu tiên
- [x] 5.2 `simulateProductionDay` tất định cho tiệm `production` vắng chủ: mẻ ngâm/hấp, năng lực, ưu tiên đơn, bán lẻ/đồ uống, ngâm cho mai, lương và 50% EXP; test cùng seed và trường hợp thiếu thợ
- [x] 5.3 `simulateBranches` rẽ theo `sim`; tạp hóa vắng chủ bán phần xôi gói theo hiệu suất, phần còn lại hỏng; test chuỗi hỗn hợp
- [x] 5.4 Thu nhập offline nhiều ngày chạy lặp mô phỏng sản xuất; benchmark test 100 ngày × 6 tiệm dưới 200 ms khi chạy riêng
- [x] 5.5 Báo cáo chuỗi có làm/bán/giao/hỏng, giá vốn hàng nội bộ nhận; Bản đồ cảnh báo khi thiếu thợ
- [ ] 5.6 Kiểm thử chơi ở tạp hóa 3 ngày với tiệm xôi vắng chủ và đơn định kỳ trên màn hình điện thoại 375x812 — kịch bản headless 3 ngày qua; kiểm thử UI/viewport vẫn cần làm

## 6. Cân bằng và phát hành

- [x] 6.1 Mở rộng `npm run playtest` với kịch bản chuỗi có tiệm xôi; mục tiêu lãi tiệm xôi ≈ 60–80% chi nhánh Chợ, đơn định kỳ tăng lãi tạp hóa 5–10%, hàng hỏng < 10%, người chơi dùng "Gợi ý" vẫn mở được chi nhánh Chợ sau khi mở tiệm xôi — `npm run playtest -- 10 3 chain`: tạp hóa L30 đứng chơi bằng Gợi ý, tiệm xôi 2 thợ vắng chủ, đơn 6 xôi gói/ngày; 3 và 6 seed đều đạt: xôi 62% Chợ, tạp hóa +6–8%, hỏng 6%, đủ tiền mở Chợ (vốn giả định 3.000.000đ). Sửa kèm: năng lực thợ mô phỏng khớp đứng chơi (15 phần/thợ/ngày), tự ngâm theo nhu cầu thay vì số đã bán, giá mô phỏng theo chất lượng, `sourcedRequestChance` cho khách tạp hóa hỏi xôi gói
- [x] 6.2 Test so sánh mô phỏng vắng chủ với playtest đứng chơi cùng seed, sai lệch không quá 20% — seed 1010, cùng cấu hình tiệm xôi có 3 thợ: lãi mô phỏng 160.000đ, lãi đứng chơi 194.500đ, sai lệch 17.7% (sau khi chỉnh năng lực thợ ở 6.1; trước đó hai bên khớp vì cả hai tình cờ ra ~45 phần)
- [x] 6.3 Cập nhật `openspec/STATUS.md` và tài liệu thêm loại cửa hàng bằng JSON (`docs/shop-types-json.md`)
- [ ] 6.4 Chơi thử trên điện thoại thật (migrate bản lưu v5 có chi nhánh, mở tiệm xôi, một tuần game), rồi deploy và thu phản hồi
