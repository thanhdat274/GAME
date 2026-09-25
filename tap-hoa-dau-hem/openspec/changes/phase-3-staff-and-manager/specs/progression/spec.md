## MODIFIED Requirements

### Requirement: EXP và level
Người chơi SHALL nhận EXP (+1 mỗi món bán, +3 mỗi khách hài lòng, cộng thưởng nhiệm vụ; trong chế độ quản lý nhận 50% EXP từ việc nhân viên làm) và lên level theo bảng mốc trong `levels.json` (mặc định L2 = 120, L3 = 350, L4 = 700, L5 = 1.150, L6 = 1.700, L7 = 2.350, L8 = 3.100, L9 = 4.000, sau đó mỗi level tăng 25% khoảng cách). Giai đoạn 3 giới hạn ở level 20.

#### Scenario: Lên level
- **WHEN** tổng EXP vượt mốc level tiếp theo
- **THEN** hiện hiệu ứng "Lên cấp!" kèm danh sách thứ mới mở khóa ở màn tổng kết

#### Scenario: Đạt giới hạn
- **WHEN** người chơi ở level 20 và đủ EXP cho level 21
- **THEN** EXP vẫn cộng dồn và hiện "Sắp ra mắt: Góc đồ ăn và quầy nước"

### Requirement: Bảng mở khóa
Nội dung mở khóa SHALL được định nghĩa trong `levels.json`: L1 đồ khô + 2 kệ; L2 ăn vặt; L3 kệ thứ 3; L4 đồ dùng; L5 Đất A + tủ lạnh + đồ uống + nhiệm vụ hằng ngày; L6 chỉnh giá + Đại lý Anh Ba; L7 đồ tươi + khách ghi sổ; L8 Đất B + nâng cấp kho + trang trí; L9 Đất C sân sau + tủ đông + đồ đông lạnh + khách mặc cả; L10 tuyển thu ngân (1 chỗ); L11 kho lớn; L12 nhân viên bổ sung kệ (2 chỗ); L13 xếp ca; L14 nhân viên kho; L15 Đất D mini-mart + quầy 2 + xe đẩy + trộm vặt (4 chỗ); L16 đặt hàng tự động; L17 camera an ninh; L18 giao hàng tận nhà; L19 Phân tích; L20 Chế độ quản lý + thu nhập offline (6 chỗ).

#### Scenario: Xem trước phần thưởng
- **WHEN** người chơi chạm vào thanh EXP trên HUD
- **THEN** hiện level tiếp theo và phần mở khóa của nó

#### Scenario: Hướng dẫn tính năng mới
- **WHEN** một hệ thống mới được mở khóa lần đầu
- **THEN** buổi sáng hôm sau có một hướng dẫn ngắn có mũi tên chỉ vào tính năng đó, chỉ hiện một lần
