## 1. Logic thuần

- [x] 1.1 Kiểu: `Slot.variants`, `OrderLine.variantId/servedVariant`, `RecipeVariant.orderWeight`; script sinh trọng số
- [x] 1.2 `src/core/customCups.ts`: `normalizeVariants`, `addCup`, `takeCup`, `pickServed`, `variantFit`, `unitPrice`, `orderVariantFor`, nhãn
- [x] 1.3 `prepareRecipe` cộng đúng loại, món tea không cộng phụ thu vào giá chung
- [x] 1.4 `generateCounterOrder` chọn tùy chọn; `serveCounterRequest` phục vụ/thay thế/phạt/giá; `returnLine` trả đúng loại

## 2. Giao diện

- [x] 2.1 Yêu cầu của khách nêu tùy chọn; nhãn ô quầy nêu số ly theo loại (ShopScene)
- [x] 2.2 Màn pha ly hiện tồn quầy theo loại

## 3. Kiểm tra

- [x] 3.1 `tests/customCups.test.ts`: chuẩn hóa, phục vụ đúng/kém/tốt hơn, giá, trả ly, phân bố đơn, một ngày chạy được
- [x] 3.2 `tsc`, `vitest` toàn bộ, `validate:data`
- [x] 3.3 Chạy thử trình duyệt
