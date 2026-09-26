## ADDED Requirements

### Requirement: Bản lưu v6
Bản lưu SHALL lên phiên bản 6. Mỗi `StoreSnapshot` có `shopType`. Trạng thái chung có `internalOrders` và `recurringOrders`. Dữ liệu tiệm có mẻ ngâm (`soakBatches`) và nếp chín (`cookedRice`, kèm thời điểm hấp). Kích thước bản lưu MUST vẫn dưới 1 MB với 5 tiệm.

#### Scenario: Lưu và tải chuỗi có tiệm xôi
- **WHEN** người chơi lưu game có tiệm xôi đang ngâm nếp và một đơn định kỳ, rồi tải lại
- **THEN** mẻ ngâm, đồng hồ giữ nóng và đơn định kỳ được khôi phục nguyên vẹn

### Requirement: Migrate v5 → v6
Game MUST tự chuyển bản lưu v5 sang v6: mọi tiệm hiện có nhận `shopType: "grocery"`, `internalOrders` và `recurringOrders` rỗng, không đổi tiền, level, kho hay nhân viên.

#### Scenario: Bản lưu v5 có 3 chi nhánh
- **WHEN** người chơi tải bản lưu v5 có tiệm chính và 2 chi nhánh
- **THEN** cả 3 tiệm là `grocery`, mọi số liệu giữ nguyên, và bản lưu được ghi lại ở v6
