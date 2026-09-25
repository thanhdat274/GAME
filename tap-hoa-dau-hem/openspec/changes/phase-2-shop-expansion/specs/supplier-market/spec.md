## ADDED Requirements

### Requirement: Nhiều mối sỉ
Màn nhập hàng SHALL có tab cho từng mối sỉ đã mở khóa: "Cô Tư" (giao ngay, giá chuẩn) và "Đại lý Anh Ba" (mở ở level 6, rẻ hơn 10%, giao 15:00 ngày hôm sau, đơn tối thiểu 200.000đ).

#### Scenario: Đặt hàng Anh Ba
- **WHEN** người chơi đặt đơn 250.000đ ở Anh Ba vào ngày 20
- **THEN** tiền bị trừ ngay, và lúc 15:00 ngày 21 có xe giao tới, hàng vào kho kèm thông báo

#### Scenario: Đơn dưới tối thiểu
- **WHEN** giỏ hàng Anh Ba dưới 200.000đ
- **THEN** nút đặt bị vô hiệu và hiện số tiền còn thiếu

#### Scenario: Kho đầy lúc giao
- **WHEN** hàng Anh Ba tới nhưng kho không đủ chỗ
- **THEN** phần dư để tạm ở "hàng chờ" và người chơi phải dọn chỗ trước khi mở cửa ngày hôm sau

### Requirement: Giá sỉ dao động
Giá nhập mỗi món SHALL dao động ±15% mỗi ngày theo RNG có seed của ngày, hiển thị mũi tên tăng/giảm so với hôm qua.

#### Scenario: Giá giảm
- **WHEN** giá mì gói hôm nay thấp hơn hôm qua
- **THEN** giá hiện màu xanh với mũi tên xuống

### Requirement: Chiết khấu số lượng
Mua từ 50 đơn vị một món trở lên trong một đơn SHALL được giảm 5% cho món đó.

#### Scenario: Mua 50 gói mì
- **WHEN** giỏ hàng có 50 gói mì
- **THEN** dòng mì gói hiện "-5%" và tổng tiền được giảm tương ứng
