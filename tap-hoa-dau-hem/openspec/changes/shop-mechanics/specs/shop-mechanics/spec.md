## ADDED Requirements

### Requirement: Cơ chế riêng cấu hình bằng dữ liệu
Loại cửa hàng SHALL có thể khai báo `mechanics` gồm `shelfLifeMul`, `demandMul`, `seasonSensitivity`, `qtyMul`, `trafficMul`; thiếu tham số nào thì coi là 1.

#### Scenario: Loại không khai báo
- **WHEN** chạy mô phỏng cho tạp hóa hoặc tiệm xôi với cùng seed
- **THEN** kết quả giống hệt trước khi thêm tính năng

### Requirement: Hạn dùng theo nhóm hàng
Hàng nhập vào tiệm có `shelfLifeMul` cho nhóm của nó SHALL có hạn dùng bằng hạn gốc nhân hệ số, làm tròn, tối thiểu 1 ngày.

#### Scenario: Rau củ hỏng nhanh
- **WHEN** nhập một mặt hàng nhóm tươi vào tiệm rau củ
- **THEN** hạn dùng ngắn hơn hạn gốc ở tạp hóa; hàng nhóm khác không đổi

### Requirement: Giỏ hàng và mùa vụ
Số lượng mỗi dòng hàng SHALL nhân `qtyMul`; nhu cầu theo nhóm SHALL nhân `demandMul` và nhu cầu mùa được lũy thừa `seasonSensitivity`.

#### Scenario: Bán sỉ
- **WHEN** khách mua ở cửa hàng gia dụng
- **THEN** số lượng mỗi dòng trung bình gấp khoảng hai lần tạp hóa

#### Scenario: Mùa nóng
- **WHEN** nhu cầu đồ uống theo mùa lớn hơn 1
- **THEN** quầy giải khát có hệ số nhu cầu lớn hơn nhu cầu mùa gốc; khi nhỏ hơn 1 thì nhỏ hơn

### Requirement: Lượng khách chung
Mật độ khách SHALL nhân `trafficMul` của loại tiệm.

#### Scenario: Gia dụng vắng hơn
- **WHEN** cùng một giờ
- **THEN** mật độ khách ở cửa hàng gia dụng bằng mật độ gốc nhân `trafficMul`

### Requirement: Kiểm tra và hiển thị
Validator SHALL báo lỗi nhóm hàng không tồn tại hoặc hệ số không dương trong `mechanics`; bản đồ phố SHALL hiện mô tả đặc điểm loại tiệm.

#### Scenario: Hệ số sai
- **WHEN** `mechanics.qtyMul` bằng 0
- **THEN** `validateShopTypes` báo lỗi
