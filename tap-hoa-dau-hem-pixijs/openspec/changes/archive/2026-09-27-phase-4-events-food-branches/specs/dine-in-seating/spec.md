## ADDED Requirements

### Requirement: Bàn ghế ăn tại chỗ
Từ level 23, người chơi SHALL đặt bàn 2 chỗ (1x1) và 4 chỗ (2x1) trên Đất E/F; khách mua đồ ăn hoặc nước có 50% ngồi lại ăn nếu còn chỗ.

#### Scenario: Khách ngồi lại
- **WHEN** khách mua trà tắc và có bàn trống
- **THEN** khách ngồi 10–20 giây game, sau đó rời đi và bàn chuyển sang trạng thái bẩn

#### Scenario: Gọi thêm
- **WHEN** khách đang ngồi
- **THEN** với xác suất 30% khách gọi thêm 1 món từ góc đồ ăn hoặc quầy nước

### Requirement: Dọn bàn
Bàn bẩn MUST không có khách ngồi cho tới khi được dọn bằng cách người chơi chạm vào hoặc nhân viên bổ sung kệ dọn.

#### Scenario: Bàn bẩn lâu
- **WHEN** tất cả bàn đều bẩn
- **THEN** khách mua đồ ăn mang đi và không gọi thêm
