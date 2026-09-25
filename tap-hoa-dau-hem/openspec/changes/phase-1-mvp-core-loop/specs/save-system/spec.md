## ADDED Requirements

### Requirement: Tự động lưu
Game SHALL tự lưu toàn bộ trạng thái vào localStorage khi chuyển pha, khi lên level và khi tab bị ẩn.

#### Scenario: Tắt trình duyệt giữa buổi sáng
- **WHEN** người chơi đã nhập hàng rồi đóng trình duyệt
- **THEN** mở lại và chọn "Chơi tiếp" thì kho và tiền đúng như lúc đóng

#### Scenario: Tắt giữa pha bán hàng
- **WHEN** người chơi đóng trình duyệt lúc 14:00 game
- **THEN** khi chơi tiếp, ngày đó tiếp tục từ lần lưu gần nhất (khách đang chờ bị bỏ qua)

### Requirement: Phiên bản bản lưu
Bản lưu MUST chứa số `version`; khi tải, hệ thống SHALL chạy chuỗi migrate tới version hiện tại.

#### Scenario: Bản lưu hỏng
- **WHEN** dữ liệu lưu không đọc được JSON
- **THEN** game sao chép dữ liệu sang khóa `.bak`, báo lỗi thân thiện và cho chơi mới

### Requirement: Chơi mới
Nút "Chơi mới" SHALL hỏi xác nhận nếu đã có bản lưu, rồi xóa bản lưu và bắt đầu lại ngày 1.

#### Scenario: Xác nhận chơi mới
- **WHEN** người chơi bấm "Chơi mới" và chọn "Đồng ý"
- **THEN** trạng thái về mặc định: 300.000đ, level 1, ngày 1, kho trống
