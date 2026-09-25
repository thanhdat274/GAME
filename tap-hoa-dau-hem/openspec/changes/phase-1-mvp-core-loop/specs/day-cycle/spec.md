## ADDED Requirements

### Requirement: Các pha trong ngày
Mỗi ngày SHALL đi qua các pha theo thứ tự: Buổi sáng (nhập hàng + bày kệ, không giới hạn thời gian) → Mở cửa bán (08:00–20:00 game, mặc định 180 giây thật) → Tổng kết.

#### Scenario: Mở cửa
- **WHEN** người chơi bấm "Mở cửa" ở buổi sáng
- **THEN** đồng hồ game chạy từ 08:00 và khách bắt đầu tới

#### Scenario: Hết giờ
- **WHEN** đồng hồ tới 20:00
- **THEN** không sinh khách mới, các khách đang chờ vẫn được phục vụ xong, rồi chuyển sang Tổng kết

### Requirement: Tổng kết cuối ngày
Màn tổng kết SHALL hiển thị doanh thu, tiền vốn hàng đã bán, lãi gộp, tip, số khách hài lòng/bỏ về, sao trung bình, EXP nhận được và món bán chạy nhất.

#### Scenario: Ngày có lãi
- **WHEN** ngày kết thúc với doanh thu 150.000đ và vốn 110.000đ
- **THEN** màn tổng kết hiển thị lãi gộp 40.000đ màu xanh

#### Scenario: Sang ngày mới
- **WHEN** người chơi bấm "Ngày mới"
- **THEN** số ngày tăng 1, game được lưu và chuyển sang Buổi sáng

### Requirement: Chống kẹt vốn
Nếu người chơi hết tiền và hết hàng, hệ thống SHALL cho "Bà gửi tiền" 50.000đ một lần mỗi 3 ngày để không bị kẹt.

#### Scenario: Phá sản
- **WHEN** buổi sáng tiền < giá món rẻ nhất và kho, kệ đều trống
- **THEN** hiện thoại của bà và cộng 50.000đ
