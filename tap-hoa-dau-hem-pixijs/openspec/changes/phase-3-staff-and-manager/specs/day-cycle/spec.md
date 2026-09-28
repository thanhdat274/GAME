## ADDED Requirements

### Requirement: Chi phí nhân sự trong tổng kết
Màn tổng kết SHALL có mục chi phí gồm lương nhân viên, thưởng, tiền điện, hàng hỏng, mất trộm, và lãi ròng sau các chi phí đó.

#### Scenario: Ngày có 2 nhân viên
- **WHEN** ngày kết thúc với lãi gộp 400.000đ, lương 60.000đ, điện 13.000đ
- **THEN** tổng kết hiện lãi ròng 327.000đ

### Requirement: Nhật ký trong ngày
Tổng kết SHALL có tab "Nhật ký" liệt kê các sự việc chính trong ngày (tự nhập hàng, giao hàng, trộm, nhân viên lên cấp, khách phàn nàn) theo giờ game.

#### Scenario: Xem nhật ký
- **WHEN** người chơi mở tab Nhật ký
- **THEN** các sự việc hiện theo thứ tự thời gian, ví dụ "10:15 · Bé Lan thối dư 5.000đ"
