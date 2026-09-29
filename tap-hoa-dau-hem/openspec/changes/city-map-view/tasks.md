## 1. Dữ liệu và logic

- [x] 1.1 `scripts/make-city-map.ts` sinh `src/data/cityMap.json` (Tiled JSON: `ground`, `objects`, `lots`)
- [x] 1.2 `src/core/cityMap.ts`: kiểu, `parseCityMap`, `validateCityMap`, `lotAt`, `clampScroll`
- [x] 1.3 Nối `validateCityMap` vào `validateContent`
- [x] 1.4 `tests/cityMap.test.ts`: hợp lệ, lô sai storeId, chi nhánh thiếu lô, `lotAt`, `clampScroll`

## 2. Đồ họa

- [x] 2.1 `src/ui/cityTiles.ts`: tileset canvas 16×16 và texture tòa nhà theo `kind` (dùng lại theo cache)

## 3. Cảnh

- [x] 3.1 `CityScene`: tilemap từ Tiled JSON, hai camera, kéo, thu phóng bước nguyên, giới hạn cuộn
- [x] 3.2 Tòa nhà từng lô, trạng thái khóa/chưa mở/đang mở, viền chọn nhấp nháy
- [x] 3.3 Bảng thông tin: Ghé tiệm, Mở tiệm, Xem kệ, Danh sách/Gửi hàng
- [x] 3.4 Đăng ký scene, lối vào từ `MorningScene` và thanh điều hướng, thêm `City` vào danh sách tự lưu

## 4. Kiểm tra

- [x] 4.1 `tsc`, `vitest` toàn bộ, `validate:data`
- [x] 4.2 Chạy thử trong trình duyệt: kéo, thu phóng, chạm tiệm, mở tiệm, quay lại

## 5. Để giai đoạn sau

- (Đã làm ở change `city-day-night`.) Thay tileset canvas bằng ảnh vẽ tay (đổi khóa texture), chỉnh bản đồ bằng Tiled.
- Chạy thử trên điện thoại thật và đo FPS khi bản đồ lớn hơn nhiều.

## 6. Nhân vật đi bộ trong phố

- [x] 6.1 `src/core/cityWalk.ts`: lưới đi được, tìm đường BFS, `stepWalker`, điểm dạo (thuộc tính tileset `promenade`)
- [x] 6.2 `validateCityMap` báo cửa không đi tới được từ tiệm chính
- [x] 6.3 `CityScene`: người chơi chạm để đi bộ, đi tới cửa tiệm rồi mở bảng, camera đi theo và nút về giữa (◎)
- [x] 6.4 Dân phố đi dạo (6–12 người, đông hơn khi mở nhiều tiệm), khung bước chân và hướng nhìn
- [x] 6.5 `tests/cityWalk.test.ts` (10 test), chạy thử trong trình duyệt
