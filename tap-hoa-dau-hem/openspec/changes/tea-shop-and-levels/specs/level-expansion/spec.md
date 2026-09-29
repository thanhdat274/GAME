## ADDED Requirements

### Requirement: Level 36–50
Bảng level SHALL kéo dài tới level 50 với EXP tăng dần, mỗi level có nhãn nêu thứ được mở khóa và số chỗ nhân viên không giảm.

#### Scenario: Bảng hợp lệ
- **WHEN** chạy `validateLevels`
- **THEN** không có lỗi, `maxLevel` bằng 50 và mốc EXP tăng dần

#### Scenario: Mỗi level mở thứ mới
- **WHEN** xem các level 36–50
- **THEN** mỗi level có ít nhất một tính năng, chỗ nhân viên tăng, hoặc mặt hàng/công thức mở khóa tại đúng level đó

### Requirement: Danh hiệu ở level tối đa
Hệ danh hiệu SHALL bắt đầu ở level tối đa hiện tại, sao tính từ EXP vượt mốc level đó, và giao diện SHALL đọc level tối đa từ dữ liệu.

#### Scenario: Chưa tới level tối đa
- **WHEN** người chơi ở level 49
- **THEN** số sao bằng 0 và màn danh hiệu ghi level cần đạt là 50

### Requirement: Thêm tiệm và giới hạn chuỗi
Hệ thống SHALL có thêm tiệm bánh kẹo (level 40) và siêu thị mini (level 45), có lô đất trên bản đồ phố, và giới hạn số cửa hàng đủ chứa mọi chi nhánh.

#### Scenario: Mở đủ chuỗi
- **WHEN** mở lần lượt mọi chi nhánh trong dữ liệu
- **THEN** không chi nhánh nào bị từ chối vì giới hạn và bản đồ phố hợp lệ
