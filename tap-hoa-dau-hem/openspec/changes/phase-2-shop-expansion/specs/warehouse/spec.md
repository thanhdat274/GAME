## ADDED Requirements

### Requirement: Bậc kho
Sức chứa kho SHALL bằng sức chứa gốc theo bậc (kệ gỗ 20, kệ sắt 40, kho lớn 70 ô) cộng thêm 10 ô cho mỗi kệ kho đặt trên mặt bằng.

#### Scenario: Nâng cấp kho
- **WHEN** người chơi level 8 trả 250.000đ nâng lên kệ sắt
- **THEN** sức chứa gốc từ 20 lên 40 ô

#### Scenario: Thêm kệ kho
- **WHEN** người chơi đặt 2 kệ kho lên sân sau
- **THEN** sức chứa tăng thêm 20 ô

### Requirement: Màn quản lý kho
Màn Kho SHALL liệt kê từng lô hàng (món, số lượng, ngày hết hạn), tổng ô đã dùng / sức chứa, lọc theo nhóm.

#### Scenario: Xem hàng sắp hết hạn
- **WHEN** người chơi chọn bộ lọc "Sắp hết hạn"
- **THEN** chỉ hiện các lô hết hạn trong ngày hôm nay hoặc ngày mai, sắp theo hạn

### Requirement: Dọn bỏ hàng
Người chơi SHALL có thể bỏ một lô hàng khỏi kho để giải phóng chỗ; giá vốn lô đó được ghi là tổn thất.

#### Scenario: Bỏ lô trứng hỏng
- **WHEN** người chơi bỏ lô 10 trứng đã hết hạn
- **THEN** kho giảm 10 trứng và tổng kết ngày ghi tổn thất theo giá vốn
