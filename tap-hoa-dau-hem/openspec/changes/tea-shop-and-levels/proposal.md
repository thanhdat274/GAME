## Why

Người chơi muốn có tiệm trà sữa với cách pha ly nhiều lựa chọn (size, trà, topping, foam, đá, đường) như các game pha chế, và game dài hơn: hiện tối đa level 35, sau đó chỉ còn danh hiệu. Thêm level 36–50 với mỗi level mở khóa một thứ mới giữ nhịp tiến triển cuốn hút.

## What Changes

- **Tiệm trà sữa** (`tea_shop`): loại cửa hàng bán ở quầy, thực đơn 14 món trà (trà sữa trân châu, hồng trà sữa, lục trà vải, trà thái đỏ, ô long sữa, matcha latte, trà dâu, hồng trà macchiato, trà chanh dây, trà khoai môn...), mỗi món nhiều biến thể (size L, thêm trân châu, thêm thạch, thêm foam).
- **Nguyên liệu trà sữa** (cốt trà, siro, topping, foam, nước đường, ly) là mặt hàng riêng của tiệm trà sữa (`shopOnly`), không lẫn vào tạp hóa; công thức và mặt hàng thành phẩm sinh bằng script để giá vốn khớp nguyên liệu.
- **Mini-game pha ly** (chế độ `tea` của màn Cook): các quầy trà, topping, foam, siro, đá/đường như ảnh tham khảo; chạm đúng thứ tự, có huy hiệu số lượng tồn, sai thứ tự thì kém ngon.
- **Nội thất mới**: quầy pha trà và máy đánh foam (công thức nâng cao cần máy foam).
- **Level 36–50**: mỗi level mở một thứ mới (tiệm trà sữa, nhóm công thức trà, kho trung tâm, tiệm bánh kẹo, siêu thị mini, chỗ nhân viên); danh hiệu (`prestige`) chuyển sang level tối đa mới.
- **Hai loại tiệm bán theo kệ nữa**: tiệm bánh kẹo (level 40) và siêu thị mini (level 45) bán sỉ, mở thêm chi nhánh và lô đất trên bản đồ phố; tăng `maxStores`.
- **BREAKING (cân bằng)**: `maxLevel` 35 → 50; hệ danh hiệu bắt đầu ở level 50; sao danh hiệu tính từ EXP mốc level 50 nên người chơi đang có sao có thể thấy số sao thấp hơn.

## Capabilities

### New Capabilities
- `tea-shop`: loại cửa hàng trà sữa, thực đơn, nguyên liệu riêng và mini-game pha ly.
- `level-expansion`: level 36–50 và các thứ được mở khóa theo level.

### Modified Capabilities
<!-- không có -->

## Impact

- Dữ liệu: `levels.json`, `products.json`, `recipes.json`, `furniture.json`, `shopTypes.json`, `branches.json`, `balance.json`, `cityMap.json`.
- Code: `data.ts` (`shopOnly`), `state.ts`, `shopTypes.ts`, `KitchenScene.ts` (chế độ `tea`), `PrestigeScene.ts`, `cityTiles.ts`, `simulation.ts`, `pixelart.ts` (bí danh sprite).
- Script: sinh nội dung trà sữa và sinh bản đồ phố.
- Test: cập nhật các test ghim level 35; test mới cho trà sữa và level.
