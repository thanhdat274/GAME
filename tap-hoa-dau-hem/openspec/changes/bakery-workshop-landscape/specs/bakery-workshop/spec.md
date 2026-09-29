## ADDED Requirements

### Requirement: Sản xuất tại tiệm bánh
Chi nhánh bakery SHALL vừa giữ chức năng bán lẻ hiện có vừa cho phép sản xuất và bán các món bánh được cấu hình cho loại cửa hàng này.

#### Scenario: Mở xưởng bánh
- **WHEN** người chơi mở bakery và đáp ứng điều kiện mở workshop/thiết bị
- **THEN** có thể bố trí thiết bị và truy cập luồng sản xuất trong cùng chi nhánh bakery

#### Scenario: Giữ bán lẻ bakery
- **WHEN** bakery bật workshop hoặc không bật workshop
- **THEN** nhóm snack/frozen và thiết bị bán lẻ hiện có vẫn hoạt động theo quy tắc trước đó

### Requirement: Nguyên liệu và thiết bị theo cửa hàng
Nguyên liệu chuyên bakery SHALL chỉ được dùng/mua theo quyền của bakery; công thức SHALL không thể làm nếu thiếu nguyên liệu hoặc trạm yêu cầu.

#### Scenario: Thiếu thiết bị
- **WHEN** người chơi chọn công thức mà bakery chưa đặt trạm yêu cầu
- **THEN** giao diện nêu tên thiết bị còn thiếu và không trừ nguyên liệu

#### Scenario: Nguyên liệu bakery
- **WHEN** liệt kê hàng có thể nhập ở cửa hàng không được phép dùng nguyên liệu bakery
- **THEN** nguyên liệu đó không xuất hiện như hàng hợp lệ và không được tiêu thụ bởi công thức

### Requirement: Làm bánh thủ công
Người chơi SHALL có thể chọn công thức đã mở và dùng luồng Cook hiện có để làm bánh với nguyên liệu, chất lượng và đầu ra được xác định bởi dữ liệu công thức.

#### Scenario: Làm mẻ hợp lệ
- **WHEN** có đủ nguyên liệu, trạm và chỗ chứa thành phẩm
- **THEN** mini-game hoàn tất tạo đúng một lượng thành phẩm cấu hình, trừ nguyên liệu và áp dụng chất lượng

#### Scenario: Mẻ không hợp lệ
- **WHEN** thiếu nguyên liệu, trạm hoặc chỗ chứa
- **THEN** thao tác bị từ chối, nêu lý do và không làm mất nguyên liệu

### Requirement: Chất lượng, giá vốn và hạn dùng
Thành phẩm bakery SHALL dùng giá vốn tương ứng nguyên liệu tiêu hao, áp dụng chất lượng theo hệ thống recipe hiện hành và hết hạn theo dữ liệu sản phẩm.

#### Scenario: Bánh hết hạn
- **WHEN** thành phẩm vượt hạn dùng
- **THEN** hệ thống xử lý như mặt hàng dễ hỏng hiện có và phản ánh lượng hỏng trong báo cáo ngày

#### Scenario: Giá vốn hợp lệ
- **WHEN** chạy bộ xác thực recipe/nội dung
- **THEN** tham chiếu sản phẩm, station, nguyên liệu, shop type và giá vốn của công thức bakery đều hợp lệ

### Requirement: Nhân viên làm bánh
Nhân viên baker SHALL chỉ nhận các công thức được phân công cho bakery và SHALL tuân theo ca làm, nghỉ việc, năng lực và quy tắc lương hiện có.

#### Scenario: Thợ làm bánh đang ca
- **WHEN** bakery hoạt động, thợ đang trong ca, có công thức được bật, đủ nguyên liệu và có trạm
- **THEN** thợ tự làm thành phẩm với chất lượng và thời gian dựa trên chỉ số nhân viên

#### Scenario: Không đủ điều kiện sản xuất
- **WHEN** thiếu trạm, nguyên liệu, công thức đang bật hoặc thợ không có ca
- **THEN** không có thành phẩm mới và báo cáo không ghi nhận sản lượng giả

### Requirement: Sản xuất ở chi nhánh không hoạt động
Mô phỏng bakery khi người chơi vận hành chi nhánh khác SHALL sử dụng cùng dữ liệu công thức, tồn kho, nhân viên và năng lực thiết bị như mô phỏng trực tiếp, và SHALL không tạo hai lần doanh thu/thành phẩm cho cùng một ngày.

#### Scenario: Mô phỏng ngày bakery
- **WHEN** bakery được mô phỏng lúc đóng ngày trong khi người chơi ở chi nhánh khác
- **THEN** báo cáo ghi sản xuất, bán, giao đơn, hàng hỏng và lương đúng theo điều kiện bakery

#### Scenario: Tính tất định
- **WHEN** mô phỏng lại cùng trạng thái, ngày và seed
- **THEN** kết quả sản lượng và tài chính giống nhau
