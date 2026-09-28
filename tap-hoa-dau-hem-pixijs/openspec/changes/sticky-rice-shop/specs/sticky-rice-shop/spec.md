## ADDED Requirements

### Requirement: Nguyên liệu xôi
Game SHALL thêm các nguyên liệu nếp, đậu xanh, hành phi, chà bông, lạp xưởng, dừa nạo và bao gói (lá chuối/hộp giấy) vào `products.json`. Các món này bán được ở tạp hóa và nhập được từ mối sỉ, mở từ L29. Trứng gà dùng mặt hàng có sẵn. Giá và hạn dùng lấy từ dữ liệu.

#### Scenario: Tạp hóa bán nếp
- **WHEN** người chơi đạt L29 và mở màn Nhập hàng ở tạp hóa
- **THEN** nếp và các nguyên liệu xôi xuất hiện trong danh sách nhập như hàng thường

### Requirement: Ngâm nếp
Tiệm xôi SHALL cho người chơi đặt mẻ ngâm vào thùng ngâm, dùng nếp trong kho. Mẻ ngâm MUST ngâm đủ thời gian tối thiểu (mặc định 6 giờ game, hoặc qua đêm) thì mới hấp được. Mẻ ngâm quá hạn tối đa (mặc định 24 giờ game) bị chua và hỏng.

#### Scenario: Ngâm từ tối hôm trước
- **WHEN** người chơi ngâm 5 kg nếp lúc cuối ngày
- **THEN** sáng hôm sau mẻ ngâm ở trạng thái "Sẵn sàng hấp"

#### Scenario: Chưa ngâm đủ
- **WHEN** người chơi thử hấp một mẻ mới ngâm 2 giờ game
- **THEN** game từ chối và hiện thời gian còn lại

#### Scenario: Ngâm quá lâu
- **WHEN** mẻ ngâm đã quá 24 giờ game mà chưa hấp
- **THEN** mẻ bị đánh dấu hỏng, bị loại khỏi thùng ngâm và ghi vào hàng hỏng của ngày

### Requirement: Hấp nếp theo mẻ
Người chơi SHALL hấp một mẻ ngâm trong xửng hấp để ra "nếp chín" (nguyên liệu trung gian, tính theo phần). Số phần mỗi mẻ lấy từ dữ liệu. Nếp chín MUST giữ nóng trong một số giờ game (mặc định 5 giờ), sau đó thành "nếp nguội": món làm từ nếp nguội bị trừ chất lượng. Cuối ngày nếp chín còn lại bị hỏng.

#### Scenario: Hấp mẻ buổi sáng
- **WHEN** người chơi hấp một mẻ 5 kg lúc 4h30
- **THEN** sau khi hấp xong, quầy có số phần nếp chín theo dữ liệu (mặc định 25 phần) kèm đồng hồ giữ nóng

#### Scenario: Nếp nguội
- **WHEN** nếp chín đã quá thời gian giữ nóng
- **THEN** món làm từ nếp này có chất lượng tối đa "Tạm được"

### Requirement: Món xôi và biến thể
Tiệm xôi SHALL có 4 công thức trong `recipes.json`: xôi đậu xanh, xôi mặn (chà bông, lạp xưởng, hành phi), xôi trứng, xôi dừa. Mỗi món dùng 1 phần nếp chín cộng topping. Biến thể "Thêm topping" tăng giá và tốn thêm nguyên liệu. Mỗi công thức có thêm đầu ra "xôi gói" (tốn thêm bao gói) để bán qua tạp hóa.

#### Scenario: Làm xôi mặn
- **WHEN** người chơi làm 1 xôi mặn có đủ nếp chín và topping
- **THEN** kho trừ 1 phần nếp chín cùng lượng chà bông, lạp xưởng, hành phi theo công thức, và quầy có thêm 1 xôi mặn

#### Scenario: Thiếu topping
- **WHEN** hết chà bông
- **THEN** món xôi mặn hiện "Thiếu nguyên liệu" trên menu và khách gọi món này sẽ đổi món hoặc bỏ đi

### Requirement: Mini-game tiệm xôi
Tiệm xôi SHALL có 3 mini-game cảm ứng. **Hấp**: giữ ngọn lửa trong vùng xanh cho tới khi thanh chín đầy, ra khỏi vùng thì chất lượng mẻ giảm. **Múc và rắc**: múc nếp rồi kéo thả topping đúng thứ tự công thức. **Gói**: vuốt để gói lá hoặc gấp hộp. Kết quả mini-game quyết định chất lượng Ngon/Tạm được như các món phase 4.

#### Scenario: Hấp hoàn hảo
- **WHEN** người chơi giữ lửa trong vùng xanh suốt mini-game hấp
- **THEN** mẻ nếp chín có chất lượng "Ngon" và các món làm từ nó được cộng điểm đánh giá

#### Scenario: Rắc sai thứ tự
- **WHEN** người chơi thả hành phi trước chà bông khi làm xôi mặn
- **THEN** món vẫn được làm nhưng chất lượng là "Tạm được"

### Requirement: Khách tiệm xôi
Tiệm xôi SHALL sinh khách theo đường cong mật độ riêng, cao điểm 5h–10h và vắng buổi chiều. Có các loại khách người đi làm, học sinh và công nhân. Khách xếp hàng ở quầy, gọi 1–3 món (có thể kèm biến thể), rồi mang đi hoặc ngồi ăn tại bàn (xem yêu cầu "Ăn tại chỗ ở tiệm xôi"). Khách đợi quá lâu thì bỏ đi và trừ đánh giá.

#### Scenario: Cao điểm buổi sáng
- **WHEN** đồng hồ game ở 6h30 tại tiệm xôi
- **THEN** mật độ khách cao hơn đáng kể so với 14h

### Requirement: Thợ nấu xôi
Game SHALL có vai trò nhân viên Thợ nấu xôi. Thợ tự ngâm, hấp và làm món theo chỉ số tốc độ và độ chính xác, dùng cùng cơ chế với Đầu bếp. Thợ đầu tiên được miễn lương 3 ngày thử việc.

#### Scenario: Thợ tự ngâm cho hôm sau
- **WHEN** cuối ngày tiệm xôi có thợ và còn nếp trong kho
- **THEN** thợ tự đặt mẻ ngâm đủ cho lượng bán dự kiến hôm sau, trong giới hạn nếp đang có

### Requirement: Ăn tại chỗ ở tiệm xôi
Tiệm xôi SHALL cho đặt bàn ghế ăn tại chỗ (dùng lại bàn 2 chỗ và 4 chỗ của phase 4). Layout mặc định có sẵn 1 bàn 2 chỗ. Mỗi khách chọn ngồi ăn hoặc mang đi theo tỉ lệ trong dữ liệu (mặc định 40% ngồi, chỉ khi còn bàn sạch). Khách ngồi ăn MUST có thể gọi thêm đồ uống kèm (trà đá, sữa đậu nành) theo xác suất trong dữ liệu. Ăn xong, bàn thành bàn bẩn và phải dọn mới xếp khách mới được. Hết bàn thì khách muốn ngồi sẽ đổi sang mang đi hoặc bỏ đi.

#### Scenario: Khách ngồi ăn gọi thêm trà đá
- **WHEN** một khách ngồi ăn xôi mặn tại bàn
- **THEN** khách có thể gọi thêm 1 trà đá, và khi ăn xong bàn chuyển sang trạng thái bẩn

#### Scenario: Hết bàn sạch
- **WHEN** mọi bàn đang có khách hoặc bẩn và một khách muốn ngồi ăn
- **THEN** khách đổi sang mang đi, hoặc bỏ đi nếu đã đợi quá lâu

#### Scenario: Mô phỏng vắng chủ có bàn
- **WHEN** tiệm xôi vắng chủ có 2 bàn
- **THEN** mô phỏng sản xuất cộng doanh thu đồ uống kèm theo số chỗ ngồi và tỉ lệ ngồi ăn, không sinh từng khách

### Requirement: Xôi chỉ làm ở tiệm xôi
Món xôi SHALL chỉ nấu được ở tiệm loại `xoi`. Góc đồ ăn của tạp hóa MUST không có công thức xôi. Tạp hóa chỉ có xôi (xôi gói) khi đặt qua đơn nội bộ từ tiệm xôi.

#### Scenario: Tạp hóa không thấy món xôi trong bếp
- **WHEN** người chơi mở Bếp & quầy nước ở tạp hóa sau khi đã mở tiệm xôi
- **THEN** menu không có món xôi nào, và có gợi ý "Đặt xôi gói từ Tiệm xôi nhà mình"

### Requirement: Quầy trưng bày xôi riêng
Tiệm xôi SHALL có quầy trưng bày xôi riêng trong layout mặc định. Món làm ra nằm ở quầy của chính tiệm xôi để khách gọi; khi chuyển xôi gói cho tạp hóa, hàng tới ô sau quầy riêng của tạp hóa. Hai tiệm MUST NOT dùng chung kho hoặc quầy.

#### Scenario: Món vừa làm ở tiệm xôi
- **WHEN** người chơi chế biến một phần xôi tại tiệm xôi
- **THEN** phần đó xuất hiện ở quầy xôi của tiệm xôi và không thay đổi tồn kho/quầy của tạp hóa

#### Scenario: Tiệm xôi mở mặc định
- **WHEN** người chơi mở tiệm xôi
- **THEN** layout riêng có thùng ngâm, xửng hấp, quầy trưng bày xôi và bàn ăn; không cần kệ tạp hóa để bán món xôi
