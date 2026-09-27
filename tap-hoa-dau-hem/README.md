# Tạp Hóa Đầu Hẻm

Game quản lý tiệm tạp hóa nhỏ, xây bằng Phaser và Vite.

## Chạy và kiểm tra

```sh
npm ci
npm run dev
npm run playtest:max
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

Chạy `npm run playtest:max` để mở hồ sơ thử nghiệm đầy đủ: level tối đa, tất cả chi nhánh và đất tạp hóa, danh mục hàng trong kho của chuỗi, nhân viên, công thức, trang trí và nội thất của các loại tiệm. Mặt bằng tiệm chính bày kín tất cả ô kệ để kiểm tra giao diện và độ mượt với lượng tài nguyên lớn; các thiết bị được phân bổ qua chuỗi để giữ lối đi thông thoáng. Kệ gỗ có 12 ô, kệ đôi 24 ô, kệ 3 có 36 ô, kệ 4 có 48 ô; mỗi ô chứa 20 món. Mỗi lần chạy lệnh sẽ tạo hồ sơ sạch; trong game, hồ sơ giữ thay đổi khi refresh. Hồ sơ dùng localStorage riêng (`thdh.simulation.max.*`), không ghi đè save thường và tắt đồng bộ cloud.

Để mở tiếp hồ sơ đã thử trước đó, chạy `npm run dev` rồi mở `/?simulate=max`.
