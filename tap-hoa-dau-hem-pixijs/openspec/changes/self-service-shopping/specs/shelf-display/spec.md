## MODIFIED Requirements

### Requirement: Kệ và ô kệ
Tiệm SHALL có 2 kệ, mỗi kệ 6 ô; mỗi ô chứa một loại hàng, tối đa 10 đơn vị. Kệ thứ 3 mở ở level 3. Mỗi kệ SHALL là một khu hàng gắn với một nhóm hàng (đồ khô, ăn vặt, đồ dùng) hoặc chưa có khu.

#### Scenario: Bày hàng
- **WHEN** người chơi kéo gói mì từ khay kho vào một ô trống của kệ đồ khô hoặc kệ chưa có khu
- **THEN** ô đó được gán cho mì gói và nạp tối đa 10 gói từ kho

#### Scenario: Ô đã có loại khác
- **WHEN** người chơi thả loại hàng khác (cùng nhóm với khu) vào ô đang chứa hàng
- **THEN** hàng cũ trả về kho và ô được gán loại mới

### Requirement: Khu hàng theo nhóm
Mỗi kệ SHALL có tối đa một khu, chỉ nhận mặt hàng đúng nhóm; kệ chưa có khu nhận món đầu tiên rồi tự gắn khu theo nhóm món đó, và trở về chưa có khu khi hết món trên kệ. Đặt món sai nhóm MUST bị từ chối và hiện thông báo "Sai khu".

#### Scenario: Đặt đúng khu
- **WHEN** người chơi đặt kẹo (ăn vặt) vào kệ đang là khu ăn vặt
- **THEN** ô nhận kẹo bình thường

#### Scenario: Đặt sai khu
- **WHEN** người chơi đặt dầu ăn (đồ khô) vào kệ đang là khu ăn vặt
- **THEN** thao tác bị từ chối, kệ rung nhẹ và hiện "Sai khu"

#### Scenario: Kệ trống nhận khu mới
- **WHEN** kệ chưa có khu và người chơi đặt món đồ dùng đầu tiên
- **THEN** kệ trở thành khu đồ dùng

#### Scenario: Hai kệ cùng nhóm
- **WHEN** hai kệ cùng là khu đồ khô
- **THEN** khách lấy hàng đồ khô từ ô có món cần trên bất kỳ kệ nào trong hai kệ đó

### Requirement: Tự bày
Nút "Tự bày" SHALL nạp đầy các ô đang có hàng, dọn ô đã hết cả trên kệ lẫn trong kho, bảo đảm mỗi món còn trong kho có ít nhất một ô trong khu đúng nhóm (nếu hết ô trống thì lấy lại ô của món đang chiếm nhiều ô nhất trong khu đó, trả hàng về kho), rồi chia ô trống còn lại cho món bán chạy; các kệ chưa có khu được gán khu theo nhóm còn món chưa có ô.

#### Scenario: Khu đã kín mà có món mới
- **WHEN** khu đồ khô đang kín bằng mì gói và muối, kho có đường và dầu ăn, người chơi bấm "Tự bày"
- **THEN** đường và dầu ăn mỗi món có một ô trong khu đồ khô, hàng trong ô bị thay trả về kho

#### Scenario: Món chưa có khu
- **WHEN** kho có kẹo, kệ 2 chưa có khu, người chơi bấm "Tự bày"
- **THEN** kệ 2 trở thành khu ăn vặt và kẹo được bày lên đó

### Requirement: Nạp lại kệ trong lúc bán
Người chơi SHALL có thể chạm vào ô kệ đang vơi để nạp thêm từ kho trong pha bán hàng, mất 1 giây thao tác, và bấm "Nạp cả khu" để nạp lần lượt mọi ô đang vơi của một khu (mặc định 0.5 giây mỗi ô).

#### Scenario: Kho còn hàng
- **WHEN** ô mì gói còn 1 và kho còn 12
- **THEN** sau khi chạm, ô có 10 và kho còn 3

#### Scenario: Kho hết
- **WHEN** kho không còn loại hàng của ô
- **THEN** ô hiện biểu tượng "Hết hàng" màu đỏ

#### Scenario: Nạp cả khu
- **WHEN** khu đồ khô có 3 ô vơi, kho đủ hàng và người chơi bấm "Nạp cả khu"
- **THEN** 3 ô lần lượt được nạp đầy trong tổng thời gian khoảng 1.5 giây

### Requirement: Cảnh báo khu vơi
Mỗi khu SHALL hiện thanh mức đầy (tổng tồn / sức chứa của các ô đang có món); nhãn khu SHALL nhấp nháy vàng khi dưới 40% và đỏ khi dưới 15% (ngưỡng lấy từ `balance.json`), và hiện "Hết" cho ô đã hết hàng.

#### Scenario: Khu sắp hết
- **WHEN** mức đầy của khu ăn vặt xuống 30%
- **THEN** nhãn khu ăn vặt nhấp nháy vàng

#### Scenario: Khu gần trống
- **WHEN** mức đầy của khu xuống 10%
- **THEN** nhãn khu chuyển đỏ

## REMOVED Requirements

### Requirement: Kệ trống làm mất khách
**Reason**: Đã thay bằng "Hết hàng khi khách tìm" trong `customer-flow`, tính theo từng món khách không tìm thấy thay vì khi khách đứng trước quầy.
**Migration**: Nhu cầu bị bỏ lỡ vẫn ghi vào `today.missed` để gợi ý nhập hàng và hiện ở tổng kết.
