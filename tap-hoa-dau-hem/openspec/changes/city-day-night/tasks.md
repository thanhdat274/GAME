## 1. Logic thuần

- [x] 1.1 `src/core/timeOfDay.ts`: `ambientAt`, `presenceAt`, `formatClock`, `phaseAt`
- [x] 1.2 `tests/timeOfDay.test.ts`: liên tục/vòng quanh, ngày sáng đêm tối, mật độ, định dạng giờ

## 2. Dữ liệu và đồ họa

- [x] 2.1 Thuộc tính tileset `light` cho đèn đường (generator + `parseCityMap`), sinh lại `cityMap.json`
- [x] 2.2 `cityTiles.ts`: `buildingWindows` dùng chung cho vẽ tòa nhà và ánh sáng; texture quầng sáng

## 3. Cảnh

- [x] 3.1 Lớp phủ nhân màu + màu nền camera theo giờ
- [x] 3.2 Ánh sáng đêm: đèn đường, cửa sổ, cửa ra vào
- [x] 3.3 Dân phố ẩn/hiện theo giờ
- [x] 3.4 Đồng hồ hiển thị, bấm để dừng/tiếp tục

## 4. Kiểm tra

- [x] 4.1 `tsc`, `vitest` toàn bộ, `validate:data`
- [x] 4.2 Chạy thử trong trình duyệt ở các giờ 6:00, 12:00, 18:30, 22:00
