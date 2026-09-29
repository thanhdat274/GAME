## ADDED Requirements

### Requirement: Loại cửa hàng bán theo kệ mới
Hệ thống SHALL có ba loại cửa hàng `greengrocer`, `drink_kiosk`, `household` với nhóm hàng, loại khách và đường cong khách riêng, mỗi loại mở được bằng một chi nhánh.

#### Scenario: Hàng bán theo loại tiệm
- **WHEN** hỏi mặt hàng nào bán được ở từng loại tiệm mới
- **THEN** chỉ các nhóm hàng của loại đó (cộng nguyên liệu/đồ kèm khai báo) bán được, hàng nhóm khác thì không

#### Scenario: Mở chi nhánh theo level
- **WHEN** người chơi chưa có tính năng `shop_veg`, `shop_drink` hoặc `shop_home`
- **THEN** chi nhánh tương ứng không mở được; đủ level và tiền thì mở được và có bố cục mặc định hợp lệ

#### Scenario: Chạy được một ngày bán hàng
- **WHEN** mở từng tiệm mới, bày hàng và chạy một ngày không giao diện
- **THEN** ngày kết thúc bình thường và có khách được phục vụ

### Requirement: Loại tiệm mới chỉ cần dữ liệu
Kiểu id loại cửa hàng và loại chi nhánh SHALL không bị giới hạn bởi union cố định; validator SHALL báo lỗi khi id tham chiếu không tồn tại.

#### Scenario: Tham chiếu sai
- **WHEN** một chi nhánh có `shopType` không có trong `shopTypes.json`
- **THEN** `validateContent` báo lỗi

### Requirement: Giới hạn chuỗi
Số cửa hàng tối đa trong chuỗi SHALL đủ chứa tiệm chính và mọi chi nhánh trong dữ liệu.

#### Scenario: Mở đủ chi nhánh
- **WHEN** mở lần lượt mọi chi nhánh trong `branches.json`
- **THEN** không chi nhánh nào bị từ chối vì giới hạn số cửa hàng
