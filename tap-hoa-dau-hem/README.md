# Tạp Hóa Đầu Hẻm

Game quản lý tiệm tạp hóa nhỏ, xây bằng Phaser và Vite.

## Chạy và kiểm tra

```sh
npm ci
npm run dev
npm test
npm run build
npm run playtest -- 7 10
```

## Đăng nhập Google và lưu cloud

Xem [CLOUD_SAVE_SETUP.md](./CLOUD_SAVE_SETUP.md) để tạo Firebase project, cấu hình `.env.local`, triển khai Firestore rules và chuẩn bị phát hành. `.env.local` được Git bỏ qua. Firebase rules được triển khai bằng:

```sh
npm run deploy:rules
```

Chỉ chạy lệnh triển khai sau khi Firebase CLI đã đăng nhập đúng tài khoản và project `tap-hoa-dau-hem` đã được thiết lập.
