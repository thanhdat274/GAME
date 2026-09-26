## ADDED Requirements

### Requirement: Chọn góc nhìn
Game SHALL có hai góc nhìn lúc bán: nhìn ngang (mặc định) và trên xuống. Lựa chọn được lưu trong `settings.viewMode` và đổi được ngay trong ngày mà không khởi động lại phiên bán. Phiên chơi chung MUST chỉ dùng góc nhìn ngang.

#### Scenario: Đổi góc nhìn giữa ngày
- **WHEN** người chơi bấm "Góc: Nhìn ngang" trong menu Tạm dừng lúc 10:00
- **THEN** góc nhìn đổi sang trên xuống, đồng hồ, khách và giỏ hàng giữ nguyên

### Requirement: Di chuyển và thao tác tại nội thất
Ở góc nhìn trên xuống, người chơi SHALL chạm ô để đi theo đường tìm được trên lưới, với tốc độ mặc định 4 ô/giây (`balance.topDown.playerTilesPerSecond`). Người chơi MUST đứng cạnh nội thất mới thao tác được. Các thao tác gồm:
- kệ: nạp ô, bày món từ kho vào ô trống, bán xả hàng hết hạn hôm nay, nạp cả khu;
- kệ kho: xem kho;
- trạm bếp: nấu nhanh (chất lượng 0,85), hoặc nấu kỹ bằng mini-game.

#### Scenario: Nạp kệ phải tới nơi
- **WHEN** người chơi chạm Kệ 1 từ quầy
- **THEN** nhân vật đi tới cạnh Kệ 1 và chỉ khi tới nơi mới hiện bảng nạp với nút + cho từng ô

### Requirement: Rời quầy
Khi người chơi không đứng ở quầy, khách đầu hàng ở quầy người chơi MUST đứng chờ, chưa được quét giỏ. Khách ở quầy người chơi mất kiên nhẫn theo hệ số mặc định 0,6 (`balance.topDown.awayPatienceRate`). Nếu có thu ngân đang đứng quầy, quầy người chơi SHALL tạm đóng: khách mới và khách chưa quét món chuyển sang quầy thu ngân.

#### Scenario: Không có thu ngân
- **WHEN** người chơi đang ở kệ và có khách tới quầy
- **THEN** khách đứng chờ ở trạng thái `waiting` cho tới khi người chơi quay lại quầy

#### Scenario: Có thu ngân
- **WHEN** có thu ngân đứng quầy và người chơi rời quầy
- **THEN** khách mới xếp vào quầy thu ngân, và bảng quầy của người chơi báo "Thu ngân đang lo quầy"

### Requirement: Bắt trộm bằng cách lại gần
Ở góc nhìn trên xuống, người chơi SHALL chỉ bắt được kẻ trộm đang bỏ chạy khi đứng cách kẻ trộm không quá 3 ô.

#### Scenario: Ở xa kẻ trộm
- **WHEN** người chơi chạm kẻ trộm khi đang cách 5 ô
- **THEN** nhân vật chạy về phía cửa và game báo "Xa quá! Chạy lại gần để bắt"
