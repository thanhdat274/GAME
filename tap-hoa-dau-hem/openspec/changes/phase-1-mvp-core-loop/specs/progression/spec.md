## ADDED Requirements

### Requirement: EXP và level
Người chơi SHALL nhận EXP (+1 mỗi món bán, +3 mỗi khách hài lòng) và lên level theo bảng mốc trong `levels.json` (mặc định L2 = 120, L3 = 350, L4 = 700 EXP tích lũy). Giai đoạn 1 giới hạn ở level 4.

#### Scenario: Lên level
- **WHEN** tổng EXP vượt mốc level tiếp theo
- **THEN** hiện hiệu ứng "Lên cấp!" kèm danh sách thứ mới mở khóa ở màn tổng kết

#### Scenario: Đạt giới hạn
- **WHEN** người chơi ở level 4 và đủ EXP cho level 5
- **THEN** EXP vẫn cộng dồn và hiện "Sắp ra mắt: Mở rộng tiệm"

### Requirement: Bảng mở khóa
Nội dung mở khóa SHALL được định nghĩa trong `levels.json`: L1 đồ khô + 2 kệ; L2 ăn vặt; L3 kệ thứ 3; L4 đồ dùng.

#### Scenario: Xem trước phần thưởng
- **WHEN** người chơi chạm vào thanh EXP trên HUD
- **THEN** hiện level tiếp theo và phần mở khóa của nó

### Requirement: Sao đánh giá tiệm
Tiệm SHALL có điểm sao 1–5 là trung bình của 20 khách gần nhất, hiển thị trên HUD và ảnh hưởng tốc độ sinh khách (±20%).

#### Scenario: Sao cao
- **WHEN** sao tiệm ≥ 4.5
- **THEN** tốc độ sinh khách tăng 20% so với mặc định
