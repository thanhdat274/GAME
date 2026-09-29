## ADDED Requirements

### Requirement: Loại tiệm trà sữa
Hệ thống SHALL có loại cửa hàng `tea_shop` bán ở quầy với thực đơn nhiều món trà, mở bằng chi nhánh khi có tính năng `shop_tea`.

#### Scenario: Mở tiệm theo level
- **WHEN** người chơi chưa đạt level mở `shop_tea`
- **THEN** không mở được; đủ level và tiền thì mở được với bố cục mặc định hợp lệ

#### Scenario: Thực đơn theo level
- **WHEN** xem thực đơn ở các level khác nhau
- **THEN** mỗi món chỉ xuất hiện khi đạt level mở khóa của nó, và món cần máy foam cần có máy đó

### Requirement: Nguyên liệu riêng của tiệm trà sữa
Nguyên liệu đánh dấu `shopOnly` SHALL chỉ nhập và bán được ở loại tiệm được liệt kê, không xuất hiện ở tạp hóa hay tiệm khác.

#### Scenario: Không lẫn vào tạp hóa
- **WHEN** liệt kê hàng mở khóa của tiệm tạp hóa ở level tối đa
- **THEN** không có nguyên liệu trà sữa

#### Scenario: Giá vốn khớp
- **WHEN** chạy `validateContent`
- **THEN** giá vốn mỗi thành phẩm bằng tổng giá nguyên liệu công thức và dữ liệu hợp lệ

### Requirement: Mini-game pha ly
Công thức của quầy pha trà SHALL dùng chế độ pha ly: các ô nguyên liệu theo nhóm quầy với số lượng tồn, chạm đúng thứ tự để pha; chạm sai làm giảm chất lượng.

#### Scenario: Pha đúng
- **WHEN** chạm đủ nguyên liệu đúng thứ tự (kể cả nguyên liệu của biến thể đã chọn)
- **THEN** ly được pha với chất lượng cao và đưa vào quầy

#### Scenario: Pha sai
- **WHEN** chạm sai nguyên liệu
- **THEN** ghi nhận lỗi và chất lượng thấp hơn nhưng vẫn hoàn thành được
