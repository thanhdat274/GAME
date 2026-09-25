## ADDED Requirements

### Requirement: Vai trò và việc làm
Nhân viên SHALL tự nhận việc từ hàng đợi việc của tiệm theo vai trò: Thu ngân (phục vụ khách ở quầy được giao), Bổ sung kệ (nạp ô kệ vơi dưới 40%), Kho (nhận hàng giao, bày kệ theo sơ đồ), Giao hàng (giao đơn tận nhà). Nhân viên MUST dùng cùng luật core như người chơi.

#### Scenario: Thu ngân phục vụ
- **WHEN** có khách chờ ở quầy 2 và thu ngân đang rảnh
- **THEN** thu ngân lấy hàng, tính tiền và thối tiền cho khách đó

#### Scenario: Bổ sung kệ
- **WHEN** ô nước ngọt còn 1/5 và kho còn nước ngọt
- **THEN** nhân viên bổ sung kệ đi tới kho rồi tới ô đó và nạp đầy

### Requirement: Chỉ số ảnh hưởng hiệu suất
Tốc độ, Chính xác, Thân thiện, Thể lực (1–10) SHALL ảnh hưởng thời gian làm việc, tỉ lệ sai sót, sao/tip của khách và thời gian trước khi mệt theo công thức trong `balance.json`.

#### Scenario: Thu ngân kém chính xác
- **WHEN** thu ngân có Chính xác 2 phục vụ 100 khách trong mô phỏng
- **THEN** khoảng 9–11 lần thối sai được ghi nhận

#### Scenario: Mệt
- **WHEN** nhân viên làm liên tục quá số giờ theo Thể lực
- **THEN** hiện biểu tượng mồ hôi và tốc độ giảm 30% tới hết ca

### Requirement: Tâm trạng và nghỉ việc
Mỗi nhân viên SHALL có tâm trạng 0–100 cập nhật cuối ngày theo lương, ngày nghỉ, số ngày làm liên tục, ca đôi, bị nhắc nhở, tính cách; dưới 30 thì năng suất −20%, dưới 10 hai ngày liền thì xin nghỉ.

#### Scenario: Làm 7 ngày liền
- **WHEN** nhân viên làm 7 ngày không nghỉ
- **THEN** tâm trạng giảm và bong bóng "Mệt quá chủ ơi..." xuất hiện

#### Scenario: Xin nghỉ việc
- **WHEN** tâm trạng dưới 10 hai ngày liền
- **THEN** sáng hôm sau nhân viên báo nghỉ, người chơi có thể "Tăng lương giữ lại" (+15% lương, +30 tâm trạng) hoặc để đi

### Requirement: Thưởng và nhắc nhở
Người chơi SHALL có thể thưởng (tiền, +tâm trạng) hoặc nhắc nhở (−tâm trạng, +chính xác tạm thời 1 ngày) nhân viên.

#### Scenario: Thưởng cuối tuần
- **WHEN** người chơi thưởng 20.000đ cho bé Lan
- **THEN** tiền −20.000đ, tâm trạng bé Lan +15

### Requirement: Lên cấp nhân viên
Nhân viên SHALL nhận EXP theo việc làm; mỗi lần lên cấp được +1 điểm chỉ số chính của vai trò và lương tăng 8%.

#### Scenario: Thu ngân lên cấp 2
- **WHEN** bé Lan đủ EXP cấp 2
- **THEN** Chính xác +1, lương từ 25.000đ lên 27.000đ và có thông báo
