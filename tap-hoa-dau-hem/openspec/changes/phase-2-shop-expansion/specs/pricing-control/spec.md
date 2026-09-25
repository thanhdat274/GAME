## ADDED Requirements

### Requirement: Chỉnh giá bán
Từ level 6, người chơi SHALL chỉnh giá bán từng món trong khoảng 80%–150% giá gợi ý, theo bước 500đ, ở pha Buổi sáng.

#### Scenario: Tăng giá snack
- **WHEN** người chơi đặt giá snack 12.000đ với giá gợi ý 10.000đ
- **THEN** giá mới áp dụng cho cả ngày và màn giá hiện "+20%"

#### Scenario: Ngoài khoảng cho phép
- **WHEN** người chơi cố đặt giá dưới 80% giá gợi ý
- **THEN** giá bị giữ ở mức 80%

### Requirement: Khách phản ứng với giá
Xác suất khách vẫn lấy một món SHALL giảm theo mức giá vượt giá gợi ý, với độ nhạy theo kiểu khách; khi từ chối, khách hiện bong bóng "Đắt quá!".

#### Scenario: Giá cao với học sinh
- **WHEN** snack giá 150% giá gợi ý và khách là học sinh
- **THEN** khách hầu như luôn bỏ món snack khỏi yêu cầu

#### Scenario: Giá rẻ
- **WHEN** giá trung bình toàn tiệm thấp hơn giá gợi ý
- **THEN** tốc độ sinh khách tăng tối đa 10%

### Requirement: Báo cáo giá
Tổng kết ngày SHALL liệt kê số lần khách chê giá theo từng món.

#### Scenario: Có món bị chê
- **WHEN** trong ngày có 6 lần khách chê giá nước ngọt
- **THEN** tổng kết hiện "Nước ngọt: 6 khách chê đắt"
