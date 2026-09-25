# Thiết lập đăng nhập Google và lưu cloud

Code client đã có trong `src/services/`. Tính năng chỉ hiện khi có cấu hình Firebase trong biến môi trường và `VITE_CLOUD_SAVE` khác `off`.

## 1. Tạo Firebase project

1. Trong Firebase Console, tạo project và thêm Web App. Ghi lại **project ID** và cấu hình Web App.
2. Bật Authentication → Sign-in method → Google.
3. Thêm domain game và `localhost` vào Authentication → Settings → Authorized domains.
4. Tạo Cloud Firestore ở vùng `asia-southeast1` với production mode.
5. Cấu hình màn đồng ý OAuth của Google bằng tên game, domain, trang Quyền riêng tư và email hỗ trợ thật của chủ dự án.

## 2. Cấu hình client

Sao chép `.env.example` thành `.env.local`, điền các giá trị `VITE_FIREBASE_*` do Firebase Console cấp. `VITE_FIREBASE_AUTH_DOMAIN` phải là hostname của game được phép đăng nhập. `.env.local` đã được Git bỏ qua; cấu hình Firebase Web App là cấu hình public, quyền truy cập dữ liệu do `firestore.rules` quyết định.

`vercel.json` hiện proxy `/__/auth/:path*` tới `tap-hoa-dau-hem.firebaseapp.com`. Nếu Firebase project ID khác `tap-hoa-dau-hem`, sửa destination này trước khi deploy. Domain game dùng làm `authDomain` phải trỏ vào deployment có rewrite đó.

Để tắt tính năng khẩn cấp, đặt `VITE_CLOUD_SAVE=off` rồi build/deploy lại. Local save vẫn hoạt động.

## 3. Quy tắc Firestore

`firebase.json` trỏ đến `firestore.rules`. Đăng nhập Firebase CLI bằng tài khoản sở hữu project rồi chạy:

```sh
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID
```

Quy tắc chỉ cho chủ tài khoản truy cập `users/{uid}/saves/main` và `users/{uid}/meta/clock`; revision của save phải tăng đúng 1 và dữ liệu nén phải nhỏ hơn 900.000 byte UTF-8.

## 4. Phát hành

Điền email liên hệ thật vào `public/privacy.html`, cấu hình OAuth, deploy quy tắc trước, rồi mới deploy game. Cần kiểm tra đăng nhập redirect trên iOS Safari và Android Chrome, đổi máy, xung đột hai máy và offline sau khi Firebase project hoạt động.

SDK Firebase và lz-string được tải lười từ CDN khi người chơi đăng nhập; người chơi khách chỉ dùng code local. Đây là lựa chọn thay cho dependency npm vì môi trường hiện tại không cài được gói mới. Nếu chuyển sang npm sau này, giữ nguyên API trong `src/services/` và thay lớp tải module.
