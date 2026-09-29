## Why

"Bản đồ thành phố" hiện chỉ là danh sách thẻ, không giống một thành phố. Để mở rộng thành phố buôn bán với nhiều loại cửa hàng và giao diện kiểu Stardew Valley, cần một lớp thế giới dựa trên tilemap: dựng được bằng công cụ chuẩn (Tiled), thêm cửa hàng/khu mới bằng dữ liệu, và vẫn mượt khi bản đồ lớn (culling, camera).

## What Changes

- Thêm bản đồ phố theo định dạng **Tiled JSON** (`src/data/cityMap.json`): lớp nền, lớp vật thể, lớp đối tượng `lots` (mỗi lô đất gắn với một cửa hàng hoặc là đất trống chờ mở rộng).
- Thêm module thuần `src/core/cityMap.ts`: đọc, kiểm tra, tra cứu lô đất và giới hạn camera; nối vào `validateContent`.
- Thêm `CityScene`: vẽ tilemap (Phaser culling), kéo để di chuyển, chụm/lăn chuột để thu phóng theo bước (giữ pixel sắc nét), tòa nhà từng cửa hàng, chạm để mở bảng thông tin (Ghé tiệm / Mở tiệm / Xem kệ / Danh sách & gửi hàng).
- Tileset và tòa nhà được vẽ bằng canvas lúc chạy từ các màu/pixel art hiện có, không thêm tài nguyên ảnh.
- Menu "Bản đồ thành phố" và thanh điều hướng mở `CityScene`; màn danh sách cũ vẫn còn, truy cập từ bảng thông tin.
- Không đổi gameplay, chi nhánh, chi phí hay định dạng save.

## Capabilities

### New Capabilities
- `city-map`: bản đồ phố dạng tilemap và cảnh tương tác, dữ liệu-driven.

### Modified Capabilities
<!-- không có -->

## Impact

- Code: `src/core/cityMap.ts`, `src/ui/cityTiles.ts`, `src/scenes/CityScene.ts` (mới); `src/main.ts`, `src/ui/page.ts`, `src/scenes/MorningScene.ts` (đăng ký và lối vào); `src/core/content.ts` (kiểm tra).
- Dữ liệu: `src/data/cityMap.json`, sinh bởi `scripts/make-city-map.ts`.
- Test: `tests/cityMap.test.ts`.
- Không thêm dependency.
