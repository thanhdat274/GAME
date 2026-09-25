## ADDED Requirements

### Requirement: Bảng ứng viên
Từ level 10, màn Tuyển dụng SHALL hiện 3–4 ứng viên (tên, ảnh, tính cách, vai trò phù hợp, 4 chỉ số, lương đề nghị/ngày); bảng làm mới mỗi 2 ngày game.

#### Scenario: Lần đầu mở tuyển dụng
- **WHEN** người chơi vừa lên level 10 và mở màn Tuyển dụng
- **THEN** bảng luôn có ứng viên cố định "bé Lan" (thu ngân, chỉ số cân bằng, lương 25.000đ/ngày)

#### Scenario: Làm mới bảng
- **WHEN** đã qua 2 ngày game từ lần làm mới trước
- **THEN** các ứng viên chưa thuê được thay bằng ứng viên mới

### Requirement: Thuê và giới hạn chỗ
Người chơi SHALL thuê ứng viên nếu còn chỗ nhân viên (L10: 1, L12: 2, L15: 4, L20: 6) và chọn vai trò khi thuê.

#### Scenario: Hết chỗ
- **WHEN** đã có đủ số nhân viên theo level
- **THEN** nút "Thuê" bị vô hiệu và hiện level mở chỗ tiếp theo

### Requirement: Trả lương
Cuối mỗi ngày, lương của mọi nhân viên có ca trong ngày SHALL được trừ vào tiền và ghi vào tổng kết.

#### Scenario: Không đủ tiền trả lương
- **WHEN** tiền mặt nhỏ hơn tổng lương
- **THEN** trả hết tiền mặt, phần thiếu thành nợ lương và mọi nhân viên −20 tâm trạng

### Requirement: Sa thải
Người chơi SHALL sa thải nhân viên, trả thêm 1 ngày lương trợ cấp.

#### Scenario: Sa thải
- **WHEN** người chơi xác nhận sa thải anh Tuấn
- **THEN** anh Tuấn rời tiệm, bị xóa khỏi lịch ca, trừ 1 ngày lương
