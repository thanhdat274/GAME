## ADDED Requirements

### Requirement: Định nghĩa mặt hàng bằng dữ liệu
Mỗi mặt hàng SHALL được định nghĩa trong `products.json` với các trường: id, tên tiếng Việt, nhóm, icon, giá nhập, giá bán mặc định, số ô kho chiếm, level mở khóa.

#### Scenario: Thêm mặt hàng mới
- **WHEN** nhà phát triển thêm một mục hợp lệ vào `products.json`
- **THEN** mặt hàng xuất hiện ở mối sỉ khi đạt level mở khóa mà không cần sửa code

#### Scenario: Dữ liệu lỗi
- **WHEN** một mục thiếu trường bắt buộc hoặc giá bán nhỏ hơn giá nhập
- **THEN** bước kiểm tra dữ liệu khi test MUST báo lỗi chỉ rõ id mặt hàng

### Requirement: Danh mục khởi điểm
Giai đoạn 1 SHALL có 14 mặt hàng thuộc 3 nhóm: đồ khô (mì gói, gạo 1kg, nước mắm, dầu ăn, đường, muối), ăn vặt (snack khoai tây, kẹo, bánh quy, que cay), đồ dùng (xà phòng, kem đánh răng, giấy vệ sinh, pin).

#### Scenario: Level 1
- **WHEN** người chơi ở level 1
- **THEN** chỉ 6 món đồ khô được mở khóa

#### Scenario: Mở khóa theo nhóm
- **WHEN** người chơi lên level 2
- **THEN** 4 món ăn vặt được mở khóa và có thông báo "Mặt hàng mới!"
