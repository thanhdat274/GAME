## ADDED Requirements

### Requirement: Thiết bị lạnh
Ở level 5, người chơi SHALL mở được hai loại tủ lạnh: tủ 1 cánh (1×1, 8 ô hàng, 3.000đ tiền điện/ngày) và tủ 2 cánh (2×1 hoặc xoay thành 1×2, 24 ô hàng, 8.000đ/ngày). Tủ đông mở ở level 9, có 12 ô hàng và tốn 8.000đ/ngày. Món có `requiresCold` chỉ được bày vào ô của thiết bị tương ứng.

#### Scenario: Bày kem vào kệ thường
- **WHEN** người chơi kéo kem vào ô kệ thường
- **THEN** không cho thả và hiện "Cần tủ đông"

#### Scenario: Bày nước ngọt vào tủ lạnh
- **WHEN** người chơi kéo nước ngọt vào ô tủ lạnh trống
- **THEN** ô được gán nước ngọt và hiện biểu tượng lạnh

### Requirement: Đồ uống không lạnh
Đồ uống có cờ `prefersCold` bày ở kệ thường SHALL vẫn bán được nhưng xác suất khách lấy giảm 50%.

#### Scenario: Nước ngọt để kệ thường
- **WHEN** nước ngọt chỉ có trên kệ thường
- **THEN** khoảng một nửa số khách muốn nước ngọt từ chối món đó và bong bóng hiện "Không lạnh à?"

### Requirement: Tiền điện
Cuối mỗi ngày, hệ thống SHALL trừ tiền điện cho mỗi thiết bị lạnh (tủ 1 cánh 3.000đ, tủ 2 cánh 8.000đ, tủ đông 8.000đ) và ghi vào tổng kết.

#### Scenario: Tổng kết có 2 thiết bị
- **WHEN** tiệm có 1 tủ lạnh 1 cánh và 1 tủ đông
- **THEN** tổng kết ghi "Tiền điện: 11.000đ" và trừ vào lãi
