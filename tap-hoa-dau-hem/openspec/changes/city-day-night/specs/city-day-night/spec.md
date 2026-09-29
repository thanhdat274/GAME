## ADDED Requirements

### Requirement: Màu môi trường theo giờ
Hệ thống SHALL tính màu môi trường liên tục theo phút trong ngày, vòng quanh 24 giờ, với đủ các giai đoạn bình minh, ban ngày, hoàng hôn và đêm.

#### Scenario: Liên tục và vòng quanh
- **WHEN** so sánh màu ở phút 0 và phút 1440, hoặc ở hai phút liền kề bất kỳ
- **THEN** màu giống nhau ở hai đầu vòng và không nhảy quá một ngưỡng nhỏ giữa hai phút liền kề

#### Scenario: Ban ngày sáng, ban đêm tối
- **WHEN** hỏi độ tối lúc 12:00 và lúc 0:00
- **THEN** ban ngày bằng 0 và ban đêm bằng 1

### Requirement: Ánh sáng ban đêm
Trên bản đồ phố, khi trời tối các ô có thuộc tính `light`, cửa sổ và cửa ra vào của tiệm đã mở SHALL phát sáng; ban ngày không phát sáng.

#### Scenario: Đèn đường
- **WHEN** giờ là 22:00
- **THEN** mọi ô đèn đường có quầng sáng hiển thị; lúc 12:00 thì không

### Requirement: Mật độ người đi đường theo giờ
Số dân phố hiển thị SHALL giảm về đêm và đầy đủ ban ngày.

#### Scenario: Đêm vắng
- **WHEN** giờ là 2:00
- **THEN** mật độ nhỏ hơn 0.25 và người bị ẩn không di chuyển

### Requirement: Đồng hồ trên phố
Màn bản đồ phố SHALL hiển thị giờ hiện tại, bắt đầu từ đồng hồ game và chạy tiếp; bấm vào đồng hồ dừng hoặc tiếp tục. Đồng hồ này không thay đổi trạng thái game.

#### Scenario: Dừng đồng hồ
- **WHEN** người chơi bấm đồng hồ
- **THEN** giờ và màu môi trường giữ nguyên cho đến khi bấm lại
