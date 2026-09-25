## ADDED Requirements

### Requirement: Để nhân viên lo
Từ level 20, ở buổi sáng người chơi SHALL bật "Để nhân viên lo"; khi đó cả ngày bán hàng do nhân viên thực hiện và người chơi ở vai trò quản lý.

#### Scenario: Ngày tự vận hành
- **WHEN** chế độ quản lý bật và có ít nhất 1 thu ngân trong ca
- **THEN** khách được phục vụ mà người chơi không cần chạm

#### Scenario: Không có thu ngân
- **WHEN** chế độ quản lý bật nhưng một ca không có thu ngân
- **THEN** hệ thống cảnh báo ở buổi sáng và trong ca đó người chơi phải tự đứng quầy

### Requirement: Tăng tốc ngày
Trong chế độ quản lý, người chơi SHALL chọn tốc độ x1, x2, x4, hoặc "Bỏ qua ngày" để chạy mô phỏng nhanh không hiển thị và xem ngay tổng kết.

#### Scenario: Bỏ qua ngày
- **WHEN** người chơi bấm "Bỏ qua ngày"
- **THEN** core chạy hết ngày bằng tick không render trong dưới 1 giây và hiện màn tổng kết

### Requirement: Can thiệp sự cố
Trong chế độ quản lý, các sự cố (trộm, khách phàn nàn, hết hàng món chủ lực, nhân viên xin nghỉ) SHALL hiện dạng thông báo chạm được; người chơi có thể xử lý hoặc "xuống quầy" tự bán.

#### Scenario: Khách phàn nàn
- **WHEN** khách phàn nàn thu ngân thối sai
- **THEN** thông báo xuất hiện, chạm vào để chọn "Xin lỗi + bù tiền" hoặc "Bỏ qua"
