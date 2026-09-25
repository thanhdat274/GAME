## ADDED Requirements

### Requirement: Sinh khách theo giờ
Hệ thống SHALL sinh khách theo đường cong mật độ trong ngày (đông 07–09h, 11–13h, 17–19h) với tốc độ phụ thuộc sao tiệm; tối đa 3 khách chờ ở quầy.

#### Scenario: Giờ cao điểm
- **WHEN** đồng hồ game ở 17:30
- **THEN** khoảng cách trung bình giữa hai khách ngắn hơn so với 14:30

#### Scenario: Quầy đầy
- **WHEN** đã có 3 khách chờ
- **THEN** không sinh thêm khách cho tới khi có chỗ

### Requirement: Kiểu khách
Giai đoạn 1 SHALL có 4 kiểu khách định nghĩa trong `customers.json`: học sinh (thích ăn vặt, ít tiền), bà nội trợ (thích đồ khô), chú xe ôm (mua nhanh, kiên nhẫn thấp), cô văn phòng (thích đồ dùng, tip cao).

#### Scenario: Khách học sinh
- **WHEN** khách kiểu "học sinh" xuất hiện ở level 2
- **THEN** yêu cầu có xác suất cao chứa món ăn vặt

### Requirement: Yêu cầu mua hàng
Mỗi khách SHALL có bong bóng yêu cầu 1–3 món (có số lượng) chọn từ các mặt hàng đã mở khóa theo tỉ lệ ưa thích của kiểu khách.

#### Scenario: Chỉ yêu cầu món đã mở khóa
- **WHEN** người chơi ở level 1
- **THEN** không khách nào yêu cầu món ăn vặt hoặc đồ dùng

### Requirement: Kiên nhẫn
Mỗi khách SHALL có thanh kiên nhẫn (mặc định 20 giây, đổi màu xanh → vàng → đỏ); hết kiên nhẫn thì bỏ về.

#### Scenario: Phục vụ kịp
- **WHEN** người chơi giao đủ hàng và thối tiền trước khi hết kiên nhẫn
- **THEN** khách hài lòng, sao đánh giá theo phần kiên nhẫn còn lại (≥ 50% = 5 sao)

#### Scenario: Hết kiên nhẫn
- **WHEN** thanh kiên nhẫn về 0
- **THEN** khách bỏ về, không trả tiền, ghi 1 sao

### Requirement: Lấy hàng cho khách
Người chơi SHALL chạm vào ô kệ để bỏ hàng vào túi của khách đang được phục vụ; món sai loại MUST không được nhận.

#### Scenario: Lấy đúng
- **WHEN** khách cần 2 gói mì và người chơi chạm ô mì 2 lần
- **THEN** yêu cầu mì được đánh dấu xong và ô kệ giảm 2

#### Scenario: Lấy sai
- **WHEN** người chơi chạm món khách không cần
- **THEN** món không bị trừ khỏi kệ và khách lắc đầu, kiên nhẫn -2 giây

#### Scenario: Thiếu một phần
- **WHEN** một món trong yêu cầu đã hết trên kệ và người chơi bấm "Tính tiền"
- **THEN** khách chỉ trả tiền các món đã nhận và mức hài lòng giảm 1 sao
