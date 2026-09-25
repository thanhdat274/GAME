## ADDED Requirements

### Requirement: Chương truyện dữ liệu hóa
Cốt truyện SHALL được định nghĩa trong `story.json` là chuỗi chương có điều kiện mở, hội thoại, mục tiêu và phần thưởng; mỗi chương hiện trong màn "Hành trình".

#### Scenario: Mở chương
- **WHEN** người chơi đạt điều kiện của chương tiếp theo
- **THEN** buổi sáng hôm sau phát hội thoại mở chương và hiện mục tiêu trên HUD

### Requirement: Chương "Siêu thị đối diện"
Ở level 24, một siêu thị mini SHALL mở đối diện hẻm, giảm 15% lượng khách trong 10 ngày; mục tiêu là giữ sao trung bình ≥ 4.5 và có 20 khách quen.

#### Scenario: Thắng đối thủ
- **WHEN** người chơi đạt mục tiêu trong 10 ngày
- **THEN** đối thủ đóng cửa, lượng khách trở lại bình thường và nhận trang trí "Biển hiệu Tiệm lâu đời"

#### Scenario: Chưa đạt
- **WHEN** hết 10 ngày chưa đạt mục tiêu
- **THEN** hiệu ứng −15% khách kéo dài thêm 10 ngày và mục tiêu giữ nguyên

### Requirement: Các chương mặc định
Game SHALL có tối thiểu các chương: "Về quê giữ tiệm" (mở đầu), "Tiệm lớn dần" (mở Đất B), "Có thêm người phụ" (thuê nhân viên), "Siêu thị đối diện" (L24), "Bà về thăm tiệm" (L28), "Lên phố mở chuỗi" (L30).

#### Scenario: Bà về thăm
- **WHEN** chương "Bà về thăm tiệm" bắt đầu
- **THEN** bà xuất hiện trong tiệm 1 ngày, nhận xét theo sao và trang trí, và tặng quà theo mức hài lòng
