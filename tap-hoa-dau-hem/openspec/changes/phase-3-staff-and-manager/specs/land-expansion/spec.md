## ADDED Requirements

### Requirement: Đất D mini-mart
Từ level 15, SHALL có Đất D (giá mặc định 1.200.000đ, +12 ô) cho phép đặt quầy thu ngân thứ 2 và kệ đôi; khi mở, mặt tiền đổi thành "Tạp Hóa Đầu Hẻm - Mini Mart".

#### Scenario: Mở Đất D
- **WHEN** người chơi level 15 mở Đất D
- **THEN** lưới mở thêm 12 ô, cửa hàng nội thất có "Quầy thu ngân 2" và mặt tiền được nâng cấp

### Requirement: Xe đẩy hàng
Khi tiệm có Đất D, khách SHALL có thể lấy xe đẩy và yêu cầu 3–6 món thay vì 1–3.

#### Scenario: Khách dùng xe đẩy
- **WHEN** tiệm đã mở Đất D và khách bà nội trợ vào
- **THEN** với xác suất 40% khách lấy xe đẩy và mua 3–6 món

### Requirement: Nhiều quầy thu ngân
Khách SHALL xếp hàng vào quầy có ít người chờ nhất trong các quầy đang có người đứng.

#### Scenario: Hai quầy
- **WHEN** quầy 1 có 3 khách chờ và quầy 2 có 1 khách
- **THEN** khách mới xếp vào quầy 2
