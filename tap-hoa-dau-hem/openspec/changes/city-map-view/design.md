## Context

`BranchesScene` liệt kê chi nhánh bằng thẻ cuộn. Game chạy Phaser 3 với camera chính zoom cố định `ZOOM = 2` và canvas logic `W×H`. Chi nhánh định nghĩa trong `branches.json`; logic ghé/mở nằm ở `core/branches.ts`.

## Goals / Non-Goals

**Goals:**
- Bản đồ dựng được bằng Tiled, đọc bằng cùng loader mà Phaser dùng (`Formats.TILED_JSON`).
- Thêm khu/cửa hàng mới chỉ bằng dữ liệu (thêm lô đất + bản ghi chi nhánh).
- Kéo/thu phóng mượt, chỉ vẽ phần nhìn thấy.

**Non-Goals:**
- Nhân vật đi bộ ngoài phố, NPC, thời tiết đầy đủ (giai đoạn sau).
- Thay đổi cách ghé/mở/vận chuyển của chi nhánh.
- Vẽ lại đồ họa bằng tài nguyên ảnh thật.

## Decisions

- **Tiled JSON làm nguồn sự thật.** File có `layers` (`ground`, `objects` là tilelayer; `lots` là objectgroup) và `tilesets` nhúng với thuộc tính ô (`blocked`). `scripts/make-city-map.ts` sinh file khởi đầu; sau này có thể sửa trực tiếp bằng Tiled. Lô đất dùng thuộc tính tùy chỉnh `storeId` (`main`, id chi nhánh, hoặc rỗng = đất trống) và `door` (ô cửa).
- **Tileset sinh bằng canvas lúc chạy**, một dải ô 16×16 (khớp `tilewidth`), để không cần tài nguyên ảnh và vẫn cùng phong cách pixel của game. Thay bằng ảnh thật sau này chỉ cần đổi khóa texture.
- **Hai camera.** Camera thế giới zoom bước nguyên (2×, 3×, 4× kích thước gốc) với giới hạn cuộn theo bản đồ; camera UI cố định `ZOOM` để thanh tiêu đề và bảng thông tin không bị co giãn. Mỗi camera bỏ qua đối tượng của camera kia.
- **Tòa nhà là sprite, không phải ô.** Kích thước theo lô đất; màu mái theo `kind` chi nhánh; biển hiệu là emoji của chi nhánh. Lô khóa (chưa đủ level) hiện xám kèm nhãn "Mở ở Lxx".
- **Logic thuần ở `core/cityMap.ts`** (parse, validate, `lotAt`, `clampScroll`) để test bằng Vitest không cần Phaser.
- **Giữ `BranchesScene`** cho gửi hàng và danh sách; bảng thông tin trong `CityScene` gọi lại `visitStore`/`openBranch` như cũ.

## Risks / Trade-offs

- Chảy viền ô khi zoom không nguyên → chỉ cho phép zoom nguyên, tắt làm mịn.
- Kéo bản đồ dễ nhầm với chạm vào tòa nhà → chỉ tính là chạm khi con trỏ dịch < 8 px (cùng ngưỡng với `ScrollArea`).
- Canvas texture tốn bộ nhớ nếu vẽ nhiều tòa → dựng theo `kind` + kích thước rồi dùng lại.
- Đồ họa sinh bằng code khó đạt độ tinh xảo của tài nguyên vẽ tay → chấp nhận cho lát cắt đầu, giao diện tách khỏi dữ liệu nên thay được.
