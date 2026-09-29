## Why

Ba loại cửa hàng mới (rau củ, giải khát, gia dụng) mới khác nhau ở hàng bán, khách và giờ đông; cách chơi vẫn giống tạp hóa. Mỗi loại cần một cơ chế riêng để có quyết định kinh doanh riêng: rau củ phải canh độ tươi, quầy giải khát chạy theo mùa nóng, cửa hàng gia dụng bán sỉ số lượng lớn.

## What Changes

- Thêm khối tùy chọn `mechanics` trong `shopTypes.json`, đọc bằng dữ liệu: `shelfLifeMul` (hạn dùng theo nhóm hàng), `demandMul` (nhu cầu theo nhóm hàng), `seasonSensitivity` (độ nhạy với nhu cầu theo mùa), `qtyMul` (số lượng mỗi dòng hàng), `trafficMul` (lượng khách chung).
- Áp dụng vào lõi: hạn dùng khi nhập hàng, giỏ hàng của khách, nhu cầu theo mùa/sự kiện, mật độ khách.
- Gán cho ba loại: **rau củ** (hàng tươi hạn ×0.6, nhu cầu tươi ×1.4), **giải khát** (nhạy mùa ×1.6), **gia dụng** (mua sỉ ×2 số lượng, khách ít hơn ×0.65).
- Tạp hóa và tiệm xôi không đổi: không có `mechanics` nên kết quả mô phỏng theo seed giữ nguyên.
- Hiển thị đặc điểm loại tiệm (sinh tự động từ số liệu) trong bảng thông tin ở bản đồ phố.
- Validator kiểm tra `mechanics`.

## Capabilities

### New Capabilities
- `shop-mechanics`: cơ chế riêng theo loại cửa hàng, cấu hình bằng dữ liệu.

### Modified Capabilities
<!-- không có -->

## Impact

- Dữ liệu: `shopTypes.json`.
- Code: `data.ts` (kiểu), `shopTypes.ts` (hành vi, mô tả, validator), `stock.ts` (hạn dùng), `customers.ts` (giỏ hàng, nhu cầu, mật độ), `CityScene.ts` (hiển thị).
- Test: `tests/shopMechanics.test.ts`.
- Là thay đổi cân bằng cho ba loại tiệm mới; tạp hóa/xôi không đổi.
