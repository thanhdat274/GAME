## Vì sao

Game hiện ưu tiên điện thoại dọc và chặn người chơi điện thoại cảm ứng khi xoay ngang. Người chơi muốn tiếp tục dùng giao diện dọc hiện tại, đồng thời có giao diện ngang riêng cho điện thoại xoay ngang và máy tính. Xoay hoặc đổi kích thước cửa sổ chỉ được đổi cách trình bày; trạng thái, luật chơi, nhịp mô phỏng và dữ liệu lưu phải tiếp tục chạy như cũ.

Stardew Valley là nguồn cảm hứng về nguyên tắc trình bày: giữ thế giới chơi dễ quan sát, đưa thông tin cần thiết tới HUD, dùng thanh công cụ truy cập nhanh và gom thông tin quản lý vào các bảng/màn có tab. Change này chuyển các nguyên tắc đó sang bối cảnh tiệm tạp hóa Việt Nam, không sao chép tài sản, biểu tượng, bố cục pixel chính xác hay giao diện đặc trưng của Stardew Valley.

## Thay đổi

- Thay lớp phủ bắt xoay dọc bằng bộ chọn bố cục thích ứng: bố cục dọc hiện tại trên điện thoại dọc, bố cục ngang mới trên điện thoại ngang và màn hình máy tính đủ rộng.
- Tách kích thước vùng chơi khỏi một bộ tọa độ dọc cố định; bổ sung vùng hiển thị và điểm gãy dùng chung cho scene Phaser.
- Thiết kế lớp vỏ ngang gồm HUD trên, khu vực chơi trung tâm, bảng thông tin theo ngữ cảnh và thanh điều hướng nhanh; trên viewport hẹp, bảng phụ có thể thu gọn hoặc mở dạng drawer.
- Giữ nguyên core, mô phỏng ngày, xử lý input hiện có, tiến trình, cấu trúc save và đồng bộ cloud. Layout không tạo lựa chọn gameplay mới.
- Bổ sung điều khiển chuột/bàn phím ở nơi phù hợp mà không loại bỏ thao tác chạm hoặc các nút giao diện hiện có.
- Chuyển các scene sang layout ngang theo từng nhóm, bắt đầu bằng màn bán hàng làm mẫu.
- Ở bản ngang, Shop mặc định dùng góc nhìn trên xuống (từ change `topdown-store-view`) khi người chơi chưa chọn góc nhìn và không ở phiên chơi chung. Góc nhìn mặc định này tính theo bố cục, không ghi vào save.
- Thêm cảnh hẻm trước cửa tiệm, chỉ báo trên kệ/khách, màu theo giờ trong ngày và đi/thao tác bằng bàn phím (`WASD`, `E`) trên máy tính.
- Desktop phóng pixel art theo hệ số nguyên để giữ nét; màn quản lý được dựng lại khi xoay, còn Shop thì bố trí lại tại chỗ.

## Khả năng

### Khả năng mới
- `responsive-layout`: chọn, bố trí và chuyển đổi giữa giao diện dọc và ngang theo viewport mà không ảnh hưởng trạng thái gameplay.

## Tác động

- `index.html`: bỏ lớp phủ yêu cầu xoay dọc trên cảm ứng; giữ safe-area, khóa zoom và vùng canvas.
- `src/main.ts`, `src/ui/theme.ts`: quản lý resize/orientation, kích thước logic và bố cục phản hồi.
- `src/scenes/*`, `src/ui/*`: căn lại thành phần theo layout thay vì giả định mọi màn đều rộng 360 đơn vị.
- `src/core/*`, dữ liệu gameplay, API cloud và định dạng save: không đổi theo phạm vi change.
- Phụ thuộc `topdown-store-view`: cần số đo FPS thật (task 4.2) trước khi bật góc trên xuống làm mặc định ở bản ngang.
- Kiểm thử giao diện cần bao phủ dọc 375×812, ngang điện thoại 812×375, ngang nhỏ 667×375 và desktop 1366×768; kiểm tra riêng các vùng safe-area và resize cửa sổ.
