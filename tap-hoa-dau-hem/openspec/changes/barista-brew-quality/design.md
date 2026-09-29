## Context

`DaySession` đã có một mẻ pha ngay (`brew`) cho khách đầu hàng, `staffCheckout`/`autoServe` dùng `brewInstant`, và nhân viên là `Worker` với `task`/`left` chạy trong `tickWorkers`. Mini-game pha ly là `TeaScene`, mở từ Bếp hoặc từ tiệm (tạm dừng tiệm).

## Goals / Non-Goals

**Goals:** chất lượng có ý nghĩa với giá, người chơi có lựa chọn đánh đổi (tự động hay pha tay), pha chế viên giảm tải bằng cách pha song song và pha trước.
**Non-Goals:** mini-game trong lúc tiệm vẫn chạy, nhiều mẻ của người chơi cùng lúc, chất lượng ảnh hưởng số sao/tip, chế độ chia sẻ trực tuyến.

## Decisions

- **Chất lượng chỉ tác động lên giá** (`brewedCupPrice`): hệ số kẹp 0.75–1.25, làm tròn 500đ, chất lượng đúng 1 giữ nguyên giá. Không đổi sao để không đụng công thức đánh giá khách.
- **Bấm Pha ngay = `autoQuality` 0.9** (dữ liệu), pha tay tối đa 1.1: đánh đổi là chú ý thao tác đổi lấy giá cao hơn, tiệm đứng yên trong lúc pha tay nên không làm khách mất kiên nhẫn. Chấp nhận pha tay hơi "rẻ" về thời gian; chỉnh bằng `autoQuality`.
- **Pha tay chạy trên `TeaScene` với `forCustomer`**: tùy chọn khóa theo khách gọi, `deliver` gọi `ShopScene.handBrewDone` → `session.brewByHand`. Nguyên liệu chỉ bị trừ lúc giao (thoát giữa chừng không mất gì). `brewByHand` kiểm tra lại lời mời còn hiệu lực.
- **Mẻ của pha chế viên là `Worker.task = 'brew:<khách>'`** kèm bản ghi `staffBrews` (không lưu vào bản lưu như `brew`). Nguyên liệu trừ ngay khi nhận, khách đi mất thì mẻ bị hủy và pha chế viên rảnh lại (nguyên liệu không hoàn).
- **Chọn khách để pha (`brewTarget`)**: khách đầu hàng đang chờ ly, hoặc khách `waiting` trong hàng của người chơi/thu ngân, gọi ly pha ngay được và chưa có ai pha/đã pha sẵn. Mỗi khách một mẻ nên nhiều pha chế viên tự chia việc.
- **Ly pha trước (`prebrewed`)**: khách chưa tới lượt nhận ly khi tới lượt (`beginCounterRequest`, hoặc `staffCheckout` của thu ngân với thời gian pha bằng 0). Khách rời thì ly bỏ.
- **Ưu tiên của pha chế viên:** ly cho khách trước, pha sẵn món `ready` sau; chu kỳ kiểm tra rút còn tối đa 1 giây để kịp phục vụ.
- **Hiển thị:** `brewProgress` trả thêm `by` (tên pha chế viên); `brewOffer` là null khi đã có người pha, nên nút Pha ngay/Pha tay tự khóa.

## Risks / Trade-offs

- Chất lượng chỉ ảnh hưởng giá nên pha tay chỉ hơn pha tự động vài phần trăm; cần chơi thử để biết có đáng bấm không.
- Pha chế viên có thể pha cho khách rồi khách bỏ đi (mất nguyên liệu); chấp nhận như khi người chơi pha.
- Hai khách cùng chờ ly đúng loại còn trên quầy có thể bị pha thừa; ít gặp nên bỏ qua.
