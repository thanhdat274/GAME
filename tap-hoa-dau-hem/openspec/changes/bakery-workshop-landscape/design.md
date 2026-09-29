## Bối cảnh và hiện trạng

- Chi nhánh `bakery` mở ở level 40; hiện bán nhóm `snack` và `frozen`, có kệ, tủ đông và quầy tính tiền.
- Loại shop bakery chưa khai báo công thức hoặc nguyên liệu sản xuất riêng. `Bánh mì trứng` hiện có dùng trạm `bread_case`, nhưng trạm đó không nằm trong thiết bị bakery được phép đặt.
- Hệ recipe hiện gắn một công thức với một station. Màn Kitchen/Cook hỗ trợ bật món, kiểm tra thiết bị/nguyên liệu, mini-game, làm thành phẩm và đặt vào quầy.
- Nhân viên `chef` tự làm công thức `food`; mô phỏng sản xuất ngày vắng chủ hiện chuyên biệt cho tiệm xôi và `xoi_cook`, chưa có vòng sản xuất bakery tương đương.
- Dự án đã có profile `landscape-compact` và `landscape-wide`, shell ngang, Shop top-down, safe-area và điều khiển cảm ứng. Tuy nhiên, không được giả định các màn quản lý hiện có tự động bố trí tốt trên ngang; Kitchen/Cook và tương tác lò cần được thiết kế có chủ đích.

## Mục tiêu

1. Bổ sung một vòng sản xuất bánh hoàn chỉnh vào chi nhánh bakery hiện có.
2. Đảm bảo màn ngang là trải nghiệm chính cho mua nguyên liệu, làm bánh, xem mẻ và đưa hàng ra bán.
3. Tái sử dụng hệ recipe, mini-game, nhân viên và lưu kho khi phù hợp; tránh một mô hình sản xuất thứ hai không tương thích.
4. Giữ nguyên cửa hàng cũ, tiến trình, dữ liệu save và hoạt động các chi nhánh không liên quan.
5. Để lại đường mở rộng cho đơn đặt trước, bánh trang trí và sự kiện nhưng không phụ thuộc chúng để MVP chơi được.

## Ngoài phạm vi MVP

- Tạo chi nhánh bakery thứ hai hoặc bản đồ khu phố mới.
- Mô phỏng nhào/ủ/nướng qua nhiều giờ thực hoặc nhiều ngày.
- Trang trí bánh tự do bằng thao tác vẽ nhiều điểm.
- Hợp đồng tiệc cưới/sinh nhật, khách VIP và chiến dịch mùa vụ hoàn chỉnh.
- Thay toàn bộ cân bằng cửa hàng bán lẻ hay thay đổi bố cục portrait toàn game.

## Quyết định thiết kế cần chốt khi triển khai

### D1. Nâng cấp bakery hiện có

Giữ id `bakery`, giá mở chi nhánh, vị trí trên bản đồ và khả năng bán snack/frozen. Bổ sung workshop như tính năng/nhóm thiết bị của chi nhánh đó. Tránh thêm chi nhánh “Tiệm bánh” thứ hai sẽ chia nhỏ kho, khách và tiến trình không cần thiết.

### D2. Công thức một trạm trong MVP

Do mô hình recipe hiện có chỉ khai báo một `station`, mỗi món MVP dùng một trạm chính: lò nướng hoặc bàn làm bánh. Mini-game hiện có quyết định chất lượng và nguyên liệu được trừ lúc hoàn tất. Quy trình nhiều công đoạn (trộn → ủ → nướng → phủ kem) là khả năng mở rộng sau; chỉ đưa vào khi có mô hình recipe nhiều stage dùng chung, không tạo ngoại lệ cứng cho bakery.

### D3. Danh mục bản đầu

Danh sách gợi ý để cân bằng nội dung: bánh bông lan, bánh quy bơ, bánh su kem và bánh mì bơ sữa. Mỗi món phải có bộ nguyên liệu khác biệt và một quyết định vận hành có nghĩa. Bánh trung thu, bánh kem nhiều tầng và trang trí theo yêu cầu để ở giai đoạn sau.

Nguyên liệu gợi ý: bột mì, trứng, đường, sữa, bơ, men nở, kem. Nguyên liệu chỉ dùng trong bakery không được rò sang cửa hàng tạp hóa nếu cơ chế `shopOnly`/quyền shop có thể biểu diễn giới hạn này. Nguyên liệu cần lạnh dùng quy tắc tủ lạnh hiện có.

### D4. Kết quả sản xuất dùng thành phẩm hiện có

Đầu ra dùng loại hàng recipe-only/behind-counter phù hợp, giá vốn khớp tổng nguyên liệu, chất lượng ảnh hưởng giá hoặc đánh giá theo quy tắc hiện hành, và hạn dùng khai báo trong dữ liệu. MVP ưu tiên làm xong một mẻ qua mini-game, rồi đặt lên quầy; không lưu đồng hồ nướng xuyên lần tải game.

### D5. Thợ làm bánh tách khỏi Đầu bếp theo loại công thức

Thêm vai trò `baker`, chỉ nhận công thức được gắn vào nhóm sản xuất bakery. Không phân vai bằng tên món hoặc id recipe rải rác trong logic. Dùng chỉ số/tính lương/tâm trạng hiện có; tốc độ quyết định thời gian và độ chính xác/chất lượng quyết định kết quả theo quy tắc thống nhất.

Để tránh lặp lỗi mô phỏng chuyên biệt hiện tại, sản xuất bakery khi người chơi ở chi nhánh khác phải có một mô phỏng dữ liệu-điều-khiển (recipe, station, nguyên liệu, sức chứa, thợ, đơn nội bộ) và báo cáo sản xuất; không sao chép nguyên hàm mô phỏng xôi.

### D6. Bố cục ngang theo profile

**Landscape wide:** mặt bằng bakery ở vùng chơi trung tâm/trái; rail bên phải cho tình trạng mẻ, đơn, quầy thành phẩm và nút tương tác. Khi mở Kitchen, bố cục ba vùng: công thức/nguyên liệu bên trái, mini-game ở giữa, mẻ/kết quả bên phải.

**Landscape compact:** không dành rail cố định làm vùng chơi quá hẹp. Giữ mặt bằng là chính; chi tiết lò/kho/mẻ mở thành drawer hoặc panel theo tab. Kitchen chuyển giữa tab Công thức, Làm bánh và Thành phẩm, giữ mục đang chọn khi đổi panel.

Các nút và vùng chạm phải dùng safe-area, có nhãn/icon rõ, không đặt lên cửa, lối đi hay nút điều khiển Shop. Mọi thao tác thiết yếu của MVP phải hoàn tất ở ngang; không yêu cầu xoay dọc để làm bánh hoặc thu thành phẩm.

### D7. Phân kỳ tiến trình

Không tăng `maxLevel` chỉ để nhét thêm vài món. Giữ mở bakery hiện tại ở level 40; gắn workshop/thiết bị/recipes vào các mốc còn chỗ trong roadmap level hiện hành hoặc vào nâng cấp bakery có chi phí, sau khi rà thứ tự unlock toàn game. Một tiêu chí cân bằng tối thiểu là giá thiết bị, chi phí nguyên liệu, sản lượng, hạn dùng và nhu cầu khu vực tạo lựa chọn đầu tư thay vì lợi nhuận chắc chắn.

## Các mảng dữ liệu và code dự kiến

- JSON: `products.json`, `recipes.json`, `furniture.json`, `shopTypes.json`, `levels.json`, `balance.json`, có thể `branches.json` nếu cần metadata workshop.
- Core: recipe/shop validation, quyền nguyên liệu, chuẩn bị thành phẩm, role/task chọn công việc, mô phỏng sản xuất chi nhánh, báo cáo ngày và thuế/doanh thu nếu cần.
- UI: `KitchenScene`, `CookScene`, `ShopScene`, build/interior placement và sprite nội thất.
- Save: chỉ thêm trường nếu có hàng chờ/mẻ qua ngày; nếu thêm phải có mặc định khi đọc save cũ và kiểm tra local/cloud.

## Rủi ro và đánh đổi

- Bakery vừa bán snack/frozen vừa làm bánh có thể làm menu và màn nhập hàng quá tải; cần bộ lọc “Hàng bán lẻ / Nguyên liệu / Bánh làm tại tiệm”.
- Đầu bếp hiện làm toàn bộ recipe `food`; nếu thêm baker, quy tắc phân công phải chỉ rõ món nào do ai làm, kể cả công thức bán ở chi nhánh khác.
- Offline simulation phải tất định theo ngày/chi nhánh để không tạo chênh lệch tiền hoặc nhân đôi thành phẩm khi đổi chi nhánh/tải save.
- Sản phẩm thành phẩm recipe-only không được nhập như hàng thường; kiểm tra cấm mua/bán trùng, giá vốn và đường vào quầy.
- Ngang compact có ít chiều cao; chữ, nút và mini-game không được thu nhỏ quá mức để giữ đủ ba cột.
- Đổi schema save có thể tác động cloud sync; vì vậy tránh trạng thái sản xuất kéo dài trong MVP.

## Câu hỏi cần chốt trước khi triển khai

1. Thợ làm bánh có tự chọn món đang bật hay người chơi cần chọn thứ tự ưu tiên?
2. Bánh chủ yếu bán tại quầy tiệm bánh hay được chuyển cho mọi chi nhánh/đơn nội bộ?
3. Workshop mở tự động khi đạt level hay mua/nâng cấp riêng tại bakery?
4. Mức độ mini-game mong muốn là thao tác nấu hiện có hay cần cơ chế trộn/ủ/nướng riêng?

Các câu hỏi này không chặn proposal. Mặc định MVP đề xuất: người chơi bật món như recipe hiện tại; thợ làm bánh làm món đang bật theo ưu tiên dữ liệu; bánh bán tại bakery và có thể giao đơn nội bộ nếu shop type cho phép; workshop mua thiết bị riêng; tái sử dụng mini-game hiện có.
