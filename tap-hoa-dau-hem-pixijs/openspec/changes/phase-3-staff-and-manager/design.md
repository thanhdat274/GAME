## Context

Giai đoạn 1–2 giả định người chơi là người duy nhất thao tác: chạm kệ, thối tiền, nạp hàng. Kiến trúc core đã tách logic khỏi Phaser và mọi hành động đều qua API core (`pickItem`, `giveChange`, `refillSlot`...), nên có thể cho tác nhân AI gọi cùng API. Thách thức là giữ cảm giác "mình vẫn quan trọng" khi nhân viên làm thay, và tính thu nhập offline công bằng mà không phải chạy mô phỏng đầy đủ nhiều giờ.

## Goals / Non-Goals

**Goals:**
- Nhân viên làm việc bằng đúng luật như người chơi, có sai sót theo chỉ số.
- Chuyển mượt từ "tự bán" sang "quản lý": ở L10–L19 người chơi vẫn đứng quầy cùng nhân viên, tới L20 mới có chế độ quản lý toàn phần.
- Thu nhập offline hấp dẫn nhưng thấp hơn khi chơi trực tiếp.

**Non-Goals:**
- Nhiều chi nhánh (giai đoạn 4).
- Nhân viên pha chế / đầu bếp (giai đoạn 4).
- Đàm phán lương phức tạp, công đoàn.

## Decisions

### D1. Mô hình tác nhân (Agent) + hàng đợi việc
Có một `TaskQueue` toàn tiệm: `ServeCustomer(counterId)`, `Refill(slotId)`, `ReceiveDelivery(orderId)`, `Deliver(orderId)`, `Watch(thief)`. Mỗi nhân viên có vai trò quyết định loại việc nhận và độ ưu tiên. Người chơi cũng là một Agent đặc biệt: input chạm = tự nhận việc.
- Đã cân nhắc: behavior tree cho từng nhân viên → quá phức tạp cho nhu cầu; hàng đợi + ưu tiên là đủ và dễ test.

### D2. Chỉ số → hành vi
- Tốc độ (1–10): thời gian di chuyển và thao tác = gốc × (1.4 − 0.08·tốc độ).
- Chính xác (1–10): xác suất thối sai = 12% − 1.1%·chính xác (tối thiểu 1%); lấy nhầm hàng tương tự.
- Thân thiện (1–10): +0.1 sao và +5% tip mỗi điểm trên 5.
- Thể lực (1–10): giờ làm trước khi mệt = 3 + 0.5·thể lực; mệt thì tốc độ −30%.
- Nhân viên nhận EXP theo việc làm; mỗi cấp +1 điểm vào chỉ số chính của vai trò, lương +8%.

### D3. Tâm trạng
Tâm trạng 0–100, cập nhật mỗi ngày: +lương so với mức thị trường, +ngày nghỉ, +thưởng, −làm quá 6 ngày liền, −ca đôi, −bị mắng (khi người chơi sửa sai của họ). Dưới 30 thì năng suất −20%; dưới 10 trong 2 ngày liền thì xin nghỉ việc. Tính cách (`staff.json`) điều chỉnh hệ số: "chăm chỉ" ít bị trừ khi làm nhiều, "cọc tính" trừ nặng khi bị mắng, "hay quên" chính xác −2 nhưng tâm trạng dễ tăng.

### D4. Tuyển dụng
Bảng 3–4 ứng viên đổi mỗi 2 ngày game; chỉ số ngẫu nhiên theo seed; lương đề nghị tăng theo tổng chỉ số. Số chỗ nhân viên: L10 = 1, L12 = 2, L15 = 4, L20 = 6.

### D5. Ca làm
Hai ca (08–14, 14–20). Lịch 7 ngày dạng lưới nhân viên × ngày × ca. Nhân viên không có ca thì không tới. Ca đôi được phép nhưng trừ tâm trạng. Có nút "Xếp tự động" chia đều.

### D6. Đặt hàng tự động
Quy tắc `{productId, threshold, orderQty, supplierId}`. Buổi sáng (hoặc 15:00 với Anh Ba), hệ thống kiểm tra tồn (kho + kệ) và tạo đơn nếu đủ tiền; nếu không đủ tiền thì ưu tiên theo thứ tự quy tắc và báo "Thiếu tiền nhập X". Nhân viên kho tự bày theo "sơ đồ kệ" người chơi đã chốt (mỗi ô gắn một món).

### D7. Chế độ Quản lý (L20)
Người chơi bật "Để nhân viên lo" ở buổi sáng. Ngày chạy tự động với tốc độ x1/x2/x4 (tick nhân). Người chơi vẫn có thể: chạm vào sự cố (trộm, khách phàn nàn) để xử lý, đổi giá, điều nhân viên, và "xuống quầy" giúp (quay lại tự bán). Có tùy chọn "Bỏ qua ngày": chạy mô phỏng nhanh không render, hiện ngay tổng kết.

### D8. Thu nhập offline
Khi mở lại game, `elapsed = now − lastSeen` (giới hạn 8 giờ thật, và chỉ tính nếu đã mở khóa chế độ Quản lý). Không chạy mô phỏng từng tick mà dùng mô hình rút gọn: lấy trung bình 3 ngày quản lý gần nhất (lãi/ngày, món bán/ngày), nhân với số ngày game tương đương × 60% hiệu suất, và giới hạn bởi tồn kho hiện có (trừ hàng đã bán, cộng hàng từ quy tắc tự động nếu đủ tiền). Hàng tươi hết hạn được áp dụng theo số ngày trôi qua. Hiện màn "Trong lúc bạn vắng mặt..." với chi tiết.
- Chống gian lận đồng hồ: nếu `now < lastSeen` thì bỏ qua; lưu `lastSeen` mỗi lần lưu.

### D9. Trộm vặt
Từ L15, 3% khách là kẻ trộm: đi tới kệ, lấy món rồi đi thẳng ra cửa. Người chơi chạm vào họ trong 3 giây để bắt (được phạt tiền bồi thường); nhân viên có vai trò "Bảo vệ" hoặc camera an ninh (L17) tăng xác suất tự phát hiện lên 50% / 80%.

### D10. Giao hàng tận nhà
Từ L18, điện thoại bàn reo: đơn 3–8 món, phí ship, hạn giao 1–2 giờ game. Cần nhân viên giao hàng (hoặc người chơi tự "đóng cửa" đi giao, tốn thời gian). Giao trễ thì bị giảm sao.

### D11. Save v4
Thêm `staff[]`, `schedule`, `rules[]`, `analyticsHistory` (30 ngày), `lastSeen`, `managerStats`. Migrate v3 → v4 với các giá trị rỗng, giữ nguyên khu hàng, hàng sau quầy và dữ liệu lô hàng.

## Risks / Trade-offs

- [Nhân viên quá giỏi làm người chơi thừa thãi] → Giới hạn số chỗ theo level; nhân viên luôn có sai sót; người chơi phục vụ khách VIP cho tip cao hơn.
- [Nhân viên quá tệ gây ức chế] → Ứng viên đầu tiên (ví dụ "bé Lan") được thiết kế cố định, cân bằng tốt, lương rẻ.
- [Thu nhập offline phá kinh tế] → Hiệu suất 60%, giới hạn 8 giờ, bị giới hạn bởi tồn kho.
- [Nhiều tác nhân gây giật trên điện thoại yếu] → Tối đa 6 nhân viên + 6 khách; tìm đường cache; ở tốc độ x4 bỏ bớt animation.
- [Giao diện quản lý nhiều bảng khó dùng trên màn nhỏ] → Mỗi màn một việc, danh sách thẻ lớn, không dùng bảng nhiều cột.

## Migration Plan

Deploy kèm migrate v3 → v4, giữ bản v3 làm dự phòng. Người chơi đang ở L9 với EXP dư sẽ lên level ngay khi tải và được giới thiệu tuyển nhân viên.

## Open Questions

- Có vai trò "Bảo vệ" riêng hay gộp vào "Bổ sung kệ"? Mặc định: gộp, nhân viên bổ sung kệ có 30% phát hiện trộm.
- Thu nhập offline có cần thông báo đẩy (PWA push) không? Mặc định: không ở giai đoạn này.
