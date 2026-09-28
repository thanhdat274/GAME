## ADDED Requirements

### Requirement: Lịch sử kinh doanh
Hệ thống SHALL lưu số liệu mỗi ngày trong 30 ngày gần nhất: doanh thu, lãi, chi phí (vốn, lương, điện, hỏng, trộm), số khách, sao, bán theo món và theo giờ.

#### Scenario: Ngày thứ 31
- **WHEN** ngày thứ 31 kết thúc
- **THEN** số liệu ngày 1 bị xóa khỏi lịch sử, giữ 30 ngày mới nhất

### Requirement: Màn Phân tích
Từ level 19, màn Phân tích SHALL hiển thị: biểu đồ doanh thu/lãi 7 ngày, top 5 món bán chạy và 5 món ế, biểu đồ khách theo giờ, bảng hiệu suất nhân viên (khách phục vụ, sai sót, sao trung bình).

#### Scenario: Món ế
- **WHEN** một món không bán được trong 5 ngày
- **THEN** món đó xuất hiện ở danh sách ế kèm gợi ý "Giảm giá hoặc ngừng nhập"

#### Scenario: Màn hình nhỏ
- **WHEN** mở màn Phân tích trên 375x812
- **THEN** mỗi biểu đồ chiếm một thẻ riêng, cuộn dọc, không cần cuộn ngang
