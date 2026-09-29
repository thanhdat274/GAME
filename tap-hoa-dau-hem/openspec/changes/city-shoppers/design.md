## Context

`CityScene` có dân phố đi dạo (`Actor`) và biết tiệm nào đã mở (lô đất + `G.state.stores`). Mỗi loại tiệm có nhóm hàng, mỗi loại khách có `prefs` theo nhóm hàng; chi nhánh có `traffic`.

## Goals / Non-Goals

**Goals:** khách chọn tiệm hợp lý theo dữ liệu thật, đi tới cửa, vào, ra; nhìn là thấy tiệm nào đông.
**Non-Goals:** tạo doanh thu hay khách thật từ dân phố, đồng bộ với `DaySession`, khách đi vào bên trong tiệm.

## Decisions

- **Trọng số chọn tiệm = `traffic` × (0.2 + 0.8 × tỉ lệ kệ có hàng) × độ hợp sở thích.** Kệ trống vẫn còn một ít khách (0.2) để tiệm không "chết hẳn" trên bản đồ. Độ hợp = trung bình `prefs[nhóm]` của các nhóm loại tiệm bán (nhóm khách không nói tới tính 0.3); tiệm không có nhóm hàng (tiệm xôi) dùng hằng số trung tính.
- **Logic thuần trong `cityShopping.ts`**, nhận `state` và `CityMap`, không dùng Phaser; scene chỉ gọi `pickShop` và điều khiển di chuyển.
- **Tính trọng số một lần khi mở màn** (trạng thái game không đổi khi đứng ở bản đồ); giờ mở cửa xét theo đồng hồ hiển thị trên phố.
- **Ghé là trạng thái của `Actor`** (`shop`, `inside`), tái dùng đường đi BFS sẵn có; vào tiệm = ẩn sprite vài giây tại cửa, ra = hiện lại với biểu tượng túi hàng.
- **Không tạo hiệu ứng kinh tế.** Số liệu bán hàng đã có ở `DaySession`; hiển thị không được làm người chơi tưởng doanh thu tăng theo số người vào.

## Risks / Trade-offs

- Nhiều người cùng tới một cửa → chồng sprite: chấp nhận, thời gian ở trong ngắn.
- Người bị ẩn (đêm) đang ở trong tiệm → đặt lại trạng thái khi bị ẩn.
- Hiển thị "đông/vắng" có thể bị hiểu là số liệu thật → chỉ dựa trên hàng đang có và `traffic`, ghi chú rõ trong tài liệu.
