## ADDED Requirements

### Requirement: Khách mặc cả
Từ level 9, kiểu khách "bà nội trợ" SHALL có xác suất 30% xin bớt 5–15% khi tính tiền; người chơi chọn "Bớt" hoặc "Không bớt".

#### Scenario: Đồng ý bớt
- **WHEN** khách xin bớt 10% và người chơi chọn "Bớt"
- **THEN** tổng đơn giảm 10%, khách hài lòng và có xác suất thành khách quen

#### Scenario: Từ chối bớt
- **WHEN** người chơi chọn "Không bớt"
- **THEN** khách có 50% vẫn mua với mặt buồn (tối đa 3 sao) và 50% bỏ về

### Requirement: Khách ghi sổ
Từ level 7, hệ thống SHALL sinh kiểu khách "hàng xóm ghi sổ" có tên riêng, là người quen của tiệm, đôi khi xin nợ thay vì trả tiền (xem debt-ledger).

#### Scenario: Khách quen quay lại
- **WHEN** chú Sáu đã từng ghé tiệm
- **THEN** lần sau chú xuất hiện với cùng tên và ngoại hình

### Requirement: Mật độ khách theo mặt bằng
Số khách chờ tối đa SHALL tăng theo đất đã mở (3 khách ban đầu, 4 khi có Đất A, 5 khi có Đất B), và tốc độ sinh khách chịu thêm các hệ số thu hút và giá.

#### Scenario: Mở Đất B
- **WHEN** người chơi mở Đất B
- **THEN** tối đa 5 khách có thể chờ cùng lúc
