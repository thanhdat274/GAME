## Why

Game hiện chỉ có hai loại cửa hàng (tạp hóa, tiệm xôi); các chi nhánh khác đều là tạp hóa đổi địa điểm. Để thành một phố buôn bán, cần các loại cửa hàng thật sự khác nhau về hàng bán, khách, giờ đông và nội thất, và thêm loại mới phải là việc thêm dữ liệu, không phải sửa union kiểu trong code.

## What Changes

- Thêm 3 loại cửa hàng bán theo kệ: **Tiệm rau củ** (hàng tươi/khô, khách nội trợ, đông sáng và chiều), **Quầy giải khát** (nước/đồ đông lạnh/ăn vặt kèm công thức đồ uống, khách học sinh/sinh viên, đông chiều tối), **Cửa hàng gia dụng** (đồ gia dụng/khô, đông cuối ngày).
- Thêm 3 chi nhánh tương ứng (`veg`, `drink`, `home`) mở bằng tính năng level `shop_veg` (L31), `shop_drink` (L32), `shop_home` (L34).
- Nới kiểu `ShopTypeId` và `BranchDef.kind` từ union cố định sang chuỗi được validator kiểm tra, để loại mới chỉ cần dữ liệu.
- Tăng `chain.maxStores` từ 6 lên 8 để chứa các tiệm mới.
- Bản đồ phố: ba lô đất trống thành ba tiệm mới, thêm hai lô đất trống ở hàng dưới; thêm ngoại hình tòa nhà cho ba loại.
- Không đổi luật bán hàng, tiệm xôi, hay định dạng save.

## Capabilities

### New Capabilities
- `shop-types`: các loại cửa hàng bán theo kệ dựa trên dữ liệu (rau củ, giải khát, gia dụng) và cách thêm loại mới.

### Modified Capabilities
<!-- không có -->

## Impact

- Dữ liệu: `shopTypes.json`, `branches.json`, `levels.json`, `balance.json`, `cityMap.json` (qua generator).
- Code: `data.ts`, `state.ts` (kiểu), `cityTiles.ts` (ngoại hình), `simulation.ts` nếu hồ sơ max cần xử lý loại mới.
- Test: `tests/shopTypes.test.ts` (mở từng tiệm, chạy một ngày), `content` validator.
- Số cửa hàng tối đa trong chuỗi tăng: đây là thay đổi cân bằng, cần chú ý khi thử chơi.
