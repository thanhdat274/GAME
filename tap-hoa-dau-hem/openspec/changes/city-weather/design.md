## Context

`heavy_rain` là sự kiện ngẫu nhiên 1 ngày (giảm khách 0.6, tăng nhu cầu áo mưa/mì gói), ShopScene đã vẽ mưa nhỏ ở khung bên. Lịch có 4 mùa. Bản đồ phố có lớp phủ nhân màu theo giờ và dân phố với vị trí/tốc độ điều khiển được.

## Goals / Non-Goals

**Goals:** mưa tất định theo ngày, khớp sự kiện, chuyển mưa mượt, nhìn thấy và cảm nhận được (tối, đèn, dân phố).
**Non-Goals:** ảnh hưởng tới doanh thu, sấm chớp, vũng nước động, thời tiết ở màn Bán hàng ngoài sự kiện đã có.

## Decisions

- **Cường độ mưa = max(mưa sự kiện, mưa rào)**. Mưa sự kiện: cửa sổ 12:00–20:00, cường độ 1, chân dốc 60 phút. Mưa rào: xác suất theo mùa (xuân 0.25, hè 0.35, thu 0.2, đông 0.1); cửa sổ bắt đầu và độ dài, cường độ 0.25–0.6 lấy từ băm của số ngày, chân dốc 30 phút.
- **Tất định bằng băm số ngày**, không dùng `Math.random`, để cùng ngày cùng thời tiết và test được.
- **Mưa vẽ ở camera UI** (không phóng theo zoom bản đồ): hai `tileSprite` cuộn chéo, alpha theo cường độ, ẩn hẳn khi không mưa để không tốn khung hình.
- **Trời xám**: nhân thêm màu xám xanh vào màu môi trường (theo cường độ); độ tối tối thiểu tăng để đèn đường bật sớm.
- **Dân phố**: mật độ × (1 − 0.5×mưa), tốc độ × (1 + 0.25×mưa), xác suất đi mua + 0.25×mưa.
- **Khớp sự kiện bằng dữ liệu**: đọc `state.activeEvents` (`heavy_rain`) và mùa từ `calendarDate`, không thêm trạng thái mới vào save.

## Risks / Trade-offs

- Hạt mưa che chữ và nút → alpha vừa phải, không nhận chạm, vẽ dưới lớp UI chính (depth thấp hơn bảng thông tin).
- Mưa suốt nhiều giờ có thể gây chán mắt → mưa rào ngắn (2–4 giờ game), sự kiện chỉ 1 ngày.
