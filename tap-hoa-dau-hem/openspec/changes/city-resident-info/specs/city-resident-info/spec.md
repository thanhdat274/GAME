## ADDED Requirements

### Requirement: Danh sách định mua từ hàng thật
Hệ thống SHALL sinh danh sách định mua của một người từ các mặt hàng đang có trên kệ của tiệm họ chọn, không vượt số lượng đang có, tối đa `maxItems` dòng của loại khách.

#### Scenario: Chỉ hàng đang có
- **WHEN** sinh danh sách cho một tiệm chỉ có vài mặt hàng còn
- **THEN** mọi dòng đều là mặt hàng còn trên kệ với số lượng không vượt tồn

#### Scenario: Sở thích
- **WHEN** một học sinh và một người nội trợ cùng chọn từ một tiệm bán đủ nhóm hàng
- **THEN** học sinh chọn đồ ăn vặt/đồ uống nhiều hơn người nội trợ, người nội trợ chọn hàng khô/tươi nhiều hơn

#### Scenario: Kệ trống
- **WHEN** tiệm không còn hàng nào
- **THEN** danh sách rỗng

#### Scenario: Bán sỉ
- **WHEN** tiệm có hệ số số lượng lớn hơn 1
- **THEN** số lượng mỗi dòng được nhân hệ số nhưng vẫn không vượt tồn

### Requirement: Thông tin người dân
Bấm vào một người dân trên bản đồ phố SHALL mở bảng có tên, loại khách, trạng thái hiện tại, danh sách định mua hoặc vừa mua và sở thích; bảng cập nhật khi trạng thái đổi.

#### Scenario: Đang đi tới tiệm
- **WHEN** người đó đang đi tới một tiệm
- **THEN** bảng nêu tên tiệm và danh sách định mua kèm tổng tiền ước tính

#### Scenario: Kệ trống ra về
- **WHEN** người đó vào tiệm hết hàng
- **THEN** khi ra, bảng ghi kệ trống và ra về tay không

#### Scenario: Theo dõi
- **WHEN** bấm nút theo dõi
- **THEN** camera đi theo người đó cho đến khi kéo bản đồ hoặc bấm nút về giữa

### Requirement: Không ảnh hưởng gameplay
Danh sách định mua SHALL không trừ kho, không ghi doanh thu hay thay đổi dữ liệu lưu.

#### Scenario: Trạng thái không đổi
- **WHEN** nhiều người "mua" ở các tiệm trong lúc xem bản đồ phố
- **THEN** `GameState` giống hệt trước khi vào màn
