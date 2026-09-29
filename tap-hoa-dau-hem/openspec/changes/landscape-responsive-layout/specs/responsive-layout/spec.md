## ADDED Requirements

### Requirement: Bố cục phản hồi theo viewport
Game SHALL cung cấp bố cục dọc hiện tại và bố cục ngang thích ứng cho điện thoại ngang và desktop. Bộ chọn MUST dựa trên vùng viewport khả dụng và profile bố cục, không sửa trạng thái gameplay hoặc save. Bố cục SHALL giữ tỉ lệ pixel art, nằm trong vùng an toàn của thiết bị và giữ nội dung chính có thể nhìn/thao tác được.

#### Scenario: Điện thoại mở game ở chế độ dọc
- **WHEN** vùng game có profile dọc
- **THEN** game hiển thị bố cục dọc hiện tại với thứ tự thông tin và tương tác tương đương trước change

#### Scenario: Điện thoại xoay ngang
- **WHEN** người chơi đang ở game trên thiết bị cảm ứng và viewport chuyển sang profile ngang
- **THEN** game bỏ lớp nhắc xoay dọc, sắp xếp lại HUD/khu chơi/điều hướng theo layout ngang, và không chặn thao tác chơi

#### Scenario: Desktop đủ rộng
- **WHEN** game mở hoặc được resize thành viewport landscape-wide
- **THEN** khu chơi được đặt ở trung tâm với các vùng điều hướng/thông tin phụ phù hợp và không kéo méo pixel art

#### Scenario: Cửa sổ ngang hẹp hoặc thấp
- **WHEN** viewport landscape không đủ chỗ cho rail cố định
- **THEN** game thu gọn rail thành drawer/tab hoặc bố cục compact, không che vĩnh viễn nội dung/điều khiển thiết yếu

### Requirement: Đổi profile không làm thay đổi gameplay
Chuyển orientation hoặc resize MUST chỉ đổi presentation. Việc đổi layout MUST NOT khởi động lại scene đang giữ phiên bán (Shop và các màn mở từ Shop trong giờ bán), thay đổi GameState, tạo lại DaySession, thay thời gian mô phỏng, hoặc phát lệnh gameplay. Scene không giữ phiên MAY khởi động lại để dựng bố cục mới. Save schema, local save, cloud save và live-shop command semantics SHALL giữ nguyên.

#### Scenario: Xoay máy ở màn quản lý
- **WHEN** người chơi đang ở một màn không giữ phiên (ví dụ Kho hoặc Sổ sách) và viewport đổi profile
- **THEN** màn được dựng lại theo profile mới, vẫn là cùng màn và cùng tab đang xem, GameState không đổi

#### Scenario: Resize trong giờ bán
- **WHEN** viewport đổi từ dọc sang ngang trong một ngày bán
- **THEN** cùng khách hàng, hàng trong giỏ, tiền, đồng hồ, nhân viên và trạng thái phiên tiếp tục tồn tại sau khi bố cục cập nhật

#### Scenario: Đổi hướng qua lại
- **WHEN** người chơi đổi dọc → ngang → dọc trong cùng phiên
- **THEN** layout trở về đúng profile dọc, trạng thái gameplay tiếp tục cùng phiên và không tạo listener trùng

#### Scenario: Save/load ở profile khác
- **WHEN** người chơi lưu trên một profile rồi tải cùng save trên profile khác
- **THEN** cùng dữ liệu tiến trình được hiển thị bằng layout của viewport hiện tại, không yêu cầu migrate save

### Requirement: Shell ngang và điều hướng nhất quán
Layout ngang SHALL có phân cấp gồm thông tin ca quan trọng, khu vực chơi/nội dung chính, thông tin phụ theo ngữ cảnh và lối tắt điều hướng phù hợp. Các scene SHALL dùng cùng quy tắc vị trí/ẩn/thu gọn vùng và modal. Thông tin phụ MUST không che hành động chính khi có thể đưa vào rail/drawer.

#### Scenario: Shop ngang
- **WHEN** người chơi mở Shop ở profile ngang
- **THEN** khu tiệm chiếm vùng trung tâm; ngày/giờ/tiền và trạng thái quan trọng nằm trong HUD; nhiệm vụ/đơn hoặc lối tắt nằm ở vùng phụ có thể thu gọn

#### Scenario: Chuyển giữa các màn
- **WHEN** người chơi dùng điều hướng ngang để mở Kho, Nhiệm vụ, Sắp xếp hoặc màn quản lý
- **THEN** mỗi màn dùng cùng shell, vùng nội dung chính và nút quay lại/đóng có vị trí nhất quán

### Requirement: Góc nhìn trên xuống là mặc định của profile ngang
Ở profile ngang, Shop SHALL dùng góc nhìn trên xuống khi người chơi chưa chọn góc nhìn và không ở phiên chơi chung. Góc nhìn hiệu lực MUST được tính từ profile, `settings.viewMode` và trạng thái phiên chơi chung, và MUST NOT được ghi vào save. Chỉ thao tác đổi góc nhìn chủ động của người chơi mới được ghi `settings.viewMode`.

#### Scenario: Chưa chọn góc nhìn, mở Shop ngang
- **WHEN** `settings.viewMode` chưa có giá trị, không có phiên chơi chung và Shop mở ở profile ngang
- **THEN** Shop hiển thị góc nhìn trên xuống và `settings.viewMode` vẫn chưa có giá trị

#### Scenario: Đã chọn góc ngang
- **WHEN** người chơi đã chọn `'side'` và mở Shop ở profile ngang
- **THEN** Shop hiển thị góc nhìn ngang theo bố cục ngang

#### Scenario: Phiên chơi chung
- **WHEN** Shop đang ở phiên chơi chung trên profile ngang
- **THEN** Shop dùng góc nhìn ngang bất kể `settings.viewMode`

#### Scenario: Xoay máy giữa giờ bán khi chưa chọn góc nhìn
- **WHEN** `settings.viewMode` chưa có giá trị và viewport đổi dọc → ngang → dọc trong giờ bán
- **THEN** góc nhìn đổi ngang → trên xuống → ngang theo profile mà không restart Shop, và `settings.viewMode` vẫn chưa có giá trị

### Requirement: Nhập hàng ở bản ngang
Ở profile ngang, màn Nhập hàng SHALL mở được từ hotbar ở mọi vị trí và từ điện thoại bàn cạnh quầy ở góc nhìn trên xuống. Cả hai lối vào MUST gọi cùng một hành động mở màn Nhập hàng và tạm dừng tiệm như hiện tại. Việc giao hàng SHALL được thể hiện trong thế giới mà không thay đổi số lượng, thời điểm vào kho hay hàng chờ.

#### Scenario: Mở từ hotbar khi đang ở kệ
- **WHEN** nhân vật đang đứng ở kệ xa quầy và người chơi bấm ô Nhập hàng (hoặc phím `2`)
- **THEN** màn Nhập hàng mở dạng hộp thoại hai cột, tiệm tạm dừng và vẫn hiện mờ phía sau

#### Scenario: Mở từ điện thoại bàn
- **WHEN** nhân vật đứng ở quầy và người chơi chạm điện thoại bàn hoặc bấm `E`
- **THEN** cùng màn Nhập hàng mở như khi bấm ô hotbar

#### Scenario: Mối sỉ giao hàng
- **WHEN** tới giờ giao của một đơn trong `state.deliveries` ở góc nhìn trên xuống
- **THEN** xe của mối dừng ở hẻm, dòng nhắc giao hàng của đơn đó biến mất, và lượng hàng vào kho/hàng chờ đúng như khi ở góc nhìn ngang

#### Scenario: Hàng không vừa kho
- **WHEN** một đơn giao có món không vừa kho
- **THEN** chồng thùng hiện cạnh cửa, chạm vào xem được danh sách hàng chờ

### Requirement: Pixel art sắc nét trên desktop
Trên desktop dùng chuột, canvas SHALL được phóng theo hệ số nguyên khi hệ số đó vẫn giữ vùng chơi đủ lớn; phần dư của viewport SHALL là viền nền theo bảng màu game. Trên điện thoại, canvas MAY dùng hệ số lẻ để lấp đầy màn hình.

#### Scenario: Cửa sổ desktop 1366×768
- **WHEN** game mở trên desktop ở viewport 1366×768
- **THEN** pixel art hiển thị với hệ số phóng nguyên, không nhòe, và vùng ngoài canvas là viền nền thay vì dải đen

### Requirement: Input phù hợp thiết bị
Các hành động thiết yếu SHALL dùng được bằng cảm ứng và chuột. Phím tắt desktop MAY bổ sung thao tác cho điều hướng/đóng overlay nhưng MUST không kích hoạt khi focus ở trường nhập liệu. Kích thước hit area SHALL đủ chạm trên điện thoại ngang.

#### Scenario: Click và touch cùng hành động
- **WHEN** người chơi kích hoạt một nút thiết yếu bằng click hoặc touch
- **THEN** cùng một hành động UI được gọi đúng một lần

#### Scenario: Phím tắt khi nhập văn bản
- **WHEN** một input/textarea đang focus và người chơi bấm phím có shortcut
- **THEN** shortcut game không chặn hoặc kích hoạt thay thao tác nhập liệu

#### Scenario: Đi bằng bàn phím ở góc trên xuống
- **WHEN** Shop đang ở góc nhìn trên xuống, không có modal mở, và người chơi giữ `W`/`A`/`S`/`D` hoặc phím mũi tên
- **THEN** nhân vật đi theo hướng đó từng ô trên ô đi được, cùng tốc độ và cùng luật rời quầy như khi chạm để đi

#### Scenario: Thao tác bằng phím
- **WHEN** nhân vật đứng kề một kệ, tủ, bếp hoặc quầy và người chơi bấm `E` hoặc `Space`
- **THEN** game mở đúng thao tác mà chạm vào nội thất đó sẽ mở

#### Scenario: Escape
- **WHEN** người chơi bấm `Esc`
- **THEN** modal hoặc drawer trên cùng được đóng; nếu không có gì đang mở thì bật/tắt Tạm dừng

#### Scenario: Rê chuột lên kệ
- **WHEN** con trỏ chuột dừng trên một kệ, tủ hoặc quầy ở góc nhìn trên xuống
- **THEN** tooltip hiện tên món, số lượng, giá và hạn dùng mà không đổi trạng thái game

### Requirement: Cảm hứng thị giác có chuyển hóa
Layout ngang SHALL áp dụng phân cấp UI lấy cảm hứng từ game mô phỏng nông trại đời sống như Stardew Valley: thế giới chính dễ quan sát, truy cập nhanh tới công cụ/chức năng, HUD gọn và thông tin quản lý chia nhóm. Game MUST dùng bảng màu, pixel art, ngôn ngữ hình ảnh và nhãn riêng của Tạp Hóa Đầu Hẻm, không sao chép tài sản hoặc bố cục đặc trưng nguyên bản.

#### Scenario: Lối tắt chức năng
- **WHEN** người chơi ở màn Shop ngang
- **THEN** có thể tới các chức năng thường dùng qua lối tắt nhất quán, có biểu tượng kèm nhãn hoặc tooltip dễ hiểu

#### Scenario: Thông tin quản lý dài
- **WHEN** người chơi cần xem kho, nhân viên, lịch hoặc sổ sách
- **THEN** nội dung xuất hiện trong màn/bảng được nhóm rõ thay vì làm HUD gameplay quá dày
