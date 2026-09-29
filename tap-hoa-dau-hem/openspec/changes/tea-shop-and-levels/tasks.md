## 1. Nền tảng

- [x] 1.1 `shopOnly` trên sản phẩm: `allowsProduct`, danh sách mở khóa, validator, test
- [x] 1.2 `scripts/make-tea-content.ts`: sinh nguyên liệu, thành phẩm, công thức trà sữa (giá vốn khớp)
- [x] 1.3 Nội thất `tea_bar`, `foam_machine` (+ bí danh sprite), loại tiệm `tea_shop`, chi nhánh `tea`

## 2. Level 36–50

- [x] 2.1 `levels.json` 36–50, `maxLevel` 50, tính năng theo level, kho trung tâm, chỗ nhân viên
- [x] 2.2 Danh hiệu chuyển sang level tối đa; `PrestigeScene` đọc `maxLevel`; sửa test ghim 35
- [x] 2.3 Hai loại tiệm bán theo kệ: tiệm bánh kẹo (L40), siêu thị mini (L45) + chi nhánh; `maxStores`

## 3. Mini-game pha ly

- [x] 3.1 Chế độ `tea` trong `CookScene`: ô theo nhóm quầy, huy hiệu tồn, thứ tự, lỗi, biến thể
- [x] 3.2 Kiểm tra giao diện ở khung dọc nhỏ

## 4. Bản đồ phố và hồ sơ max

- [x] 4.1 Lô đất và ngoại hình cho tiệm trà sữa, bánh kẹo, siêu thị; sinh lại bản đồ
- [x] 4.2 `createMaxLevelSimulation` xử lý tiệm bán ở quầy mới

## 5. Kiểm tra

- [x] 5.1 Test: tiệm trà sữa mở/chạy một ngày, nguyên liệu riêng, level, danh hiệu, chuỗi
- [x] 5.2 `tsc`, `vitest` toàn bộ, `validate:data`, `validate:recipes`
- [x] 5.3 Chạy thử trình duyệt: pha ly, bản đồ phố, mở tiệm trà sữa
