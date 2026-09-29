## ADDED Requirements

### Requirement: Cường độ mưa tất định
Hệ thống SHALL tính cường độ mưa trong [0, 1] từ ngày game, giờ, mùa và sự kiện `heavy_rain`; cùng đầu vào luôn cho cùng kết quả.

#### Scenario: Sự kiện mưa lớn
- **WHEN** sự kiện `heavy_rain` đang diễn ra
- **THEN** buổi chiều (khoảng 14:00–19:00) cường độ bằng 1, buổi sáng sớm bằng 0 nếu không có mưa rào

#### Scenario: Liên tục
- **WHEN** so sánh hai phút liền kề bất kỳ
- **THEN** cường độ không nhảy quá một ngưỡng nhỏ

#### Scenario: Xác suất theo mùa
- **WHEN** xét nhiều ngày ở từng mùa
- **THEN** tỉ lệ ngày có mưa rào gần xác suất của mùa đó (hè nhiều hơn đông)

### Requirement: Mưa trên bản đồ phố
Khi cường độ mưa lớn hơn ngưỡng, bản đồ phố SHALL hiện hạt mưa, tối và xám hơn, bật đèn sớm hơn; ngoài mưa thì không hiện hạt mưa.

#### Scenario: Có mưa
- **WHEN** cường độ mưa là 1
- **THEN** hạt mưa hiển thị và đèn đường sáng dù đang ban ngày

#### Scenario: Trời quang
- **WHEN** cường độ mưa bằng 0
- **THEN** hạt mưa bị ẩn

### Requirement: Dân phố phản ứng với mưa
Trong mưa, dân phố SHALL thưa hơn, đi nhanh hơn và ghé tiệm nhiều hơn.

#### Scenario: Mưa lớn
- **WHEN** cường độ mưa là 1
- **THEN** số người hiển thị nhỏ hơn ban ngày quang và tốc độ đi bộ cao hơn

### Requirement: Không ảnh hưởng gameplay
Thời tiết trên phố SHALL không thay đổi trạng thái game hay dữ liệu lưu.

#### Scenario: Trạng thái không đổi
- **WHEN** ở màn bản đồ phố trong ngày mưa
- **THEN** `GameState` giống hệt trước khi vào màn
