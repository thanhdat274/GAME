## Context

Giai đoạn 1 có `save.ts` lưu JSON vào localStorage với số phiên bản và chuỗi migrate. Game là web tĩnh deploy trên Vercel, không có backend riêng. Người chơi phần lớn tới từ link chia sẻ trên Facebook/Zalo, tức là thường mở game trong trình duyệt nhúng của app, nơi Google chặn đăng nhập OAuth (lỗi `disallowed_useragent`). Người chơi chủ yếu dùng điện thoại, mạng 4G chập chờn.

## Goals / Non-Goals

**Goals:**
- Không mất tiến trình khi đổi máy hoặc xóa dữ liệu trình duyệt.
- Không bắt đăng nhập mới được chơi; đăng nhập là lựa chọn.
- localStorage vẫn là nơi lưu chính để chơi offline mượt; cloud là bản sao đồng bộ.
- Không bao giờ ghi đè âm thầm một bản lưu tốt hơn.
- Không tự dựng hay vận hành máy chủ.

**Non-Goals:**
- Đăng nhập bằng Facebook, Apple, email/mật khẩu (có thể thêm sau vì Firebase hỗ trợ).
- Bảng xếp hạng, bạn bè, chơi mạng.
- Nhiều khe lưu (save slot) trên một tài khoản.
- Chống gian lận tuyệt đối: game chơi đơn, chỉ chặn các cách phổ biến (chỉnh đồng hồ).

## Decisions

### D1. Firebase Auth + Cloud Firestore
Có sẵn đăng nhập Google, SDK web, quy tắc bảo mật, và gói Spark miễn phí (50k lượt đọc, 20k lượt ghi mỗi ngày), đủ cho vài nghìn người chơi mỗi ngày với nhịp đồng bộ ở D5.
- Đã cân nhắc Supabase (Postgres + Auth): tốt, nhưng dự án miễn phí bị tạm dừng sau 7 ngày không hoạt động, và cần tự viết bảng + RLS. Tự làm backend (Node + DB) thì tốn công vận hành. Google Drive AppData thì quyền truy cập rộng, màn đồng ý đáng sợ với người chơi.

### D2. Tải lười SDK
Firebase chỉ được `import()` động khi người chơi bấm "Đăng nhập", hoặc khi localStorage có cờ `thdh.auth.hint = "google"` (đã từng đăng nhập). Người chơi khách không phải tải thêm Firebase. Bản triển khai hiện dùng browser modules phiên bản cố định trên CDN chính thức của Firebase; `lz-string` cũng chỉ tải khi cần nén/giải nén bản cloud. Điều này giữ bundle ban đầu nhỏ và tránh phụ thuộc npm trong môi trường cài gói đang lỗi, nhưng đăng nhập và khôi phục cloud cần mạng tới các CDN. Khi npm hoạt động ổn định có thể chuyển sang gói cục bộ mà không đổi API dịch vụ.

### D3. Luồng đăng nhập
- Desktop: `signInWithPopup`.
- Điện thoại: `signInWithRedirect`. Để redirect chạy được trên Safari/Chrome mới (chặn cookie bên thứ ba), đặt `authDomain` là domain của game và thêm rewrite Vercel `/__/auth/:path*` → `https://<project>.firebaseapp.com/__/auth/:path*` theo hướng dẫn "redirect best practices" của Firebase.
- Persistence: `browserLocalPersistence`; mở lại game thì tự đăng nhập.
- Chỉ xin scope mặc định (`openid email profile`). Không lưu email/tên/ảnh vào Firestore, chỉ đọc từ đối tượng Auth để hiển thị.

### D4. Trình duyệt trong app
Kiểm tra user agent với các dấu hiệu `FBAN`, `FBAV`, `FB_IAB`, `Messenger`, `Instagram`, `Zalo`, `TikTok`/`musical_ly`, `Line`, và Android WebView (`; wv)`). Nếu khớp thì không gọi Google: hiện hướng dẫn "Bấm ⋯ → Mở bằng trình duyệt" có ảnh minh họa, nút "Sao chép link", và trên Android thêm nút mở bằng `intent://...#Intent;scheme=https;package=com.android.chrome;end`. Người chơi vẫn chơi khách được.

### D5. Mô hình dữ liệu và nhịp đồng bộ
Firestore: `users/{uid}/saves/main`
```
{
  schemaVersion: number,   // version bản lưu game (v1..v5)
  revision: number,        // tăng 1 mỗi lần ghi thành công
  deviceId: string,        // id ngẫu nhiên của thiết bị ghi
  updatedAt: Timestamp,    // serverTimestamp()
  summary: { level, day, money, playSeconds },  // hiển thị khi xung đột
  data: string             // bản lưu JSON nén lz-string (UTF-16)
}
```
Local giữ thêm `sync: { baseRevision, dirty, lastSyncedAt, deviceId }`.

Khi nào đẩy lên: kết thúc mỗi ngày game, lên level, người chơi bấm "Lưu ngay", và khi tab ẩn (cố gắng hết sức, có thể không xong). Tối thiểu 30 giây giữa hai lần đẩy tự động. Ước tính khoảng 20–40 lần ghi mỗi người mỗi giờ chơi.

### D6. Khóa lạc quan và xung đột
Đẩy lên bằng transaction: đọc `revision` trên cloud; nếu bằng `baseRevision` của máy thì ghi với `revision + 1`; nếu khác thì có máy khác đã ghi → **xung đột**. Khi xung đột, hoặc khi đăng nhập mà cả máy và cloud đều có dữ liệu, hiện hộp thoại hai thẻ ("Trên máy này" / "Trên cloud") với level, ngày, tiền, thời gian chơi, lần lưu cuối; gắn nhãn "Tiến trình xa hơn" cho bản có `playSeconds` lớn hơn. Bản bị bỏ được giữ trong localStorage `thdh.save.discarded` 7 ngày để khôi phục thủ công.
- Đã cân nhắc "ghi đè theo bản mới nhất": dễ làm mất tiến trình khi chơi song song hai máy, nên bỏ.

### D7. Khi mở game
1. Tải bản local ngay để chơi không phải chờ.
2. Nếu đã đăng nhập: tải `saves/main` ngầm (timeout 5 giây).
   - Cloud rỗng → đẩy bản local lên.
   - `cloud.revision == baseRevision` và local `dirty` → đẩy lên.
   - `cloud.revision > baseRevision` và local không `dirty` → dùng bản cloud (thông báo "Đã tải tiến trình từ thiết bị khác"). Chỉ áp dụng ở màn tiêu đề hoặc buổi sáng, không đổi giữa pha bán hàng.
   - Cả hai đều thay đổi → hộp thoại xung đột (D6).
3. Mất mạng → chơi bằng bản local, đặt `dirty`, thử lại khi có sự kiện `online` hoặc ở lần đẩy kế tiếp.

### D8. Giờ máy chủ
`getServerNow()`: ghi `users/{uid}/meta/clock.ping = serverTimestamp()` rồi đọc lại, lấy độ lệch so với `Date.now()`, lưu cache trong phiên. Giai đoạn 3 dùng `serverNow - cloud.updatedAt` để tính thời gian vắng mặt khi đã đăng nhập; khi chơi khách thì dùng giờ máy kèm luật chống lùi đồng hồ sẵn có.

### D9. Quy tắc bảo mật Firestore
```
match /users/{uid}/{document=**} {
  allow read, delete: if request.auth != null && request.auth.uid == uid;
  allow write: if request.auth != null && request.auth.uid == uid
               && request.resource.size() < 1000000;
}
```
Kèm kiểm tra kiểu cho `revision` (int, tăng đúng 1) và `data` (string). Test bằng Firebase Emulator. Giới hạn API key theo HTTP referrer (domain game + localhost). App Check (reCAPTCHA) để tùy chọn sau khi có lượng người chơi lớn.

### D10. Nén và kích thước
Nén bằng `lz-string.compressToUTF16`; bản lưu giai đoạn 1 khoảng 5–20KB JSON còn khoảng 2–6KB. Nếu bản nén > 900KB thì từ chối đẩy lên, báo lỗi và ghi log, để không vượt giới hạn 1MB của tài liệu Firestore.

### D11. Xóa tài khoản
Xóa `users/{uid}/**` rồi `user.delete()`. Nếu Firebase báo `requires-recent-login` thì yêu cầu đăng nhập lại rồi thử lại. Bản local vẫn giữ để chơi khách tiếp (hỏi người chơi có muốn xóa luôn không).

## Risks / Trade-offs

- [Đa số người chơi mở game từ Facebook/Zalo nên không đăng nhập được] → D4 hướng dẫn mở trình duyệt; chơi khách vẫn được; mã sao lưu (giai đoạn 2) vẫn là phương án dự phòng.
- [Redirect đăng nhập hỏng trên iOS Safari] → Proxy `/__/auth` cùng domain (D3); nếu vẫn lỗi thì dùng popup và hiện thông báo lỗi dễ hiểu.
- [Vượt hạn mức miễn phí] → Nhịp đẩy tối thiểu 30 giây, không ghi mỗi tick; theo dõi usage trên Firebase Console; nâng gói Blaze (trả theo dùng) khi cần.
- [Người chơi chọn nhầm bản trong hộp thoại xung đột] → Nhãn "Tiến trình xa hơn", xác nhận lần hai, bản bị bỏ giữ 7 ngày.
- [Đổi bản lưu giữa lúc đang chơi gây rối] → Chỉ áp bản cloud ở màn tiêu đề hoặc buổi sáng.
- [Lộ cấu hình Firebase] → Cấu hình web không phải bí mật; bảo mật dựa vào quy tắc Firestore và giới hạn referrer.

## Migration Plan

1. Người dùng tạo project Firebase, bật Google sign-in, tạo Firestore (vùng `asia-southeast1`), cấu hình màn đồng ý OAuth (tên game, logo, link chính sách quyền riêng tư, domain được phép). Đây là bước người chơi/chủ dự án tự làm trên Console.
2. Deploy quy tắc Firestore trước, sau đó deploy client.
3. Bản lưu local hiện có không phải migrate: phần `sync` được thêm với giá trị mặc định khi tải.
4. Rollback: tắt tính năng bằng cờ `VITE_CLOUD_SAVE=off`; game quay về chỉ lưu local, dữ liệu cloud vẫn còn.

## Open Questions

- Có hiện lời mời đăng nhập tự động (ví dụ sau ngày game thứ 3) không? Mặc định: có, một lần, có thể tắt.
- Domain chính thức của game là gì (cần cho OAuth và `authDomain`)? Tạm dùng domain Vercel.
