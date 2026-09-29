## 1. Kiểu và giới hạn

- [x] 1.1 `ShopTypeId`, `ShopTypeDef.id`, `BranchDef.kind/shopType`, `StoreSnapshot.kind` thành chuỗi; sửa các chỗ compiler báo
- [x] 1.2 `balance.chain.maxStores` 6 → 8

## 2. Dữ liệu

- [x] 2.1 `shopTypes.json`: `greengrocer`, `drink_kiosk`, `household`
- [x] 2.2 `branches.json`: `veg`, `drink`, `home` (bố cục mặc định hợp lệ)
- [x] 2.3 `levels.json`: tính năng `shop_veg` (L31), `shop_drink` (L32), `shop_home` (L34)
- [x] 2.4 `validate:data` và `validate:recipes` qua

## 3. Bản đồ phố

- [x] 3.1 Generator: ba lô đất thành `veg`/`drink`/`home`, thêm hai lô đất trống hàng dưới; sinh lại `cityMap.json`
- [x] 3.2 Ngoại hình tòa nhà cho ba loại, có bảng màu mặc định cho loại lạ

## 4. Kiểm thử

- [x] 4.1 Test: mở từng chi nhánh theo level, bố cục hợp lệ, hàng bán theo loại tiệm
- [x] 4.2 Test: chạy một ngày không giao diện cho từng loại tiệm mới
- [x] 4.3 Toàn bộ `vitest`, `tsc`, `validate:data`; chạy thử bản đồ phố trong trình duyệt
