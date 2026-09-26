## 1. Chuẩn bị Firebase (chủ dự án tự làm trên Console)

- [ ] 1.1 Tạo project Firebase "tap-hoa-dau-hem", thêm Web App, lấy cấu hình
- [ ] 1.2 Bật Authentication → Google; thêm domain Vercel và localhost vào Authorized domains
- [ ] 1.3 Tạo Cloud Firestore ở chế độ production, vùng `asia-southeast1`
- [ ] 1.4 Cấu hình màn đồng ý OAuth trên Google Cloud Console: tên "Tạp Hóa Đầu Hẻm", logo, email hỗ trợ, link chính sách quyền riêng tư, domain
- [ ] 1.5 Giới hạn API key theo HTTP referrer (domain game + localhost)
- [x] 1.6 Tạo `.env.example` với các biến `VITE_FIREBASE_*` và `VITE_CLOUD_SAVE`; thêm `.env.local` vào `.gitignore`

## 2. Bản lưu sẵn sàng cho đồng bộ

- [x] 2.1 Tải lười `lz-string` phiên bản khóa trong `package-lock.json`; viết `compressSave` / `decompressSave` dùng chung; test round-trip và dữ liệu hỏng
- [x] 2.2 Thêm khối `sync` (baseRevision, dirty, lastSyncedAt, deviceId) và bổ sung mặc định khi tải; test
- [x] 2.3 Thêm `summary` (level, day, money, playSeconds), đếm thời gian chơi trừ lúc tạm dừng; test
- [x] 2.4 Đặt `dirty = true` mỗi lần lưu local

## 3. Đăng nhập

- [x] 3.1 `src/services/firebase.ts`: Firebase SDK từ dependency khóa phiên bản, tải bằng dynamic import/chunk khi bấm đăng nhập hoặc có cờ `thdh.auth.hint`; tôn trọng `VITE_CLOUD_SAVE=off`
- [ ] 3.2 `src/services/auth.ts`: popup trên desktop, redirect trên điện thoại, `browserLocalPersistence`, lắng nghe `onAuthStateChanged`, xử lý hủy/lỗi
- [ ] 3.3 Rewrite Vercel `/__/auth/:path*` → `<project>.firebaseapp.com`, đặt `authDomain` là domain game; thử redirect trên iOS Safari và Chrome Android
- [x] 3.4 `src/services/inAppBrowser.ts`: nhận diện FBAN/FBAV/FB_IAB/Messenger/Instagram/Zalo/TikTok/Line/WebView; test với danh sách user agent mẫu
- [ ] 3.5 Hộp hướng dẫn "Mở bằng trình duyệt" (ảnh minh họa, Sao chép link, mở Chrome bằng intent trên Android)
- [ ] 3.6 Nút đăng nhập ở màn tiêu đề và Cài đặt; ảnh đại diện nhỏ trên HUD
- [ ] 3.7 Lời mời đăng nhập một lần sau ngày game thứ 3 (có "Để sau" / "Không nhắc nữa")

## 4. Lưu cloud và đồng bộ

- [x] 4.1 `src/services/cloudSave.ts`: `pull()` có timeout 5 giây, `push()` trong transaction kiểm tra `revision == baseRevision`, trả về kết quả ok / conflict / offline / error; có test mock transaction và timeout
- [x] 4.2 Bộ điều phối đồng bộ: kích hoạt khi hết ngày, lên level, Lưu ngay, tab ẩn; khoảng cách tối thiểu 30 giây; thử lại khi có sự kiện `online`; lỗi 3 lần thì báo
- [x] 4.3 Luồng khi mở game theo design D7 (cloud rỗng / cloud mới hơn / local dirty / cả hai thay đổi); chỉ áp bản cloud ở màn tiêu đề hoặc buổi sáng
- [ ] 4.4 Hộp thoại xung đột hai thẻ, nhãn "Tiến trình xa hơn", xác nhận lần hai; lưu bản bị bỏ vào `thdh.save.discarded` 7 ngày và cho khôi phục
- [x] 4.5 Biểu tượng trạng thái đồng bộ trên HUD (khách, đang, đã, chưa đồng bộ, lỗi)
- [x] 4.6 `src/services/serverTime.ts`: `getServerNow()` qua `serverTimestamp()` + cache độ lệch trong phiên
- [x] 4.7 Chặn đẩy khi bản nén > 900KB, báo lỗi
- [x] 4.8a Test mock Firestore cho nén/giải nén, transaction revision, offline và timeout pull
- [x] 4.8b Test đơn vị bộ điều phối và toàn bộ nhánh D7 với Firestore giả (mock)

## 5. Bảo mật Firestore

- [x] 5.1 Viết `firestore.rules`: chỉ chủ tài khoản đọc/ghi/xóa các tài liệu save/clock hiện dùng, revision tăng đúng 1, data là string, giới hạn dữ liệu dưới 900KB
- [ ] 5.2 Test quy tắc bằng Firebase Emulator (`@firebase/rules-unit-testing`): đọc chéo bị chặn, ghi sai revision bị chặn, chưa đăng nhập bị chặn
- [x] 5.3 Script deploy quy tắc và hướng dẫn trong README

## 6. Tài khoản và quyền riêng tư

- [ ] 6.1 Màn Tài khoản: ảnh, tên, trạng thái đồng bộ, lần đồng bộ cuối, Lưu ngay, Khôi phục bản bị bỏ, Đăng xuất, Xóa tài khoản, link Quyền riêng tư
- [x] 6.2 Đăng xuất: đồng bộ lần cuối, cảnh báo khi còn `dirty`, xóa cờ `thdh.auth.hint`
- [x] 6.3 Xóa tài khoản: xác nhận hai bước, xóa các tài liệu cloud hiện dùng, `user.delete()`, xử lý đăng nhập cũ, hỏi xóa bản local
- [ ] 6.4 Trang `public/privacy.html` tiếng Việt (dữ liệu thu thập, mục đích, nơi lưu, cách xóa, liên hệ email thật của chủ dự án)

## 7. Kiểm thử thực tế và phát hành

- [ ] 7.1 Kịch bản đổi máy: chơi trên máy A, đăng nhập máy B, tiến trình tải về đúng
- [ ] 7.2 Kịch bản xung đột: hai máy cùng chơi từ một revision, máy thứ hai thấy hộp thoại
- [ ] 7.3 Kịch bản offline: tắt mạng chơi 2 ngày game, bật mạng tự đồng bộ
- [ ] 7.4 Mở link game từ Messenger, Zalo, Facebook trên iOS và Android: thấy hướng dẫn, không lỗi `disallowed_useragent`
- [x] 7.5a Build tách lz-string thành chunk tải lười; entry ban đầu không import Firebase hoặc lz-string
- [ ] 7.5b Kiểm tra trên trình duyệt qua Network rằng khách không tải Firebase
- [ ] 7.6 Deploy quy tắc Firestore rồi deploy client; theo dõi số lượt đọc/ghi trên Firebase Console trong tuần đầu

### Ghi nhận triển khai 26/09/2026

- Hoàn tất 2.3, 4.3, 4.8b: summary lấy đúng tiến trình khi migrate; thời gian chơi loại trừ tạm dừng và tab ẩn; đồng bộ D7 chỉ áp cloud tại Title/Morning, kiểm tra lại sau các thao tác bất đồng bộ.
- Bổ sung kiểm thử `tests/sync.test.ts`, `tests/playClock.test.ts` và hồi quy migration: cloud rỗng/mới hơn/cùng revision, local dirty, offline/reconnect, xung đột liên tiếp, thay đổi trong lúc pull/push, sign-out, lỗi giải nén và cooldown.
- Giữ nguyên các mục Firebase Console, Emulator, kiểm thử thiết bị thật và deploy chưa xác minh. Chưa archive change hoặc chuyển sang Phase 2.
