## ADDED Requirements

### Requirement: Sự kiện theo mùa dữ liệu hóa
Sự kiện theo mùa SHALL được định nghĩa trong `events.json` (thời gian theo lịch game, hiệu ứng, hàng đặc biệt, trang trí, nhiệm vụ, hội thoại) và tự bắt đầu/kết thúc theo lịch.

#### Scenario: Thêm sự kiện mới
- **WHEN** nhà phát triển thêm sự kiện "Valentine" hợp lệ vào `events.json`
- **THEN** sự kiện chạy đúng thời gian mà không cần sửa code

### Requirement: Các sự kiện mặc định
Game SHALL có các sự kiện: Tết (tháng 1, ngày 1–7: bánh kẹo, hạt dưa, bao lì xì, nước ngọt thùng; khách ×3), Hè (tháng 5–7: kem, nước đá), Trung thu (tháng 8: bánh trung thu, lồng đèn), Khai giảng (tháng 9: tập vở, bút, nước tăng lực), Mùa bóng đá (ngẫu nhiên 1 lần/năm, 10 ngày: snack, nước ngọt, khách tối đông).

#### Scenario: Tết bắt đầu
- **WHEN** ngày 1 tháng 1 bắt đầu
- **THEN** tiệm tự khoác trang trí Tết, mối sỉ có hàng Tết, khách tăng gấp 3 và có nhiệm vụ sự kiện

#### Scenario: Hàng sự kiện sau khi hết sự kiện
- **WHEN** sự kiện Trung thu kết thúc mà còn bánh trung thu
- **THEN** bánh trung thu chỉ bán được ở 30% nhu cầu và có gợi ý bán xả

### Requirement: Phần thưởng sự kiện
Mỗi sự kiện SHALL có đường tiến độ riêng (điểm sự kiện từ nhiệm vụ và doanh thu hàng sự kiện) mở khóa đồ trang trí độc quyền.

#### Scenario: Đủ điểm Tết
- **WHEN** người chơi đạt mốc cuối của đường tiến độ Tết
- **THEN** nhận "Cây mai vàng" trang trí vĩnh viễn
