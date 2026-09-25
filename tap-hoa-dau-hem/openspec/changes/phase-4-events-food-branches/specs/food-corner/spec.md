## ADDED Requirements

### Requirement: Công thức món ăn
Món ăn SHALL được định nghĩa trong `recipes.json` với nguyên liệu lấy từ kho, các bước chế biến, giá bán và level mở: xúc xích nướng, mì ly pha sẵn, trứng luộc (L21), bánh mì kẹp (L23).

#### Scenario: Thiếu nguyên liệu
- **WHEN** khách gọi bánh mì kẹp nhưng kho hết xúc xích
- **THEN** món đó hiện "Hết" trên bảng menu và khách chọn món khác hoặc bỏ về

### Requirement: Mini-game chế biến
Người chơi SHALL tự chế biến bằng thao tác chạm/giữ: nướng xúc xích (giữ tới khi kim ở vùng xanh), mì ly (rót nước tới vạch, chờ), bánh mì (thả đúng thứ tự nguyên liệu).

#### Scenario: Nướng vừa tới
- **WHEN** người chơi thả tay khi kim ở vùng xanh
- **THEN** món đạt "Ngon", khách tip thêm

#### Scenario: Nướng cháy
- **WHEN** người chơi giữ quá vùng đỏ
- **THEN** xúc xích cháy, mất nguyên liệu và phải làm lại

### Requirement: Thành phẩm trong ngày
Món đã chế biến chưa bán SHALL bị hỏng cuối ngày và tính vào tổn thất.

#### Scenario: Còn 3 xúc xích nướng
- **WHEN** ngày kết thúc với 3 xúc xích nướng trên vỉ
- **THEN** tổng kết ghi 3 xúc xích nướng bị hỏng
