## Why

Ở tiệm trà sữa mọi ly đều phải pha sẵn rồi khách nhận từ quầy. Thực tế có món pha sẵn được (trà sữa trân châu, hồng trà) và có món phải pha theo đơn (foam, matcha, món nhiều topping). Cho khách chờ pha theo đơn làm nhịp bán hàng có quyết định thật: canh thời gian pha trong lúc khách chờ, và chọn món nào nên pha sẵn để phục vụ nhanh.

## What Changes

- Mỗi món trà có kiểu phục vụ `serve` trong dữ liệu: `ready` (pha sẵn, để trên quầy như hiện nay) hoặc `order` (pha theo đơn). Món `order` không thể pha sẵn.
- Khi khách gọi mà quầy không có đúng ly (món `order`, hoặc món `ready` hết đúng loại), người chơi bấm **Pha ngay**: nguyên liệu bị trừ lập tức, ly mất `prepSeconds` để pha trong lúc khách chờ; xong thì khách nhận đúng ly gọi, giá đủ phụ thu. Khách mất dần kiên nhẫn khi chờ nên pha lâu thì ít sao hơn.
- Món `ready` vẫn phục vụ tức thì từ quầy nếu có ly (có thể thay thế loại khác như hiện nay); thiếu đúng loại thì chọn nhận ly thay thế hoặc pha ngay.
- Thu ngân và chế độ tự phục vụ (bỏ qua ngày) cũng xử lý ly tùy biến và pha theo đơn: cùng một cách tính giá, phạt và thời gian pha.
- Pha chế viên (`barista`) chỉ tự pha sẵn các món `ready`.
- Màn Bếp và pha ly cho biết món nào pha theo đơn; món `order` không có nút chế biến trước.
- Giao diện bán hàng: nút "Pha ngay", thanh tiến độ pha và trạng thái chờ.

## Capabilities

### New Capabilities
- `made-to-order-cups`: kiểu phục vụ pha sẵn/pha theo đơn, pha ngay khi khách chờ.

### Modified Capabilities
<!-- không có -->

## Impact

- Dữ liệu: `recipes.json` (trường `serve`), `balance.json` (`madeToOrder`), `make-tea-content.ts`.
- Code: `data.ts`, `recipes.ts`, `customCups.ts`, `customers.ts`, `day.ts`, `KitchenScene.ts`, `TeaScene.ts`, `ShopScene.ts`.
- Test: `tests/madeToOrder.test.ts`.
- Cân bằng: thời gian pha, tốc độ mất kiên nhẫn và phân bố món pha theo đơn chưa cân bằng bằng chơi thật.
