# Rà soát triển khai (26/09/2026)

Đối chiếu `config.yaml`, toàn bộ `tasks.md` và các capability spec với mã hiện tại. Dấu `[x]` trong task là trạng thái ghi nhận của change, không tự động xác nhận kiểm thử trên thiết bị hay triển khai production.

| Change | Đã đánh dấu | Chưa đánh dấu | Trạng thái tiếp theo |
| --- | ---: | ---: | --- |
| `phase-1-mvp-core-loop` | 44 | 2 | Chưa deploy lên Vercel/cổng game và chưa có phản hồi 3–5 người chơi thật. |
| `self-service-shopping` | 42 | 3 | Core/UI và test tự động đã có; còn kiểm thử nạp khu/hàng sau quầy, một ngày trọn ở L1/L3/L4 trên điện thoại và deploy. |
| `add-google-login-cloud-save` | 20 | 20 | Code Auth, đồng bộ, hộp xung đột, menu tài khoản và privacy đã có một phần; các bước Firebase Console, Emulator, đổi máy và triển khai vẫn chưa được xác nhận. |
| `realtime-shared-shop` | 13 | 4 | Backend/client đã viết; còn emulator race test, hai phiên trình duyệt, đo quota/latency và deploy. Change này chưa nằm trong thứ tự phase của `config.yaml`. |
| `phase-2-shop-expansion` | 0 | 42 | Chưa bắt đầu; phụ thuộc giai đoạn 1b chơi và triển khai được theo `config.yaml`. |
| `phase-3-staff-and-manager` | 0 | 41 | Chưa bắt đầu; phụ thuộc phase 2. |
| `phase-4-events-food-branches` | 0 | 41 | Chưa bắt đầu; phụ thuộc phase 3. |

## Kiểm tra trong repo

- Vitest: 132/132 test qua (12 file), gồm popup/redirect và chặn đăng nhập trong trình duyệt nhúng.
- TypeScript client và Functions: biên dịch qua; Vite production build qua, PWA tạo service worker.
- `scripts/playtest.ts 7 10`: 4 kiểu người chơi × 10 ván × 7 ngày; tất cả đạt L4 vào khoảng ngày 5–6, không có lỗi mô phỏng.
- Chơi thử trình duyệt: từ tổng kết ngày 1 sang nhập hàng ngày 2, tăng số lượng, nhập hàng, tự bày và mở tiệm thành công.
- Chưa đo 60fps hoặc xác nhận thao tác trên điện thoại 375×812 thật. Chưa kiểm thử đăng nhập/đồng bộ bằng tài khoản thật hoặc Firebase Emulator.

## Việc cần làm trước phase 2

1. Hoàn thiện và kiểm thử các mục còn mở của `add-google-login-cloud-save` (đặc biệt Auth redirect, Firestore rules bằng Emulator, hai máy, offline và xung đột).
2. Điền email liên hệ thật cho trang quyền riêng tư, cấu hình Firebase/OAuth và domain; deploy rules trước client.
3. Chơi thử đầy đủ `self-service-shopping` trên điện thoại, đo hiệu năng, lấy phản hồi người chơi; deploy bản giai đoạn 1.
4. Sau khi giai đoạn 1b hoạt động được trên production, triển khai `phase-2-shop-expansion` theo thứ tự 1.1 → 8.4 trong `tasks.md`.

Không đánh dấu hoàn thành các task yêu cầu thiết bị thật, Console, Emulator hoặc deploy dựa trên test mô phỏng/trình duyệt cục bộ.
