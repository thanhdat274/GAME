## 1. Tái cấu trúc core cho tác nhân

- [x] 1.1 Tạo `TaskQueue` toàn tiệm (ServeCustomer, Refill, ReceiveDelivery, Deliver, Watch) và độ ưu tiên; test
- [x] 1.2 Tách người chơi thành Agent; chuyển input chạm thành "tự nhận việc" mà không đổi cảm giác chơi
- [x] 1.3 Hỗ trợ nhiều quầy thu ngân và xếp hàng vào quầy ít người nhất; test
- [x] 1.4 Save v4 + `migrate_3_to_4` + fixture; giữ nguyên khu/kho lô/hàng sau quầy, thêm trường nhân viên và `lastSeen`; test
- [x] 1.5 Nâng `levels.json` lên L20 với bảng mở khóa L10–L20

## 2. Nhân viên

- [x] 2.1 `staff.json`: tên, tính cách, dải chỉ số, ứng viên cố định "bé Lan"
- [x] 2.2 Core: sinh bảng ứng viên theo seed, làm mới 2 ngày, thuê/sa thải, giới hạn chỗ theo level; test
- [x] 2.3 Core: AI theo vai trò (Thu ngân, Bổ sung kệ, Kho, Giao hàng) dùng API core; test mô phỏng 1 ngày có 2 nhân viên
- [x] 2.4 Core: công thức chỉ số → tốc độ, sai sót, sao/tip, mệt; test thống kê tỉ lệ thối sai
- [x] 2.5 Core: tâm trạng cuối ngày, tính cách, xin nghỉ, tăng lương giữ lại, thưởng, nhắc nhở; test
- [x] 2.6 Core: EXP và lên cấp nhân viên
- [x] 2.7 Trả lương cuối ngày, nợ lương khi thiếu tiền
- [x] 2.8 Sprite nhân viên (6–8 người), biểu cảm (vui, mệt, bực), bong bóng thoại ngắn
- [x] 2.9 Màn Tuyển dụng và màn Nhân sự (thẻ nhân viên, chỉ số, tâm trạng, nút Thưởng / Nhắc nhở / Sa thải)

## 3. Xếp ca

- [x] 3.1 Core: lịch 7 ngày × 2 ca, nửa lương theo ca, ca đôi, ngày nghỉ; test
- [x] 3.2 Core: thuật toán "Xếp tự động"; test mọi ca có thu ngân khi đủ người
- [x] 3.3 UI lịch ca dạng thẻ theo ngày (phù hợp màn dọc), cảnh báo ca đôi / ca trống
- [x] 3.4 Nhân viên tới / về đúng giờ ca, bàn giao quầy khi đổi ca

## 4. Mở rộng mini-mart

- [x] 4.1 Đất D trong `land.json`, quầy thu ngân 2, kệ đôi, mặt tiền "Mini Mart"
- [x] 4.2 Xe đẩy: khách mua 3–6 món; cân bằng kiên nhẫn cho đơn lớn
- [ ] 4.3 Kiểm thử hiệu năng 6 nhân viên + 6 khách trên điện thoại tầm trung

## 5. Tự động hóa và an ninh

- [x] 5.1 Core: quy tắc đặt hàng tự động, thứ tự ưu tiên, báo thiếu tiền; test
- [x] 5.2 Core: sơ đồ kệ; nhân viên kho và bổ sung kệ nạp theo sơ đồ; test
- [x] 5.3 UI màn Quy tắc với gợi ý theo trung bình 7 ngày
- [x] 5.4 Core: kẻ trộm, bắt quả tang trong 3 giây, phát hiện bởi nhân viên / camera; test
- [x] 5.5 UI: hoạt ảnh trộm lén, chuông báo động, camera trên tường

## 6. Giao hàng tận nhà

- [x] 6.1 Core: sinh đơn điện thoại, giữ hàng, thời gian giao theo khoảng cách, đúng/trễ hạn; test
- [x] 6.2 UI: điện thoại bàn reo, thẻ đơn hàng, xe máy rời tiệm / quay về
- [x] 6.3 Tự giao khi không có nhân viên giao hàng (quầy bỏ trống)

## 7. Phân tích và tổng kết

- [x] 7.1 Core: lịch sử 30 ngày (doanh thu, lãi, chi phí, bán theo món/giờ, hiệu suất nhân viên); test cửa sổ trượt
- [x] 7.2 Màn Phân tích: biểu đồ 7 ngày, top bán chạy / ế, khách theo giờ, bảng nhân viên (thẻ dọc)
- [x] 7.3 Tổng kết: mục chi phí, lãi ròng, tab Nhật ký

## 8. Chế độ quản lý và offline

- [x] 8.1 Core: "Để nhân viên lo", cảnh báo ca không thu ngân, người chơi xuống quầy
- [x] 8.2 Tốc độ x1/x2/x4 và "Bỏ qua ngày" (chạy tick không render < 1 giây); test hiệu năng
- [x] 8.3 Hệ thống thông báo sự cố chạm được (trộm, phàn nàn, hết hàng chủ lực, xin nghỉ)
- [x] 8.4 Core: thu nhập offline theo mô hình rút gọn, giới hạn 8 giờ, 60%, giới hạn tồn kho, chống lùi đồng hồ; test nhiều tình huống
- [x] 8.5 Màn "Trong lúc bạn vắng mặt..."

## 9. Cân bằng và phát hành

- [x] 9.1 Mô phỏng 60 ngày: tốc độ lên L20 (mục tiêu 45–60 ngày game), lãi ròng khi có nhân viên phải cao hơn tự bán từ L12
- [x] 9.2 Kiểm tra nhân viên không làm người chơi thừa: ở L10–L19 người chơi tự bán vẫn tăng lãi rõ rệt
- [ ] 9.3 Kiểm thử trên điện thoại các màn quản lý (Nhân sự, Ca, Quy tắc, Phân tích)
- [ ] 9.4 Deploy, thu phản hồi, chỉnh `balance.json` trước giai đoạn 4
