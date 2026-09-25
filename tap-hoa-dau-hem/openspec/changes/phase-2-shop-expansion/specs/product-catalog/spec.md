## ADDED Requirements

### Requirement: Mặt hàng giai đoạn 2
Danh mục SHALL có thêm 16 mặt hàng: đồ uống (L5: nước ngọt lon, nước suối, trà xanh chai, nước tăng lực, sữa hộp), đồ tươi (L7: trứng gà, bánh mì, rau muống, sữa tươi, đậu hũ), đông lạnh (L9: kem que, kem hộp, xúc xích, há cảo, chả giò, nước đá).

#### Scenario: Món cần lạnh
- **WHEN** dữ liệu mặt hàng có `requiresCold: "freezer"`
- **THEN** món đó chỉ bày được trong tủ đông

### Requirement: Trường dữ liệu mới
Mỗi mặt hàng SHALL hỗ trợ thêm các trường tùy chọn: `refPrice` (giá gợi ý), `shelfLifeDays`, `requiresCold`, `prefersCold`; bước kiểm tra dữ liệu MUST báo lỗi nếu `shelfLifeDays` ≤ 0 hoặc `requiresCold` không phải "fridge"/"freezer".

#### Scenario: Dữ liệu sai hạn dùng
- **WHEN** một món có `shelfLifeDays: 0`
- **THEN** test dữ liệu báo lỗi chỉ rõ id món
