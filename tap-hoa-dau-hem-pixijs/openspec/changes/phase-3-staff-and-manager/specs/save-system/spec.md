## ADDED Requirements

### Requirement: Migrate bản lưu v3 lên v4
Khi tải bản lưu version 3, hệ thống SHALL thêm các trường nhân viên, lịch ca, quy tắc tự động, lịch sử phân tích, `lastSeen` với giá trị mặc định rỗng; giữ nguyên dữ liệu Phase 1a và Phase 2, đồng thời giữ bản v3 làm dự phòng.

#### Scenario: Người chơi giai đoạn 2 cập nhật
- **WHEN** người chơi level 9 với EXP đủ level 11 mở bản giai đoạn 3
- **THEN** bản lưu được migrate, người chơi lên level 11 và thấy hướng dẫn tuyển nhân viên

### Requirement: Lưu thời điểm cuối
Mỗi lần lưu SHALL ghi `lastSeen` là thời gian thực hiện tại để phục vụ thu nhập offline.

#### Scenario: Tab bị ẩn
- **WHEN** người chơi chuyển sang ứng dụng khác
- **THEN** game lưu kèm `lastSeen` mới
