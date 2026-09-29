## ADDED Requirements

### Requirement: Khách gọi ly tùy biến
Đơn ở quầy của món trà SHALL có thể mang một tùy chọn (Size L, thêm topping, thêm foam) chọn theo trọng số trong dữ liệu; món không thuộc mini-game pha ly không có tùy chọn.

#### Scenario: Phân bố theo trọng số
- **WHEN** sinh nhiều đơn cho một món trà
- **THEN** tỉ lệ đơn theo từng tùy chọn gần trọng số của nó, và có cả đơn ly thường

#### Scenario: Món khác
- **WHEN** khách gọi món ở quầy của tiệm xôi hoặc món không có tùy chọn
- **THEN** đơn không có tùy chọn và cách phục vụ như trước

### Requirement: Đếm ly theo tùy chọn
Ô quầy SHALL đếm số ly theo từng tùy chọn; pha xong ly nào cộng đúng loại đó, và tổng theo loại luôn khớp số ly của ô.

#### Scenario: Pha nhiều loại
- **WHEN** pha một ly thường và một ly Size L cùng món
- **THEN** ô quầy có 2 ly, gồm 1 thường và 1 Size L

#### Scenario: Số ly đổi ở nơi khác
- **WHEN** số ly của ô đổi do bán, hết hạn hoặc trả ly
- **THEN** đọc lại ô cho tổng theo loại bằng số ly

### Requirement: Phục vụ và tính tiền theo ly
Khi phục vụ, khách SHALL nhận đúng ly yêu cầu nếu có; nếu không thì nhận một ly khác trong ô. Tiền SHALL tính theo giá món cộng phụ thu của ly được đưa, nhưng không cao hơn giá món khách đã gọi.

#### Scenario: Đúng ly
- **WHEN** quầy có đúng loại khách gọi
- **THEN** khách nhận ly đó, không bị phạt, trả giá món cộng phụ thu của loại đó

#### Scenario: Ly kém hơn
- **WHEN** khách gọi Size L mà quầy chỉ có ly thường
- **THEN** khách nhận ly thường, trả giá ly thường và bị trừ một sao

#### Scenario: Ly tốt hơn
- **WHEN** khách gọi ly thường mà quầy chỉ có ly có phụ thu
- **THEN** khách không bị phạt và chỉ trả giá ly thường

### Requirement: Hiển thị
Yêu cầu của khách SHALL nêu tùy chọn; nhãn ô quầy SHALL nêu số ly theo loại khi ô có nhiều loại.

#### Scenario: Nhãn
- **WHEN** ô quầy có 2 ly thường và 1 ly Size L
- **THEN** nhãn nêu tổng 3 ly kèm phân loại
