## ADDED Requirements

### Requirement: Trộm vặt
Từ level 15, khoảng 3% khách SHALL là kẻ trộm: tự lấy 1–3 món từ khu hàng rồi đi thẳng ra cửa không qua quầy, theo cơ chế khách tự chọn hàng của Phase 1a.

#### Scenario: Bắt quả tang
- **WHEN** người chơi chạm vào kẻ trộm trong vòng 3 giây kể từ lúc hắn lấy hàng
- **THEN** kẻ trộm trả lại hàng, bồi thường gấp đôi giá trị và bỏ đi

#### Scenario: Để lọt
- **WHEN** kẻ trộm ra khỏi cửa
- **THEN** hàng bị mất và tổng kết ghi "Mất trộm: ..."

### Requirement: Nhân viên và camera phát hiện trộm
Nhân viên bổ sung kệ SHALL có 30% xác suất tự phát hiện trộm khi ở gần; camera an ninh (level 17) nâng xác suất phát hiện toàn tiệm lên 80%.

#### Scenario: Có camera
- **WHEN** tiệm có camera an ninh và kẻ trộm lấy hàng
- **THEN** với xác suất 80% chuông báo động kêu và kẻ trộm bị chặn lại
