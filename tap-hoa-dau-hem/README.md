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

## Mô phỏng max level

Mở `/?simulate=max` để tạo hồ sơ thử nghiệm level tối đa, mở đủ đất/chi nhánh, có hàng và trang thiết bị để xem nội dung cuối game. Hồ sơ dùng localStorage riêng (`thdh.simulation.max.*`), không ghi đè save thường và tắt đồng bộ cloud trong chế độ mô phỏng.

Đặt lại hồ sơ mô phỏng bằng `/?simulate=max&reset=1`. Sau khi tải xong, bỏ `&reset=1` khỏi URL để những lần tải sau giữ tiến trình mô phỏng.
