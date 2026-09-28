## ADDED Requirements

### Requirement: Lưới mặt bằng và đất khóa
Tiệm SHALL được biểu diễn bằng lưới 6x8 ô; các mảnh đất chưa mở hiển thị mờ với ổ khóa, level yêu cầu và giá mở.

#### Scenario: Xem đất khóa
- **WHEN** người chơi level 5 vào chế độ Sắp xếp
- **THEN** Đất A hiện giá 150.000đ và nút "Mở", Đất B hiện "Cần level 8"

### Requirement: Mở khóa đất
Người chơi SHALL mở được một mảnh đất khi đủ level và đủ tiền; tiền bị trừ và các ô đất trở thành ô có thể đặt nội thất.

#### Scenario: Mở thành công
- **WHEN** người chơi level 5 có 180.000đ bấm "Mở" Đất A
- **THEN** tiền còn 30.000đ, 8 ô mới xuất hiện với hiệu ứng dỡ rào

#### Scenario: Chưa đủ level
- **WHEN** người chơi level 7 chạm Đất B
- **THEN** nút "Mở" bị vô hiệu và hiện "Cần level 8"

### Requirement: Đặt và di chuyển nội thất
Ở chế độ Sắp xếp, người chơi SHALL kéo nội thất (kệ, tủ lạnh, tủ đông, kệ kho, trang trí) đặt theo lưới lên ô đã mở, không chồng nhau.

#### Scenario: Đặt hợp lệ
- **WHEN** người chơi kéo tủ lạnh vào 2 ô trống đã mở
- **THEN** các ô tô xanh và tủ lạnh được đặt khi thả tay

#### Scenario: Đặt không hợp lệ
- **WHEN** vị trí thả chồng lên nội thất khác hoặc ô chưa mở
- **THEN** các ô tô đỏ và nội thất quay về vị trí cũ

### Requirement: Lối đi thông
Hệ thống MUST đảm bảo luôn có lối đi từ cửa tới quầy và tới mỗi kệ bán hàng.

#### Scenario: Chặn lối đi
- **WHEN** người chơi bấm "Xong" khi bố cục chặn đường tới quầy
- **THEN** không thoát chế độ Sắp xếp và tô sáng chỗ bị chặn

### Requirement: Chỉ sắp xếp buổi sáng
Chế độ Sắp xếp SHALL chỉ dùng được ở pha Buổi sáng.

#### Scenario: Đang bán hàng
- **WHEN** đang trong pha Mở cửa bán
- **THEN** nút "Sắp xếp" bị ẩn

### Requirement: Mua và bán lại nội thất
Người chơi SHALL mua nội thất từ cửa hàng nội thất và bán lại được với 50% giá mua; nội thất đang chứa hàng phải dọn hàng về kho trước khi bán.

#### Scenario: Bán kệ còn hàng
- **WHEN** người chơi bán một kệ còn 12 món
- **THEN** 12 món được trả về kho (nếu đủ chỗ) và nhận 50% giá kệ
