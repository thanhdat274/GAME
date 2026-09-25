## ADDED Requirements

### Requirement: Danh hiệu sau level 35
Sau level 35, EXP SHALL tiếp tục tích lũy; mỗi mốc trong `titles.json` cho một sao danh hiệu (+1% doanh thu toàn chuỗi, tối đa +30%) và một đồ trang trí xoay vòng.

#### Scenario: Đạt sao danh hiệu đầu tiên
- **WHEN** người chơi level 35 đạt mốc danh hiệu đầu tiên
- **THEN** HUD hiện "Chủ chuỗi ★1" và doanh thu toàn chuỗi +1%

#### Scenario: Chạm trần thưởng
- **WHEN** người chơi có 30 sao danh hiệu
- **THEN** các mốc sau chỉ cho trang trí, doanh thu không tăng thêm
