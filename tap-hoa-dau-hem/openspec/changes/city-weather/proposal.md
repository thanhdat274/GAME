## Why

Bản đồ phố có ngày-đêm nhưng trời luôn quang. Game đã có sự kiện `heavy_rain` (mưa lớn buổi chiều) và lịch có mùa; phố nên phản ánh chúng để người chơi thấy thời tiết ảnh hưởng tới cuộc sống trong phố.

## What Changes

- Module thuần `src/core/cityWeather.ts`: cường độ mưa (0..1) theo ngày game, giờ, mùa và sự kiện `heavy_rain`. Mưa rào ngẫu nhiên nhưng tất định theo ngày (cùng ngày luôn cùng thời tiết), xác suất theo mùa.
- `CityScene`: hạt mưa rơi phủ màn hình (hai lớp cuộn khác tốc độ), trời tối và xám hơn khi mưa, đèn đường bật sớm hơn trong mưa, dân phố thưa hơn và bước nhanh hơn, ghé tiệm nhiều hơn để trú.
- Đồng hồ trên phố hiện thêm biểu tượng thời tiết.
- Chỉ là lớp hiển thị: không đổi tiền, khách thật, save; sự kiện `heavy_rain` vẫn có tác dụng như cũ ở màn Bán hàng.

## Capabilities

### New Capabilities
- `city-weather`: thời tiết mưa trên bản đồ phố, khớp với sự kiện và mùa.

### Modified Capabilities
<!-- không có -->

## Impact

- Mới: `src/core/cityWeather.ts`, `tests/cityWeather.test.ts`.
- Sửa: `src/scenes/CityScene.ts`.
- Không đổi dữ liệu game, không thêm dependency.
