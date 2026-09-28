## ADDED Requirements

### Requirement: Khởi động và màn tiêu đề
Game SHALL hiển thị màn tải có thanh tiến trình, sau đó là màn tiêu đề "Tạp Hóa Đầu Hẻm" với các nút Chơi tiếp, Chơi mới, Cách chơi và bật/tắt âm thanh.

#### Scenario: Có bản lưu
- **WHEN** người chơi mở game và đã có bản lưu hợp lệ
- **THEN** nút "Chơi tiếp" hiển thị và đưa người chơi vào đúng pha đang dở

#### Scenario: Chưa có bản lưu
- **WHEN** người chơi mở game lần đầu
- **THEN** nút "Chơi tiếp" bị ẩn và "Chơi mới" phát đoạn mở đầu 3 câu thoại trước khi vào buổi sáng ngày 1

### Requirement: Bố cục dọc co giãn theo màn hình
Game SHALL render ở kích thước logic 360x640, co giãn giữ tỉ lệ và căn giữa trên mọi màn hình, với vùng chạm tối thiểu 44px logic.

#### Scenario: Điện thoại dọc
- **WHEN** mở trên màn hình 375x812
- **THEN** toàn bộ khung game hiển thị không bị cắt và không có thanh cuộn

#### Scenario: Xoay ngang trên điện thoại
- **WHEN** thiết bị cảm ứng ở chế độ ngang
- **THEN** game tạm dừng và hiện thông báo "Xoay dọc điện thoại để chơi"

### Requirement: Cài như ứng dụng (PWA)
Game MUST có web manifest (tên, icon, orientation portrait) và service worker cache asset để có thể "Thêm vào màn hình chính" và mở lại khi mất mạng.

#### Scenario: Mở lại khi offline
- **WHEN** người chơi đã mở game một lần rồi tắt mạng và mở lại
- **THEN** game vẫn tải được và đọc được bản lưu

### Requirement: Tạm dừng
Game SHALL tạm dừng đồng hồ và tick khi tab bị ẩn hoặc người chơi bấm nút tạm dừng.

#### Scenario: Chuyển ứng dụng
- **WHEN** người chơi chuyển sang ứng dụng khác giữa pha bán hàng
- **THEN** đồng hồ, kiên nhẫn khách dừng lại và game được lưu
