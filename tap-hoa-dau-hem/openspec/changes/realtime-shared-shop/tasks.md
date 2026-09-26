## 1. Runtime có thể serialize

- [x] 1.1 Thêm snapshot/restore cho RNG và `DaySession` (khách, queue, timers, tray, clock)
- [x] 1.2 Test tiếp tục mô phỏng từ snapshot cho kết quả xác định
- [x] 1.3 Định nghĩa aggregate live session, sequence, command envelope/ID và danh sách command cốt lõi

## 2. Backend authoritative

- [x] 2.1 Tạo Firebase Functions TypeScript workspace dùng chung core logic
- [x] 2.2 Implement callable mở/tạo phiên theo UID đã xác thực
- [x] 2.3 Implement command handler cho nhập hàng, sắp kệ, mở tiệm, scan/checkout/thối tiền và ngày mới
- [x] 2.4 Deduplicate command bằng receipt, tuần tự hóa transaction, kiểm tra phase và payload
- [x] 2.5 Implement heartbeat server-time để tiến DaySession một lần dù hai thiết bị cùng gửi
- [x] 2.6 Thêm rules chặn client ghi trực tiếp trạng thái authoritative

## 3. Client realtime

- [x] 3.1 Thêm callable client, Firestore `onSnapshot`, và dừng listener/heartbeat khi tạm rời phiên
- [x] 3.2 Gửi thao tác UI thành command và dựng lại màn chơi từ snapshot authoritative
- [x] 3.3 Hai thiết bị cùng UID nhận cùng sequence; mất mạng khóa gửi lệnh, reconnect lấy snapshot mới
- [x] 3.4 Giữ local cache và checkpoint `GameState` vào save cloud khi hết ngày

## 4. Kiểm thử và phát hành

- [ ] 4.1 Emulator test cho command hợp lệ, command trùng, race hai máy, sai phase và UID khác
- [ ] 4.2 Browser test hai phiên thiết bị giả lập và offline/reconnect
- [ ] 4.3 Kiểm tra latency, reads/writes, quota và đặt cảnh báo chi phí
- [ ] 4.4 Deploy functions/rules/client rồi thử thực tế trên điện thoại và desktop
