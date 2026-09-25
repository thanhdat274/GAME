## Why

Vòng bán hàng của Phase 1 hiện là "khách đứng ở quầy đọc yêu cầu, người chơi chạm ô kệ để nhặt từng món". Nó chạy được nhưng không giống một tiệm tạp hóa thật (khách tự đi chọn đồ), và làm thao tác chính của người chơi chỉ là phản xạ chạm kệ, trong khi các phase sau (nhân viên, khách nhiều món, xe đẩy, kẻ trộm lấy hàng khỏi kệ) đều giả định khách tự lấy hàng. Đổi sớm, khi lõi mới ở Phase 1 và Phase 2–4 chưa code, rẻ hơn nhiều so với đổi sau.

## What Changes

- Khách vào tiệm rồi **tự đi qua các khu hàng, tự lấy đồ vào giỏ**, sau đó ra quầy xếp hàng tính tiền. Người chơi không còn chạm ô kệ để nhặt hàng cho khách.
- Kệ chia **khu theo nhóm hàng** (đồ khô / ăn vặt / đồ dùng): mỗi kệ có một khu, chỉ bày được món đúng nhóm. Khu vơi hoặc hết hàng có cảnh báo, người chơi phải nạp gấp (thêm nút "Nạp cả khu").
- Khách đi tới khu mà món đã hết thì **bỏ món đó** (ghi vào "nhu cầu bị bỏ lỡ"), buồn và bị trừ sao; giỏ trống hoàn toàn thì bỏ về không mua.
- Ở quầy, người chơi **thấy giỏ khách và chạm từng món để quét tính tiền**; có nút "Quét hết" (không thưởng combo). Thối tiền giữ nguyên như Phase 1.
- Thêm **hàng sau quầy** (thẻ cào, gas mini...): khách không tự lấy được, hiện bong bóng "Cho em ...", người chơi chạm ô hàng sau quầy trong thời gian giới hạn.
- **BREAKING** (nội bộ Phase 1): bỏ `DaySession.pick(shelf, slot)`, trạng thái khách `picking`, sự kiện `customerFront/picked/wrongPick`; `GameState` thêm khu cho kệ và hàng sau quầy nên nâng phiên bản lưu game 1 → 2 (có migrate).
- Ghi chú chỉnh nhẹ cho Phase 2 (kệ là nội thất có nhãn khu; bỏ rủi ro cuộn camera xung đột với chạm lấy hàng) và Phase 3 (thu ngân chỉ quét, tính tiền, thối tiền; kẻ trộm khớp luôn với khách tự lấy hàng).

## Capabilities

### New Capabilities
- `back-counter`: Kho nhỏ sau quầy, danh mục hàng chỉ bán qua yêu cầu tại quầy và cơ chế phục vụ trong thời gian giới hạn.

### Modified Capabilities
- `customer-flow`: Khách tự đi chọn hàng (trạng thái browsing), giỏ hàng, xếp hàng ra quầy, xử lý hết hàng; bỏ yêu cầu "Lấy hàng cho khách" bằng chạm.
- `shelf-display`: Kệ chia khu theo nhóm hàng, kiểm tra đúng khu khi bày, cảnh báo khu vơi, nạp cả khu; "Kệ trống làm mất khách" tính theo từng món khách không tìm thấy.
- `checkout-change`: Quầy hiện giỏ khách, quét từng món (hoặc "Quét hết") trước khi khách trả tiền; phần trả tiền và thối tiền giữ nguyên.
- `save-system`: Nâng phiên bản lưu lên 2, migrate bản lưu cũ (gán khu cho kệ theo món đang bày, tạo hàng sau quầy rỗng).
- `game-shell`: Cập nhật màn "Cách chơi" (khách tự chọn, quét hàng, hàng sau quầy).

## Impact

- Code: `src/core/day.ts` (máy trạng thái khách, bỏ `pick`), `src/core/customers.ts` (giỏ hàng, tiến độ duyệt khu), `src/core/stock.ts` (kiểm tra khu, nạp khu, hàng sau quầy), `src/core/state.ts` và `src/core/save.ts` (khu kệ, `counter`, migrate v2), `src/core/data.ts` (kiểm tra dữ liệu mới), `src/data/*.json` (`balance.json`, `products.json`, `levels.json`), `src/scenes/ShopScene.ts`, `MorningScene.ts`, `HowToScene.ts`, `src/ui/*` (khu kệ, giỏ khách), `scripts/playtest.ts`.
- Test: viết lại phần khách/lấy hàng trong `tests/day.test.ts`, thêm test khu kệ, quét hàng, hàng sau quầy, migrate save.
- Phụ thuộc: change `add-google-login-cloud-save` cũng đụng `save-system`; cần thống nhất phiên bản lưu (xem design).
- Cân bằng lại: số khách trong tiệm cùng lúc, thời gian duyệt khu, kiên nhẫn; chạy lại mô phỏng 7 ngày.
- Không đổi: nhập hàng buổi sáng, kho, thối tiền, EXP/level, tổng kết ngày, PWA.
