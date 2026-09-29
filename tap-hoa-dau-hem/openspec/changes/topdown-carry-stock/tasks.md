## 0. Điều kiện trước

- [ ] 0.1 `topdown-store-view` 4.3 đã chơi thử bằng người thật; ghi lại cảm nhận về tốc độ nạp kệ hiện tại
- [ ] 0.2 `landscape-responsive-layout` D12 đã có ô hotbar Nhập hàng và điện thoại bàn (hoặc làm tạm lối vào tương đương ở bản dọc)

## 1. Core cầm hàng

- [x] 1.1 `balance.json › topDown.carry` (`carryStacks` 2, `carryUnitsPerStack` 20); `settings.carryStock?`, `settings.orderAtPhone?` trong `Settings`
- [x] 1.2 `src/core/carry.ts`: `carryAvailable` (kho trừ phần đang cầm), `pickUp`, `dropStack`, giới hạn số loại và số món; test
- [x] 1.3 `DaySession.carrying` và trường tùy chọn `carrying?` trong snapshot; snapshot cũ thiếu trường thì tay không; test lưu/đọc
- [x] 1.4 `DaySession.startRefillFromHand(shelf, slot, productId)`: dùng task `refill:r:c` như `startRefill`, khi xong lấy từ kho tối đa min(chỗ trống, đang cầm, kho còn) theo lô; trừ số đang cầm; test cả trường hợp kho bị nhân viên lấy bớt
- [ ] 1.5 Bày vào ô trống từ tay (chặn số lượng theo số đang cầm, dùng `placeError` như `assignSlot`); test
- [ ] 1.6 Xóa tay cầm khi hết ngày/đóng tiệm; test không đổi `state.warehouse`, `holding` và sức chứa kho qua cả vòng lấy → hết ngày
- [ ] 1.7 Xác nhận `startRefill`, `autoRefill`, nhân viên và góc ngang không đổi hành vi (chạy lại test hiện có)

## 2. Giao diện cầm hàng (góc trên xuống)

- [ ] 2.1 Điểm lấy hàng: kệ kho gần nhất hoặc quầy; bảng lấy hàng với "+1 thùng", bộ đếm, "Lấy hàng cho kệ thiếu", "Cất lại"
- [ ] 2.2 Bảng nạp kệ khi bật `carryStock`: chỉ ô cùng món đang cầm và ô trống hợp lệ; tay không thì nhắc và có nút đi tới điểm lấy hàng; ẩn "Nạp cả khu"
- [ ] 2.3 Nhân vật bê thùng khi đang cầm (sprite thùng trên tay, đổi theo hướng đi); ô "Tay cầm" ở đầu hotbar hiện món và số lượng từng stack
- [ ] 2.4 Xóa tay cầm khi đổi góc nhìn hiệu lực sang ngang (kể cả do xoay máy) hoặc tắt tùy chọn; toast ngắn "Đã cất hàng lại kho"
- [ ] 2.5 Mục "Chế độ tự tay" trong menu Tạm dừng với hai công tắc; hướng dẫn một lần khi bật lần đầu (gợi ý đặt kệ kho gần khu kệ, thuê nhân viên nạp kệ)

## 3. Đặt hàng tại điện thoại

- [ ] 3.1 Khi bật `orderAtPhone` và đang ở xa: lối vào Nhập hàng (hotbar, nút 📦, menu Tạm dừng) cho nhân vật tự đi về quầy rồi gọi `openRestock()`; chạm chỗ khác thì hủy
- [ ] 3.2 Tiệm xôi: màn Bếp từ hotbar đi tới trạm bếp gần nhất theo cùng cách
- [ ] 3.3 Kiểm tra buổi sáng, góc ngang và phiên chơi chung không bị ảnh hưởng

## 4. Cân bằng

- [ ] 4.1 Tổng quát hóa `playerTripSeconds` thành thời gian đi giữa hai fixture; test
- [ ] 4.2 `compare:views` thêm chế độ `carry` (bot lấy hàng ở điểm lấy hàng, bày nhiều kệ mỗi chuyến, về quầy); báo cáo ba chế độ cùng seed
- [ ] 4.3 Chạy tiệm nhỏ 10/20 ngày, tiệm lớn 20 ngày, có và không có kệ kho đặt xa; ghi bảng kết quả vào design
- [ ] 4.4 Nếu chưa đạt tiêu chí D7: chỉnh `carryUnitsPerStack`, rồi `carryStacks`, cuối cùng mới xem `awayPatienceRate`; chạy lại

## 5. Kiểm thử và phát hành

- [ ] 5.1 Chơi thử trên trình duyệt ở 375×667 (dọc, góc trên xuống) và 812×375 (ngang): lấy hàng, bày ô cùng món, bày ô trống, tay không, cất lại, xoay máy khi đang cầm, đặt hàng từ xa, hủy giữa đường
- [ ] 5.2 Tải lại giữa ngày khi đang cầm hàng; đồng bộ cloud rồi tải trên máy khác
- [ ] 5.3 `npm run build` và `npm test`
- [ ] 5.4 Chơi thử bằng người thật; quyết định có đề xuất bật mặc định `carryStock` trong change sau hay không
