# Thiết kế: phiên tiệm dùng chung realtime

## D1. Một tài khoản, một phiên tiệm

Hai máy xác thực cùng Firebase UID và mở `users/{uid}/live/main`. Mỗi máy có `deviceId` riêng. Trạng thái live tách khỏi `users/{uid}/saves/main`, là snapshot khôi phục dài hạn.

## D2. Máy chủ quyết định trạng thái

Client gửi command nhỏ (`buyStock`, `assignSlot`, `scanItem`, `addBill`, ...), không ghi toàn bộ `GameState`. Callable Cloud Function kiểm tra người gọi, dedupe `commandId`, đọc snapshot/runtime trong transaction, chạy logic `src/core`, rồi tăng sequence và ghi kết quả. Firestore listener phát snapshot mới tới cả hai máy.

Runtime ngày bán phải serialize được: khách ở từng hàng, khay tiền, refill timers, đồng hồ, timer spawn và trạng thái RNG. Mỗi command hoặc heartbeat tiến mô phỏng theo thời gian server kể từ `simulatedAt`; server clamp khoảng thời gian để tab ngủ/mất mạng không nhảy thời gian game ngoài ý muốn.

## D3. Đồng bộ và reconnect

Thiết bị nghe snapshot realtime. Khi mất kết nối, hiển thị trạng thái offline và khóa thao tác ghi; không tự phát lại command không rõ đã được server nhận chưa. Sau reconnect, lấy snapshot/sequence hiện hành rồi mở lại thao tác. Command ID xử lý an toàn retry.

## D4. Lưu bền và quyền truy cập

Tài liệu `live/main` là trạng thái authoritative bền trên cloud và vẫn tồn tại khi mọi thiết bị rời game; cuối ngày backend checkpoint `GameState` sang save cloud để tương thích khôi phục và đồng bộ solo. Firestore rules chỉ cho UID sở hữu đọc session; client không được ghi trực tiếp vào trạng thái authoritative. Ghi gameplay chỉ đi qua backend dùng Admin SDK. Cần Firebase Emulator tests và quan sát quota trước khi rollout.

## D5. Ràng buộc triển khai

Cloud Functions cần project trên Blaze. Trước deploy phải xác nhận billing budget/alerts; Functions đặt ở region gần Firestore (`asia-southeast1`). Nếu latency hoặc lưu lượng heartbeat không đạt, chuyển runtime sang Cloud Run/WebSocket.
