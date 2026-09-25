## ADDED Requirements

### Requirement: Siêu dữ liệu đồng bộ
Bản lưu local SHALL có thêm khối `sync` gồm `baseRevision`, `dirty`, `lastSyncedAt`, `deviceId` (sinh ngẫu nhiên một lần cho mỗi thiết bị); bản lưu cũ không có khối này MUST được bổ sung giá trị mặc định khi tải mà không cần tăng version.

#### Scenario: Bản lưu giai đoạn 1 cũ
- **WHEN** tải bản lưu v1 không có `sync`
- **THEN** `sync` được thêm với `baseRevision: 0`, `dirty: true` và `deviceId` mới

#### Scenario: Lưu local sau khi thay đổi
- **WHEN** game tự lưu local khi chuyển pha
- **THEN** `dirty` được đặt thành true cho tới khi đẩy cloud thành công

### Requirement: Tóm tắt bản lưu
Mỗi bản lưu SHALL có `summary` gồm level, ngày, tiền và tổng thời gian chơi (giây), cập nhật mỗi lần lưu, để hiển thị khi chọn bản.

#### Scenario: Tính thời gian chơi
- **WHEN** người chơi chơi 10 phút rồi lưu
- **THEN** `summary.playSeconds` tăng khoảng 600 (không tính thời gian tạm dừng hoặc tab ẩn)

### Requirement: Nén bản lưu
Hàm nén/giải nén bản lưu (lz-string UTF-16) SHALL dùng chung cho cloud và mã sao lưu; giải nén lỗi MUST được xử lý như bản lưu hỏng (giữ `.bak`, báo lỗi).

#### Scenario: Nén rồi giải nén
- **WHEN** một trạng thái game được nén rồi giải nén
- **THEN** kết quả giống hệt trạng thái ban đầu
