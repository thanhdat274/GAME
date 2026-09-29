## Why

Pha theo đơn hiện chỉ có một nút Pha ngay: ly luôn ra chất lượng cố định, một mẻ một lúc, và nhân viên pha chế chỉ pha sẵn nên không giúp gì khi khách đang chờ. Mini-game pha ly đã có nhưng bị bỏ ngoài luồng bán hàng, còn quầy đông thì người chơi phải tự pha từng ly.

## What Changes

- **Chất lượng ly pha theo đơn:** giá ly nhân hệ số chất lượng (0.75–1.25, chất lượng 1 giữ nguyên giá) cộng phụ thu như cũ. Bấm **Pha ngay** ra chất lượng `madeToOrder.autoQuality` (0.9).
- **Pha tay:** nút **Pha tay** mở mini-game pha ly cho đúng ly khách gọi (tùy chọn bị khóa, tiệm đứng yên). Không sai bước nào được chất lượng 1.1, mỗi bước sai trừ 0.07 (sàn 0.75). Bấm Giao cho khách thì nguyên liệu bị trừ và khách nhận ly ngay.
- **Pha chế viên pha theo đơn song song:** nhân viên `barista` tự nhận pha ly cho khách đang chờ ở quầy hoặc đang xếp hàng (kể cả hàng thu ngân). Nhiều pha chế viên pha song song, mỗi người một khách. Ly pha trước cho khách chưa tới lượt được giao ngay khi tới lượt. Chất lượng theo chỉ số chuẩn xác (0.75 + 0.045 × chuẩn xác, tối đa 1.1); thời gian theo tốc độ và mệt của nhân viên.
- Trong lúc pha chế viên pha cho khách đang chờ ở quầy, khách kiên nhẫn như khi người chơi pha; nút Pha ngay/Pha tay bị khóa và hiện tên pha chế viên cùng số giây còn lại.
- Thu ngân dùng ly pha chế viên đã pha sẵn (không mất thời gian pha), và ly thu ngân tự pha có chất lượng theo chuẩn xác của họ.
- Pha chế viên vẫn pha sẵn các món `ready` khi không có khách chờ.

## Capabilities

### New Capabilities
- `barista-brew-quality`: chất lượng ly pha theo đơn, pha tay bằng mini-game, pha chế viên pha theo đơn song song.

### Modified Capabilities
<!-- made-to-order-cups: giá ly pha ngay giờ theo chất lượng; hành vi khác giữ nguyên -->

## Impact

- Code: `customCups.ts` (hàm chất lượng/giá), `day.ts` (pha tay, mẻ của nhân viên, ly pha trước), `TeaScene.ts` (chế độ pha cho khách), `ShopScene.ts` (nút Pha tay, nhãn chất lượng), `data.ts`, `balance.json`.
- Test: `tests/baristaBrew.test.ts`, `tests/madeToOrder.test.ts`.
- Cân bằng: chất lượng tự động 0.9, sàn/trần 0.75–1.1, thời gian pha chế viên và giá theo chất lượng chưa cân bằng bằng chơi thử.
