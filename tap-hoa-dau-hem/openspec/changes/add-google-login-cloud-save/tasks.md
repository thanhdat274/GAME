## 1. Chuẩn bị Firebase (chủ dự án tự làm trên Console)

- [ ] 1.1 Tạo project Firebase "tap-hoa-dau-hem", thêm Web App, lấy cấu hình
- [ ] 1.2 Bật Authentication → Google; thêm domain Vercel và localhost vào Authorized domains
- [ ] 1.3 Tạo Cloud Firestore ở chế độ production, vùng `asia-southeast1`
- [ ] 1.4 Cấu hình màn đồng ý OAuth trên Google Cloud Console: tên "Tạp Hóa Đầu Hẻm", logo, email hỗ trợ, link chính sách quyền riêng tư, domain
- [ ] 1.5 Giới hạn API key theo HTTP referrer (domain game + localhost)
- [ ] 1.6 Tạo `.env.example` với các biến `VITE_FIREBASE_*` và `VITE_CLOUD_SAVE`; thêm `.env.local` vào `.gitignore`

## 2. Bản lưu sẵn sàng cho đồng bộ

- [ ] 2.1 Thêm `lz-string`; viết `compressSave` / `decompressSave` dùng chung; test nén rồi giải nén giống hệt, test dữ liệu hỏng
- [ ] 2.2 Thêm khối `sync` (baseRevision, dirty, lastSyncedAt, deviceId) và bổ sung mặc định khi tải; test
- [ ] 2.3 Thêm `summary` (level, day, money, playSeconds), đếm thời gian chơi trừ lúc tạm dừng; test
- [ ] 2.4 Đặt `dirty = true` mỗi lần lưu local

## 3. Đăng nhập

- [ ] 3.1 `src/services/firebase.ts`: khởi tạo tải lười bằng `import()` động, chỉ khi bấm đăng nhập hoặc có cờ `thdh.auth.hint`; tôn trọng `VITE_CLOUD_SAVE=off`
- [ ] 3.2 `src/services/auth.ts`: popup trên desktop, redirect trên điện thoại, `browserLocalPersistence`, lắng nghe `onAuthStateChanged`, xử lý hủy/lỗi
- [ ] 3.3 Rewrite Vercel `/__/auth/:path*` → `<project>.firebaseapp.com`, đặt `authDomain` là domain game; thử redirect trên iOS Safari và Chrome Android
- [ ] 3.4 `src/services/inAppBrowser.ts`: nhận diện FBAN/FBAV/FB_IAB/Messenger/Instagram/Zalo/TikTok/Line/WebView; test với danh sách user agent mẫu
- [ ] 3.5 Hộp hướng dẫn "Mở bằng trình duyệt" (ảnh minh họa, Sao chép link, mở Chrome bằng intent trên Android)
- [ ] 3.6 Nút đăng nhập ở màn tiêu đề và Cài đặt; ảnh đại diện nhỏ trên HUD
- [ ] 3.7 Lời mời đăng nhập một lần sau ngày game thứ 3 (có "Để sau" / "Không nhắc nữa")

## 4. Lưu cloud và đồng bộ

- [ ] 4.1 `src/services/cloudSave.ts`: `pull()` có timeout 5 giây, `push()` trong transaction kiểm tra `revision == baseRevision`, trả về kết quả ok / conflict / offline / error
- [ ] 4.2 Bộ điều phối đồng bộ: kích hoạt khi hết ngày, lên level, Lưu ngay, tab ẩn; khoảng cách tối thiểu 30 giây; thử lại khi có sự kiện `online`; lỗi 3 lần thì báo
- [ ] 4.3 Luồng khi mở game theo design D7 (cloud rỗng / cloud mới hơn / local dirty / cả hai thay đổi); chỉ áp bản cloud ở màn tiêu đề hoặc buổi sáng
- [ ] 4.4 Hộp thoại xung đột hai thẻ, nhãn "Tiến trình xa hơn", xác nhận lần hai; lưu bản bị bỏ vào `thdh.save.discarded` 7 ngày và cho khôi phục
- [ ] 4.5 Biểu tượng trạng thái đồng bộ trên HUD (khách, đang, đã, chưa đồng bộ, lỗi)
- [ ] 4.6 `src/services/serverTime.ts`: `getServerNow()` qua `serverTimestamp()` + cache độ lệch trong phiên
- [ ] 4.7 Chặn đẩy khi bản nén > 900KB, báo lỗi và ghi log
- [ ] 4.8 Test đơn vị bộ điều phối và luồng D7 với Firestore giả (mock)

## 5. Bảo mật Firestore

- [ ] 5.1 Viết `firestore.rules`: chỉ chủ tài khoản đọc/ghi/xóa `users/{uid}/**`, `revision` tăng đúng 1, `data` là string, tài liệu < 1MB
- [ ] 5.2 Test quy tắc bằng Firebase Emulator (`@firebase/rules-unit-testing`): đọc chéo bị chặn, ghi sai revision bị chặn, chưa đăng nhập bị chặn
- [ ] 5.3 Script deploy quy tắc (`firebase deploy --only firestore:rules`) và ghi chú trong README

## 6. Tài khoản và quyền riêng tư

- [ ] 6.1 Màn Tài khoản: ảnh, tên, trạng thái đồng bộ, lần đồng bộ cuối, Lưu ngay, Khôi phục bản bị bỏ, Đăng xuất, Xóa tài khoản, link Quyền riêng tư
- [ ] 6.2 Đăng xuất: đồng bộ lần cuối, cảnh báo khi còn `dirty`, xóa cờ `thdh.auth.hint`
- [ ] 6.3 Xóa tài khoản: xác nhận hai bước, xóa `users/{uid}/**`, `user.delete()`, xử lý `requires-recent-login`, hỏi xóa bản local
- [ ] 6.4 Trang `public/privacy.html` tiếng Việt (dữ liệu thu thập, mục đích, nơi lưu, cách xóa, liên hệ)

## 7. Kiểm thử thực tế và phát hành

- [ ] 7.1 Kịch bản đổi máy: chơi trên máy A, đăng nhập máy B, tiến trình tải về đúng
- [ ] 7.2 Kịch bản xung đột: hai máy cùng chơi từ một revision, máy thứ hai thấy hộp thoại
- [ ] 7.3 Kịch bản offline: tắt mạng chơi 2 ngày game, bật mạng tự đồng bộ
- [ ] 7.4 Mở link game từ Messenger, Zalo, Facebook trên iOS và Android: thấy hướng dẫn, không lỗi `disallowed_useragent`
- [ ] 7.5 Kiểm tra người chơi khách không tải Firebase (tab Network) và kích thước bundle ban đầu không tăng
- [ ] 7.6 Deploy quy tắc Firestore rồi deploy client; theo dõi số lượt đọc/ghi trên Firebase Console trong tuần đầu
