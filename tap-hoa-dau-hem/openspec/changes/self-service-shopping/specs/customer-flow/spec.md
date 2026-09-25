## MODIFIED Requirements

### Requirement: Sinh khách theo giờ
Hệ thống SHALL sinh khách theo đường cong mật độ trong ngày (đông 07–09h, 11–13h, 17–19h) với tốc độ phụ thuộc sao tiệm; tối đa 3 khách đang chọn hàng trong tiệm và tối đa 3 khách chờ ở quầy (giá trị mặc định lấy từ `balance.json`).

#### Scenario: Giờ cao điểm
- **WHEN** đồng hồ game ở 17:30
- **THEN** khoảng cách trung bình giữa hai khách ngắn hơn so với 14:30

#### Scenario: Tiệm mới mở
- **WHEN** đang là ngày 1 hoặc ngày 2
- **THEN** lượng khách bằng 60% (ngày 1) và 80% (ngày 2) so với bình thường

#### Scenario: Tiệm đầy khách
- **WHEN** đã có đủ số khách đang chọn hàng hoặc hàng chờ ở quầy đã đầy
- **THEN** không sinh thêm khách cho tới khi có chỗ

### Requirement: Yêu cầu mua hàng
Mỗi khách SHALL có danh sách mua 1–3 món (có số lượng) chọn từ các mặt hàng đã mở khóa theo tỉ lệ ưa thích của kiểu khách; danh sách này là ý định của khách, không hiện bong bóng cho người chơi trước khi khách ra quầy.

#### Scenario: Chỉ mua món đã mở khóa
- **WHEN** người chơi ở level 1
- **THEN** không khách nào mua món ăn vặt hoặc đồ dùng

#### Scenario: Khách thích ăn vặt
- **WHEN** khách kiểu "học sinh" xuất hiện ở level 2
- **THEN** danh sách mua có xác suất cao chứa món ăn vặt

### Requirement: Khách tự chọn hàng
Sau khi vào tiệm, khách SHALL lần lượt đi tới khu hàng của từng món trong danh sách, mất thời gian đi và lấy theo `balance.json`, rồi tự lấy món từ ô kệ có món đó trong khu và bỏ vào giỏ; người chơi MUST NOT phải chạm kệ để lấy hàng cho khách.

#### Scenario: Lấy đủ hàng
- **WHEN** khách cần 2 gói mì và khu đồ khô có 5 gói mì
- **THEN** sau khi khách lấy xong, ô kệ giảm 2 và giỏ khách có 2 gói mì

#### Scenario: Nhiều khách cùng lấy
- **WHEN** hai khách cùng cần món mà kệ chỉ còn 1 đơn vị
- **THEN** khách tới lấy trước có món, khách sau không có món đó

### Requirement: Hết hàng khi khách tìm
Khi khách tới khu mà món cần đã hết, khách SHALL bỏ món đó khỏi giỏ, hiện biểu cảm buồn kèm "Hết!", ghi món vào nhu cầu bị bỏ lỡ của ngày và bị trừ 1 sao (tối đa 1 sao cho mỗi khách dù thiếu nhiều món).

#### Scenario: Thiếu một phần
- **WHEN** một món trong danh sách đã hết trên kệ khi khách tới lấy, các món còn lại có đủ
- **THEN** khách vẫn lấy các món còn lại, ra quầy trả tiền các món đã có và mức hài lòng giảm 1 sao

#### Scenario: Không lấy được món nào
- **WHEN** tất cả món khách cần đều không có trên kệ
- **THEN** khách bỏ về với biểu cảm buồn, không trả tiền và ghi 1 sao

### Requirement: Xếp hàng ở quầy
Sau khi chọn xong, khách SHALL ra quầy xếp hàng; khách đứng đầu hàng SHALL được phục vụ (quét hàng, tính tiền); khách chưa tới lượt hao kiên nhẫn chậm hơn khách đang được phục vụ.

#### Scenario: Ra quầy khi chưa có ai
- **WHEN** khách chọn xong hàng và quầy trống
- **THEN** khách được phục vụ ngay và giỏ hiện trên quầy

#### Scenario: Xếp hàng
- **WHEN** đang phục vụ một khách và khách thứ hai chọn xong
- **THEN** khách thứ hai đứng chờ và mất kiên nhẫn theo tỉ lệ hàng chờ

### Requirement: Kiểu khách
Giai đoạn 1 SHALL có 4 kiểu khách định nghĩa trong `customers.json`: học sinh (thích ăn vặt, ít tiền), bà nội trợ (thích đồ khô), chú xe ôm (mua nhanh, kiên nhẫn thấp), cô văn phòng (thích đồ dùng, tip cao).

#### Scenario: Khách học sinh
- **WHEN** khách kiểu "học sinh" xuất hiện ở level 2
- **THEN** danh sách mua có xác suất cao chứa món ăn vặt

### Requirement: Kiên nhẫn
Mỗi khách SHALL có thanh kiên nhẫn (mặc định 20 giây, đổi màu xanh → vàng → đỏ) chỉ hao khi khách đã ra quầy chờ hoặc đang được phục vụ; thời gian đi chọn hàng của khách không tính vào kiên nhẫn. Hết kiên nhẫn thì bỏ về.

#### Scenario: Phục vụ kịp
- **WHEN** người chơi quét hàng và thối tiền trước khi hết kiên nhẫn
- **THEN** khách hài lòng, sao đánh giá theo phần kiên nhẫn còn lại (≥ 50% = 5 sao)

#### Scenario: Hết kiên nhẫn
- **WHEN** thanh kiên nhẫn về 0
- **THEN** khách bỏ về, không trả tiền, ghi 1 sao, giỏ hàng trả lại kệ (hoặc kho nếu kệ không còn chỗ)

#### Scenario: Đang chọn hàng
- **WHEN** khách đang đi lấy hàng trong tiệm
- **THEN** thanh kiên nhẫn không giảm

## REMOVED Requirements

### Requirement: Lấy hàng cho khách
**Reason**: Khách tự lấy hàng theo khu (xem "Khách tự chọn hàng"), người chơi không nhặt hàng cho khách nữa.
**Migration**: Thao tác chạm ô kệ trong lúc bán chỉ còn là nạp hàng (xem `shelf-display`) và lấy hàng sau quầy (xem `back-counter`). Sự kiện "lấy sai" bị bỏ; `DaySession.pick`, `PickResult`, sự kiện `customerFront/picked/wrongPick` được thay bằng `customerBrowse`, `itemTaken`, `itemMissing`, `basketReady`.
