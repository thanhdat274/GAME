## Why

Tới level 9–10, tiệm đã lớn (3 mảnh đất, 5 khách chờ, hàng tươi, sổ nợ), nên một người vừa lấy hàng, thối tiền vừa nạp kệ sẽ quá tải. Đây đúng là lúc chuyển người chơi từ "người bán" sang "chủ tiệm": thuê nhân viên, xếp ca, đặt quy tắc tự động, rồi lên hẳn vai quản lý. Đây là bước quan trọng để giữ người chơi lâu dài theo kiểu game tycoon, và là nền cho thu nhập offline.

## What Changes

- Nâng giới hạn level lên 20, bảng mở khóa L10–L20.
- **Thuê nhân viên**: bảng ứng viên đổi mỗi 2 ngày, ứng viên có tên, tính cách và chỉ số; lương theo ngày; sa thải.
- **Vai trò**: Thu ngân, Bổ sung kệ, Kho, Giao hàng. Nhân viên chạy trên cùng API core như người chơi.
- **Chỉ số và trạng thái**: Tốc độ, Chính xác, Thân thiện, Thể lực; tâm trạng; mệt; lên cấp nhân viên; nghỉ việc nếu bất mãn.
- **Xếp ca**: ca sáng (08–14h) và ca chiều (14–20h), ngày nghỉ.
- **Đất D - mini-mart**: mở rộng lớn, xe đẩy hàng (khách mua nhiều món hơn), thêm quầy thu ngân thứ 2.
- **Đặt hàng tự động**: quy tắc "còn dưới X thì nhập Y từ mối Z".
- **An ninh**: khách trộm vặt, mini-game bắt quả tang, camera an ninh.
- **Giao hàng tận nhà**: đơn qua điện thoại bàn, giao trong thời hạn.
- **Bảng phân tích**: doanh thu 7 ngày, món bán chạy/ế, giờ đông khách, hiệu suất nhân viên.
- **Chế độ Quản lý**: tiệm tự chạy cả ngày, người chơi xem và can thiệp; tăng tốc x2/x4.
- **Thu nhập offline**: rời game vẫn có tiền theo mô phỏng rút gọn, tối đa 8 giờ.
- **BREAKING (dữ liệu lưu)**: bản lưu v4, có migrate v3 → v4.

## Capabilities

### New Capabilities
- `staff-hiring`: Bảng ứng viên, thuê, sa thải, lương.
- `staff-simulation`: Vai trò, chỉ số, AI làm việc, tâm trạng, mệt, lên cấp, nghỉ việc.
- `shift-scheduling`: Ca làm và ngày nghỉ.
- `auto-restock`: Quy tắc đặt hàng và bày kệ tự động.
- `shop-security`: Trộm vặt, bắt quả tang, camera.
- `home-delivery`: Đơn giao hàng qua điện thoại.
- `business-analytics`: Biểu đồ và báo cáo kinh doanh.
- `manager-mode`: Tiệm tự vận hành, tăng tốc, can thiệp.
- `offline-income`: Tính tiền khi người chơi vắng mặt.

### Modified Capabilities
- `progression`: Giới hạn level 20 và bảng mở khóa L10–L20.
- `land-expansion`: Thêm Đất D (mini-mart) và quầy thu ngân thứ 2.
- `day-cycle`: Tổng kết có lương nhân viên; tốc độ ngày trong chế độ quản lý.
- `save-system`: Bản lưu v4 và migrate v3 → v4.

## Impact

- Core: tách "tác nhân" (Agent) dùng chung cho người chơi và nhân viên; mô-đun `staff.ts`, `schedule.ts`, `autorestock.ts`, `security.ts`, `delivery.ts`, `analytics.ts`, `offline.ts`.
- Scene: màn Tuyển dụng, Nhân sự, Xếp ca, Quy tắc tự động, Phân tích; HUD chế độ quản lý.
- Dữ liệu: `staff.json` (tên, tính cách, dải chỉ số), `delivery.json`; mở rộng `levels.json`, `land.json`.
- Asset: 6–8 sprite nhân viên, đồng phục, xe máy giao hàng, camera, điện thoại bàn.
- Hiệu năng: nhiều tác nhân hơn, cần giới hạn số nhân viên (tối đa 6).
