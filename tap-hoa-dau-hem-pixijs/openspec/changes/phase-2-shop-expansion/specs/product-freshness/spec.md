## ADDED Requirements

### Requirement: Hạn dùng theo lô
Mỗi lô hàng tươi SHALL có ngày hết hạn = ngày nhập + `shelfLifeDays` của mặt hàng (trứng 3, bánh mì 1, rau 2, sữa tươi 3); hàng khô không có hạn.

#### Scenario: Nhập bánh mì
- **WHEN** người chơi nhập 10 bánh mì vào ngày 12
- **THEN** lô bánh mì có hạn tới hết ngày 13

### Requirement: Xuất hàng theo hạn
Khi bày kệ hoặc nạp lại kệ, hệ thống SHALL lấy lô có hạn sớm nhất trước (FEFO).

#### Scenario: Hai lô trứng
- **WHEN** kho có lô trứng hạn ngày 14 và lô hạn ngày 16
- **THEN** nạp kệ lấy lô hạn ngày 14 trước

### Requirement: Hàng hết hạn
Cuối ngày, lô đã quá hạn SHALL bị chuyển thành hàng hỏng, rời khỏi kho và kệ, và tổn thất được ghi vào tổng kết. Ô kệ chứa hàng sắp hết hạn MUST hiện nhãn vàng.

#### Scenario: Qua đêm
- **WHEN** ngày 13 kết thúc và còn 3 bánh mì hạn ngày 13
- **THEN** 3 bánh mì bị loại, tổng kết ghi "Hàng hỏng: 3 bánh mì (-9.000đ)"

### Requirement: Bán xả
Người chơi SHALL có thể bật "Bán xả" cho ô kệ chứa hàng hết hạn trong ngày, giảm giá 30% hoặc 50%.

#### Scenario: Bán xả 50%
- **WHEN** người chơi bật bán xả 50% cho ô bánh mì hết hạn hôm nay
- **THEN** giá bán ô đó giảm một nửa và khách lấy món đó với xác suất gấp đôi
