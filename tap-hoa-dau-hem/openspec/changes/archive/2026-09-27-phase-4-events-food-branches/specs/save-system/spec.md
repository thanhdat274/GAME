## ADDED Requirements

### Requirement: Migrate bản lưu v4 lên v5 nhiều cửa hàng
Khi tải bản lưu version 4, hệ thống SHALL bọc tiệm hiện tại thành `stores[0]` (tiệm chính), tách dữ liệu chung (tiền, level, danh hiệu, thành tựu), gán lịch game ở ngày 1 tháng 3 năm 1, giữ nguyên khu hàng, lô kho, hàng sau quầy và nhân sự, rồi giữ bản v4 làm dự phòng.

#### Scenario: Người chơi giai đoạn 3 cập nhật
- **WHEN** người chơi level 20 với 4 nhân viên mở bản giai đoạn 4
- **THEN** tiệm chính giữ nguyên mặt bằng, nhân viên, lịch ca, quy tắc; tiền và level không đổi

### Requirement: Giới hạn kích thước bản lưu
Bản lưu MUST nhỏ hơn 1MB; lịch sử phân tích của chi nhánh chỉ giữ 14 ngày và nhật ký chỉ giữ 3 ngày gần nhất.

#### Scenario: Chuỗi 4 tiệm sau 200 ngày
- **WHEN** người chơi có 4 tiệm và đã chơi 200 ngày game
- **THEN** bản lưu vẫn dưới 1MB
