## Context

`serveCounterRequest` phục vụ từ ô quầy; thu ngân (`staffCheckout`) và tự phục vụ (`autoServe`) có đường riêng. Đơn ở quầy có `variantId` và ô quầy đếm ly theo loại. Khách có bộ đếm yêu cầu quầy (`counterRequestLeft`, 6 giây) và kiên nhẫn chung (`patience`, ảnh hưởng số sao).

## Goals / Non-Goals

**Goals:** pha theo đơn có thời gian và hậu quả, pha sẵn còn giá trị, mọi đường phục vụ (người chơi, thu ngân, tự động) cùng quy tắc ly.
**Non-Goals:** nhiều trạm pha song song, mini-game pha trong lúc bán, pha theo đơn cho bàn ăn tại chỗ, chế độ chia sẻ trực tuyến (lệnh mới cho `liveSession`).

## Decisions

- **`recipe.serve` trong dữ liệu** (`ready` mặc định, `order`): món foam, matcha và món nhiều topping cao cấp là `order`; món truyền thống là `ready`. Chỉnh bằng dữ liệu.
- **Pha ngay là một tác vụ của phiên bán** (`startBrew`), không phải cảnh mini-game: nguyên liệu trừ lập tức, một bộ đếm `left` chạy trong `tick`, xong thì khách nhận đúng ly. Tránh tạm dừng cả phiên bán và giữ được chế độ tự động/mô phỏng.
- **Một mẻ pha cùng lúc** cho khách đầu hàng. Bộ đếm yêu cầu của khách tạm dừng khi đang pha (không hết giờ giữa chừng), nhưng kiên nhẫn chung giảm theo `madeToOrder.patienceDrain` mỗi giây, nên chờ lâu thì ít sao.
- **Thời gian yêu cầu của món pha theo đơn dài hơn** (`counterRequestSeconds + waitSeconds`) để người chơi kịp bấm Pha ngay; món pha sẵn giữ 6 giây.
- **Khách hủy trong lúc pha**: mẻ bị bỏ, nguyên liệu mất (đã trừ), ghi nhật ký.
- **Gộp đường phục vụ ly**: hàm dùng chung `applyCustomCup` (chọn ly, giá, phạt) cho người chơi và thu ngân; `brewNow` cho pha ngay của thu ngân/tự động (cộng thời gian pha vào việc của thu ngân, hoặc bộ đếm pha của người chơi). `returnLine` xử lý dòng đơn quầy không có ô (ly pha ngay bị bỏ khi khách hủy).
- **Pre-make bị chặn ở `prepareRecipe`** (`reason: 'order'`) và nhân viên pha chế bỏ qua món `order`, để dữ liệu quyết định một chiều.
- **Chất lượng ly pha ngay cố định 1.0** (chưa có mini-game); ghi rõ để làm sau.

## Risks / Trade-offs

- Đường phục vụ của thu ngân trước đây bỏ qua ly tùy biến → sửa theo là thay đổi hành vi có chủ ý (đúng giá, đúng phạt).
- Một mẻ pha một lúc có thể làm hàng dài khi đông; đó là áp lực mong muốn, chỉnh bằng thời gian pha và món `ready`.
- Không hỗ trợ chế độ chia sẻ trực tuyến → nút Pha ngay ẩn khi đang ở phiên chia sẻ.
