## Context

`src/core/data.ts` import 17 file JSON vào object `DATA`. Validator hiện có: `validateProducts`, `validateLevels` (data.ts), `validateRecipes`, `validateShopTypes` (bao gồm branches), `validateEventsData`. Chưa có kiểm tra: furniture, customers, suppliers, quests, achievements, weeklyQuests, partyOrders, decor, staff, land, story, titles và các tham chiếu chéo của chúng.

## Goals / Non-Goals

**Goals:**
- Một hàm `validateContent(data)` trả danh sách lỗi tiếng Việt có tiền tố `file.id`.
- Chạy được bằng CLI, bằng Vitest, và trong `npm run build`.
- Dùng được khi thêm hàng trăm SKU mà không phải sửa code.

**Non-Goals:**
- Không tách JSON thành nhiều gói nạp theo yêu cầu (làm ở giai đoạn C nếu đo cần).
- Không đổi định dạng dữ liệu, không thêm thư viện schema.

## Decisions

- **Validator viết tay, không dùng Zod.** Dữ liệu chỉ kiểm khi dev/build, không cần chạy runtime; tránh thêm dependency và bundle. Chấp nhận code dài hơn. Validator nhận `data: GameData` làm tham số để test được bằng dữ liệu giả.
- **Gom trong `src/core/content.ts`**, gọi lại validator cũ thay vì viết lại, rồi thêm các hàm `validateX` mới cho từng file còn thiếu và một pass tham chiếu chéo.
- **Chỉ mục Map dựng một lần khi nạp module** cho recipes/shopTypes/suppliers/customers, thay `find` tuyến tính ở `shopTypeDef`, `supplier`, và hàng nóng.
- **Dữ liệu thật đang có thể sai** (ví dụ khóa không phải id mặt hàng trong `partyOrders`). Khi gặp, xác nhận với code dùng nó: nếu là ý đồ (vd. khóa là nhóm hàng) thì validator chấp nhận đúng dạng đó; nếu là lỗi thật thì sửa dữ liệu và ghi lại.

## Risks / Trade-offs

- Validator quá chặt có thể chặn dữ liệu hợp lệ → mỗi luật có test dương và test âm, và chạy trên dữ liệu thật trước khi bật vào build.
- Hai nguồn sự thật (interface TS và validator) có thể lệch → validator dùng các danh sách hằng chung (`CATEGORIES`) thay vì bản sao.
