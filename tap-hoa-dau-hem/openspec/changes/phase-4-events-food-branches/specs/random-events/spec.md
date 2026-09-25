## ADDED Requirements

### Requirement: Sự kiện ngẫu nhiên hằng ngày
Từ level 21, mỗi ngày SHALL có tối đa 1 sự kiện ngẫu nhiên rút từ `events.json` theo xác suất và điều kiện; sự kiện được báo ở buổi sáng (trừ cúp điện xảy ra bất ngờ).

#### Scenario: Báo mưa
- **WHEN** sự kiện "Mưa lớn" được rút cho hôm nay
- **THEN** buổi sáng hiện "Dự báo: chiều nay mưa to" và gợi ý nhập áo mưa

### Requirement: Tác động mặc định
Các sự kiện ngẫu nhiên SHALL có tác động: Mưa lớn (khách −40%, áo mưa và mì gói nhu cầu ×3), Cúp điện 2–4 giờ (thiết bị lạnh tắt, đồ đông lạnh hỏng sau 3 giờ nếu không có máy phát), Mối sỉ xả hàng (1 món −40% hôm nay), Kiểm tra vệ sinh (phạt 100.000đ nếu có hàng hết hạn trên kệ, ngược lại +5 thu hút trong 7 ngày), Trend mạng xã hội (1 món nhu cầu ×3 trong 2 ngày), Đám giỗ hàng xóm (đơn lớn hạn 2 ngày).

#### Scenario: Cúp điện có máy phát
- **WHEN** cúp điện xảy ra và tiệm có máy phát
- **THEN** thiết bị lạnh vẫn chạy và trừ 10.000đ tiền dầu

#### Scenario: Kiểm tra vệ sinh sạch
- **WHEN** đoàn kiểm tra tới và không có hàng hết hạn trên kệ
- **THEN** tiệm treo "Giấy khen vệ sinh" và thu hút +5 trong 7 ngày

### Requirement: Gộp hiệu ứng
Hiệu ứng của sự kiện mùa, sự kiện ngẫu nhiên và mùa SHALL được gộp qua một ngăn xếp hiệu ứng (nhân hệ số) mà mọi hệ thống đọc từ đó.

#### Scenario: Mưa trong Tết
- **WHEN** đang Tết (khách ×3) và có mưa lớn (khách −40%)
- **THEN** hệ số khách là 3 × 0.6 = 1.8
