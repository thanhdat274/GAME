## Why

Hiện tại tiến trình chỉ nằm trong localStorage của một trình duyệt. Người chơi sẽ mất sạch tiến trình khi xóa dữ liệu trình duyệt, đổi điện thoại, hoặc dùng Safari trên iOS (Safari tự xóa dữ liệu web nếu 7 ngày không mở). Đây là game quản lý chơi lâu dài (hàng chục đến hàng trăm ngày game, có thu nhập offline), nên mất tiến trình là lý do lớn nhất khiến người chơi bỏ game. Cần làm ngay sau giai đoạn 1, trước khi có nhiều người chơi thật và trước khi bản lưu phình to ở giai đoạn 2–4.

## What Changes

- Đăng nhập bằng tài khoản Google (Firebase Authentication). **Không bắt buộc**: vẫn chơi được ngay ở chế độ khách.
- Khách đăng nhập lần đầu thì tiến trình hiện tại được gắn vào tài khoản.
- Lưu cloud (Cloud Firestore): tự đẩy bản lưu lên sau mỗi ngày game, khi lên level, khi thoát game, và khi bấm nút "Lưu ngay".
- Mở game trên thiết bị khác thì tự tải tiến trình về.
- Phát hiện và xử lý xung đột giữa bản trên máy và bản trên cloud: hiện hai bản để người chơi chọn.
- Chơi offline vẫn bình thường; có mạng lại thì tự đồng bộ.
- Lấy giờ máy chủ để giai đoạn 3 tính thu nhập offline chống chỉnh đồng hồ.
- Màn Tài khoản: ảnh + tên Google, trạng thái đồng bộ, Đăng xuất, Xóa tài khoản và dữ liệu.
- Phát hiện trình duyệt trong app (Facebook, Messenger, Zalo, Instagram, TikTok) và hướng dẫn mở bằng Chrome/Safari, vì Google chặn đăng nhập trong các trình duyệt này.
- Trang Chính sách quyền riêng tư (bắt buộc cho màn đồng ý OAuth của Google).

## Capabilities

### New Capabilities
- `account-auth`: Đăng nhập/đăng xuất Google, chế độ khách, trình duyệt trong app, xóa tài khoản, quyền riêng tư.
- `cloud-save`: Đẩy/tải bản lưu, đồng bộ nhiều thiết bị, xung đột, hàng đợi offline, giờ máy chủ, bảo mật dữ liệu.

### Modified Capabilities
- `save-system`: Thêm siêu dữ liệu đồng bộ (revision, deviceId, cờ "chưa đồng bộ") và nén bản lưu.

## Impact

- Phụ thuộc mới: `firebase` (modular SDK, chỉ tải khi cần), `lz-string` (nén bản lưu).
- Hạ tầng: 1 project Firebase (Auth + Firestore, gói Spark miễn phí), màn đồng ý OAuth trên Google Cloud Console, rewrite `/__/auth/*` trên Vercel.
- Code mới: `src/services/auth.ts`, `src/services/cloudSave.ts`, `src/services/serverTime.ts`, scene/overlay Tài khoản, `firestore.rules`, trang `privacy.html`.
- Cấu hình: biến môi trường `VITE_FIREBASE_*` trong `.env` (không commit `.env.local`).
- Ảnh hưởng tới lộ trình: giai đoạn 2–4 phải giữ bản lưu nén < 1MB (giới hạn tài liệu Firestore); giai đoạn 3 dùng giờ máy chủ cho thu nhập offline khi đã đăng nhập.
- Thứ tự: làm sau `phase-1-mvp-core-loop`, trước `phase-2-shop-expansion`.
