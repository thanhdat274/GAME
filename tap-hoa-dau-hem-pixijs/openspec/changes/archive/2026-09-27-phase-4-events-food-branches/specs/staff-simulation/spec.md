## ADDED Requirements

### Requirement: Vai trò Đầu bếp và Pha chế
Nhân viên vai trò Đầu bếp (góc đồ ăn) và Pha chế (quầy nước) SHALL tự làm món theo đơn của khách; tỉ lệ món đạt "Ngon" phụ thuộc Chính xác, thời gian làm phụ thuộc Tốc độ.

#### Scenario: Đầu bếp nướng xúc xích
- **WHEN** khách gọi xúc xích nướng và Đầu bếp đang rảnh
- **THEN** Đầu bếp làm món và với Chính xác 8 có khoảng 90% món đạt "Ngon"

### Requirement: Vai trò Quản lý chi nhánh
Nhân viên SHALL được giao vai trò Quản lý chi nhánh cho một chi nhánh; mỗi chi nhánh tối đa 1 quản lý và quản lý không làm vai trò khác.

#### Scenario: Giao quản lý
- **WHEN** người chơi giao anh Tuấn làm quản lý chi nhánh Chợ
- **THEN** anh Tuấn rời lịch ca tiệm chính và hiệu suất chi nhánh Chợ được tính theo chỉ số của anh
