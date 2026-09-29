## Context

Tiệm bán ở quầy (`service: 'counter'`) đã hỗ trợ thực đơn công thức, biến thể, mini-game `Cook` và thành phẩm đặt vào quầy. Hệ thống level, danh hiệu và bản đồ phố đều dựa trên dữ liệu; danh hiệu gắn với `maxLevel`.

## Goals / Non-Goals

**Goals:** trà sữa là một loại tiệm thật (thực đơn, nguyên liệu riêng, pha ly có tính chơi), 15 level mới có nội dung, không phá tiệm cũ.
**Non-Goals:** pha theo từng đơn của khách trong lúc bán (khách gọi ly tùy biến), hình ảnh tay vẽ cho nội thất mới, nhân vật khách riêng cho trà sữa.

## Decisions

- **Trà sữa = tiệm bán ở quầy dùng lại hệ công thức.** Mỗi ly là một công thức (`recipes.json`), pha sẵn bằng mini-game rồi đặt vào quầy như các món khác. Tránh đụng vòng lặp bán hàng 2000+ dòng; đánh đổi là khách không đặt ly tùy biến từng ly, người chơi chọn biến thể lúc pha.
- **Nguyên liệu riêng bằng `shopOnly`** trên sản phẩm (danh sách id loại tiệm). `allowsProduct` và danh sách mở khóa tôn trọng cờ này, kể cả khi không có trạng thái (thì bỏ qua sản phẩm `shopOnly`).
- **Nội dung sinh bằng script** (`scripts/make-tea-content.ts`), idempotent: tính giá vốn thành phẩm = tổng giá nguyên liệu (validator yêu cầu), giá bán theo hệ số, `priceDelta` biến thể theo chi phí nguyên liệu thêm. Sửa dữ liệu bằng cách sửa bảng trong script rồi chạy lại.
- **Size L là biến thể** cộng thêm đá và nước đường; các biến thể là lựa chọn đơn (mô hình hiện có), không phối nhiều topping cùng lúc.
- **Mini-game `tea`**: nhận dạng công thức thuộc trạm `tea_bar`/`foam_machine`; thứ tự = ly → trà → siro → topping → sữa/foam → đá/đường, gồm cả nguyên liệu của biến thể đang chọn; ô hiển thị theo nhóm quầy, có huy hiệu tồn kho, chỉ hiện món đã mở khóa; chạm sai tính lỗi (chất lượng thấp hơn), không chặn.
- **Level 36–50 theo dữ liệu**: EXP tăng ~8.5%/bước, `features` mở tiệm/tính năng, `staffSlots` tăng dần. `prestige` chuyển sang level 50; `PrestigeScene` đọc `maxLevel` thay vì hằng số 35.
- **Tiệm bánh kẹo/siêu thị mini dùng cơ chế `mechanics` sẵn có** (bán sỉ, lượng khách), không thêm code riêng.
- **Sprite nội thất mới dùng lại sprite quầy nước** (bí danh) cho lát cắt đầu.

## Risks / Trade-offs

- Đổi `maxLevel` làm số sao danh hiệu của bản lưu cũ giảm → ghi rõ trong tài liệu, dữ liệu phát triển.
- Khối lượng dữ liệu lớn dễ sai giá vốn/tham chiếu → script + `validateContent` + test chạy trên toàn bộ dữ liệu.
- Mini-game nhiều ô trên màn hình dọc nhỏ → chỉ hiện món đã mở khóa, lưới 5 cột, kiểm tra ở khung 375×812.
