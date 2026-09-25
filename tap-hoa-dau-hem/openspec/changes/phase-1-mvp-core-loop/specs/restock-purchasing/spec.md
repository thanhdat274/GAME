## ADDED Requirements

### Requirement: Nhập hàng buổi sáng
Mỗi ngày SHALL bắt đầu bằng pha "Buổi sáng" nơi người chơi mua hàng từ "Mối sỉ Cô Tư" bằng tiền hiện có, với danh sách các mặt hàng đã mở khóa và giá nhập.

#### Scenario: Mua thành công
- **WHEN** người chơi chọn 10 gói mì và đủ tiền, đủ chỗ kho
- **THEN** tiền giảm đúng 10 × giá nhập và kho tăng 10 gói mì

#### Scenario: Không đủ tiền
- **WHEN** tổng tiền giỏ hàng vượt quá tiền đang có
- **THEN** nút "Nhập hàng" bị vô hiệu và hiển thị số tiền còn thiếu

### Requirement: Giới hạn kho
Kho SHALL có sức chứa tính theo ô (mặc định 30 ô); mỗi mặt hàng chiếm số ô theo dữ liệu cho mỗi 10 đơn vị (làm tròn lên).

#### Scenario: Kho đầy
- **WHEN** giỏ hàng làm tổng ô vượt sức chứa
- **THEN** không cho thêm và hiện "Kho đầy"

### Requirement: Gợi ý nhập hàng
Màn nhập hàng SHALL hiển thị số lượng đang có (kho + kệ), số đã bán hôm qua và số món khách hỏi mà hết hàng hôm qua cho từng món.

#### Scenario: Ngày thứ hai
- **WHEN** người chơi mở màn nhập hàng ngày 2
- **THEN** mỗi món hiện "Còn: X · Hôm qua bán: Y", kèm nhãn đỏ "thiếu Z" cạnh tên món nếu hôm qua có khách hỏi mà hết

### Requirement: Nút nhập theo gợi ý
Màn nhập hàng SHALL có nút "🪄 Gợi ý" tự điền giỏ hàng: mỗi món nhắm tới (bán + thiếu hôm qua) × 1,25 + 1; món chưa có số liệu dùng mức ước tính (món rẻ 10, món đắt 5). Khi thiếu tiền hoặc chỗ kho, số lượng MUST được chia theo tỉ lệ còn thiếu để không món nào bị bỏ trống hoàn toàn.

#### Scenario: Món mới mở khóa
- **WHEN** người chơi vừa lên level 2 và bấm "Gợi ý"
- **THEN** giỏ hàng có mỗi món ăn vặt khoảng 13 cái (nếu đủ tiền và chỗ)

#### Scenario: Không đủ tiền
- **WHEN** tổng gợi ý vượt tiền đang có
- **THEN** giỏ hàng dùng gần hết tiền và mọi món cần nhập đều có ít nhất một phần
