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

Firebase được đóng thành các chunk riêng và chỉ tải khi người chơi dùng tài khoản; `lz-string` cũng là chunk tải lười, chỉ cần khi nén hoặc giải nén save cloud. Người chơi khách không tải các chunk này. Các package và phiên bản đã khóa trong `package-lock.json`.

Deploy rules bằng `npm run deploy:rules` sau khi cài Firebase CLI và đăng nhập đúng tài khoản chủ dự án. Nếu project ID thay đổi, cập nhật script trong `package.json` và đích rewrite trong `vercel.json` trước khi deploy.

## 5. Phiên chơi realtime hai thiết bị

Phiên dùng chung được lưu riêng tại `users/{uid}/live/main`; client chỉ đọc snapshot và gửi command qua Cloud Functions. Sau khi Functions và rules đã deploy, đặt `VITE_LIVE_SESSION=on` trong `.env.local` và môi trường web để hiện nút **Chơi chung trên hai máy** ở menu tài khoản. Để thử emulator, đặt `VITE_USE_FIREBASE_EMULATORS=true`; Auth, Firestore, Functions dùng lần lượt các cổng `9099`, `8080`, `5001`.

Firebase Functions cần gói Blaze, nên trước khi deploy hãy kiểm tra billing và đặt budget alerts. Chạy `npm run functions:build` để biên dịch backend; dùng `npm run emulators` để chạy Auth/Firestore/Functions cục bộ. Khi môi trường đã sẵn sàng, `npm run deploy:live` deploy Functions cùng Firestore rules.

Realtime là phiên chơi có server xử lý, khác với cloud save snapshot. Rules chặn client ghi thẳng trạng thái live; chỉ callable Functions dùng Admin SDK mới ghi được. Không deploy trước khi emulator test race-command và flow hai thiết bị đạt.
