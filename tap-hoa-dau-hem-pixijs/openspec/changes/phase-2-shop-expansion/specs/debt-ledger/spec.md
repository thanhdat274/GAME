## ADDED Requirements

### Requirement: Cho ghi sổ
Khi khách ghi sổ (mở ở level 7) tính tiền, người chơi SHALL chọn "Cho nợ" hoặc "Không cho"; cho nợ thì khách lấy hàng không trả tiền và khoản nợ được ghi với hạn 3 ngày.

#### Scenario: Cho nợ
- **WHEN** chú Sáu mua 35.000đ và người chơi chọn "Cho nợ"
- **THEN** sổ nợ thêm dòng "Chú Sáu · 35.000đ · hạn ngày N+3" và khách vui

#### Scenario: Không cho
- **WHEN** người chơi chọn "Không cho"
- **THEN** khách bỏ về, không mua, ghi 2 sao

#### Scenario: Vượt hạn mức
- **WHEN** tổng nợ sau khoản mới vượt 20% tiền mặt
- **THEN** nút "Cho nợ" bị vô hiệu và hiện "Sổ nợ đã đầy"

### Requirement: Trả nợ
Mỗi ngày, khách đang nợ SHALL có xác suất ghé trả nợ (mặc định 80% trả đúng hạn, 15% trả trễ, 5% quỵt sau 7 ngày).

#### Scenario: Khách trả nợ
- **WHEN** chú Sáu tới trả nợ
- **THEN** tiền tăng 35.000đ, dòng nợ được gạch và có hiệu ứng "Trả nợ"

#### Scenario: Quỵt nợ
- **WHEN** khoản nợ quá 7 ngày chưa trả
- **THEN** khoản đó chuyển thành "nợ khó đòi" và ghi tổn thất

### Requirement: Nhắc nợ
Khi khách đang nợ quá hạn tới tiệm, người chơi SHALL có thể bấm "Nhắc nợ" để tăng xác suất trả trong 2 ngày tới.

#### Scenario: Nhắc nợ đúng lúc
- **WHEN** người chơi nhắc chú Sáu đã quá hạn
- **THEN** xác suất trả trong 2 ngày tới tăng lên 95%

#### Scenario: Nhắc khi chưa tới hạn
- **WHEN** người chơi nhắc một khoản chưa tới hạn
- **THEN** khách phật ý và sao tiệm ghi 2 sao cho khách đó
