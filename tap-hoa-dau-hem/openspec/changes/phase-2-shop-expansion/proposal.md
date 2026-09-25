## Why

Sau giai đoạn 1, người chơi chạm trần level 4 với 3 kệ và 14 món, nên vòng chơi sẽ nhàm sau khoảng một tuần. Giai đoạn 2 cho tiệm "lớn dần": mở thêm đất, kho to hơn, hàng mới cần tủ lạnh hoặc có hạn dùng, và thêm quyết định kinh tế (giá bán, chọn mối sỉ, sổ nợ). Có thêm nhiệm vụ hằng ngày để người chơi quay lại mỗi ngày.

## What Changes

- Nâng giới hạn level từ 4 lên 9, thêm bảng mở khóa L5–L9.
- **Mở rộng mặt bằng**: bản đồ tiệm dạng lưới với các ô đất bị khóa (mờ + ổ khóa). Mở khóa cần đủ level và tiền. Người chơi tự đặt kệ, tủ, kho lên ô đất.
- **Kho**: nâng cấp theo bậc (kệ gỗ 30 → kệ sắt 50 → kho lớn 80 ô), màn quản lý kho.
- **Tủ lạnh / tủ đông**: thiết bị đặt lên đất, có ô riêng cho đồ uống và đồ đông lạnh, tốn tiền điện mỗi ngày.
- **Hàng tươi và hạn dùng**: trứng, bánh mì, rau, sữa có hạn 1–3 ngày; hàng hết hạn phải bỏ. Có "bán xả" giảm giá.
- **Nhiều mối sỉ**: mối 2 rẻ hơn nhưng giao chiều hôm sau; giá sỉ dao động theo ngày; mua sỉ số lượng lớn được chiết khấu.
- **Chỉnh giá bán**: giá cao hơn giá gợi ý thì khách có thể chê và bỏ món.
- **Kiểu khách mới**: bà nội trợ mặc cả (mini-game đồng ý / từ chối giảm giá), khách ghi sổ nợ.
- **Sổ nợ**: ghi, nhắc, thu nợ; có rủi ro bị quỵt.
- **Nhiệm vụ hằng ngày** (3/ngày) và **thành tựu**.
- **Trang trí**: biển hiệu, đèn, chậu cây, con mèo, giúp tăng chỉ số "thu hút".
- 16 mặt hàng mới: đồ uống, đồ tươi, đông lạnh.
- **BREAKING (dữ liệu lưu)**: bản lưu lên version 2, có migrate tự động từ v1.

## Capabilities

### New Capabilities
- `land-expansion`: Lưới mặt bằng, ô đất khóa, mở khóa đất, đặt/di chuyển nội thất.
- `warehouse`: Bậc kho, sức chứa, màn quản lý kho.
- `refrigeration`: Tủ lạnh / tủ đông, ô lạnh, tiền điện.
- `product-freshness`: Hạn dùng theo lô, hết hạn, bán xả.
- `supplier-market`: Nhiều mối sỉ, giá dao động, giao hàng trễ, chiết khấu số lượng.
- `pricing-control`: Chỉnh giá bán và phản ứng của khách với giá.
- `debt-ledger`: Sổ nợ của khách ghi sổ.
- `daily-quests`: Nhiệm vụ hằng ngày và thành tựu.
- `shop-decoration`: Đồ trang trí và chỉ số thu hút.

### Modified Capabilities
- `progression`: Nâng giới hạn level lên 9 và thêm bảng mở khóa L5–L9.
- `customer-flow`: Thêm kiểu khách mặc cả, khách ghi sổ; khách phản ứng với giá bán và thu hút.
- `save-system`: Bản lưu v2, migrate v1 → v2, xuất/nhập mã sao lưu.
- `product-catalog`: Thêm 16 mặt hàng và các trường hạn dùng, cần lạnh, giá gợi ý.

## Impact

- Core: thêm mô-đun `land.ts`, `warehouse.ts`, `freshness.ts`, `suppliers.ts`, `pricing.ts`, `ledger.ts`, `quests.ts`. Kho chuyển từ "số lượng theo món" sang "lô hàng có ngày hết hạn".
- Scene: thêm Chế độ Xây dựng (build mode), màn Kho, màn Sổ nợ, màn Nhiệm vụ; camera tiệm có thể kéo/cuộn khi tiệm lớn.
- Dữ liệu: `land.json`, `furniture.json`, `suppliers.json`, `quests.json`, `decor.json`; mở rộng `products.json`, `levels.json`.
- Asset: tủ lạnh, tủ đông, kệ sắt, 16 icon hàng mới, đồ trang trí, ô đất khóa.
