## Why

Game sắp mở rộng thành phố buôn bán với hàng trăm SKU và nhiều loại cửa hàng. Dữ liệu đã nằm trong `src/data/*.json`, nhưng kiểm tra chỉ rải rác (products, levels, recipes, shopTypes, events), không có kiểm tra chéo giữa các file (quest → mặt hàng, party order → mặt hàng, level → nhóm hàng...) và không có một lệnh/test chung. Thêm nội dung dễ sinh tham chiếu hỏng chỉ lộ ra lúc chơi.

## What Changes

- Thêm bộ kiểm tra nội dung tập trung `validateContent()` gom validator hiện có và bổ sung kiểm tra schema + tham chiếu chéo cho mọi file JSON còn thiếu.
- Thêm lệnh `npm run validate:data` và một test Vitest chạy validator trên dữ liệu thật, chặn build khi dữ liệu hỏng.
- Thêm chỉ mục tra cứu (Map) cho các danh sách thường tra bằng `find` (recipes, shopTypes, suppliers, customers) để O(1) khi số lượng lớn.
- Viết tài liệu "thêm mặt hàng / loại cửa hàng chỉ bằng dữ liệu".
- Không đổi gameplay, cân bằng, hay định dạng save.

## Capabilities

### New Capabilities
- `content-validation`: kiểm tra schema và tham chiếu chéo toàn bộ dữ liệu nội dung, chạy qua CLI và test.

### Modified Capabilities
<!-- không có -->

## Impact

- Code: `src/core/content.ts` (mới), `src/core/data.ts` (chỉ mục tra cứu), `src/core/shopTypes.ts`/`recipes.ts` (dùng chỉ mục).
- Scripts: `scripts/validate-data.ts`, `package.json`, hook vào `build`.
- Tests: `tests/content.test.ts`.
- Docs: `docs/adding-content.md`.
- Không thêm dependency runtime.
