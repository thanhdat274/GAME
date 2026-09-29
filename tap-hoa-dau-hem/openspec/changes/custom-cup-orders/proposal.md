## Why

Ở tiệm trà sữa người chơi chọn tùy chọn (Size L, thêm trân châu, thêm thạch, thêm foam) lúc pha, nhưng khách chỉ gọi tên món nên tùy chọn không có ý nghĩa với việc bán. Cho khách gọi ly tùy biến làm việc pha có mục đích: pha đúng loại khách cần, canh mức tồn từng loại ly, và bán được giá cao hơn cho ly nhiều topping.

## What Changes

- Đơn hàng ở quầy của món trà mang thêm `variantId` (mặc định, Size L, + trân châu...), chọn theo trọng số `orderWeight` của từng tùy chọn trong dữ liệu.
- Ô quầy đếm số ly theo từng tùy chọn; pha xong ly nào thì cộng đúng loại đó.
- Phục vụ: khách được đưa đúng ly nếu quầy có; nếu không có thì nhận một ly khác trong ô. Ly "kém hơn" yêu cầu (phụ thu thấp hơn hoặc khác loại) làm khách mất một sao; ly "tốt hơn" thì không phạt nhưng khách chỉ trả giá món họ gọi.
- Tiền tính theo ly thực sự đưa (giá món + phụ thu của tùy chọn), không còn dùng một giá chung cho mọi ly cùng món.
- Giao diện hiển thị: yêu cầu của khách nêu rõ tùy chọn; nhãn ô quầy nêu số ly theo loại; màn pha ly hiện tồn quầy theo loại.
- Không đổi các món ở tiệm khác (xôi, tạp hóa) và không đổi định dạng lưu ngoài trường tùy chọn mới của ô quầy.

## Capabilities

### New Capabilities
- `custom-cup-orders`: khách gọi ly trà tùy biến và cách phục vụ, tính tiền, phạt theo ly.

### Modified Capabilities
<!-- không có -->

## Impact

- Mới: `src/core/customCups.ts`, `tests/customCups.test.ts`.
- Sửa: `data.ts`, `state.ts` (kiểu), `recipes.ts` (pha), `customers.ts` (sinh đơn), `day.ts` (phục vụ, trả ly), `make-tea-content.ts` (trọng số), `TeaScene.ts`, `ShopScene.ts` (nhãn).
- Save: ô quầy có thêm trường tùy chọn `variants`; bản lưu cũ không có trường này vẫn hợp lệ.
