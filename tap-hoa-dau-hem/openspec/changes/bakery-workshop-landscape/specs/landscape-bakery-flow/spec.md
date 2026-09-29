## ADDED Requirements

### Requirement: Màn ngang là luồng chơi đầy đủ
Luồng bakery SHALL hỗ trợ hoàn tất các hành động thiết yếu trên màn hình ngang mà không yêu cầu xoay thiết bị sang dọc.

#### Scenario: Vận hành ở ngang rộng
- **WHEN** người chơi dùng bakery ở profile `landscape-wide`
- **THEN** có thể xem mặt bằng, mở công thức, làm bánh, xem thành phẩm và quay lại Shop mà không bị cắt nội dung hoặc che thao tác

#### Scenario: Vận hành ở ngang gọn
- **WHEN** người chơi dùng bakery ở profile `landscape-compact`
- **THEN** có thể hoàn tất cùng các hành động qua panel/tab/drawer thích hợp, với nội dung đang chọn được giữ khi chuyển panel

### Requirement: Bố cục bếp ngang theo ngữ cảnh
Kitchen/Cook SHALL trình bày thông tin theo profile ngang: công thức và điều kiện, thao tác làm, trạng thái thành phẩm; giao diện SHALL không làm giảm vùng tương tác mini-game đến mức không thể thao tác cảm ứng.

#### Scenario: Công thức thiếu điều kiện
- **WHEN** công thức bị khóa, thiếu nguyên liệu hoặc thiếu trạm
- **THEN** trạng thái và nguyên nhân hiển thị rõ mà không che nút quay lại hoặc vùng mini-game

#### Scenario: Mini-game ở ngang gọn
- **WHEN** chiều cao viewport ngang bị giới hạn
- **THEN** mini-game, prompt, nút làm xong và nút quay lại cùng nằm trong viewport hoặc có cách cuộn/panel rõ ràng

### Requirement: Tương tác trạm và vùng chạm
Các trạm bakery SHALL có thể được đặt và tương tác bằng cảm ứng/chuột trong Shop top-down; hit area SHALL tránh xung đột với lối đi, HUD, rail và safe-area.

#### Scenario: Mở lò trong Shop
- **WHEN** người chơi chọn lò hoặc bàn làm bánh trong mặt bằng
- **THEN** đúng panel hoặc công thức liên quan được mở, không làm thay đổi đồng hồ/mô phỏng ngoài quy tắc gameplay hiện có

#### Scenario: Safe-area ngang
- **WHEN** viewport ngang có notch hoặc safe-area inset
- **THEN** nút điều hướng và nút thao tác bakery vẫn nhìn thấy và nhận chạm được

### Requirement: Giữ trạng thái khi đổi panel
Khi chuyển giữa danh sách công thức, thao tác làm và thành phẩm trong profile ngang gọn, giao diện SHALL giữ recipe đang chọn và SHALL không tự tiêu thụ nguyên liệu hoặc reset phiên Shop.

#### Scenario: Đổi tab khi đang xem recipe
- **WHEN** người chơi mở panel thành phẩm rồi quay lại danh sách công thức
- **THEN** recipe đang chọn được giữ nếu còn hợp lệ, và trạng thái phiên bán không bị khởi tạo lại
