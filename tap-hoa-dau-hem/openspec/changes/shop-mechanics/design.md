## Context

`ShopTypeDef` đã quyết định hàng, khách, nội thất, đường cong khách. Điểm móc còn thiếu là các hằng số dùng chung: `expiryFor` (hạn dùng, không biết loại tiệm), `generateOrder` (số lượng, nhu cầu), `shopDensityAt` (mật độ khách).

## Goals / Non-Goals

**Goals:** cơ chế riêng cấu hình bằng dữ liệu, tạp hóa/xôi giữ nguyên kết quả theo seed, người chơi thấy được đặc điểm.
**Non-Goals:** mini-game riêng, UI riêng trong màn Bán hàng, chất lượng/độ tươi theo từng lô ảnh hưởng giá.

## Decisions

- **`mechanics` là khối tùy chọn với 5 tham số nhân.** Thiếu = 1, nên loại cũ không đổi; thêm cơ chế mới là thêm dữ liệu. Không thêm cờ đặc biệt trong code cho từng loại.
- **Hạn dùng theo nhóm hàng**: `shelfLifeMul[nhóm]` nhân `shelfLifeDays`, làm tròn, tối thiểu 1 ngày. Chỉ áp dụng cho lô nhập sau khi có cơ chế (lô cũ giữ nguyên). `expiryFor` nhận thêm hệ số tùy chọn để giữ chữ ký cũ.
- **Nhu cầu**: hệ số cuối = `demandMul[nhóm]` × (nhu cầu mùa/sự kiện)^`seasonSensitivity`. Mũ số >1 làm mùa nóng bùng nổ hơn và mùa lạnh vắng hơn, đúng tính chất quầy nước.
- **Số lượng**: `qtyMul` nhân số lượng mỗi dòng sau khi rút ngẫu nhiên, không tiêu thêm số ngẫu nhiên nên phân bố seed của loại khác không đổi.
- **Mật độ khách**: `trafficMul` nhân vào `shopDensityAt`, cùng chỗ với đường cong giờ.
- **Mô tả tự sinh** (`describeMechanics`) từ số liệu để không lệch với dữ liệu thật; hiển thị ở bản đồ phố.

## Risks / Trade-offs

- Ba loại mới chưa cân bằng bằng chơi thật → số liệu ban đầu thận trọng, ghi rõ.
- Hàng tươi hạn ngắn có thể gây hỏng nhiều → người chơi vẫn có bán xả và nhập theo gợi ý sẵn có.
- `qtyMul` lớn làm kệ nhanh cạn → sức chứa ô kệ giữ nguyên, đó là phần của thách thức.
