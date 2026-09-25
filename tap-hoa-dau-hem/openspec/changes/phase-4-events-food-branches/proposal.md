## Why

Sau level 20, tiệm đã tự vận hành và người chơi cần mục tiêu mới để quay lại. Giai đoạn 4 thực hiện tầm nhìn dài hạn: tiệm không chỉ bán tạp hóa mà có thêm đồ ăn và thức uống pha chế; có sự kiện theo mùa và sự kiện ngẫu nhiên tạo bất ngờ; có cốt truyện cạnh tranh; và mở chuỗi chi nhánh ở các khu có nhu cầu khác nhau. Đây là nội dung "live" có thể cập nhật mãi bằng dữ liệu.

## What Changes

- Nâng giới hạn level lên 35, sau đó là hệ "Danh hiệu" không giới hạn.
- **Lịch game**: 1 tháng game = 10 ngày, 12 tháng/năm; HUD hiện ngày/tháng.
- **Sự kiện theo mùa**: Tết (tháng 1), Hè (tháng 5–7), Trung thu (tháng 8), Khai giảng (tháng 9), Mùa bóng đá; có hàng đặc biệt, trang trí, khách đông, nhiệm vụ sự kiện.
- **Sự kiện ngẫu nhiên**: mưa lớn, cúp điện, mối sỉ xả hàng, đoàn kiểm tra vệ sinh, trend mạng xã hội, đám giỗ hàng xóm đặt số lượng lớn.
- **Góc đồ ăn (Đất E)**: xúc xích nướng, mì ly pha sẵn, bánh mì kẹp, trứng luộc; mini-game chế biến; vai trò Đầu bếp.
- **Quầy nước (Đất F)**: trà tắc, cà phê sữa đá, nước mía, sinh tố, trà sữa; mini-game pha chế theo công thức; vai trò Pha chế.
- **Bàn ghế ăn tại chỗ**: khách ngồi ăn, dọn bàn, tăng doanh thu mỗi khách.
- **Cốt truyện**: các chương "Siêu thị đối diện" (đối thủ cạnh tranh giá), "Bà về thăm tiệm", "Lên phố mở chuỗi".
- **Chi nhánh**: mở 3 chi nhánh (Chợ, Cổng trường, Khu công nghiệp) với nhu cầu khác nhau; giao Quản lý chi nhánh; chuyển hàng giữa chi nhánh; bản đồ thành phố.
- **Nhiệm vụ tuần** và **đơn tiệc** số lượng lớn.
- **BREAKING (dữ liệu lưu)**: bản lưu v4 hỗ trợ nhiều cửa hàng, có migrate v3 → v4.

## Capabilities

### New Capabilities
- `game-calendar`: Ngày/tháng/năm trong game và mùa.
- `seasonal-events`: Sự kiện theo lịch game với hàng, trang trí, nhiệm vụ riêng.
- `random-events`: Sự kiện ngẫu nhiên trong ngày và tác động.
- `food-corner`: Góc đồ ăn, công thức, mini-game chế biến.
- `drink-bar`: Quầy nước, công thức, mini-game pha chế.
- `dine-in-seating`: Bàn ghế, khách ăn tại chỗ, dọn bàn.
- `story-chapters`: Cốt truyện theo chương và đối thủ cạnh tranh.
- `branch-network`: Bản đồ thành phố, chi nhánh, quản lý chi nhánh, chuyển hàng.
- `prestige-titles`: Danh hiệu sau level 35.

### Modified Capabilities
- `progression`: Giới hạn level 35 và bảng mở khóa L21–L35.
- `land-expansion`: Đất E (góc đồ ăn) và Đất F (quầy nước).
- `staff-simulation`: Vai trò mới Đầu bếp, Pha chế, Quản lý chi nhánh.
- `daily-quests`: Nhiệm vụ tuần, nhiệm vụ sự kiện, đơn tiệc.
- `save-system`: Bản lưu v4 nhiều cửa hàng, migrate v3 → v4.

## Impact

- Core: trạng thái chuyển từ "một tiệm" sang `stores[]` + dữ liệu chung (tiền, level, kho tổng); mô-đun `calendar.ts`, `events/`, `recipes.ts`, `seating.ts`, `story.ts`, `branches.ts`.
- Scene: bản đồ thành phố, mini-game nấu và pha chế, cảnh trang trí theo mùa, hội thoại cốt truyện.
- Dữ liệu: `events.json`, `recipes.json`, `story.json`, `branches.json`, `titles.json`; nội dung sự kiện có thể thêm chỉ bằng JSON.
- Asset: góc đồ ăn, quầy nước, bàn ghế, trang trí Tết/Trung thu, 3 khu chi nhánh, nhân vật đối thủ.
