## Why

Dân phố đi mua ở các tiệm nhưng người chơi không biết họ là ai hay định mua gì. Cho phép bấm vào một người để xem tên, loại khách, đang làm gì và danh sách định mua giúp bản đồ phố có chiều sâu và cho thấy tiệm nào đáp ứng nhu cầu của ai.

## What Changes

- `cityShopping.ts` bổ sung `planPurchase`: sinh danh sách định mua từ **hàng thật đang có trên kệ** của tiệm khách chọn, theo sở thích loại khách, giá của tiệm, số lượng tối đa theo giá và hệ số bán sỉ của loại tiệm. Kệ trống thì danh sách rỗng.
- `ShopTarget` mang thêm hàng đang có (mặt hàng, số lượng, giá) và hệ số số lượng.
- `CityScene`: bấm vào một người mở bảng thông tin (tên, loại khách, trạng thái hiện tại, định mua/vừa mua, sở thích), có nút theo dõi bằng camera; người bấm có vòng sáng dưới chân.
- Trạng thái người dân mở rộng: định mua trước khi tới tiệm, "vừa mua" khi ra, "kệ trống ra về tay không" nếu tiệm hết hàng.
- Chỉ là lớp hiển thị: không đổi tiền, kho hay save.

## Capabilities

### New Capabilities
- `city-resident-info`: xem thông tin và ý định mua sắm của dân phố.

### Modified Capabilities
<!-- không có -->

## Impact

- Sửa: `src/core/cityShopping.ts`, `src/core/shopTypes.ts` (xuất nhãn nhóm hàng), `src/scenes/CityScene.ts`.
- Test: mở rộng `tests/cityShopping.test.ts`.
- Không đổi dữ liệu, không thêm dependency.
