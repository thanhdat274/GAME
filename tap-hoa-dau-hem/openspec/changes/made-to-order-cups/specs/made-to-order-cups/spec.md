## ADDED Requirements

### Requirement: Kiểu phục vụ của món trà
Mỗi món trà SHALL có kiểu phục vụ `ready` (pha sẵn) hoặc `order` (pha theo đơn), mặc định `ready`; món `order` SHALL không pha sẵn được.

#### Scenario: Pha sẵn món pha theo đơn
- **WHEN** người chơi hoặc nhân viên cố pha sẵn một món `order`
- **THEN** bị từ chối với lý do pha theo đơn và không trừ nguyên liệu

#### Scenario: Khách gọi món pha theo đơn khi quầy trống
- **WHEN** khách gọi món `order` và quầy không có ly
- **THEN** yêu cầu vẫn diễn ra (không tính là hết món) miễn còn nguyên liệu và có trạm pha

### Requirement: Pha ngay khi khách chờ
Người chơi SHALL bấm Pha ngay để pha đúng ly khách gọi: nguyên liệu bị trừ lập tức, ly mất `prepSeconds` để pha, xong thì khách nhận đúng ly với giá món cộng phụ thu; trong lúc pha kiên nhẫn của khách giảm dần.

#### Scenario: Pha xong
- **WHEN** mẻ pha chạy hết thời gian khi khách còn chờ
- **THEN** khách nhận đúng loại ly gọi, không bị phạt loại ly, và trả đủ giá

#### Scenario: Khách rời khi đang pha
- **WHEN** khách hết kiên nhẫn hoặc rời hàng trước khi pha xong
- **THEN** mẻ bị hủy và nguyên liệu không được hoàn lại

#### Scenario: Thiếu nguyên liệu hoặc trạm
- **WHEN** thiếu nguyên liệu hoặc không có trạm pha
- **THEN** không pha được và khách tính là hết món như trước

### Requirement: Pha sẵn vẫn phục vụ tức thì
Món `ready` có ly trên quầy SHALL được phục vụ ngay từ quầy (đúng loại, hoặc ly thay thế như hiện nay); khi thiếu đúng loại người chơi MAY chọn pha ngay.

#### Scenario: Chọn pha ngay thay vì ly thay thế
- **WHEN** khách gọi Size L mà quầy chỉ có ly thường
- **THEN** người chơi có thể pha ngay ly Size L thay vì đưa ly thường bị trừ sao

### Requirement: Mọi đường phục vụ cùng quy tắc
Thu ngân và chế độ tự phục vụ SHALL áp dụng cùng quy tắc chọn ly, tính giá, phạt và pha theo đơn như người chơi.

#### Scenario: Thu ngân phục vụ ly tùy biến
- **WHEN** thu ngân phục vụ khách gọi Size L mà quầy chỉ có ly thường
- **THEN** khách nhận ly thường, trả giá ly thường và bị trừ một sao

#### Scenario: Tự phục vụ món pha theo đơn
- **WHEN** chạy một ngày bỏ qua ngày với thực đơn chỉ có món `order` và quầy trống
- **THEN** khách vẫn được phục vụ nhờ pha ngay và ngày có doanh thu
