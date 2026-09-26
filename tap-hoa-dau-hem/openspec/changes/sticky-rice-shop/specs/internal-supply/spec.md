## ADDED Requirements

### Requirement: Mối hàng nội bộ
Màn Nhập hàng SHALL liệt kê thêm các tiệm khác trong chuỗi làm mối, nếu tiệm đó có thể cung cấp mặt hàng cần. Tạp hóa thấy "Tiệm xôi nhà mình", bán các loại xôi gói. Tiệm xôi thấy "Tạp hóa nhà mình", bán nguyên liệu xôi đang có trong kho tạp hóa.

#### Scenario: Tạp hóa thấy mối tiệm xôi
- **WHEN** chuỗi có tiệm xôi và người chơi mở Nhập hàng ở tạp hóa
- **THEN** có mối "Tiệm xôi nhà mình" với các loại xôi gói và năng lực làm mỗi ngày

#### Scenario: Chưa có tiệm xôi
- **WHEN** chuỗi chưa có tiệm xôi
- **THEN** mối nội bộ không hiện

### Requirement: Giá và phí đơn nội bộ
Hàng nội bộ SHALL tính theo giá vốn nguyên liệu, không cộng lãi, vì tiền dùng chung toàn chuỗi. Mỗi chuyến giao trả phí xe theo công thức chuyển hàng hiện có. Tổng kết MUST ghi doanh thu bán lẻ cuối cùng cho tiệm bán ra, và ghi giá vốn chuyển giao là chi phí của tiệm nhận.

#### Scenario: Đặt 20 xôi gói
- **WHEN** tạp hóa đặt 20 xôi gói mặn
- **THEN** chi phí đơn bằng 20 × giá vốn nguyên liệu xôi mặn cộng phí xe, không có khoản lãi nội bộ

### Requirement: Đơn một lần và đơn định kỳ
Người chơi SHALL đặt đơn nội bộ một lần, hoặc bật đơn định kỳ lặp lại mỗi ngày với số lượng cố định cho tới khi tắt. Đơn có trạng thái: `pending` (chờ làm), `ready` (đã làm), `in_transit` (đang chở), `delivered` (đã giao), `short` (giao thiếu), `cancelled` (đã hủy).

#### Scenario: Đơn định kỳ
- **WHEN** người chơi bật đơn định kỳ 15 xôi gói đậu xanh mỗi ngày
- **THEN** mỗi sáng tiệm xôi nhận một đơn mới 15 phần và tạp hóa nhận hàng lúc 7h nếu làm kịp

#### Scenario: Hủy đơn chưa làm
- **WHEN** người chơi hủy một đơn đang `pending`
- **THEN** đơn chuyển sang `cancelled` và không mất tiền

### Requirement: Giao hàng và giao thiếu
Xôi gói SHALL tới tạp hóa trong buổi sáng cùng ngày (mặc định 7h game) nếu được làm trước giờ chở. Nguyên liệu từ tạp hóa tới tiệm xôi vào sáng hôm sau bằng xe chuyển hàng, giữ nguyên hạn dùng (FEFO). Khi tiệm cung cấp không đủ hàng, game MUST giao phần đang có, đánh dấu `short` và ghi chú ở màn Buổi sáng của tiệm nhận.

#### Scenario: Tiệm xôi thiếu nếp
- **WHEN** đơn 20 xôi gói nhưng tiệm xôi chỉ làm được 12
- **THEN** tạp hóa nhận 12, đơn ở trạng thái `short`, và buổi sáng hiện "Tiệm xôi giao thiếu 8 phần: thiếu nếp"

### Requirement: Ưu tiên đơn nội bộ
Khi người chơi đang đứng ở tiệm xôi, bảng "Đơn nội bộ" SHALL hiện các đơn chờ làm cùng giờ chở. Món làm ra được xếp vào đơn khi người chơi chọn "Giao cho đơn". Thợ nấu xôi MUST làm đơn nội bộ trước rồi mới làm hàng bán lẻ, trừ khi người chơi tắt ưu tiên.

#### Scenario: Người chơi tự làm đơn
- **WHEN** người chơi làm xong 1 xôi mặn gói và chọn "Giao cho đơn"
- **THEN** đơn nội bộ tăng 1 phần và món không lên quầy bán lẻ

### Requirement: Mô phỏng sản xuất khi vắng chủ
Tiệm có kiểu mô phỏng `production` SHALL chạy mô phỏng sản xuất cho mỗi ngày game người chơi không đứng ở đó. Mô phỏng: ngâm và hấp theo nguyên liệu trong kho; làm món trong giới hạn năng lực của thợ; lấp đơn nội bộ trước; bán lẻ phần còn lại theo hồ sơ khách và hiệu suất tiệm; trừ đúng nguyên liệu và lương. Mô phỏng MUST tất định với cùng seed.

#### Scenario: Tiệm xôi chạy khi người chơi ở tạp hóa
- **WHEN** một ngày game kết thúc, người chơi ở tạp hóa, tiệm xôi có 1 thợ và đủ nguyên liệu cho 60 phần
- **THEN** kho tiệm xôi bị trừ đúng lượng nguyên liệu, đơn nội bộ được lấp trước, và tổng kết tiệm xôi hiện số phần làm, bán, giao

#### Scenario: Không có thợ
- **WHEN** tiệm xôi vắng chủ và không có Thợ nấu xôi
- **THEN** tiệm xôi không sản xuất, không bán, đơn nội bộ giao 0, và bản đồ hiện cảnh báo
