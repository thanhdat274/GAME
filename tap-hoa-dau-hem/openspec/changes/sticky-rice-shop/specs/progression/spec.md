## ADDED Requirements

### Requirement: Mở khóa Tiệm xôi
L31 SHALL mở thêm tính năng `shop_xoi` (khu Tiệm xôi trên bản đồ), nguyên liệu xôi ở tạp hóa, và vai trò Thợ nấu xôi, bên cạnh Xe tải chuyển hàng. Nhãn L31 trong `levels.json` đổi thành "Xe tải chuyển hàng · Tiệm xôi".

#### Scenario: Lên L31
- **WHEN** người chơi lên L31
- **THEN** màn tổng kết liệt kê "Tiệm xôi" trong phần mở khóa, và sáng hôm sau có hướng dẫn chỉ vào Bản đồ

### Requirement: EXP ở tiệm xôi
Món bán và khách hài lòng ở tiệm xôi SHALL cho EXP theo cùng quy tắc với tạp hóa. Mô phỏng khi vắng chủ cho 50% EXP. Đơn nội bộ MUST không cho EXP, để tránh cày EXP bằng cách chuyển hàng qua lại.

#### Scenario: Giao đơn nội bộ
- **WHEN** tiệm xôi giao 20 xôi gói cho tạp hóa
- **THEN** không có EXP cho lần giao; EXP chỉ tính khi tạp hóa bán xôi gói cho khách
