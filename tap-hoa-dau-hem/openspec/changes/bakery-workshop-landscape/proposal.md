## Vì sao

Chi nhánh `bakery` hiện là cửa hàng bán lẻ đồ ăn vặt và hàng đông lạnh. Người chơi chưa thể nhập nguyên liệu làm bánh, sản xuất bánh tại chỗ, giao sản xuất cho thợ, hoặc xem một luồng làm bánh được thiết kế cho màn hình ngang. Cần mở rộng tiệm hiện có thành tiệm bánh có sản xuất nhưng vẫn giữ phần bán lẻ, chuỗi cửa hàng và vòng đời hàng hóa hiện tại.

Yêu cầu hình thành change này đến từ chat tham chiếu “Mở rộng tiệm bánh”. Nội dung hội thoại gốc hiện không được cung cấp; chỉ có dấu tham chiếu. Phạm vi cụ thể trong proposal vì vậy là kế hoạch suy ra từ tên chat, yêu cầu chơi ngang của người dùng và hiện trạng repository, chưa phải xác nhận rằng các ý tưởng đã được chốt.

## Thay đổi

- Mở rộng chi nhánh Tiệm bánh kẹo hiện có thành cửa hàng vừa bán lẻ vừa làm bánh tại chỗ; không tạo chi nhánh trùng chức năng.
- Thêm nguyên liệu làm bánh, thiết bị sản xuất, công thức và thành phẩm có giá vốn, giá bán, chất lượng và hạn dùng.
- Tái sử dụng vòng lặp công thức và mini-game nấu hiện có cho sản xuất thủ công; bổ sung vai trò Thợ làm bánh để tự sản xuất khi người chơi không trực tiếp thao tác.
- Bảo đảm toàn bộ luồng mới có thể chơi bằng màn hình ngang, trên cả profile ngang gọn và rộng; giữ nguyên góc nhìn cửa tiệm từ trên xuống và tương tác cảm ứng hiện có.
- Kết nối sản xuất tiệm bánh với hoạt động khi người chơi điều hành chi nhánh khác, đơn hàng nội bộ, tổng kết ngày và cơ chế hàng hỏng nếu các hệ thống hiện tại hỗ trợ.
- Chia nội dung thành lát MVP có thể chơi trọn vòng lặp và các phần mở rộng sau như đơn bánh đặt trước, trang trí bánh và sự kiện mùa vụ.

## Khả năng

### Khả năng mới
- `bakery-workshop`: sản xuất, nhân viên, nguyên liệu và thành phẩm của tiệm bánh.
- `landscape-bakery-flow`: luồng vận hành tiệm bánh trên màn hình ngang.

## Tác động dự kiến

- Dữ liệu: sản phẩm, công thức, nội thất, shop type, chi nhánh, level và cân bằng.
- Logic hiện có cần tích hợp: shop type, recipe production, staff simulation, branch simulation, tồn kho, thuế/doanh thu và hạn dùng.
- UI: `KitchenScene`/`CookScene`, tương tác trạm trong `ShopScene`, bảng điều khiển ngang và bố trí nội thất.
- Nhân viên: dữ liệu vai trò, tuyển dụng, đổi vai, chọn công việc, lương và mô phỏng chi nhánh.
- Lưu game: chỉ cần migration nếu lựa chọn thiết kế cuối cùng lưu mẻ đang làm hoặc hàng chờ sản xuất qua ngày; MVP ưu tiên hoàn tất mẻ ngay trong lượt thao tác để tránh trạng thái save mới.
- Kiểm tra: xác thực dữ liệu, công thức, mô phỏng chuỗi và chơi thử ngang gọn/rộng; không thuộc phạm vi thực hiện của proposal này.
