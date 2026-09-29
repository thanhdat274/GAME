## ADDED Requirements

### Requirement: Giá ly pha theo đơn theo chất lượng
Giá một ly pha theo đơn SHALL bằng giá món nhân hệ số chất lượng (kẹp 0.75–1.25, làm tròn 500đ; chất lượng 1 giữ nguyên giá) cộng phụ thu tùy chọn như quy tắc ly hiện có. Bấm Pha ngay SHALL cho chất lượng `madeToOrder.autoQuality`.

#### Scenario: Ly chất lượng cao
- **WHEN** ly pha xong với chất lượng 1.1 cho món giá 40.000đ không tùy chọn
- **THEN** khách trả 44.000đ

### Requirement: Pha tay bằng mini-game
Người chơi SHALL có nút Pha tay khi khách đang chờ ly pha ngay được; mini-game SHALL khóa tùy chọn theo khách gọi và cho chất lượng 1.1 trừ 0.07 mỗi bước sai (sàn 0.75). Nguyên liệu SHALL chỉ bị trừ khi giao ly.

#### Scenario: Pha tay xong
- **WHEN** người chơi hoàn tất mini-game và bấm Giao cho khách
- **THEN** khách nhận đúng ly với chất lượng vừa pha, nguyên liệu bị trừ và tiệm chạy tiếp

#### Scenario: Thoát giữa chừng
- **WHEN** người chơi thoát mini-game khi chưa giao
- **THEN** không trừ nguyên liệu và khách vẫn chờ

### Requirement: Pha chế viên pha theo đơn song song
Nhân viên pha chế SHALL tự nhận pha ly cho khách đang chờ ly pha ngay được (ở quầy hoặc đang xếp hàng), mỗi khách một mẻ; nhiều pha chế viên SHALL pha song song cho các khách khác nhau. Chất lượng SHALL theo chỉ số chuẩn xác (0.75 + 0.045 × chuẩn xác, tối đa 1.1).

#### Scenario: Khách đang chờ ở quầy
- **WHEN** có pha chế viên rảnh và khách đầu hàng chờ ly pha ngay được
- **THEN** pha chế viên pha ly đó, nút Pha ngay/Pha tay bị khóa và khách nhận ly khi xong

#### Scenario: Khách đang xếp hàng
- **WHEN** khách chưa tới lượt gọi ly pha ngay được và pha chế viên rảnh
- **THEN** ly được pha trước và giao ngay khi khách tới lượt (thu ngân cũng nhận ly này không mất thời gian pha)

#### Scenario: Khách rời khi đang pha
- **WHEN** khách rời trước khi pha xong
- **THEN** mẻ bị hủy, nguyên liệu không hoàn và pha chế viên rảnh lại
