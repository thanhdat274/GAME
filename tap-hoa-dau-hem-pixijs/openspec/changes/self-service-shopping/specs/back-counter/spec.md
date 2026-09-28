## ADDED Requirements

### Requirement: Hàng sau quầy
Tiệm SHALL có kho nhỏ sau quầy (mặc định 4 ô, mỗi ô tối đa 5 đơn vị, mở từ level 3) chỉ chứa các mặt hàng có đánh dấu `behindCounter` trong `products.json` (mặc định: thẻ cào điện thoại, gas mini, bật lửa). Khách MUST NOT tự lấy các mặt hàng này; người chơi xếp hàng vào ô sau quầy ở buổi sáng từ kho, giống bày kệ.

#### Scenario: Bày hàng sau quầy
- **WHEN** người chơi kéo thẻ cào từ khay kho vào một ô sau quầy trống
- **THEN** ô đó được gán thẻ cào và nạp tối đa 5 đơn vị từ kho

#### Scenario: Món thường không vào ô sau quầy
- **WHEN** người chơi kéo mì gói vào ô sau quầy
- **THEN** thao tác bị từ chối và hiện "Chỉ để hàng đặc biệt"

#### Scenario: Món sau quầy không lên kệ
- **WHEN** người chơi kéo gas mini vào một ô của kệ
- **THEN** thao tác bị từ chối

### Requirement: Yêu cầu tại quầy
Khách SHALL có xác suất (theo kiểu khách, giá trị trong `customers.json`) thêm một dòng hàng sau quầy vào giỏ khi tới quầy; dòng này hiện bong bóng "Cho em <món>" và người chơi SHALL chạm ô sau quầy chứa đúng loại đó trong thời gian giới hạn (mặc định 6 giây) để đưa hàng cho khách.

#### Scenario: Phục vụ kịp
- **WHEN** khách xin 1 thẻ cào và người chơi chạm ô thẻ cào trong 6 giây
- **THEN** dòng đó được thêm vào giỏ, ô giảm 1 và khách chờ quét tiếp

#### Scenario: Chạm sai ô
- **WHEN** người chơi chạm ô sau quầy không phải món khách xin
- **THEN** khách lắc đầu, kiên nhẫn -2 giây và hàng không bị trừ

#### Scenario: Quá thời gian
- **WHEN** hết thời gian giới hạn mà người chơi chưa đưa hàng
- **THEN** khách bỏ dòng đó và mức hài lòng giảm 1 sao

#### Scenario: Hết hàng sau quầy
- **WHEN** khách xin món mà ô sau quầy đã hết hoặc chưa bày
- **THEN** bong bóng chuyển thành "Hết rồi" ngay, khách bỏ dòng đó và mức hài lòng giảm 1 sao

### Requirement: Mở khóa hàng sau quầy
Hàng sau quầy và yêu cầu tại quầy SHALL chỉ xuất hiện từ level mở khóa trong `levels.json` (mặc định level 3); trước đó không khách nào xin và tab "Sau quầy" ở buổi sáng ẩn.

#### Scenario: Level 2
- **WHEN** người chơi ở level 2
- **THEN** không có ô sau quầy và không khách nào xin hàng đặc biệt

#### Scenario: Lên level 3
- **WHEN** người chơi lên level 3
- **THEN** popup mở khóa hiện "Hàng sau quầy" và buổi sáng hôm sau có tab "Sau quầy"
