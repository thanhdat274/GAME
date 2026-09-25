## ADDED Requirements

### Requirement: Đẩy bản lưu lên cloud
Khi đã đăng nhập, hệ thống SHALL đẩy bản lưu nén lên `users/{uid}/saves/main` khi kết thúc ngày game, khi lên level, khi người chơi bấm "Lưu ngay", và khi tab bị ẩn; các lần đẩy tự động MUST cách nhau tối thiểu 30 giây.

#### Scenario: Hết một ngày
- **WHEN** người chơi đã đăng nhập bấm "Ngày mới" ở màn tổng kết
- **THEN** bản lưu được đẩy lên, `revision` tăng 1 và biểu tượng đồng bộ hiện dấu tích

#### Scenario: Hai lần đẩy liên tiếp
- **WHEN** người chơi lên level 10 giây sau khi vừa đẩy xong
- **THEN** lần đẩy mới được hoãn tới đủ 30 giây

#### Scenario: Lưu ngay
- **WHEN** người chơi bấm "Lưu ngay" ở màn Tài khoản
- **THEN** đẩy lên ngay, bỏ qua khoảng cách 30 giây

### Requirement: Tải tiến trình trên thiết bị khác
Khi mở game đã đăng nhập, hệ thống SHALL tải bản lưu local ngay rồi kiểm tra cloud ở nền (timeout 5 giây); nếu cloud mới hơn và bản local không có thay đổi chưa đồng bộ thì dùng bản cloud, chỉ áp dụng ở màn tiêu đề hoặc buổi sáng.

#### Scenario: Đổi điện thoại
- **WHEN** người chơi đăng nhập trên điện thoại mới chưa có bản lưu
- **THEN** tiến trình từ cloud được tải về và hiện "Đã tải tiến trình từ thiết bị khác"

#### Scenario: Cloud chậm
- **WHEN** tải cloud quá 5 giây
- **THEN** người chơi tiếp tục với bản local và việc kiểm tra được thử lại ở lần đồng bộ sau

### Requirement: Xử lý xung đột
Hệ thống MUST phát hiện xung đột bằng `revision` (ghi trong transaction chỉ khi revision trên cloud bằng `baseRevision` của máy) và không bao giờ ghi đè âm thầm. Khi xung đột, game SHALL hiện hai thẻ "Trên máy này" và "Trên cloud" (level, ngày, tiền, thời gian chơi, lần lưu cuối), gắn nhãn "Tiến trình xa hơn" cho bản có thời gian chơi lớn hơn, và yêu cầu xác nhận lần hai.

#### Scenario: Chơi trên hai máy
- **WHEN** máy A và máy B đều chơi tiếp từ revision 12 và máy A đã đẩy revision 13
- **THEN** máy B đẩy lên thì nhận xung đột và hiện hộp thoại chọn bản

#### Scenario: Giữ bản bị bỏ
- **WHEN** người chơi chọn bản cloud
- **THEN** bản trên máy được lưu vào `thdh.save.discarded` trong 7 ngày và có thể khôi phục ở màn Tài khoản

#### Scenario: Đăng nhập khi cả hai bên có dữ liệu
- **WHEN** người chơi khách level 2 đăng nhập vào tài khoản đã có tiến trình level 6 trên cloud
- **THEN** hiện hộp thoại xung đột, bản level 6 được gắn nhãn "Tiến trình xa hơn"

### Requirement: Chơi offline và đồng bộ lại
Khi mất mạng, game SHALL tiếp tục lưu local và đánh dấu `dirty`; khi có mạng lại (sự kiện `online`) hoặc ở lần đẩy kế tiếp, hệ thống tự đồng bộ.

#### Scenario: Mất mạng giữa buổi chơi
- **WHEN** người chơi chơi 3 ngày game khi không có mạng
- **THEN** biểu tượng đồng bộ hiện "Chưa đồng bộ" và khi có mạng lại thì tự đẩy lên

### Requirement: Trạng thái đồng bộ
HUD SHALL có biểu tượng nhỏ thể hiện trạng thái: khách, đang đồng bộ, đã đồng bộ, chưa đồng bộ (offline), lỗi; chạm vào thì mở màn Tài khoản.

#### Scenario: Lỗi đồng bộ
- **WHEN** đẩy lên thất bại 3 lần liên tiếp không phải do mất mạng
- **THEN** biểu tượng chuyển sang lỗi và màn Tài khoản hiện mô tả lỗi và nút "Thử lại"

### Requirement: Giờ máy chủ
Khi đã đăng nhập, hệ thống SHALL cung cấp `getServerNow()` dựa trên `serverTimestamp()` của Firestore để các hệ thống tính thời gian thực (thu nhập offline) không phụ thuộc đồng hồ thiết bị.

#### Scenario: Đồng hồ máy bị chỉnh
- **WHEN** đồng hồ điện thoại bị chỉnh nhanh 5 giờ
- **THEN** `getServerNow()` vẫn trả về giờ đúng của máy chủ

### Requirement: Bảo mật và giới hạn kích thước
Quy tắc Firestore MUST chỉ cho người dùng đã đăng nhập đọc/ghi/xóa dữ liệu trong `users/{theirUid}`, yêu cầu `revision` tăng đúng 1 mỗi lần ghi, và từ chối tài liệu ≥ 1MB; client MUST không đẩy bản nén lớn hơn 900KB.

#### Scenario: Đọc dữ liệu người khác
- **WHEN** một người dùng đã đăng nhập cố đọc `users/{uid-khác}/saves/main`
- **THEN** Firestore từ chối với lỗi thiếu quyền

#### Scenario: Bản lưu quá lớn
- **WHEN** bản lưu nén vượt 900KB
- **THEN** client không đẩy lên, giữ `dirty`, hiện lỗi "Bản lưu quá lớn" và ghi log để nhà phát triển xử lý

### Requirement: Tắt tính năng bằng cờ
Cờ build `VITE_CLOUD_SAVE=off` SHALL ẩn toàn bộ nút đăng nhập và không tải Firebase, game hoạt động như chỉ lưu local.

#### Scenario: Tắt khẩn cấp
- **WHEN** build với `VITE_CLOUD_SAVE=off`
- **THEN** không có nút đăng nhập và không có yêu cầu mạng nào tới Firebase
