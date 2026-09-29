## 1. Chốt phạm vi và dữ liệu

- [ ] 1.1 Khôi phục nội dung chat tham chiếu nếu người dùng cung cấp bản chat đầy đủ; đối chiếu yêu cầu, món bánh, phong cách và các điều kiện đã chốt với assumptions trong proposal/design.
- [ ] 1.2 Chốt vòng lặp MVP, quyền workshop, danh sách tối đa bốn món đầu tiên, nguyên liệu, giá vốn, giá bán và hạn dùng.
- [ ] 1.3 Chốt cách mở workshop: theo level hay nâng cấp/mua riêng tại bakery; rà roadmap level hiện hành để không trùng hoặc làm lệch unlock.
- [ ] 1.4 Chốt quy tắc ưu tiên món cho Thợ làm bánh, phạm vi bán tại chỗ và giao đơn nội bộ.
- [ ] 1.5 Rà hợp đồng save/cloud và quyết định có cần lưu batch đang làm; mặc định MVP không lưu mẻ qua ngày.

## 2. Thiết bị, nguyên liệu và công thức

- [ ] 2.1 Thêm nguyên liệu bakery và xác định quyền shop, điều kiện bảo quản, giá nhập, số lượng tiêu hao và cách nhập hàng.
- [ ] 2.2 Thêm bàn làm bánh/lò/kệ trưng bày dưới dạng nội thất đặt được; khai báo footprint, hướng xoay, chi phí, công suất điện, giới hạn và unlock.
- [ ] 2.3 Thêm tối đa bốn recipe MVP với station, nguyên liệu, output, thời gian, minigame, giá vốn và hạn dùng; giữ cấu trúc một station mỗi recipe.
- [ ] 2.4 Khai báo output recipe-only/behind-counter, không cho nhập hoặc bán trùng như hàng thường.
- [ ] 2.5 Mở recipe/station cho bakery nhưng giữ danh mục snack/frozen, và xác minh validator nội dung/shop/recipe.
- [ ] 2.6 Thêm sprite pixel-art cho trạm; kiểm tra footprint và va chạm trong bố cục bakery mặc định.

## 3. Vòng làm bánh trực tiếp

- [ ] 3.1 Thêm bộ lọc bakery trong Kitchen: Bánh, Nguyên liệu, Thiết bị; hiện rõ trạng thái khóa/thiếu trạm/thiếu nguyên liệu/thiếu chỗ.
- [ ] 3.2 Nối công thức bakery vào Cook hiện có; trừ nguyên liệu đúng một lần khi hoàn tất hợp lệ.
- [ ] 3.3 Đưa thành phẩm vào quầy hoặc vùng trưng bày bakery, hỗ trợ bán, hạn dùng, hỏng hàng và thống kê doanh thu/COGS.
- [ ] 3.4 Thêm tương tác trạm trong Shop top-down để mở đúng công thức/panel bakery.
- [ ] 3.5 Xử lý rời màn mini-game, hủy thao tác và lỗi thiếu hàng sao cho không mất nguyên liệu hoặc tạo thành phẩm trùng.

## 4. Thợ làm bánh và mô phỏng chuỗi

- [ ] 4.1 Thêm vai trò baker vào type, dữ liệu vai trò, tuyển dụng, đổi vai, bảng nhân viên, lương và roster mô phỏng.
- [ ] 4.2 Giới hạn baker vào recipe/group được đánh dấu bakery; đảm bảo không tranh việc với chef ngoài quy tắc đã chốt.
- [ ] 4.3 Thêm tự động sản xuất trong ngày đang chơi dựa trên ca, nguyên liệu, trạm, công thức bật và chỉ số baker.
- [ ] 4.4 Tổng quát hóa mô phỏng sản xuất chi nhánh/ngày để hỗ trợ bakery, đơn nội bộ, tồn kho, bán hàng, hàng hỏng, lương và báo cáo; tránh nhân đôi logic riêng kiểu xôi.
- [ ] 4.5 Kiểm tra đổi chi nhánh, đóng/mở ngày và tải save không tạo sản lượng, tiền hoặc lương hai lần.

## 5. UI màn hình ngang

- [ ] 5.1 Thiết kế/wireframe landscape-wide: Shop trung tâm, rail bakery theo ngữ cảnh và Kitchen ba vùng.
- [ ] 5.2 Thiết kế/wireframe landscape-compact: mặt bằng ưu tiên, drawer/tab cho công thức, thao tác và thành phẩm.
- [ ] 5.3 Thực hiện responsive Kitchen/Cook và panel bakery theo layout profile hiện có; bảo toàn item chọn và phiên Shop.
- [ ] 5.4 Đảm bảo toàn bộ hành động thiết yếu dùng được ngang, hit area cảm ứng, keyboard/mouse hiện có, safe-area và không che bản đồ/lối đi.
- [ ] 5.5 Chơi thử luồng Bakery ở 812×375 và 667×375; sửa clipping, overlap, chữ quá nhỏ, vùng cuộn và trạng thái focus.

## 6. Mở rộng sau MVP (không chặn phát hành MVP)

- [ ] 6.1 Thiết kế đơn đặt bánh/đơn tiệc có hạn giao, số lượng, thưởng và hậu quả thất bại.
- [ ] 6.2 Thiết kế trang trí bánh như mini-game tùy chọn với đánh giá/chất lượng; không yêu cầu thao tác vẽ tự do làm cản trở cảm ứng.
- [ ] 6.3 Thêm nội dung mùa vụ như bánh trung thu khi công thức, event demand và nguồn nguyên liệu đã được cân bằng.
- [ ] 6.4 Cân nhắc công đoạn nhiều trạm (trộn/ủ/nướng/phủ kem) dưới dạng mô hình recipe stages dùng chung nếu nhiều ngành hàng cần.

## 7. Kiểm chứng và hoàn thiện

- [ ] 7.1 Thêm kiểm tra core cho nguyên liệu, công thức, chất lượng, hạn dùng, nhân viên, mô phỏng tất định và chống ghi nhận trùng.
- [ ] 7.2 Kiểm tra save hiện có không bakery workshop và save có chi nhánh bakery; bổ sung migration chỉ khi schema mới thực sự cần.
- [ ] 7.3 Xác minh báo cáo doanh thu, COGS, lương, thuế, tồn hàng và hàng hỏng nhất quán giữa chơi trực tiếp và mô phỏng chi nhánh.
- [ ] 7.4 Chơi thử bằng chuột và cảm ứng ở landscape-wide, landscape-compact; xác minh luồng từ Shop → trạm → Kitchen/Cook → thành phẩm → tổng kết ngày.
- [ ] 7.5 Chạy build, validator dữ liệu/công thức và bộ kiểm tra liên quan; ghi môi trường, kết quả và giới hạn còn lại trong `openspec/STATUS.md` khi triển khai change.
