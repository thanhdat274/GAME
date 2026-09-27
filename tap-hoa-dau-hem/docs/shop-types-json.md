# Thêm loại cửa hàng bằng JSON

Game đọc cấu hình loại cửa hàng từ `src/data/shopTypes.json`. `shopType` xác định cách một tiệm bán hàng; `kind` trong `branches.json` vẫn là vị trí/khu vực của tiệm. Mỗi cửa hàng giữ kho, kệ, quầy, nhân viên và nội thất riêng trong dữ liệu snapshot; tiền và level vẫn dùng chung.

## Các trường

- `id`, `name`, `icon`: mã loại, tên và biểu tượng.
- `categories`: nhóm hàng có thể nhập và bày trên kệ. Tiệm xôi dùng `[]` vì bán món gọi tại quầy.
- `ingredients`: nguyên liệu có thể nhập cho các công thức của loại tiệm.
- `fixtures`: danh sách mã nội thất được phép đặt, tham chiếu `furniture.json`.
- `customers`: mã loại khách có trong `customers.json`.
- `densityCurve`: các khoảng phút trong ngày và hệ số khách; `null` dùng đường cong chung.
- `sim`: `profit_average` cho tạp hóa vắng chủ, hoặc `production` cho tiệm phải tiêu nguyên liệu và sản xuất.
- `recipes`: mã công thức được loại tiệm phục vụ, tham chiếu `recipes.json`.
- `supplies`: mặt hàng loại tiệm này có thể giao cho tiệm khác.
- `sourcesFrom`: mặt hàng loại tiệm muốn ưu tiên đặt từ nguồn nội bộ; nếu chưa có tiệm cung cấp, người chơi vẫn có thể nhập từ mối sỉ.
- `sourcedRequestChance` (tùy chọn): tỉ lệ mỗi khách hỏi thêm một món `sourcesFrom` khi món đó đang có ở quầy, ví dụ khách tạp hóa mua xôi gói ăn sáng. Bỏ trống là 0.
- `dineInChance`, `addOns`: tỉ lệ khách ngồi lại và đồ uống kèm (nếu có).
- `landPlots`: loại tiệm có thể mở rộng đất.
- `service`: `shelves` cho khách tự lấy hàng hoặc `counter` cho khách gọi món tại quầy.

## Thêm một loại tiệm

1. Thêm mục mới vào `shopTypes.json`, chọn `id` duy nhất và khai báo nhóm hàng, nội thất, khách, công thức, nguồn cung và kiểu phục vụ.
2. Thêm một khu mở tiệm trong `branches.json`, đặt `shopType` trùng `id`, rồi khai báo level, giá mở và layout mặc định.
3. Thêm công thức, mặt hàng, vai trò nhân viên và cấu hình cân bằng nếu loại tiệm cần chúng. Đảm bảo công thức đầu ra, trạm nấu và mặt hàng đều có id hợp lệ.
4. Chạy `npm run validate:recipes`. Lệnh kiểm tra `shopTypes.json`, công thức, mặt hàng, nội thất, khách và tham chiếu loại tiệm ở `branches.json`.
5. Bổ sung hoặc chạy kiểm thử cho vòng chơi, chuyển hàng và mô phỏng của loại mới.

## Ranh giới của cấu hình

JSON điều khiển lọc danh mục, nội thất, khách, giờ đông, công thức, nhà cung cấp nội bộ và lựa chọn mô phỏng đã có. Một kiểu phục vụ hoặc mô hình sản xuất hoàn toàn mới vẫn cần core/UI và kiểm thử tương ứng; không nên khai báo `service`/`sim` mới rồi kỳ vọng game tự sinh hành vi.

Ví dụ hiện tại: `grocery` bán hàng trên kệ và mô phỏng lợi nhuận trung bình; `xoi` dùng quầy xôi riêng, làm món tại chỗ và cung cấp các loại xôi gói cho đơn nội bộ.
