## MODIFIED Requirements

### Requirement: EXP và level
Người chơi SHALL nhận EXP (+1 mỗi món bán, +3 mỗi khách hài lòng, cộng thưởng nhiệm vụ) và lên level theo bảng mốc trong `levels.json` (mặc định L2 = 120, L3 = 350, L4 = 700, L5 = 1.150, L6 = 1.700, L7 = 2.350, L8 = 3.100, L9 = 4.000 EXP tích lũy). Giai đoạn 2 giới hạn ở level 9.

#### Scenario: Lên level
- **WHEN** tổng EXP vượt mốc level tiếp theo
- **THEN** hiện hiệu ứng "Lên cấp!" kèm danh sách thứ mới mở khóa ở màn tổng kết

#### Scenario: Đạt giới hạn
- **WHEN** người chơi ở level 9 và đủ EXP cho level 10
- **THEN** EXP vẫn cộng dồn và hiện "Sắp ra mắt: Thuê nhân viên"

### Requirement: Bảng mở khóa
Nội dung mở khóa SHALL được định nghĩa trong `levels.json`: L1 đồ khô + 2 kệ; L2 ăn vặt; L3 kệ thứ 3; L4 đồ dùng; L5 Đất A + tủ lạnh + đồ uống + nhiệm vụ hằng ngày; L6 chỉnh giá + Đại lý Anh Ba; L7 đồ tươi + khách ghi sổ; L8 Đất B + nâng cấp kho + trang trí; L9 Đất C sân sau + tủ đông + đồ đông lạnh + khách mặc cả.

#### Scenario: Xem trước phần thưởng
- **WHEN** người chơi chạm vào thanh EXP trên HUD
- **THEN** hiện level tiếp theo và phần mở khóa của nó

#### Scenario: Hướng dẫn tính năng mới
- **WHEN** một hệ thống mới được mở khóa lần đầu
- **THEN** buổi sáng hôm sau có một hướng dẫn ngắn có mũi tên chỉ vào tính năng đó, chỉ hiện một lần
