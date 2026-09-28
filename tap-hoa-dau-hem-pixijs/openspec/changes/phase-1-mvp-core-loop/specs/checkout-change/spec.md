## ADDED Requirements

### Requirement: Khách trả tiền
Khi tính tiền, khách SHALL trả bằng tờ tiền Việt Nam nhỏ nhất đủ trả (hoặc tổ hợp 2 tờ) theo mệnh giá 1k, 2k, 5k, 10k, 20k, 50k, 100k, 200k, 500k.

#### Scenario: Đơn 13.000đ
- **WHEN** tổng đơn là 13.000đ
- **THEN** khách đưa 20.000đ (hoặc 50.000đ với xác suất nhỏ) và màn hình hiện "Khách đưa 20.000đ · Đơn 13.000đ"

### Requirement: Mini-game thối tiền
Người chơi SHALL chọn các tờ tiền từ ngăn kéo vào khay rồi bấm "Đưa"; có nút hoàn tác tờ cuối.

#### Scenario: Thối đúng và nhanh
- **WHEN** người chơi thối đúng 7.000đ trong dưới 4 giây và không hoàn tác
- **THEN** giao dịch thành công và khách tip 1.000–3.000đ

#### Scenario: Thối thiếu
- **WHEN** số tiền thối nhỏ hơn số cần thối
- **THEN** khách phàn nàn, người chơi phải thối lại và mức hài lòng giảm 1 sao

#### Scenario: Thối thừa
- **WHEN** số tiền thối lớn hơn số cần thối
- **THEN** giao dịch hoàn tất nhưng người chơi mất phần thừa và hiện "Thối dư X đ"

### Requirement: Tự động thối tiền
Game SHALL có cài đặt "Tự thối tiền", mặc định bật ngay từ level 1: khi khách trả tiền, hệ thống tự thối đúng số tiền mà người chơi không phải chọn tờ, đổi lại không có tip. Người chơi SHALL bật/tắt được ở màn tiêu đề và menu tạm dừng; khi tắt thì dùng mini-game thối tiền và vẫn có nút "Tự tính" cho từng khách.

#### Scenario: Chế độ tự động (mặc định)
- **WHEN** người chơi mới lấy đủ hàng cho khách và khách đưa 20.000đ cho đơn 15.000đ
- **THEN** game tự thối 5.000đ, hiện "🧮 Thối 5.000đ", giao dịch hoàn tất với tip = 0

#### Scenario: Tắt tự động để kiếm tip
- **WHEN** người chơi tắt "Tự thối tiền" trong menu tạm dừng
- **THEN** các khách sau hiện ngăn kéo tiền để người chơi tự thối và có thể nhận tip

#### Scenario: Dùng nút Tự tính khi đang thối tay
- **WHEN** chế độ tự động đang tắt và người chơi level 1 bấm "Tự tính"
- **THEN** giao dịch hoàn tất đúng số tiền và tip = 0

#### Scenario: Bản lưu cũ
- **WHEN** tải bản lưu chưa có cài đặt này
- **THEN** "Tự thối tiền" được coi là bật
