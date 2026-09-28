## ADDED Requirements

### Requirement: Đơn qua điện thoại
Từ level 18, điện thoại bàn SHALL reo ngẫu nhiên trong ngày với đơn 3–8 món, địa chỉ trong hẻm, phí ship và hạn giao 1–2 giờ game; người chơi Nhận hoặc Từ chối.

#### Scenario: Nhận đơn
- **WHEN** người chơi nhận đơn của cô Hoa
- **THEN** đơn vào danh sách chờ giao và hàng được giữ riêng khỏi kệ

#### Scenario: Thiếu hàng
- **WHEN** đơn có món mà kho và kệ không đủ
- **THEN** nút "Nhận" bị vô hiệu và hiện món thiếu

### Requirement: Giao hàng
Đơn SHALL được giao bởi nhân viên giao hàng (xe máy rời tiệm và quay lại sau thời gian theo khoảng cách); người chơi không có nhân viên giao hàng thì có thể tự giao, khi đó quầy không có người trong thời gian đó.

#### Scenario: Giao đúng hạn
- **WHEN** đơn được giao trước hạn
- **THEN** nhận tiền đơn + phí ship và 5 sao

#### Scenario: Giao trễ
- **WHEN** đơn giao sau hạn
- **THEN** khách trả tiền nhưng không trả phí ship và ghi 2 sao
