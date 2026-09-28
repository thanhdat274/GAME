## ADDED Requirements

### Requirement: Quy tắc đặt hàng
Từ level 16, người chơi SHALL tạo quy tắc "Khi tồn [món] dưới X thì nhập Y từ [mối sỉ]"; quy tắc chạy mỗi buổi sáng.

#### Scenario: Quy tắc kích hoạt
- **WHEN** buổi sáng tồn mì gói là 8 và có quy tắc "dưới 15 thì nhập 40 từ Cô Tư"
- **THEN** hệ thống tự mua 40 gói và ghi vào nhật ký "Tự nhập: 40 mì gói"

#### Scenario: Thiếu tiền
- **WHEN** tổng các đơn tự động vượt tiền đang có
- **THEN** thực hiện quy tắc theo thứ tự ưu tiên đến khi hết tiền và báo "Thiếu tiền nhập: ..."

### Requirement: Sơ đồ kệ
Người chơi SHALL chốt sơ đồ kệ (mỗi ô gắn một món); nhân viên kho và nhân viên bổ sung kệ MUST nạp hàng theo sơ đồ này.

#### Scenario: Hàng mới về
- **WHEN** hàng tự động nhập vào kho và nhân viên kho có ca
- **THEN** nhân viên kho bày hàng vào các ô trống theo sơ đồ trước giờ mở cửa

### Requirement: Gợi ý quy tắc
Màn Quy tắc SHALL gợi ý ngưỡng và số lượng dựa trên trung bình bán 7 ngày gần nhất.

#### Scenario: Gợi ý cho nước suối
- **WHEN** nước suối bán trung bình 20 chai/ngày
- **THEN** gợi ý "dưới 20 thì nhập 40"
