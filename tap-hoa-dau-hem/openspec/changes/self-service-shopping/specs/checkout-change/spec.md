## ADDED Requirements

### Requirement: Quét hàng tại quầy
Khi khách được phục vụ, quầy SHALL hiện giỏ hàng của khách (biểu tượng và số lượng từng món khách đã lấy); người chơi SHALL chạm từng món để quét mỗi lần 1 đơn vị, hoặc bấm "Quét hết" để quét toàn bộ giỏ. Chỉ món đã quét được tính tiền; khi quét hết giỏ hệ thống chuyển sang bước khách trả tiền.

#### Scenario: Quét từng món
- **WHEN** giỏ khách có 2 gói mì và 1 chai nước mắm, người chơi chạm mì hai lần rồi chạm nước mắm
- **THEN** tổng tiền hiện đủ 3 món và khách chuyển sang trả tiền

#### Scenario: Quét hết
- **WHEN** người chơi bấm "Quét hết" cho giỏ 4 món
- **THEN** tất cả món được quét ngay và tính tiền, không có tip combo

#### Scenario: Combo quét nhanh
- **WHEN** người chơi quét hết giỏ bằng tay trong thời gian ngắn (mặc định 3 giây) không dùng "Quét hết"
- **THEN** tip của khách được cộng thêm phần thưởng combo (giá trị trong `balance.json`) nếu thối tiền cũng thành công

#### Scenario: Tự quét
- **WHEN** cài đặt "Tự quét" bật (mặc định tắt)
- **THEN** giỏ khách tự quét khi tới lượt và không có tip combo

## MODIFIED Requirements

### Requirement: Khách trả tiền
Khi giỏ đã được quét xong, khách SHALL trả bằng tờ tiền Việt Nam nhỏ nhất đủ trả (hoặc tổ hợp 2 tờ) theo mệnh giá 1k, 2k, 5k, 10k, 20k, 50k, 100k, 200k, 500k.

#### Scenario: Đơn 13.000đ
- **WHEN** tổng đơn là 13.000đ
- **THEN** khách đưa 20.000đ (hoặc 50.000đ với xác suất nhỏ) và màn hình hiện "Khách đưa 20.000đ · Đơn 13.000đ"

### Requirement: Tự động thối tiền
Game SHALL có cài đặt "Tự thối tiền", mặc định bật ngay từ level 1: khi khách trả tiền, hệ thống tự thối đúng số tiền mà người chơi không phải chọn tờ, đổi lại không có tip. Người chơi SHALL bật/tắt được ở màn tiêu đề và menu tạm dừng; khi tắt thì dùng mini-game thối tiền và vẫn có nút "Tự tính" cho từng khách.

#### Scenario: Chế độ tự động (mặc định)
- **WHEN** giỏ của khách đã quét xong và khách đưa 20.000đ cho đơn 15.000đ
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
