## Vì sao

Ở góc nhìn trên xuống, người chơi đã phải đi tới kệ mới nạp được, nhưng hàng vẫn "bay" thẳng từ kho lên kệ và màn Nhập hàng mở được từ bất kỳ đâu. Người chơi muốn cảm giác tự tay làm việc kiểu Stardew Valley: tới kho bê một thùng hàng, mang ra kệ bày; muốn đặt hàng thì ra điện thoại ở quầy gọi mối. Hai luật này làm việc bày hàng chậm hơn và đổi cân bằng, nên được tách khỏi change bố cục `landscape-responsive-layout` (chỉ đổi trình bày) và đi kèm kiểm tra cân bằng riêng.

## Thay đổi

- **Chế độ "Cầm hàng trên tay"** (tùy chọn, mặc định tắt, chỉ ở góc nhìn trên xuống):
  - Tới điểm lấy hàng (kệ kho gần nhất, hoặc quầy nếu tiệm chưa có kệ kho) để chọn món và số lượng cầm theo.
  - Người chơi cầm tối đa `carryStacks` loại món, mỗi loại tối đa `carryUnitsPerStack` món (`balance.topDown.carry`).
  - Tới kệ, chạm ô để bày món đang cầm: nạp ô cùng món hoặc bày vào ô trống. Mỗi ô vẫn mất `refillSeconds`.
  - Cầm hàng là **giữ chỗ** trong kho, không rút hàng ra khỏi kho; chỉ khi bày lên kệ hàng mới rời kho theo đúng thứ tự hạn dùng hiện tại. Nhờ vậy không mất hàng khi đổi góc nhìn, tải lại, hết ngày hoặc lỗi.
  - "Nạp cả khu" của người chơi ẩn trong chế độ này. Nhân viên, chơi hộ (`autoPlayer`) và góc nhìn ngang không đổi.
- **Chế độ "Đặt hàng tại điện thoại"** (tùy chọn, mặc định tắt, chỉ trong giờ bán ở góc nhìn trên xuống):
  - Bấm ô Nhập hàng trên hotbar khi đang ở xa thì nhân vật tự đi về quầy rồi mới mở màn Nhập hàng; thời gian đi bộ vẫn trôi.
  - Buổi sáng, góc nhìn ngang và phiên chơi chung không bị ảnh hưởng.
- Hai tùy chọn gom trong mục "Chế độ tự tay" ở menu Tạm dừng; có hướng dẫn một lần khi bật lần đầu.
- `compare:views` thêm chế độ bot cầm hàng để so sánh với góc ngang và góc trên xuống hiện tại.

## Khả năng

### Khả năng mới
- `topdown-carry`: cầm hàng từ kho ra kệ và đặt hàng tại điện thoại ở góc nhìn trên xuống.

## Tác động

- Core:
  - `src/core/carry.ts` (mới): hàm thuần cho giữ chỗ, số lượng còn lấy được, bày từ tay; có test.
  - `day.ts`: `DaySession.carrying` (lưu trong snapshot phiên, trường tùy chọn), `startRefillFromHand()`, trả hàng khi kết thúc ngày. `startRefill()` hiện có giữ nguyên cho góc ngang, nhân viên và chơi hộ.
  - `state.ts`: `settings.carryStock?` và `settings.orderAtPhone?` (tùy chọn, không migrate).
- Dữ liệu: `balance.json › topDown.carry` (`carryStacks`, `carryUnitsPerStack`).
- UI: `ui/liveMap.ts` (điểm lấy hàng, thùng trên tay, bày từ tay), hotbar ô tay cầm, `ShopScene` (tự đi về quầy khi đặt hàng), menu Tạm dừng.
- Script: `scripts/compare-views.ts` thêm chế độ `carry`.
- Phụ thuộc: `topdown-store-view` (sơ đồ chơi, luật rời quầy) và `landscape-responsive-layout` D12 (hotbar Nhập hàng, điện thoại bàn). Phiên chơi chung vẫn chỉ dùng góc nhìn ngang nên không bị ảnh hưởng.
