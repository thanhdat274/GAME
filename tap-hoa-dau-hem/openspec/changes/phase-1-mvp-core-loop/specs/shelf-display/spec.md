## ADDED Requirements

### Requirement: Kệ và ô kệ
Tiệm SHALL có 2 kệ, mỗi kệ 6 ô; mỗi ô chứa một loại hàng, tối đa 5 đơn vị. Kệ thứ 3 mở ở level 3.

#### Scenario: Bày hàng
- **WHEN** người chơi kéo gói mì từ khay kho vào một ô trống
- **THEN** ô đó được gán cho mì gói và nạp tối đa 5 gói từ kho

#### Scenario: Ô đã có loại khác
- **WHEN** người chơi thả loại hàng khác vào ô đang chứa hàng
- **THEN** hàng cũ trả về kho và ô được gán loại mới

### Requirement: Tự bày
Nút "Tự bày" SHALL nạp đầy các ô đang có hàng, dọn ô đã hết cả trên kệ lẫn trong kho, bảo đảm mỗi món còn trong kho có ít nhất một ô (nếu hết ô trống thì lấy lại ô của món đang chiếm nhiều ô nhất, trả hàng về kho), rồi chia ô trống còn lại cho món bán chạy.

#### Scenario: Kệ đã kín mà có món mới
- **WHEN** 18 ô đều đang bày mì gói và muối, kho có pin và xà phòng, người chơi bấm "Tự bày"
- **THEN** pin và xà phòng mỗi món có một ô, hàng trong ô bị thay trả về kho

### Requirement: Nạp lại kệ trong lúc bán
Người chơi SHALL có thể chạm vào ô kệ đang vơi để nạp thêm từ kho trong pha bán hàng, mất 1 giây thao tác.

#### Scenario: Kho còn hàng
- **WHEN** ô mì gói còn 1 và kho còn 8
- **THEN** sau khi chạm, ô có 5 và kho còn 4

#### Scenario: Kho hết
- **WHEN** kho không còn loại hàng của ô
- **THEN** ô hiện biểu tượng "Hết hàng" màu đỏ

### Requirement: Kệ trống làm mất khách
Khi khách yêu cầu món không có trên kệ, món đó SHALL được tính là "hết hàng" cho khách đó.

#### Scenario: Mọi món đều hết
- **WHEN** tất cả món khách cần đều không có trên kệ
- **THEN** khách bỏ về với biểu cảm buồn, tính là khách không hài lòng
