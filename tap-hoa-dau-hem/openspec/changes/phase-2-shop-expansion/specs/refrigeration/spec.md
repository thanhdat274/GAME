## ADDED Requirements

### Requirement: Thiết bị lạnh
Tủ lạnh (mở ở level 5, 6 ô) và tủ đông (mở ở level 9, 4 ô) SHALL là nội thất đặt được lên mặt bằng; món có `requiresCold` chỉ được bày vào ô của thiết bị tương ứng.

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
Cuối mỗi ngày, hệ thống SHALL trừ tiền điện cho mỗi thiết bị lạnh (mặc định tủ lạnh 5.000đ, tủ đông 8.000đ) và ghi vào tổng kết.

#### Scenario: Tổng kết có 2 thiết bị
- **WHEN** tiệm có 1 tủ lạnh và 1 tủ đông
- **THEN** tổng kết ghi "Tiền điện: 13.000đ" và trừ vào lãi
