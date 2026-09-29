## ADDED Requirements

### Requirement: Tùy chọn chế độ tự tay
Game SHALL có hai tùy chọn độc lập `settings.carryStock` (cầm hàng trên tay) và `settings.orderAtPhone` (đặt hàng tại điện thoại), mặc định tắt. Hai tùy chọn MUST chỉ có hiệu lực ở góc nhìn trên xuống và ngoài phiên chơi chung; ở góc nhìn ngang, nhân viên, chơi hộ và phiên chơi chung, cách nạp kệ và nhập hàng giữ nguyên.

#### Scenario: Mặc định tắt
- **WHEN** người chơi chưa bật "Chế độ tự tay" và đang ở góc nhìn trên xuống
- **THEN** nạp kệ và mở màn Nhập hàng hoạt động như trước change

#### Scenario: Góc nhìn ngang
- **WHEN** `carryStock` đang bật và góc nhìn hiệu lực là ngang
- **THEN** chạm ô kệ nạp thẳng từ kho như cũ và giá trị `carryStock` vẫn được giữ

### Requirement: Lấy hàng tại điểm lấy hàng
Khi `carryStock` bật, người chơi SHALL lấy hàng tại kệ kho gần nhất, hoặc tại quầy nếu tiệm chưa có kệ kho. Người chơi MUST cầm không quá `balance.topDown.carry.carryStacks` loại món, mỗi loại không quá `carryUnitsPerStack` món và không quá số còn trong kho trừ phần đang cầm. Lấy hàng MUST NOT thay đổi `state.warehouse`.

#### Scenario: Lấy một thùng
- **WHEN** kho có 50 gói mì, người chơi đứng ở kệ kho và bấm "+1 thùng" ở dòng mì
- **THEN** người chơi cầm 20 gói mì và kho vẫn ghi 50 gói

#### Scenario: Đầy tay
- **WHEN** người chơi đã cầm 2 loại món và muốn lấy loại thứ ba
- **THEN** game từ chối và nhắc bày bớt hoặc cất lại

#### Scenario: Tiệm chưa có kệ kho
- **WHEN** mặt bằng không có kệ kho và người chơi cần lấy hàng
- **THEN** điểm lấy hàng là quầy

### Requirement: Bày hàng từ tay
Khi `carryStock` bật, người chơi SHALL chỉ nạp hoặc bày ô kệ bằng món đang cầm. Mỗi ô vẫn mất `refillSeconds`. Khi xong, hàng MUST rời kho theo thứ tự hạn dùng hiện có, với số lượng bằng số nhỏ nhất trong chỗ trống của ô, số đang cầm và số còn trong kho; số đang cầm giảm đúng số món đã bày. "Nạp cả khu" của người chơi SHALL ẩn.

#### Scenario: Nạp ô cùng món
- **WHEN** người chơi cầm 20 gói mì và nạp ô mì đang còn 5/20
- **THEN** ô thành 20/20, kho giảm 15 gói, người chơi còn cầm 5 gói

#### Scenario: Tay không
- **WHEN** người chơi không cầm gì và chạm một ô kệ cần nạp
- **THEN** game nhắc ra kho lấy hàng và có nút đi tới điểm lấy hàng gần nhất; kho và kệ không đổi

#### Scenario: Kho bị lấy bớt
- **WHEN** người chơi đang cầm 20 gói mì nhưng nhân viên đã nạp khiến kho chỉ còn 8 gói
- **THEN** khi bày, ô chỉ nhận tối đa 8 gói, số đang cầm giảm về số còn lại trong kho, và game báo kho vừa hết bớt

### Requirement: Không mất hàng khi bỏ tay cầm
Hàng đang cầm SHALL được lưu trong snapshot phiên và MUST được bỏ giữ chỗ (không mất hàng trong kho) khi hết ngày, khi góc nhìn hiệu lực đổi sang ngang, khi tắt `carryStock`, hoặc khi người chơi bấm "Cất lại".

#### Scenario: Xoay máy khi đang cầm hàng
- **WHEN** người chơi đang cầm 20 gói mì ở bản ngang và xoay máy sang dọc (góc nhìn hiệu lực thành ngang)
- **THEN** tay cầm trở về rỗng và kho vẫn đủ số mì như trước

#### Scenario: Tải lại giữa ngày
- **WHEN** game tải lại snapshot phiên trong lúc người chơi đang cầm hàng
- **THEN** người chơi vẫn cầm đúng các món và số lượng đó

### Requirement: Đặt hàng tại điện thoại
Khi `orderAtPhone` bật, trong giờ bán ở góc nhìn trên xuống, màn Nhập hàng SHALL chỉ mở khi nhân vật đứng ở quầy. Bấm lối vào Nhập hàng khi đang ở xa MUST cho nhân vật tự đi về quầy rồi mới mở màn; tiệm tiếp tục chạy trong lúc đi. Buổi sáng, góc nhìn ngang và phiên chơi chung MUST NOT bị ảnh hưởng.

#### Scenario: Đang ở kệ xa
- **WHEN** `orderAtPhone` bật, nhân vật đứng ở kệ cuối tiệm và người chơi bấm ô Nhập hàng
- **THEN** nhân vật đi về quầy, đồng hồ tiếp tục chạy, và màn Nhập hàng mở khi tới quầy

#### Scenario: Hủy giữa đường
- **WHEN** nhân vật đang tự đi về điện thoại và người chơi chạm một ô khác
- **THEN** nhân vật đổi hướng tới ô đó và màn Nhập hàng không mở

#### Scenario: Buổi sáng
- **WHEN** `orderAtPhone` bật và người chơi mở Nhập hàng ở buổi sáng
- **THEN** màn Nhập hàng mở ngay như trước change

### Requirement: Cân bằng được kiểm chứng
`compare:views` SHALL có chế độ bot cầm hàng. Thông số mặc định của `balance.topDown.carry` MUST cho lãi ở chế độ cầm hàng không thấp hơn 95% góc nhìn ngang và tỉ lệ khách bỏ về vì chờ không cao hơn quá 2 điểm phần trăm so với góc trên xuống hiện tại, trên tiệm nhỏ và tiệm lớn.

#### Scenario: Chạy so sánh
- **WHEN** chạy `npm run compare:views` với chế độ cầm hàng
- **THEN** báo cáo có lãi và tỉ lệ bỏ về của ba chế độ ngang, trên xuống và cầm hàng trên cùng seed
