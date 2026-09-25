## ADDED Requirements

### Requirement: Lịch trong game
Game SHALL có lịch 10 ngày/tháng, 12 tháng/năm; HUD hiện "Ngày D · Tháng M · Năm Y" và mùa hiện tại.

#### Scenario: Qua tháng
- **WHEN** ngày 10 tháng 3 kết thúc
- **THEN** ngày tiếp theo là ngày 1 tháng 4

### Requirement: Hệ số theo mùa
Mỗi mùa SHALL áp hệ số nhu cầu theo nhóm hàng từ dữ liệu (mặc định hè: đồ uống lạnh ×1.8, kem ×2; đông: mì gói ×1.3).

#### Scenario: Mùa hè
- **WHEN** đang tháng 6
- **THEN** khách yêu cầu đồ uống lạnh nhiều hơn khoảng 80% so với mùa xuân

### Requirement: Xem lịch
Màn Lịch SHALL hiện tháng hiện tại, các sự kiện theo mùa sắp tới và sự kiện ngẫu nhiên đã báo trước.

#### Scenario: Chuẩn bị Tết
- **WHEN** người chơi mở Lịch vào tháng 12
- **THEN** thấy "Tết: bắt đầu ngày 1 tháng 1" kèm danh sách hàng Tết nên nhập
