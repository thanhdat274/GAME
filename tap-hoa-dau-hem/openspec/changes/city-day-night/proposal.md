## Why

Bản đồ phố luôn một màu như giữa trưa, trong khi game có khái niệm giờ trong ngày (mở cửa 8:00 đến 20:00). Đổi màu theo giờ làm phố sống động và cho người chơi cảm nhận thời gian, đúng hướng giao diện kiểu Stardew.

## What Changes

- Thêm module thuần `src/core/timeOfDay.ts`: từ phút trong ngày tính ra màu môi trường (bình minh, sáng, trưa, hoàng hôn, chạng vạng, đêm), độ tối cho đèn, và mật độ người đi đường.
- `CityScene`: lớp phủ nhân màu theo giờ; ban đêm đèn đường, cửa sổ và cửa ra vào phát sáng; dân phố thưa dần về đêm; đồng hồ hiển thị và bấm để dừng/tiếp tục.
- Giờ trên phố bắt đầu từ đồng hồ game (`state.clock`) rồi chạy tiếp một chu kỳ ngày-đêm chậm (~6 phút thật cho 24 giờ game) chỉ để hiển thị, không ảnh hưởng đồng hồ hay save.
- Dữ liệu bản đồ: ô đèn đường đánh dấu thuộc tính tileset `light` để đèn sáng theo dữ liệu.
- Không đổi gameplay, save, hay giờ bán hàng.

## Capabilities

### New Capabilities
- `city-day-night`: màu môi trường, ánh sáng đêm và mật độ người đi đường theo giờ trên bản đồ phố.

### Modified Capabilities
<!-- không có -->

## Impact

- Mới: `src/core/timeOfDay.ts`, `tests/timeOfDay.test.ts`.
- Sửa: `src/scenes/CityScene.ts`, `src/ui/cityTiles.ts` (cửa sổ dùng chung với ánh sáng, texture quầng sáng), `src/core/cityMap.ts` và `scripts/make-city-map.ts` (thuộc tính `light`), `cityMap.json`.
- Không thêm dependency.
