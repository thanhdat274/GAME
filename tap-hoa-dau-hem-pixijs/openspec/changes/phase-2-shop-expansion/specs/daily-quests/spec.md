## ADDED Requirements

### Requirement: Nhiệm vụ hằng ngày
Từ level 5, mỗi ngày game SHALL có 3 nhiệm vụ rút ngẫu nhiên từ `quests.json` phù hợp level, mỗi nhiệm vụ có thanh tiến độ và phần thưởng (tiền + EXP).

#### Scenario: Hoàn thành nhiệm vụ
- **WHEN** người chơi bán đủ 20 chai nước trong ngày có nhiệm vụ "Bán 20 chai nước"
- **THEN** nhiệm vụ hiện "Xong!", người chơi bấm "Nhận" để nhận thưởng

#### Scenario: Sang ngày mới
- **WHEN** ngày kết thúc với nhiệm vụ chưa xong
- **THEN** nhiệm vụ đó hết hạn và 3 nhiệm vụ mới được rút cho ngày sau

### Requirement: Đổi nhiệm vụ
Người chơi SHALL được đổi 1 nhiệm vụ miễn phí mỗi ngày.

#### Scenario: Đổi nhiệm vụ
- **WHEN** người chơi bấm "Đổi" trên một nhiệm vụ chưa làm
- **THEN** nhiệm vụ đó được thay bằng nhiệm vụ khác và nút "Đổi" các nhiệm vụ còn lại bị khóa tới hôm sau

### Requirement: Thành tựu
Hệ thống SHALL theo dõi các thành tựu trọn đời (ví dụ bán 1.000 món, mở hết đất, 7 ngày liền đạt 5 sao, thu đủ 10 khoản nợ); mở khóa thành tựu thưởng tiền hoặc đồ trang trí độc quyền.

#### Scenario: Thành tựu con mèo
- **WHEN** người chơi đạt 7 ngày liền sao trung bình ≥ 4.8
- **THEN** mở khóa thành tựu "Tiệm được yêu thích" và nhận đồ trang trí "Mèo mướp nằm quầy"
