# Chơi realtime trên nhiều thiết bị

## Mục tiêu

Cho phép hai thiết bị đăng nhập cùng tài khoản Google cùng điều khiển một tiệm. Hành động và mô phỏng khách phải dùng một trạng thái có thứ tự chung, không đẩy hai bản save độc lập rồi hỏi chọn khi xung đột.

## Phạm vi

- Lưu runtime của ngày đang mở (khách, hàng đợi, RNG, timer) để mô phỏng có thể tiếp tục sau mỗi yêu cầu server.
- Gửi thao tác người chơi thành command có ID duy nhất; server xác thực và áp dụng tuần tự.
- Phát snapshot mới cho các thiết bị đang tham gia; localStorage tiếp tục giữ cache và bản dự phòng.
- Mất kết nối thì khóa thao tác ảnh hưởng đến trạng thái chung cho đến khi đồng bộ lại.

## Ngoài phạm vi ban đầu

- Mời tài khoản Google khác vào tiệm.
- Chơi offline rồi tự hòa giải nhiều thao tác cùng lúc.
- Máy chủ liên tục chạy WebSocket; phiên bản đầu dùng callable functions và nhịp đồng bộ thưa phù hợp game thao tác theo lượt.

## Vì sao

Cloud save hiện tại là snapshot riêng theo thiết bị. Revision ngăn ghi đè âm thầm nhưng không cho hai máy cùng thao tác lên một trạng thái. Realtime cần một luồng server-authoritative duy nhất.
