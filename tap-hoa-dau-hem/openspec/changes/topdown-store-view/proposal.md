## Why

Người chơi muốn nhìn tiệm như một siêu thị thật: thấy quầy kệ được sắp xếp thế nào, bấm từng kệ để biết đang bán gì và giá bao nhiêu, xem nhà kho, và thấy khách, nhân viên đi lại quanh kệ. Người chơi cũng muốn thử hướng chơi "tự điều khiển nhân vật" (kiểu Stardew Valley): phải tự đi tới kệ mới nạp được, về quầy mới tính tiền được. Góc nhìn ngang cũ vẫn giữ lại để so sánh.

## What Changes

- **Sơ đồ tiệm** (buổi sáng, chỉ xem): mặt bằng từ trên xuống. Chạm kệ, tủ, quầy hoặc trạm bếp để xem từng món, số lượng, giá, bán xả và hạn dùng. Nút Nhà kho xem tồn kho. Xem được mọi tiệm trong chuỗi mà không cần ghé.
- **Sơ đồ trực tiếp** (trong giờ bán, chỉ xem): khách đi từ cửa tới kệ theo đường tìm được trên lưới, xếp hàng ở quầy rồi về. Nhân viên đứng quầy, đi nạp kệ, nấu món. Có biểu tượng cho các sự kiện: lấy món, hết hàng, chê giá, bỏ về, trả tiền.
- **Góc nhìn trên xuống để chơi** (`settings.viewMode = 'topdown'`):
  - Sơ đồ thay phần kệ nhìn ngang; bảng tính tiền giữ nguyên.
  - Chạm ô để đi.
  - Tới kệ thì nạp từng ô, bày món từ kho vào ô trống, bán xả hàng hết hạn hôm nay, nạp cả khu.
  - Tới kệ kho thì xem kho. Tới bếp hoặc quầy nước thì nấu nhanh, hoặc nấu kỹ bằng mini-game (tiệm tạm dừng).
  - Rời quầy thì khách đầu hàng phải chờ; khi đó khách mất kiên nhẫn chậm hơn (×0,6).
  - Có thu ngân thì quầy người chơi tạm đóng khi người chơi rời quầy, khách tự sang quầy thu ngân.
  - Bắt trộm bằng cách chạy lại gần (tối đa 3 ô).
  - Đổi góc nhìn ngay trong ngày: ở menu Tạm dừng, trên sơ đồ, hoặc ở sơ đồ trực tiếp.
- Nhân vật có dáng quay lưng khi đi lên và khi đứng nhìn vào kệ phía trên. Người đứng chung một ô được dàn ra quanh ô.
- Có hướng dẫn một lần khi bật góc nhìn trên xuống.
- Có script `npm run compare:views` so sánh cân bằng giữa hai góc nhìn bằng bot.

## Capabilities

### New Capabilities
- `store-map`: Sơ đồ tiệm, chi tiết kệ và kho, xem tiệm khác trong chuỗi, sơ đồ trực tiếp.
- `topdown-play`: Góc nhìn trên xuống để chơi: di chuyển, thao tác tại nội thất, luật rời quầy, phối hợp với thu ngân.

## Impact

- Core:
  - `storeMap.ts` và `liveMap.ts` (mới): tính toán thuần, có test.
  - `topDown.ts` (mới): thời gian đi quầy → kệ.
  - `day.ts`: `playerAtCounter`, `playerRefillShelf()`, luật quầy người chơi và hệ số kiên nhẫn.
  - `state.ts`: `settings.viewMode`, không cần migrate vì là trường tùy chọn.
- UI:
  - `ui/floorPlan.ts`, `ui/liveMap.ts`, `scenes/StoreMapScene.ts` (mới).
  - `ShopScene`: đổi góc nhìn, lớp che quầy.
  - `CookScene`: mở được từ lúc đang bán.
  - Nhân vật có dáng quay lưng.
- Dữ liệu: `balance.json › topDown` (`playerTilesPerSecond` 4, `awayPatienceRate` 0,6).
- Phiên chơi chung (realtime) chỉ dùng góc nhìn ngang, vì vị trí người chơi chưa được đồng bộ.
