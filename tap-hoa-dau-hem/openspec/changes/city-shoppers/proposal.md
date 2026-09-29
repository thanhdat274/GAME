## Why

Dân phố trên bản đồ chỉ đi dạo, không liên quan gì tới các cửa hàng. Cho họ ghé mua ở tiệm làm phố có nhịp sống thật: nhìn là biết tiệm nào đông, tiệm nào vắng vì kệ trống hay đã đóng cửa.

## What Changes

- Thêm module thuần `src/core/cityShopping.ts`: xác định các tiệm khách có thể ghé (tiệm đã mở, có cửa trên bản đồ), giờ mở cửa, tỉ lệ kệ có hàng, và chọn tiệm theo sở thích của từng loại khách.
- `CityScene`: dân phố có việc "đi mua": chọn một tiệm, đi tới cửa, vào trong vài giây rồi ra với túi hàng; cửa nhấp sáng và có biểu tượng nổi lên khi có người vào/ra. Ngoài giờ mở cửa thì không ghé.
- Mức thu hút tiệm dựa trên dữ liệu thật: `traffic` của chi nhánh, hàng đang có trên kệ của tiệm, và độ hợp giữa sở thích loại khách với nhóm hàng của loại tiệm.
- Chỉ là lớp hiển thị: không tạo doanh thu, không đổi save hay số liệu tiệm.

## Capabilities

### New Capabilities
- `city-shoppers`: dân phố trên bản đồ chọn và ghé mua ở các tiệm đang mở.

### Modified Capabilities
<!-- không có -->

## Impact

- Mới: `src/core/cityShopping.ts`, `tests/cityShopping.test.ts`.
- Sửa: `src/scenes/CityScene.ts`.
- Không đổi dữ liệu, không thêm dependency.
