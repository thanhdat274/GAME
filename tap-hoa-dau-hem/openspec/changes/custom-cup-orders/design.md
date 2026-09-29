## Context

Tiệm bán ở quầy: khách gọi món (`counterLine`), người chơi chạm ô quầy chứa món đó (`serveCounterRequest(slotIndex)`), tiền tính từ `line.value` hoặc giá chung của món. Một ô quầy giữ một mặt hàng (`productId`, `qty`); giá của món là một giá chung trong `prices`.

## Goals / Non-Goals

**Goals:** đơn gọi tùy chọn; ly theo loại; phục vụ đúng/sai/thay thế có hậu quả rõ; giá theo ly; giữ nguyên hành vi món khác.
**Non-Goals:** phối nhiều topping trên một ly, người chơi pha theo đúng đơn lúc khách đang chờ (vẫn pha sẵn), thay đổi giao diện quầy lớn.

## Decisions

- **Một ô vẫn giữ một món; tùy chọn nằm trong ô** dưới dạng `variants: Record<khóa, số ly>` (khóa rỗng = mặc định). Không tách ô theo tùy chọn để khỏi làm hết chỗ quầy và khỏi đổi cách giao diện chọn ô.
- **`variants` là thông tin phụ tự chữa lành.** Nhiều nơi khác đổi `qty` của ô quầy (bán, hết hạn, trả ly, bàn ăn); thay vì vá từng nơi, `normalizeVariants` khớp tổng theo `qty` mỗi lần đọc: thừa thì bớt từ loại cuối, thiếu thì tính vào mặc định.
- **Giá theo tùy chọn tại lúc phục vụ**: giá món (giá chung, phản ánh chất lượng lần pha) + `priceDelta` của tùy chọn, ghi vào `line.value`. Với món của minigame `tea`, `prepareRecipe` không cộng phụ thu vào giá chung nữa; món khác giữ nguyên.
- **Phân loại thay thế** theo `priceDelta`: đúng loại → không phạt; ly có phụ thu cao hơn → không phạt, khách chỉ trả giá món họ gọi; ly thấp hơn hoặc khác loại cùng mức → khách trừ một sao (`penalty`) và thời gian chờ như chạm sai một nửa, nhưng vẫn trả tiền ly nhận được. Tránh đường chết khi chưa pha đúng loại, vẫn khuyến khích pha đủ loại.
- **Chọn tùy chọn khi sinh đơn** theo `orderWeight` trong dữ liệu (mặc định 0.4 cho ly thường), có dùng RNG hiện có chỉ với món tea nên chuỗi ngẫu nhiên của loại tiệm khác không đổi.
- **Trả ly khi khách bỏ về** cộng lại đúng loại đã lấy (`servedVariant` trên dòng đơn).

## Risks / Trade-offs

- Người chơi không thấy ngay ô nào có loại nào → nhãn ô quầy nêu số ly theo loại và yêu cầu của khách nêu tùy chọn.
- Chọn ô sai loại vẫn được phục vụ (mất sao) thay vì bị từ chối: thân thiện hơn nhưng giảm căng thẳng; cân bằng bằng mất sao.
- Trọng số tùy chọn chưa cân bằng bằng chơi thật → để trong dữ liệu để chỉnh nhanh.
