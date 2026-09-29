## Context

`cityShopping.ts` chọn tiệm theo trọng số và `CityScene` điều khiển dân phố (`Actor`) đi tới cửa, vào, ra. Chưa có khái niệm "định mua gì" hay tên người.

## Goals / Non-Goals

**Goals:** danh sách định mua khớp hàng thật của tiệm và sở thích, bảng thông tin đọc được, theo dõi bằng camera.
**Non-Goals:** mua thật (trừ kho, ghi doanh thu), khách phản ứng với giá, hội thoại.

## Decisions

- **Sinh danh sách ở lúc chọn tiệm**, từ `ShopTarget.items` (gộp từ ô kệ/quầy có hàng) chứ không gọi `generateOrder`, vì `generateOrder` gắn với tiệm đang đứng còn khách có thể đi tới tiệm khác trong chuỗi.
- **Trọng số món = sở thích nhóm hàng (+ε) × 1/√giá**, cùng tinh thần `generateOrder`; số dòng theo `orderLineWeights` giới hạn bởi `maxItems`; số lượng theo `qtyByPrice`, nhân `qtyMul` của loại tiệm, không vượt số đang có.
- **Không trừ kho**: danh sách chỉ để hiển thị; ghi rõ để tránh hiểu nhầm là giao dịch thật.
- **Thông tin người dân**: tên lấy từ `staff.names` theo chỉ số, loại khách từ `CustomerType.name`, sở thích là hai nhóm hàng cao nhất trong `prefs`.
- **Bảng thông tin cập nhật định kỳ** (mỗi ~0.35 giây) để trạng thái đi/vào/ra đổi theo thời gian thực mà không dựng lại cả bảng.
- **Bấm trúng người ưu tiên hơn bấm tòa nhà**; người đang ở trong tiệm (ẩn) không bấm được.

## Risks / Trade-offs

- Danh sách có thể gợi ý món mà tiệm sắp hết → chỉ lấy từ hàng còn tại thời điểm chọn, người dân thấy "vừa mua" là kết quả dự định, không phải hàng bị trừ.
- Ngón tay to khó bấm người nhỏ → vùng bấm rộng hơn sprite vài điểm ảnh.
