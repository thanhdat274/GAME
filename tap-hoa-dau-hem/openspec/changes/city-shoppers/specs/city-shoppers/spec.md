## ADDED Requirements

### Requirement: Chọn tiệm theo dữ liệu thật
Hệ thống SHALL tính trọng số ghé tiệm từ `traffic` của chi nhánh, tỉ lệ kệ có hàng và độ hợp giữa sở thích loại khách với nhóm hàng của loại tiệm, và chỉ xét các tiệm đã mở đang trong giờ mở cửa.

#### Scenario: Sở thích khác nhau
- **WHEN** một học sinh và một người nội trợ cùng chọn giữa quầy giải khát và tiệm rau củ
- **THEN** học sinh có trọng số cao hơn cho quầy giải khát, người nội trợ cao hơn cho tiệm rau củ

#### Scenario: Kệ trống ít khách
- **WHEN** hai tiệm giống hệt nhau nhưng một tiệm hết hàng
- **THEN** tiệm hết hàng có trọng số thấp hơn nhưng vẫn lớn hơn 0

#### Scenario: Ngoài giờ mở cửa
- **WHEN** giờ trên phố nằm ngoài giờ mở cửa
- **THEN** không chọn được tiệm nào

### Requirement: Dân phố đi mua
Dân phố SHALL đi tới cửa tiệm đã chọn, vào trong vài giây rồi ra và tiếp tục; cửa nhấp sáng khi có người vào hoặc ra.

#### Scenario: Ghé tiệm
- **WHEN** một người rảnh chọn được tiệm
- **THEN** họ đi theo đường bộ tới cửa, biến mất trong lúc ở trong tiệm, rồi xuất hiện lại ở cửa

#### Scenario: Tiệm đóng lúc tới nơi
- **WHEN** người đó tới cửa nhưng tiệm vừa hết giờ mở
- **THEN** họ không vào và đi tiếp

### Requirement: Không ảnh hưởng gameplay
Việc dân phố ghé tiệm SHALL không thay đổi tiền, kho, doanh thu hay dữ liệu lưu.

#### Scenario: Trạng thái không đổi
- **WHEN** ở màn bản đồ phố một thời gian có nhiều người vào ra tiệm
- **THEN** `GameState` giống hệt trước khi vào màn
