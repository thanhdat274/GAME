## Context

`shopTypes.json` đã mô tả loại tiệm bằng dữ liệu (nhóm hàng, nội thất, khách, đường cong khách, công thức). Loại `grocery` dùng `service: 'shelves'` + `sim: 'profit_average'`, nên một loại tiệm bán theo kệ mới không cần cơ chế mới. Ràng buộc còn lại nằm ở kiểu TS (`'grocery' | 'xoi'`) và số cửa hàng tối đa.

## Goals / Non-Goals

**Goals:** ba loại mới khác nhau thật sự về hàng, khách và giờ đông; mở được từ bản đồ phố; thêm loại mới không cần sửa code.
**Non-Goals:** cơ chế bán hàng mới (quầy gọi món, sản xuất như tiệm xôi), nhóm hàng/sản phẩm mới, mini-game riêng, đồ họa nội thất riêng.

## Decisions

- **`ShopTypeId` và `BranchKind` thành `string`.** Validator (`validateShopTypes`, `validateContent`) đã kiểm tra mọi tham chiếu, nên union cố định chỉ còn cản trở. Đánh đổi: so sánh với chuỗi sai chính tả không còn bị compiler bắt; giữ hằng cho `'grocery'` và `'xoi'` ở chỗ code có hành vi riêng.
- **Loại mới dùng `landPlots: true`** như tạp hóa để có thể mở rộng mặt bằng và đặt kệ lớn. Khác biệt đến từ `categories`, `customers`, `densityCurve`, `fixtures`, `addOns`.
- **Quầy giải khát dùng lại 5 công thức đồ uống** của tạp hóa (trạm blender/ép mía/quầy nước), liệt kê nguyên liệu trong `ingredients` để hàng nguyên liệu bán được ở loại tiệm này dù không thuộc nhóm hàng.
- **Mở theo tính năng level** (`shop_veg`, `shop_drink`, `shop_home`) thay vì chỉ `unlockLevel`, đúng cơ chế của tiệm xôi; thêm vào `levels.json` ở L31/32/34.
- **`maxStores` 6 → 8.** Đây là thay đổi cân bằng có chủ ý: chuỗi tối đa gồm tiệm chính + 4 chi nhánh hiện có + 3 tiệm mới.
- **Ngoại hình tòa nhà**: bổ sung bảng màu cho ba loại, loại lạ dùng bảng màu mặc định thay vì lỗi.

## Risks / Trade-offs

- Hồ sơ max (`createMaxLevelSimulation`) và test mô phỏng một năm mở mọi chi nhánh → phải chạy lại và chỉnh nếu loại mới làm hỏng giả định (ví dụ chỉ gieo hàng cho `grocery`).
- Cân bằng kinh tế chưa đo bằng chơi thật → giữ hệ số `efficiency`/`traffic`/`cost` sát các chi nhánh hiện có, ghi rõ là số ban đầu.
- Tiệm không có công thức riêng (rau củ, gia dụng) có thể thấy nhạt → chấp nhận cho lát cắt đầu.
