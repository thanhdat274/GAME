## ADDED Requirements

### Requirement: Migrate lên bản lưu 2
Bản lưu version 1 SHALL được migrate lên version 2: mỗi kệ được gán khu theo nhóm hàng chiếm nhiều ô nhất trên kệ (kệ trống là chưa có khu), ô có món sai khu được trả về kho, `counter` (hàng sau quầy) tạo rỗng và `settings.autoScan` đặt là tắt; hàng, tiền, level và các trường khác MUST giữ nguyên.

#### Scenario: Kệ toàn một nhóm
- **WHEN** tải bản lưu v1 có kệ 1 toàn đồ khô và kệ 2 toàn ăn vặt
- **THEN** sau migrate kệ 1 là khu đồ khô, kệ 2 là khu ăn vặt, không mất hàng

#### Scenario: Kệ lẫn nhiều nhóm
- **WHEN** tải bản lưu v1 có kệ 1 chứa 4 ô đồ khô và 2 ô ăn vặt
- **THEN** kệ 1 là khu đồ khô, 2 ô ăn vặt được trả về kho với đúng số lượng

#### Scenario: Bản lưu giữa ngày
- **WHEN** tải bản lưu v1 được tạo giữa pha bán hàng
- **THEN** ngày tiếp tục từ trạng thái đã lưu gần nhất theo quy tắc hiện tại; khách đang ở tiệm và hàng đợi được bỏ qua, các trường hàng hóa, tiền và tiến độ ngày được giữ nhất quán

#### Scenario: Cài đặt mới
- **WHEN** tải bản lưu v1
- **THEN** "Tự quét" tắt và các cài đặt khác giữ nguyên
