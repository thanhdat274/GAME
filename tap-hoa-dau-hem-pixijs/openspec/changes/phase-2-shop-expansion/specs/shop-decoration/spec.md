## ADDED Requirements

### Requirement: Đồ trang trí
Từ level 8, người chơi SHALL mua đồ trang trí (biển hiệu, dây đèn, chậu cây, lịch treo tường, bàn thờ Thần Tài...) và đặt lên mặt bằng hoặc tường tiệm; mỗi món có điểm thu hút.

#### Scenario: Đổi biển hiệu
- **WHEN** người chơi mua "Biển hiệu đèn LED"
- **THEN** mặt tiền tiệm đổi hình và điểm thu hút tăng theo dữ liệu của món

### Requirement: Chỉ số thu hút
Điểm thu hút SHALL bằng tổng điểm trang trí (tối đa 100) và nhân tốc độ sinh khách với `1 + thuHut/400`.

#### Scenario: Thu hút tối đa
- **WHEN** điểm thu hút đạt 100
- **THEN** tốc độ sinh khách tăng 25% so với khi không có trang trí

### Requirement: Mèo quầy
Đồ trang trí "Mèo mướp nằm quầy" SHALL thỉnh thoảng làm khách đang chờ vui, cộng 2 giây kiên nhẫn.

#### Scenario: Khách vuốt mèo
- **WHEN** có mèo trên quầy và khách chờ quá 5 giây
- **THEN** với xác suất 20% khách vuốt mèo, hiện trái tim và kiên nhẫn +2 giây
