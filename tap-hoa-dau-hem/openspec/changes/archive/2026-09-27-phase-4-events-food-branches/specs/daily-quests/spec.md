## ADDED Requirements

### Requirement: Nhiệm vụ tuần
Từ level 27, mỗi 7 ngày game SHALL có 3 nhiệm vụ tuần lớn hơn (ví dụ bán 300 ly nước, phục vụ 50 khách ăn tại chỗ) với phần thưởng lớn hơn nhiệm vụ ngày.

#### Scenario: Hoàn thành nhiệm vụ tuần
- **WHEN** người chơi hoàn thành cả 3 nhiệm vụ tuần
- **THEN** nhận thêm hộp quà tuần chứa tiền và đồ trang trí ngẫu nhiên

### Requirement: Nhiệm vụ sự kiện
Trong sự kiện theo mùa, bảng nhiệm vụ SHALL có thêm tab nhiệm vụ sự kiện lấy từ `events.json`, cho điểm sự kiện.

#### Scenario: Nhiệm vụ Tết
- **WHEN** đang Tết
- **THEN** tab "Tết" có nhiệm vụ như "Bán 30 bao lì xì"

### Requirement: Đơn tiệc
Từ level 27, hàng xóm SHALL thỉnh thoảng đặt đơn tiệc số lượng lớn (ví dụ 50 ly trà tắc + 30 bánh mì) với hạn 1–2 ngày và thưởng cao; đơn tiệc có thể từ chối.

#### Scenario: Giao đơn tiệc đúng hạn
- **WHEN** người chơi chuẩn bị đủ đơn tiệc trước hạn
- **THEN** nhận tiền đơn + 30% thưởng và điểm thân thiết với khách đó
