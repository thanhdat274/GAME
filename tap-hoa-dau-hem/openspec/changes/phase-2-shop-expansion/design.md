## Context

Giai đoạn 1 đã có vòng chơi ngày, kệ cố định và kho đếm theo số lượng. Giai đoạn 2 phải chuyển tiệm từ bố cục cố định sang bố cục do người chơi đặt, và chuyển kho sang mô hình lô hàng để hỗ trợ hạn dùng. Màn hình điện thoại nhỏ, nên tiệm lớn cần camera cuộn được mà vẫn thao tác bán hàng nhanh.

## Goals / Non-Goals

**Goals:**
- Tiệm lớn dần một cách trực quan: nhìn thấy đất bị khóa, muốn mở.
- Thêm chiều sâu kinh tế (hạn dùng, giá, mối sỉ, nợ) mà vẫn dễ hiểu cho người chơi phổ thông.
- Bản lưu v2 (sau self-service-shopping) chuyển sang v3 không mất tiến trình.

**Non-Goals:**
- Nhân viên, tự động hóa (giai đoạn 3).
- Sự kiện mùa, góc đồ ăn (giai đoạn 4).
- Kéo thả tự do theo pixel: chỉ đặt theo lưới.

## Decisions

### D1. Mặt bằng dạng lưới
Tiệm là lưới 6×8 ô (mỗi ô 48px logic). Mỗi "mảnh đất" là một nhóm ô định nghĩa trong `land.json` (id, các ô, giá, level yêu cầu). Nội thất (kệ 1×2, tủ lạnh 1×2, tủ đông 2×1, kệ kho 1×1, quầy 2×1, trang trí 1×1) có footprint; chỉ đặt được trên ô đã mở và không chồng nhau. Lối đi từ cửa đến quầy phải thông (kiểm tra bằng BFS) để khách đi được.
- Đã cân nhắc: tiệm nhiều "phòng" chuyển màn → bỏ vì mất cảm giác tiệm lớn dần.

Kế hoạch mở đất: ban đầu 12 ô. Đất A (L5, 150.000đ, +8 ô), Đất B (L8, 400.000đ, +8 ô), Đất C sân sau (L9, 600.000đ, +6 ô, chỉ đặt kho). Đất D (mini-mart) để dành cho giai đoạn 3; Đất E, F để dành cho giai đoạn 4 (góc đồ ăn, quầy nước).

### D2. Camera và đường đi khách
Khi lưới cao hơn màn hình, cho kéo một ngón để cuộn dọc; quầy thu ngân và khay tiền luôn ghim ở dưới cùng (UI layer). Có nút "Về quầy". Khách tự chọn hàng tìm đường tới khu có món cần rồi đến quầy; người chơi chạm ô kệ để nạp hàng, không lấy hàng thay khách.

### D3. Chế độ xây dựng
Chỉ vào được ở Buổi sáng. Nút "Sắp xếp" chuyển sang build mode: ô đất khóa hiện giá, nội thất kéo được, ô hợp lệ tô xanh, ô không hợp lệ tô đỏ. Thoát thì kiểm tra lối đi.

### D4. Mô hình lô hàng
`Stock = { productId, qty, expiresOnDay | null }[]`. Xuất kho theo FEFO (hết hạn trước ra trước). Kệ cũng giữ lô. Cuối ngày chạy `expireLots(day)` để chuyển lô hết hạn sang "hàng hỏng" và ghi vào tổng kết. Hàng khô có `expiresOnDay = null`.
- Đã cân nhắc: chỉ lưu tổng + "ngày hết hạn sớm nhất" → bỏ vì sai khi nhập nhiều đợt.

### D5. Lạnh
Món có `requiresCold: "fridge" | "freezer"` chỉ đặt được vào ô của thiết bị tương ứng. Tiền điện tính cuối ngày: tủ lạnh 5.000đ/ngày, tủ đông 8.000đ/ngày. Đồ uống không lạnh vẫn bán được nhưng khách mua ít hơn 50% (trừ nước suối).

### D6. Giá và phản ứng khách
Mỗi món có `refPrice` (giá gợi ý). Hệ số giá `r = price / refPrice` trong khoảng 0.8–1.5. Xác suất khách vẫn lấy món = `clamp(1 - k·(r-1), 0.1, 1)`, với k theo kiểu khách (học sinh k=1.5, văn phòng k=0.5). Giá < refPrice thì tăng nhẹ tốc độ sinh khách của tiệm (tối đa +10%).

### D7. Mối sỉ
- Cô Tư: giao ngay, giá chuẩn.
- Đại lý Anh Ba (L6): rẻ hơn 10%, đặt hôm nay thì chiều hôm sau (lúc 15:00 game) mới có hàng; tối thiểu 200.000đ/đơn.
- Giá mỗi ngày dao động ±15% theo RNG seed ngày. Mua ≥ 50 đơn vị một món được giảm 5%.

### D8. Sổ nợ
Khách ghi sổ lấy hàng không trả tiền; nợ ghi vào `ledger` kèm hạn trả 3 ngày. Mỗi ngày, khách có xác suất quay lại trả (80% đúng hạn, 15% trễ, 5% quỵt). Người chơi có thể từ chối cho nợ (khách không hài lòng) hoặc "nhắc nợ" khi khách tới (tăng xác suất trả, nhưng -1 sao nếu nhắc nhầm người chưa tới hạn). Hạn mức nợ tối đa: 20% tiền mặt.

### D9. Nhiệm vụ hằng ngày
3 nhiệm vụ mỗi ngày rút từ `quests.json` theo level (ví dụ bán 20 chai nước, không để hàng hết hạn, thu 2 khoản nợ). Thưởng tiền + EXP. Thành tựu là mốc trọn đời (bán 1.000 món, mở hết đất...) thưởng đồ trang trí độc quyền. Reset khi sang ngày mới trong game (không theo giờ thật, để người chơi không bị ép).

### D10. Thu hút và trang trí
`attraction = tổng điểm trang trí (giới hạn 100)`. Tốc độ sinh khách nhân `1 + attraction/400` (tối đa +25%). Con mèo là thành tựu đặc biệt: +5 điểm và thỉnh thoảng làm khách vui (+2 giây kiên nhẫn).

### D11. Save v3
`migrate_2_to_3`: chuyển `inventory[id] = qty` thành lô `expiresOnDay: null`; tạo lưới mặt bằng mặc định đặt 3 kệ theo vị trí cũ; giữ khu kệ, hàng sau quầy và cài đặt self-service; thêm các trường mới với giá trị mặc định.

## Risks / Trade-offs

- [Quá nhiều hệ thống mới cùng lúc khiến người chơi rối] → Mỗi level chỉ mở 1–2 hệ thống, kèm hướng dẫn ngắn 1 lần (tooltip mũi tên).
- [Cuộn camera xung đột với chạm nạp hàng] → Ngưỡng kéo 8px mới tính là cuộn; chạm nhanh vào ô kệ là nạp hàng.
- [Hàng hỏng gây cảm giác bị phạt] → Bán xả giảm 30–50% ở ngày cuối hạn, tổng kết nhắc "mẹo: nhập ít hàng tươi hơn".
- [Người chơi bố trí chặn lối đi] → BFS kiểm tra, không cho thoát build mode khi bị chặn.
- [Hiệu năng khi nhiều nội thất + khách] → Gộp nội thất tĩnh vào RenderTexture, chỉ khách và UI là động.

## Migration Plan

1. Deploy bản có migrate v2 → v3, giữ bản save v2 làm bản dự phòng 14 ngày.
2. Test migrate bằng bản lưu mẫu v2 trong thư mục test fixtures.
3. Rollback: bản cũ vẫn đọc được save v2; không hạ version dữ liệu đã migrate.

## Open Questions

- Có cho bán lại nội thất (hoàn 50%) không? Mặc định: có.
- Nhiệm vụ reset theo ngày game hay ngày thật? Mặc định: ngày game (thân thiện hơn); cân nhắc thêm "nhiệm vụ tuần" theo ngày thật ở giai đoạn 4.
