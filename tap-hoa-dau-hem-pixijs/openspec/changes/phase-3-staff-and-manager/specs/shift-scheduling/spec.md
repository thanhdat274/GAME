## ADDED Requirements

### Requirement: Lịch ca
Từ level 13, người chơi SHALL xếp lịch 7 ngày với 2 ca mỗi ngày (sáng 08–14, chiều 14–20) cho từng nhân viên; trước level 13 mọi nhân viên làm cả ngày.

#### Scenario: Nhân viên chỉ làm ca chiều
- **WHEN** anh Tuấn chỉ được xếp ca chiều ngày 30
- **THEN** anh Tuấn tới tiệm lúc 14:00 ngày 30 và chỉ tính nửa ngày lương

#### Scenario: Ngày nghỉ
- **WHEN** nhân viên không có ca nào trong ngày
- **THEN** nhân viên không tới, không tính lương và tâm trạng +10

### Requirement: Ca đôi
Nhân viên SHALL làm được cả hai ca trong một ngày (ca đôi) nhưng bị trừ tâm trạng.

#### Scenario: Xếp ca đôi
- **WHEN** người chơi xếp bé Lan cả ca sáng và chiều
- **THEN** ô lịch hiện cảnh báo vàng "Ca đôi: −tâm trạng"

### Requirement: Xếp tự động
Màn Xếp ca SHALL có nút "Xếp tự động" chia ca để mỗi ca có ít nhất 1 thu ngân và mỗi nhân viên nghỉ ít nhất 1 ngày/tuần nếu đủ người.

#### Scenario: Đủ người
- **WHEN** có 2 thu ngân và bấm "Xếp tự động"
- **THEN** mọi ca đều có thu ngân và mỗi người có ít nhất 1 ngày nghỉ

#### Scenario: Ca trống
- **WHEN** một ca không có thu ngân nào
- **THEN** ô ca đó tô đỏ "Không ai đứng quầy"
