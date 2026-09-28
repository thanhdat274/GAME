## ADDED Requirements

### Requirement: Mở tiệm theo loại
Bản đồ thành phố SHALL hiện các khu mở được kèm loại cửa hàng của khu. Từ L29 có khu "Tiệm xôi" (loại `xoi`) với giá mở theo dữ liệu (mặc định 700.000đ). Tiệm mới dùng layout mặc định của loại tiệm: thùng ngâm, xửng hấp, quầy xôi.

#### Scenario: Mở tiệm xôi
- **WHEN** người chơi L29 đủ tiền và chọn mở Tiệm xôi
- **THEN** tiệm xôi được tạo với kho, nhân viên riêng, layout mặc định, và hướng dẫn ngâm nếp hiện vào sáng hôm sau

### Requirement: Giới hạn số cửa hàng trong chuỗi
Chuỗi SHALL có tối đa số cửa hàng theo `balance.json › chain.maxStores` (mặc định 6), tính cả tiệm chính.

#### Scenario: Đủ 6 tiệm
- **WHEN** chuỗi đã có 6 tiệm và người chơi chọn mở thêm
- **THEN** game từ chối với thông báo "Đã đạt giới hạn 6 cửa hàng"

### Requirement: Mô phỏng theo loại tiệm
Khi vắng chủ, tiệm có kiểu mô phỏng `profit_average` SHALL tiếp tục được cộng tiền như trước. Tiệm có kiểu `production` MUST dùng mô phỏng sản xuất của capability `internal-supply`.

#### Scenario: Chuỗi hỗn hợp
- **WHEN** ngày kết thúc với chi nhánh Chợ và tiệm xôi cùng vắng chủ
- **THEN** chi nhánh Chợ nhận tiền theo lãi trung bình, còn tiệm xôi chạy mô phỏng sản xuất
