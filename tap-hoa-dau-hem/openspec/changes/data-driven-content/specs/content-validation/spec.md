## ADDED Requirements

### Requirement: Kiểm tra dữ liệu nội dung tập trung
Hệ thống SHALL cung cấp `validateContent(data)` trả về danh sách lỗi (rỗng nếu hợp lệ), mỗi lỗi có tiền tố tên file và id bản ghi.

#### Scenario: Dữ liệu hợp lệ
- **WHEN** chạy `validateContent(DATA)` trên dữ liệu trong repo
- **THEN** kết quả là danh sách rỗng

#### Scenario: Tham chiếu hỏng
- **WHEN** một quest, party order, nhà cung cấp hoặc loại cửa hàng tham chiếu id mặt hàng, nội thất, công thức hay loại khách không tồn tại
- **THEN** lỗi nêu rõ file, id bản ghi và id bị thiếu

#### Scenario: Trùng id
- **WHEN** hai bản ghi trong cùng một file có cùng id
- **THEN** validator báo lỗi trùng id

### Requirement: Chạy được ngoài game
Hệ thống SHALL có lệnh `npm run validate:data` trả mã thoát khác 0 khi có lỗi, và `npm run build` SHALL chạy lệnh này trước khi đóng gói.

#### Scenario: Build bị chặn
- **WHEN** dữ liệu có lỗi
- **THEN** `npm run build` thất bại và in danh sách lỗi

### Requirement: Tra cứu theo id O(1)
Truy vấn recipe, shopType, supplier, customer theo id SHALL dùng chỉ mục Map và giữ nguyên kết quả cũ.

#### Scenario: Id không tồn tại
- **WHEN** tra một id không có
- **THEN** hành vi giống trước (ném lỗi hoặc trả undefined tùy hàm)
