## Context

`CityScene` dùng hai camera: camera chính vẽ thế giới, camera UI vẽ giao diện. Tòa nhà là texture canvas với cửa sổ vàng đã vẽ sẵn. `state.clock` là phút trong ngày; ở pha buổi sáng luôn bằng giờ mở cửa nên riêng nó không tạo ra sự thay đổi nhìn thấy được.

## Goals / Non-Goals

**Goals:** màu chuyển mượt theo giờ, ban đêm có ánh sáng ấm, đọc được trên mọi giờ, chi phí render thấp.
**Non-Goals:** đổi màu ở màn Bán hàng trong tiệm, thời tiết, bóng đổ động, đồng hồ game thật chạy ngoài phố.

## Decisions

- **Màu theo khung khóa nội suy tuyến tính** (phút, màu nhân, độ tối) trong `timeOfDay.ts`, vòng quanh 24 giờ. Logic thuần, test được; màn hình chỉ áp dụng kết quả.
- **Lớp phủ nhân màu (MULTIPLY)** một hình chữ nhật phủ cả bản đồ, đặt trên tòa nhà và nhân vật, dưới nhãn. Rẻ hơn nhuộm từng đối tượng và không đụng texture. Màu nền camera được nhân cùng màu để vùng ngoài bản đồ khớp.
- **Ánh sáng ADD** vẽ trên lớp phủ: quầng sáng ở ô có thuộc tính `light`, ô cửa sổ và cửa ra vào của tiệm đã mở. Cửa sổ lấy từ cùng hàm với lúc vẽ tòa nhà (`buildingWindows`) để hai bên không lệch.
- **Đồng hồ hiển thị chạy nhanh, tách khỏi đồng hồ game.** Bắt đầu từ `state.clock`, 4 phút game mỗi giây thật, bấm để dừng. Không ghi ngược vào state.
- **Mật độ người đi đường theo giờ**: dân phố ẩn dần về đêm (còn ~15%), bình minh/hoàng hôn ~60%. Người ẩn không tính toán di chuyển.
- **Ô đèn theo thuộc tính tileset `light`** (dữ liệu), không mã cứng gid.

## Risks / Trade-offs

- Đêm quá tối làm khó đọc → màu nhân đêm giữ đủ sáng (xanh chàm, không đen), nhãn ở camera UI không bị tối.
- Cửa sổ vẽ sẵn màu vàng bị nhân tối vào ban đêm → cộng thêm ánh sáng ADD để nó vẫn "bật đèn".
- Chu kỳ chạy nhanh có thể gây chói/nhấp nháy → nội suy liên tục, không có bước nhảy màu.
