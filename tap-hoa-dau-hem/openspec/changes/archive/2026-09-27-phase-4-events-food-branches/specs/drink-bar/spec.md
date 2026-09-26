## ADDED Requirements

### Requirement: Công thức đồ uống
Quầy nước SHALL có công thức trong `recipes.json`: trà tắc, cà phê sữa đá, nước mía (L25); sinh tố bơ, trà sữa trân châu (L26); mỗi công thức là danh sách nguyên liệu theo thứ tự và thao tác cuối (khuấy/lắc/xay).

#### Scenario: Mở quầy nước
- **WHEN** người chơi lên level 25 và mở Đất F
- **THEN** có thể đặt Quầy nước và mua nguyên liệu đồ uống ở mối sỉ

### Requirement: Mini-game pha chế
Người chơi SHALL pha bằng cách chạm nguyên liệu theo đúng thứ tự công thức rồi thực hiện thao tác cuối; khách có thể yêu cầu biến thể (ít đường, nhiều đá).

#### Scenario: Pha đúng
- **WHEN** khách gọi cà phê sữa đá ít đường và người chơi chọn cà phê → sữa (nửa phần) → đá → khuấy
- **THEN** khách hài lòng và trả thêm tip

#### Scenario: Sai thứ tự
- **WHEN** người chơi cho đá trước cà phê
- **THEN** ly bị đánh giá "Tạm được" và khách tối đa 3 sao

### Requirement: Sổ công thức
Game SHALL có "Sổ công thức" xem lại nguyên liệu và thứ tự của các món đã mở khóa.

#### Scenario: Xem công thức giữa ca
- **WHEN** người chơi chạm biểu tượng sổ trong lúc pha
- **THEN** công thức hiện chồng lên và thời gian kiên nhẫn của khách vẫn chạy
