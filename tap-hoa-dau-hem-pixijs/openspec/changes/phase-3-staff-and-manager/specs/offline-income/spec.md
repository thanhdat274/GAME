## ADDED Requirements

### Requirement: Tính thu nhập khi vắng mặt
Khi người chơi đã mở khóa chế độ quản lý và mở lại game, hệ thống SHALL tính thu nhập offline cho thời gian vắng mặt (tối đa 8 giờ thật) bằng mô hình rút gọn: lãi trung bình 3 ngày quản lý gần nhất × số ngày game tương đương × 60%, giới hạn bởi tồn kho và trừ lương, điện, hàng hỏng.

#### Scenario: Vắng 2 giờ
- **WHEN** người chơi quay lại sau 2 giờ thật
- **THEN** hiện màn "Trong lúc bạn vắng mặt..." với số ngày đã trôi qua, tiền lãi, món đã bán và hàng hỏng, rồi cộng vào trạng thái

#### Scenario: Hết hàng giữa chừng
- **WHEN** tồn kho chỉ đủ bán cho 1 ngày game nhưng thời gian vắng tương đương 4 ngày
- **THEN** thu nhập chỉ tính tới khi hết hàng (sau khi áp dụng quy tắc đặt hàng tự động nếu đủ tiền) và ghi "Tiệm hết hàng từ ngày ..."

#### Scenario: Chưa mở khóa quản lý
- **WHEN** người chơi dưới level 20 quay lại sau 5 giờ
- **THEN** không có thu nhập offline và game tiếp tục đúng chỗ đã lưu

### Requirement: Chống chỉnh đồng hồ
Khi người chơi đã đăng nhập, thời gian vắng mặt SHALL được tính bằng giờ máy chủ (`getServerNow()` trừ `updatedAt` của bản lưu trên cloud). Khi chơi khách, hệ thống dùng giờ thiết bị và MUST bỏ qua thu nhập offline nếu thời gian hiện tại nhỏ hơn lần lưu cuối.

#### Scenario: Đã đăng nhập, chỉnh đồng hồ nhanh
- **WHEN** người chơi đã đăng nhập chỉnh đồng hồ điện thoại nhanh 8 giờ rồi mở game
- **THEN** thời gian vắng mặt được tính theo giờ máy chủ và không được cộng thêm 8 giờ

#### Scenario: Lùi đồng hồ máy
- **WHEN** đồng hồ thiết bị bị chỉnh lùi trước `lastSeen`
- **THEN** không tính thu nhập offline và cập nhật `lastSeen`
