## 1. Dữ liệu và kiểu

- [x] 1.1 `RecipeDef.serve`, `Balance.madeToOrder`; script gán `serve` cho từng món; `recipes.json`, `balance.json`
- [x] 1.2 `prepareRecipe` từ chối món `order`; nhân viên pha chế bỏ qua món `order`

## 2. Lõi phục vụ

- [x] 2.1 `recipes.ts`: kiểm tra và trừ nguyên liệu cho một ly pha ngay (không đặt lên quầy)
- [x] 2.2 `day.ts`: `applyCustomCup` dùng chung; `startBrew`/`tickBrew`/hủy; `beginCounterRequest` cho phép món pha theo đơn; `returnLine` cho dòng không có ô
- [x] 2.3 Thu ngân (`staffCheckout`) và `autoServe`: cùng quy tắc ly và pha theo đơn
- [x] 2.4 Đơn của khách: món `order` luôn có trọng số như còn hàng; thời gian yêu cầu dài hơn

## 3. Giao diện

- [x] 3.1 `ShopScene`: nút Pha ngay, thanh tiến độ, trạng thái đang pha
- [x] 3.2 `KitchenScene`/`TeaScene`: nhãn "pha theo đơn", chặn chế biến trước

## 4. Kiểm tra

- [x] 4.1 `tests/madeToOrder.test.ts`
- [x] 4.2 `tsc`, `vitest` toàn bộ, `validate:data`, `validate:recipes`
- [x] 4.3 Chạy thử trình duyệt
