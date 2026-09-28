## ADDED Requirements

### Requirement: Migrate bản lưu v2 lên v3
Khi tải bản lưu version 2, hệ thống SHALL chuyển kho từ số lượng theo món thành lô không hạn, tạo lưới mặt bằng mặc định với các kệ ở vị trí cũ, giữ nguyên khu kệ, hàng sau quầy và cài đặt, thêm các trường mới với giá trị mặc định, và giữ bản v2 làm dự phòng.

#### Scenario: Người chơi cũ cập nhật game
- **WHEN** người chơi level 4 với 30 gói mì trong kho mở bản giai đoạn 2
- **THEN** kho có một lô 30 gói mì không hạn, 3 kệ nằm đúng chỗ cũ, tiền, level, khu kệ, hàng sau quầy và cài đặt không đổi

#### Scenario: Migrate lỗi
- **WHEN** quá trình migrate ném lỗi
- **THEN** bản v2 không bị ghi đè, game báo lỗi và cho thử lại hoặc chơi mới

### Requirement: Mã sao lưu
Người chơi SHALL có thể xuất bản lưu thành mã chữ (dùng lại hàm nén của cloud-save, mã hóa base64) và nhập lại trên thiết bị khác; đây là phương án dự phòng cho người chơi không đăng nhập Google được.

#### Scenario: Chuyển máy
- **WHEN** người chơi dán mã sao lưu hợp lệ vào ô "Nhập mã" trên máy mới
- **THEN** game tải đúng tiến trình từ mã đó sau khi xác nhận ghi đè
