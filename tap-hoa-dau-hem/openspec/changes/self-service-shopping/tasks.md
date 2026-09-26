## 1. Chuẩn bị

- [x] 1.1 Kiểm tra trạng thái working tree và xác định các thay đổi có sẵn cần giữ nguyên trước khi sửa; không gộp hoặc ghi đè thay đổi ngoài change này
- [x] 1.2 Chạy `npm test` và `scripts/playtest.ts` lấy số liệu nền (lãi/ngày, tốc độ lên level, số khách/ngày) để so sánh sau khi đổi

## 2. Dữ liệu và trạng thái

- [x] 2.1 `balance.json`: thêm `maxShoppers`, `zoneWalkSeconds`, `pickSeconds`, `shopBudgetFactor`, `zoneLowThreshold`, `zoneCriticalThreshold`, `zoneRefillSecondsPerSlot`, `scanComboSeconds`, `scanTipBonus`, `counterSlots`, `counterCapacity`, `counterRequestSeconds`, `counterWrongPenalty` (đổi tên từ `wrongPickPenalty`)
- [x] 2.2 `products.json`: thêm nhóm `counter` và 3 món `behindCounter` (thẻ cào, gas mini, bật lửa); `data.ts` cập nhật kiểu `Category`, kiểm tra dữ liệu (món sau quầy không có kệ, giá bán ≥ giá nhập); test dữ liệu
- [x] 2.3 `levels.json`: thêm `counterUnlock` (level 3) và `customers.json`: thêm `counterRequestChance` theo kiểu khách
- [x] 2.4 `state.ts`: thêm `zones` cho kệ, `counter: Slot[]`, `settings.autoScan`; `createNewGame()` và kiểu `DayStats` cập nhật; test
- [x] 2.5 `save.ts`: nâng `CURRENT_VERSION` lên 2, viết `migrations[1]` (gán khu, trả hàng sai khu về kho, tạo `counter`, `autoScan=false`); test với bản lưu v1 thật (kệ một nhóm, kệ lẫn nhóm, giữa ngày)

## 3. Khu hàng và kho (core)

- [x] 3.1 `stock.ts`: `zoneOf(state, shelf)`, `assignSlot` kiểm tra đúng khu (trả lỗi `wrong-zone`), tự gắn/gỡ khu; test đặt đúng/sai khu, kệ trống nhận khu
- [x] 3.2 `stock.ts`: `zoneFill(state, zone)` và mức cảnh báo (ok/low/critical); test ngưỡng
- [x] 3.3 `stock.ts`: cập nhật "Tự bày" tôn trọng khu (ưu tiên món chưa có ô, gán khu cho kệ trống); test ca khu kín có món mới
- [x] 3.4 `stock.ts`: `assignCounterSlot`, `refillCounterSlot` cho hàng sau quầy, từ chối món thường; test
- [x] 3.5 Kiểm thử thủ công màn hình xếp kệ trên 375x812 sau khi nối UI ở nhóm 8: nhập hàng và "Tự bày" đặt đúng khu (26/09/2026)

## 4. Khách tự chọn hàng (core)

- [x] 4.1 `customers.ts`: mở rộng `Customer` (`status` mới `entering/browsing/waiting/scanning/paying/done`, `browseIndex`, `shopBudget`, `basketMissing`), `OrderLine` thêm `scanned`, `missing`, `counterLine`; giữ `generateOrder` (loại món sau quầy khỏi danh sách tự chọn) và thêm sinh dòng hàng sau quầy theo xác suất
- [x] 4.2 `day.ts`: quản lý danh sách khách đang duyệt (`maxShoppers`) và hàng chờ quầy; sinh khách chỉ khi còn chỗ; test giới hạn số khách
- [x] 4.3 `day.ts`: tick duyệt khu (đi + lấy), `takeFromShelf`, phát `customerBrowse/itemTaken/itemMissing`; nhiều khách tranh hàng theo thứ tự; test lấy đủ, hết hàng một phần, hết cả giỏ, hai khách một món
- [x] 4.4 `day.ts`: kiên nhẫn chỉ hao từ `waiting`, chuyển `waiting → scanning` khi tới lượt, khách bỏ về trả giỏ lại kệ/kho; test kiên nhẫn không giảm khi đang duyệt và giỏ trả về
- [x] 4.5 `day.ts`: `refillZone(zone)` nạp tuần tự theo `zoneRefillSecondsPerSlot`; test tổng thời gian và trường hợp kho thiếu
- [x] 4.6 Xóa `pick`, `PickResult`, `wrongPick`, `wrongPickPenalty`, cập nhật `DayEvents`; sửa `tests/day.test.ts` theo luật mới và test mô phỏng cả ngày (không lỗi, tiền/kho nhất quán)

## 5. Quét hàng và thối tiền (core)

- [x] 5.1 `day.ts`: `scanItem(productId)`, `scanAll()`, cập nhật `orderTotal` theo `scanned`; khi quét hết giỏ chuyển `paying` dùng lại `customerPayment`; test tổng tiền, thứ tự quét tùy ý, giỏ rỗng
- [x] 5.2 Tip combo quét nhanh (`scanComboSeconds`, `scanTipBonus`) trong `computeTip`, không cộng khi dùng `scanAll` hoặc `autoScan`; test các ca
- [x] 5.3 `autoScan`: tự quét khi tới lượt (không tip); test
- [x] 5.4 Xác nhận `giveChange`, `autoChange`, `completeSale` vẫn đúng với giỏ mới (doanh thu, vốn, EXP, `sold`); test hồi quy

## 6. Hàng sau quầy (core)

- [x] 6.1 `day.ts`: `counterRequest` cho khách ở `scanning`, đếm ngược `counterRequestSeconds`, phát `counterRequested/counterServed/counterExpired`; test phục vụ kịp, quá giờ, hết hàng
- [x] 6.2 `serveCounterRequest(slot)`: chạm đúng ô thì trừ hàng và thêm dòng vào giỏ, chạm sai thì kiên nhẫn -`counterWrongPenalty`; test
- [x] 6.3 Mở khóa theo level (không xin trước level 3); test không sinh yêu cầu ở level 1–2

## 7. Cân bằng lõi

- [x] 7.1 Cập nhật `scripts/playtest.ts` (người chơi giả: nạp khu khi vơi, quét hàng, phục vụ hàng sau quầy) và `scripts/_diag.ts` nếu còn dùng
- [x] 7.2 Chạy mô phỏng 7 ngày, chỉnh `balance.json` để lãi/ngày và tốc độ lên level khớp mục tiêu Phase 1 (L4 sau 5–7 ngày); ghi kết quả vào design (Open Questions)
- [x] 7.3 Chạy toàn bộ `npm test`, sửa test lỗi

## 8. Giao diện

- [x] 8.1 `ShopScene`: nền tiệm hai hàng kệ có nhãn khu, thanh mức đầy và nhấp nháy vàng/đỏ theo cảnh báo; nút "Nạp cả khu" cho từng khu; chạm ô vơi để nạp như cũ
- [x] 8.2 `ShopScene`: sprite khách đi cửa → khu → quầy bằng tween khớp timer core, bong bóng "Hết!" và biểu cảm buồn khi thiếu hàng
- [x] 8.3 Quầy: chip giỏ khách (icon × số lượng còn cần quét), chạm để quét, nút "Quét hết", hiệu ứng "bíp" và tổng tiền cập nhật
- [x] 8.4 Hàng sau quầy: 4 ô cạnh quầy, bong bóng "Cho em <món>" với thanh thời gian, ô đúng nhấp nháy, rung khi chạm sai
- [x] 8.5 `MorningScene`: kệ theo khu, thông báo "Sai khu" khi kéo sai, tab "Sau quầy" (ẩn trước level 3), "Tự bày" tôn trọng khu
- [x] 8.6 Cài đặt "Tự quét" ở menu tạm dừng và màn tiêu đề; `HowToScene` cập nhật các trang theo spec `game-shell`; popup mở khóa "Hàng sau quầy" ở level 3
- [x] 8.7 Cập nhật tổng kết ngày: món bị bỏ lỡ tính theo khách tìm không thấy, hiển thị khu hay hết hàng
- [x] 8.8a Kiểm tra màn tiêu đề, màn tiệm và tổng kết không bị cắt trên viewport 375x812 (smoke test browser, 26/09/2026)
- [x] 8.8b Kiểm tra thao tác chạm "Quét hết" ở 375x812 cập nhật đơn và chuyển khách tiếp theo (26/09/2026)
- [ ] 8.8c Kiểm tra chạm nạp khu/hàng sau quầy và đạt 60fps với 3 khách duyệt + 3 khách chờ trên điện thoại

## 9. Hoàn thiện và ghi chú các phase sau

- [ ] 9.1 Chơi thử 1 ngày đầy đủ ở level 1, 3 và 4 trên điện thoại, ghi lại độ dễ theo dõi, có nhàm vì quét lặp không; điều chỉnh mặc định `autoScan` và các số cân bằng
- [x] 9.2 Đánh giá lại nhu cầu asset: icon 3 món sau quầy, nhãn khu, quầy có giỏ (thêm vào task 10.1 của Phase 1 nếu cần)
- [x] 9.3 Ghi chú vào Phase 2: `design.md` (kệ là nội thất có nhãn khu, khách đi theo A* tới khu, bỏ rủi ro "Cuộn camera xung đột với chạm lấy hàng"), `tasks.md` 2.7 và 8.2
- [x] 9.4 Ghi chú vào Phase 3: spec `staff-simulation` (Thu ngân chỉ quét, tính tiền, thối tiền và phục vụ hàng sau quầy, không lấy hàng), `shop-security` (kẻ trộm tự lấy hàng khỏi khu)
- [x] 9.5 Cập nhật `openspec/config.yaml` (lộ trình) thêm dòng `1a. self-service-shopping` và thống nhất với `add-google-login-cloud-save` về phiên bản lưu game
- [x] 9.6a Build production và tải lại game thành công khi máy chủ offline từ cache PWA (26/09/2026)
- [ ] 9.6b Deploy Vercel
