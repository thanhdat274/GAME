## ADDED Requirements

### Requirement: Bản đồ phố theo định dạng Tiled
Hệ thống SHALL đọc bản đồ phố từ file Tiled JSON gồm lớp `ground`, lớp `objects` và nhóm đối tượng `lots`, và kiểm tra tính hợp lệ khi build.

#### Scenario: Bản đồ hợp lệ
- **WHEN** chạy `validateContent` trên dữ liệu trong repo
- **THEN** không có lỗi về `cityMap.json`

#### Scenario: Lô đất trỏ tới cửa hàng không tồn tại
- **WHEN** một lô có `storeId` không phải `main`, không phải id trong `branches.json` và không rỗng
- **THEN** validator báo lỗi nêu tên lô và `storeId`

#### Scenario: Chi nhánh thiếu lô đất
- **WHEN** một chi nhánh trong `branches.json` không có lô đất nào
- **THEN** validator báo lỗi

### Requirement: Cảnh bản đồ phố tương tác
Hệ thống SHALL có màn `City` cho phép kéo để di chuyển, thu phóng theo bước nguyên và chạm một tòa nhà để xem thông tin.

#### Scenario: Camera không ra ngoài bản đồ
- **WHEN** người chơi kéo hoặc thu phóng
- **THEN** camera bị giới hạn trong kích thước bản đồ

#### Scenario: Chạm tòa nhà đã mở
- **WHEN** người chơi chạm một tiệm đã mở
- **THEN** bảng thông tin có nút Ghé tiệm, Xem kệ và Danh sách/Gửi hàng

#### Scenario: Chạm tòa nhà chưa mở
- **WHEN** người chơi chạm một chi nhánh chưa mở
- **THEN** bảng hiện phí mở và nút Mở tiệm, bị vô hiệu kèm điều kiện level nếu chưa đủ

#### Scenario: Kéo không kích hoạt chạm
- **WHEN** con trỏ dịch chuyển hơn 8 px trước khi thả
- **THEN** không mở bảng thông tin

### Requirement: Lối vào từ menu
Menu "Bản đồ thành phố" và thanh điều hướng SHALL mở màn `City`; màn danh sách chi nhánh cũ SHALL vẫn truy cập được.

#### Scenario: Mở từ menu Buổi sáng
- **WHEN** người chơi chọn "🗺️ Bản đồ thành phố"
- **THEN** màn `City` mở
