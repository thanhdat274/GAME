## Context

Tới giai đoạn 3, game có một tiệm lớn tự vận hành, nhân viên, thu nhập offline. Toàn bộ trạng thái đang gắn với một tiệm duy nhất. Giai đoạn 4 thêm ba hướng khá độc lập: (1) nội dung theo thời gian (lịch, sự kiện), (2) mặt hàng chế biến (đồ ăn, nước), (3) nhiều cửa hàng. Cần làm theo thứ tự để có thể phát hành từng phần.

## Goals / Non-Goals

**Goals:**
- Sự kiện điều khiển hoàn toàn bằng dữ liệu, để thêm sự kiện mới không phải sửa code.
- Đồ ăn / nước uống đem lại cảm giác "làm tay" như Tiệm Mì Cay, bổ sung cho phần quản lý.
- Chi nhánh có bản sắc riêng, không chỉ là bản sao tiệm chính.
- Phát hành theo 3 đợt nhỏ: 4a Lịch + Sự kiện; 4b Đồ ăn + Nước + Bàn ghế; 4c Cốt truyện + Chi nhánh + Danh hiệu.

**Non-Goals:**
- Chơi mạng / nhiều người, giao dịch giữa người chơi.
- Máy chủ backend (bảng xếp hạng online để ngoài phạm vi, xem Open Questions).
- Thanh toán trong game.

## Decisions

### D1. Lịch game
10 ngày = 1 tháng, 12 tháng = 1 năm (120 ngày). Ngày 1 của bản lưu cũ khi migrate được gán vào tháng 3 năm 1 để Tết không tới ngay. Mùa quyết định hệ số nhu cầu theo nhóm hàng (hè: đồ uống lạnh ×1.8, kem ×2; đông: mì gói ×1.3).

### D2. Hệ thống sự kiện dữ liệu hóa
`events.json`: mỗi sự kiện có `trigger` (theo lịch: tháng/ngày; hoặc ngẫu nhiên: xác suất/ngày + điều kiện level), `duration`, `effects[]` (hệ số nhu cầu theo nhóm/món, hệ số sinh khách, giá sỉ, tắt thiết bị điện, khách đặc biệt), `items[]` (hàng chỉ bán trong sự kiện), `decor[]`, `quests[]`, `dialog`. Core có `EffectStack` gộp các hiệu ứng đang chạy (nhân hệ số). Mọi hệ thống cũ đọc hệ số từ `EffectStack` thay vì hằng số.
- Đã cân nhắc: viết code riêng từng sự kiện → khó mở rộng, bỏ.

### D3. Sự kiện ngẫu nhiên (mặc định)
- Mưa lớn: khách −40%, áo mưa / mì gói nhu cầu ×3.
- Cúp điện 2–4 giờ: tủ lạnh/tủ đông tắt, đồ đông lạnh hỏng nếu quá 3 giờ trừ khi có máy phát (mua được).
- Mối sỉ xả hàng: 1 món giảm 40% chỉ hôm nay.
- Kiểm tra vệ sinh: nếu có hàng hết hạn trên kệ thì phạt 100.000đ; sạch thì được giấy khen (+5 thu hút 7 ngày).
- Trend mạng xã hội: 1 món nhu cầu ×3 trong 2 ngày.
- Đám giỗ / đám cưới hàng xóm: đơn số lượng lớn, hạn 2 ngày.
Tối đa 1 sự kiện ngẫu nhiên mỗi ngày, báo trước lúc buổi sáng (trừ cúp điện) để người chơi chuẩn bị.

### D4. Mặt hàng chế biến và công thức
`recipes.json`: món thành phẩm = nguyên liệu (lấy từ kho, ví dụ bánh mì + xúc xích + dưa leo) + các bước. Mini-game nấu: chuỗi thao tác chạm/giữ theo thời gian (nướng xúc xích: giữ đến vùng xanh; mì ly: rót nước, chờ 3 giây). Mini-game pha chế: chọn nguyên liệu theo thứ tự + lắc/khuấy; sai công thức thì khách chê. Đầu bếp/Pha chế làm thay với tỉ lệ thành công theo chỉ số. Thành phẩm không lưu kho qua đêm (hỏng cuối ngày).

### D5. Bàn ghế
Bàn 2 chỗ (1×1) và 4 chỗ (2×1) đặt trên Đất E/F. Khách mua đồ ăn/nước có 50% ngồi lại 10–20 giây game, sau đó bàn bẩn; bàn bẩn không ai ngồi đến khi được dọn (người chơi chạm hoặc nhân viên bổ sung kệ dọn). Khách ngồi có 30% gọi thêm 1 món.

### D6. Chi nhánh
Trạng thái: `stores[]`, mỗi tiệm có lưới, nội thất, kệ, nhân viên, lịch, quy tắc riêng; tiền, level, danh hiệu là chung. Chi nhánh luôn ở chế độ quản lý (mô phỏng rút gọn giống thu nhập offline nhưng chạy mỗi ngày game), người chơi có thể "ghé" để chơi trực tiếp tại đó. Mỗi khu có hồ sơ nhu cầu:
- Chợ (L30): đồ tươi ×2, khách mặc cả nhiều, sáng rất đông.
- Cổng trường (L33): ăn vặt + nước ×2, đông 11h và 17h, nghỉ Chủ nhật và mùa hè vắng.
- Khu công nghiệp (L35): mì ly, nước tăng lực, cơm hộp; đông 6–7h và 18–20h.
Quản lý chi nhánh (vai trò mới) tăng hiệu suất mô phỏng từ 60% lên 75–90% theo chỉ số. Chuyển hàng giữa chi nhánh bằng "xe tải nhỏ", về vào sáng hôm sau.

### D7. Cốt truyện
`story.json` là chuỗi chương với điều kiện mở (level, ngày, sự kiện), hội thoại, và mục tiêu. Chương "Siêu thị đối diện" (L24): đối thủ mở cửa, giảm 15% khách trong 10 ngày; mục tiêu: giữ sao ≥ 4.5 và có 20 khách quen để giành lại khách. Hoàn thành chương mở khóa trang trí và danh hiệu.

### D8. Danh hiệu sau L35
EXP tiếp tục tích lũy; mỗi mốc cố định được một sao danh hiệu (+1% doanh thu toàn chuỗi, tối đa +30%) và vật phẩm trang trí xoay vòng. Không có reset tiến trình.

### D9. Hiệu năng
Chỉ render tiệm đang xem. Chi nhánh khác mô phỏng rút gọn cuối ngày. Sự kiện trang trí dùng atlas riêng, tải lười khi sự kiện bắt đầu.

## Risks / Trade-offs

- [Mini-game nấu và pha chế làm người chơi quá tải khi còn phải bán tạp hóa] → Góc đồ ăn có Đầu bếp ngay từ khi mở (L21 được thuê miễn phí 3 ngày đầu); người chơi chọn tự làm để lấy tip cao.
- [Sự kiện tiêu cực gây khó chịu] → Luôn báo trước, luôn có cách chuẩn bị (máy phát, dọn hàng hết hạn); mỗi sự kiện xấu đi kèm cơ hội bán hàng.
- [Bản lưu v4 thay đổi lớn cấu trúc] → Migrate v3 → v4 bọc tiệm hiện tại thành `stores[0]`; test kỹ bằng fixture của người chơi thật.
- [Nội dung sự kiện hết nhanh] → Dữ liệu hóa hoàn toàn để thêm sự kiện mới theo mùa thật mỗi tháng.

## Migration Plan

Phát hành theo 3 đợt (4a, 4b, 4c). Migrate v3 → v4 chạy ở đợt 4a (dù chi nhánh chưa mở) để ổn định cấu trúc sớm. Giữ bản v3 làm dự phòng.

## Open Questions

- Có làm bảng xếp hạng online (cần backend như Supabase/Firebase) không? Mặc định: chưa, cân nhắc sau giai đoạn 4.
- Sự kiện Tết có đồng bộ với Tết thật (theo ngày thật) không? Mặc định: theo lịch game, cộng thêm gói trang trí đặc biệt khi ngày thật trùng Tết.
