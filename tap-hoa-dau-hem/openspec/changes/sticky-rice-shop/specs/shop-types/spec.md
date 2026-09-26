## ADDED Requirements

### Requirement: Loại cửa hàng dữ liệu hóa
Game SHALL định nghĩa các loại cửa hàng trong `shopTypes.json`. Mỗi loại khai báo: `id`, tên, biểu tượng, nhóm hàng được bày bán, danh sách nội thất và trạm nấu được đặt, hồ sơ loại khách, đường cong mật độ khách theo giờ, và kiểu mô phỏng khi vắng chủ (`profit_average` hoặc `production`). Mặc định có hai loại: `grocery` (tạp hóa) và `xoi` (tiệm xôi).

#### Scenario: Tạp hóa giữ nguyên hành vi
- **WHEN** người chơi ở tiệm chính thuộc loại `grocery`
- **THEN** nhóm hàng, nội thất, khách và mô phỏng giống hệt trước change này

#### Scenario: Thêm loại cửa hàng bằng dữ liệu
- **WHEN** nhà phát triển thêm một mục hợp lệ vào `shopTypes.json` chỉ dùng trạm nấu và công thức có sẵn
- **THEN** loại tiệm đó mở được trên bản đồ mà không phải sửa mã core

### Requirement: Kiểm tra dữ liệu loại cửa hàng
Game MUST có trình kiểm tra `shopTypes.json` (chạy cùng `validate:recipes`). Trình kiểm tra báo lỗi khi tham chiếu tới nhóm hàng, nội thất, loại khách hoặc công thức không tồn tại.

#### Scenario: Tham chiếu trạm nấu sai
- **WHEN** `shopTypes.json` khai báo trạm `xung_hap_2` không có trong `furniture.json`
- **THEN** trình kiểm tra thoát với lỗi nêu rõ loại tiệm và id bị sai

### Requirement: Nội thất và hàng theo loại tiệm
Màn Sắp xếp, Nhập hàng và Kệ SHALL chỉ hiện nội thất và mặt hàng mà loại tiệm hiện tại cho phép.

#### Scenario: Không đặt tủ đông ở tiệm xôi
- **WHEN** người chơi mở màn Sắp xếp tại tiệm xôi
- **THEN** danh sách nội thất có xửng hấp, thùng ngâm, quầy xôi, bàn ghế và không có tủ đông
