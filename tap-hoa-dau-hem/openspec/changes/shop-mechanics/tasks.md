## 1. Lõi

- [x] 1.1 Kiểu `ShopMechanics` trong `data.ts`; hành vi + `describeMechanics` + validator trong `shopTypes.ts`
- [x] 1.2 `expiryFor` nhận hệ số; `buyStock`/`receiveDeliveries` áp dụng theo loại tiệm
- [x] 1.3 `generateOrder` áp dụng `demandMul`, `seasonSensitivity`, `qtyMul`; `shopDensityAt` áp dụng `trafficMul`

## 2. Dữ liệu và hiển thị

- [x] 2.1 `mechanics` cho `greengrocer`, `drink_kiosk`, `household`
- [x] 2.2 Bảng thông tin ở bản đồ phố hiện đặc điểm loại tiệm

## 3. Kiểm tra

- [x] 3.1 `tests/shopMechanics.test.ts`: hạn dùng, số lượng, mùa, mật độ, validator, tạp hóa/xôi không đổi
- [x] 3.2 `tsc`, `vitest` toàn bộ, `validate:data`
