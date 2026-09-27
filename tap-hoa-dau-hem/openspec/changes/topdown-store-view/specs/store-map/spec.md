## ADDED Requirements

### Requirement: Sơ đồ tiệm và chi tiết kệ
Game SHALL có màn Sơ đồ tiệm vẽ mặt bằng từ trên xuống. Khi chạm một nội thất bày hàng, màn này hiện từng món: tên, số lượng, giá bán hiện tại, giá gợi ý, phần trăm bán xả và hạn dùng sớm nhất.

#### Scenario: Chạm kệ để xem giá
- **WHEN** người chơi chạm Kệ 1 đang bày mì gói giá 5.000đ
- **THEN** bảng chi tiết hiện "Mì gói", số lượng còn trên kệ và giá 5.000đ

#### Scenario: Xem nhà kho
- **WHEN** người chơi bấm "Xem nhà kho"
- **THEN** màn hiện số ô đã dùng trên sức chứa và từng món trong kho, gộp theo món, kèm hạn sớm nhất

### Requirement: Xem tiệm khác trong chuỗi
Sơ đồ tiệm SHALL xem được kệ và kho của mọi tiệm trong chuỗi mà không đổi tiệm đang đứng. Tiệm khác MUST chỉ được xem, không sửa được.

#### Scenario: Xem chi nhánh Chợ
- **WHEN** người chơi đang ở Tiệm chính và chọn tab "Chợ"
- **THEN** màn hiện mặt bằng và kho của chi nhánh Chợ, còn tiệm đang đứng vẫn là Tiệm chính

### Requirement: Sơ đồ trực tiếp trong giờ bán
Trong giờ bán, game SHALL cho mở sơ đồ trực tiếp. Trên đó khách đi theo đường ngắn nhất trên lưới tới kệ đang nhắm, xếp hàng ở quầy rồi đi về. Nhân viên đứng ở chỗ ứng với việc đang làm. Sơ đồ MUST NOT thay đổi kết quả mô phỏng.

#### Scenario: Khách đi tới kệ
- **WHEN** khách bắt đầu tìm món ở Kệ 2
- **THEN** hình khách đi từ vị trí hiện tại tới một ô đứng cạnh Kệ 2 mà không đi xuyên nội thất
