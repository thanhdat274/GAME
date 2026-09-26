## ADDED Requirements

### Requirement: Bản đồ thành phố
Từ level 30, game SHALL có màn Bản đồ thành phố hiện tiệm chính và các khu có thể mở chi nhánh: Chợ (L30), Cổng trường (L33), Khu công nghiệp (L35), mỗi khu có giá mở và hồ sơ nhu cầu.

#### Scenario: Xem khu Cổng trường
- **WHEN** người chơi chạm khu Cổng trường trên bản đồ
- **THEN** hiện "Ăn vặt, nước ×2 · Đông 11h và 17h · Vắng mùa hè" và giá mở

### Requirement: Mở và vận hành chi nhánh
Chi nhánh SHALL có mặt bằng, nội thất, kho, nhân viên, lịch ca, quy tắc riêng; tiền, level và danh hiệu dùng chung. Chi nhánh không được xem MUST mô phỏng rút gọn mỗi ngày game.

#### Scenario: Mở chi nhánh Chợ
- **WHEN** người chơi level 30 trả tiền mở chi nhánh Chợ
- **THEN** chi nhánh có mặt bằng nhỏ mặc định, người chơi được hướng dẫn đặt kệ và thuê người

#### Scenario: Cuối ngày có 2 tiệm
- **WHEN** ngày kết thúc khi người chơi đang ở tiệm chính
- **THEN** tổng kết có tab cho từng tiệm và tab tổng chuỗi

### Requirement: Ghé chi nhánh
Người chơi SHALL chọn một chi nhánh trên bản đồ để "ghé" vào sáng hôm sau và chơi trực tiếp tại đó; tiệm chính khi đó chạy mô phỏng rút gọn.

#### Scenario: Ghé chi nhánh trường
- **WHEN** người chơi chọn ghé Cổng trường
- **THEN** ngày hôm sau cảnh game là tiệm ở Cổng trường với khách học sinh chiếm đa số

### Requirement: Quản lý chi nhánh
Người chơi SHALL giao một nhân viên vai trò Quản lý chi nhánh; hiệu suất mô phỏng rút gọn của chi nhánh tăng từ 60% lên 75–90% theo chỉ số của quản lý.

#### Scenario: Không có quản lý
- **WHEN** chi nhánh không có quản lý
- **THEN** hiệu suất mô phỏng là 60% và bản đồ hiện cảnh báo

### Requirement: Chuyển hàng giữa chi nhánh
Người chơi SHALL chuyển hàng từ kho tiệm này sang tiệm khác bằng xe tải nhỏ (phí cố định), hàng tới vào sáng hôm sau.

#### Scenario: Chuyển rau cho chi nhánh Chợ
- **WHEN** người chơi chuyển 30 bó rau từ tiệm chính sang Chợ
- **THEN** kho tiệm chính −30 ngay, kho Chợ +30 vào sáng hôm sau, hạn dùng giữ nguyên
