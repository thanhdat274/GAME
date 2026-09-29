## 1. Kiểm tra nội dung

- [x] 1.1 Tạo `src/core/content.ts` với `validateContent(data)` gom `validateProducts`, `validateLevels`, `validateRecipes`, `validateShopTypes`, `validateEventsData`
- [x] 1.2 Thêm validator cho furniture, customers, suppliers, decor, staff, land, story, titles (trường bắt buộc, kiểu số, trùng id, giá trị hợp lệ)
- [x] 1.3 Thêm kiểm tra chéo: quests/weeklyQuests/achievements, partyOrders, levels (nhóm hàng, features), furniture.requiresPlot ↔ land, branches
- [x] 1.4 Chạy trên dữ liệu thật; xử lý từng lỗi (sửa validator nếu là ý đồ, sửa dữ liệu nếu là lỗi thật) và ghi lại

## 2. CLI, test, build

- [x] 2.1 `scripts/validate-data.ts` + script `validate:data`; gọi trong `build`
- [x] 2.2 `tests/content.test.ts`: dữ liệu thật hợp lệ + test âm cho từng loại lỗi

## 3. Chỉ mục tra cứu

- [x] 3.1 Thêm Map cho recipes, shopTypes, suppliers, customers trong `data.ts`; dùng ở `shopTypeDef`, `supplier`, `behavior`
- [x] 3.2 Chạy toàn bộ test để xác nhận hành vi không đổi

## 4. Tài liệu

- [x] 4.1 `docs/adding-content.md`: cách thêm mặt hàng, công thức, loại cửa hàng; cách chạy validator
