## 1. Nền responsive

- [x] 1.1 Kiểm kê import `W`/`H`, phân nhóm scene gameplay, quản lý, bản đồ/bố trí và component dùng chung cùng rủi ro reflow trong `design.md`.
- [x] 1.2 Định nghĩa profile dựa trên kích thước vùng `#game` khả dụng: portrait khi cao ≥ rộng; landscape compact khi rộng < 900 CSS px hoặc cao < 420; còn lại landscape wide. Safe-area đọc bằng `env(safe-area-inset-*)`; `#game` đã inset theo safe-area.
- [x] 1.3 Thêm `src/ui/layout.ts` với profile, bounds header/playfield/rail/drawer/shortcuts và helper lấy layout hiện tại.
- [x] 1.3a Đổi `W`/`H` trong `theme.ts` sang `export let` cập nhật qua một hàm set duy nhất (live binding); rà các chỗ chụp W/H lúc dựng cần vẽ lại.
- [x] 1.3b Thêm hàm thuần `effectiveViewMode(profile, viewMode, isLive)` theo D8 kèm unit test (live → side; đã chọn → theo chọn; chưa chọn → ngang topdown, dọc side).
- [ ] 1.4 Cấu hình Phaser resize theo viewport, camera cập nhật đúng và pixel art giữ tỉ lệ/độ nét; kiểm tra resize cửa sổ liên tục.
- [ ] 1.4a Phóng hệ số nguyên trên desktop theo D9, phần dư là viền nền; hiệu chỉnh ngưỡng cho phép hệ số lẻ; rà lại `resolution` của text.
- [x] 1.5 Bỏ lớp phủ bắt xoay dọc và mã sự kiện orientation chỉ phục vụ việc nhắc xoay; giữ safe-area, background edges và khóa zoom.
- [x] 1.6 Rà listener resize/orientation: Shop chỉ đăng ký một `resize` listener trong `create()`, gỡ ở `shutdown`; listener chỉ đổi góc nhìn hiệu lực khi profile làm thay đổi lựa chọn, không restart/ghi save.
- [ ] 1.7 Cơ chế đổi profile theo D3: scene giữ phiên nhận sự kiện reflow; scene không giữ phiên được `scene.restart()` kèm trạng thái trình bày (tab, vị trí cuộn, mục đang chọn).

## 2. Shell ngang và màn mẫu

- [x] 2.1 Dựng wireframe/palette/spacing cho ngang compact và wide, dựa trên HUD gọn, thế giới trung tâm, rail/drawer ngữ cảnh, lối tắt; dùng nhãn/asset riêng của game.
- [x] 2.2 Cập nhật HUD dùng bounds của profile, đặt ngày/giờ/tiền/trạng thái quan trọng và xử lý notch/safe-area.
- [ ] 2.0 Điều kiện trước: có số đo FPS thật của `topdown-store-view` 4.2; nếu góc trên xuống quá nặng trên điện thoại tầm trung, xử lý trước khi bật D8.
- [x] 2.3 Chuyển Shop sang vùng chơi trung tâm; bố trí lại nút, bảng quầy, live map, top-down map, nhiệm vụ/đơn và modal trong ngang compact/wide.
- [x] 2.3a Bật góc nhìn trên xuống mặc định ở profile ngang qua `effectiveViewMode`; đổi góc nhìn khi xoay giữa giờ bán không ghi `settings.viewMode` và không restart Shop.
- [x] 2.3b Bố cục Shop trên xuống theo D10: lưới lệch phải, rail phải chứa bảng tính tiền/hàng chờ/đơn/nhiệm vụ, hotbar đáy; `landscape-compact` thu rail thành drawer và bảng tính tiền thành nút nổi.
- [x] 2.3c Bố cục Shop góc ngang trong profile ngang (cho phiên chơi chung và người đã chọn `'side'`).
- [x] 2.4 Bảo đảm touch target trên điện thoại ngang, click/hover trên desktop, tooltip/nhãn cho icon và không che lối tương tác của Shop.
- [ ] 2.5 Hỗ trợ đổi hướng/resize ngay trong Shop mà không restart scene/session; rà riêng Shop listener `thdh-orientation` hiện có.
- [x] 2.5a Cảnh hẻm bên trái cửa: vỉa hè, xe máy, bảng hiệu; khách xuất hiện từ mép hẻm rồi vào cửa, về thì đi ra hẻm; chỉ trình bày, không đổi thời gian mô phỏng.
- [x] 2.5b Chỉ báo trên thế giới: viền ô đang trỏ, dấu "!" trên kệ hết hàng/có món hết hạn hôm nay, bong bóng khách sắp bỏ về.
- [x] 2.5c Lớp phủ màu theo giờ trong ngày và HUD đồng hồ/lịch khung gỗ góc phải trên; tắt lớp phủ và cảnh hẻm khi bật tiết kiệm pin.
- [ ] 2.6 Chơi thử Shop dọc/ngang trên save thường, max-level, top-down, góc nhìn ngang hiện có, realtime snapshot nếu khả dụng; ghi lại clipping/overlap.

## 3. Điều hướng và màn gameplay

- [x] 3.1 Xây drawer điều hướng ngang dùng chung có tab nhóm màn; compact và wide cùng dùng drawer, giữ nút quay lại riêng và ẩn drawer khi Shop còn active/paused/sleeping để bảo toàn phiên bán. Đã build/test code; rà trực quan ngang còn thuộc 5.2.
- [x] 3.2 Chuyển Morning, Summary và các luồng mở/đóng từ Shop sang cùng shell mà không đổi thứ tự/gameplay phase.
- [x] 3.3 Chuyển StoreMap/Build sang bố cục ngang chia vùng; Decor/Warehouse dùng page shell, danh sách và bộ lọc theo W/H viewport, giữ các hit-area/kéo thả hiện có. Kiểm tra thiết bị/viewport nằm ở 5.2.
- [x] 3.4 Restock có hai cột wide và tab compact; Kitchen/Cook dùng page shell, mini-game theo H; Dining xếp thẻ hai cột landscape thấp. Điều chỉnh tùy chọn món tránh đè prompt ở ngang. Kiểm tra thiết bị/scroll thực tế nằm ở 5.2.
- [x] 3.4a Ô hotbar Nhập hàng (phím `2`) gọi `openRestock()`/`openKitchen()`; chuyển hiệu ứng nhún khi `itemMissing` sang ô này (D12.1).
- [x] 3.4b Vẽ điện thoại bàn dạng phủ trên mặt quầy trong góc trên xuống; chạm để đi tới quầy rồi mở Nhập hàng, hoặc bấm `E` khi đã ở quầy (D12.2).
- [x] 3.4c RestockScene dạng hộp thoại hai cột ở `landscape-wide`, một cột có tab Danh mục/Giỏ ở `landscape-compact`; Shop hiện mờ phía sau; giỏ hiện ô kho còn trống sau khi mua và giờ giao dự kiến (D12.3).
- [x] 3.4d Xe ba gác dừng ở hẻm khi có `delivery`; người nhận task `receive` đi ra xe rồi bê thùng vào kệ kho/quầy; chồng thùng hàng chờ cạnh cửa, chạm xem danh sách (D12.4). Xác nhận lượng hàng vào kho/hàng chờ giống góc nhìn ngang.
- [x] 3.4e Dòng nhắc tối đa hai đơn kế tiếp "🚚 <mối> giao lúc HH:MM", lấy từ `state.deliveries` hôm nay; tự ẩn khi không còn đơn chờ (D12.5; hiện tạm trên HUD top-down).
- [ ] 3.5 Kiểm tra cửa sổ desktop hẹp: vùng phụ thu gọn được, canvas không crop nội dung thiết yếu.

## 4. Màn quản lý và hoàn thiện desktop

- [x] 4.1 Các màn Quests/Reviews giữ tab-lọc; Analytics/Ledger/Prices/Tax dùng page shell và danh sách/thẻ cuộn theo chiều ngang; Calendar có hai cột riêng cho lịch và hạn/sự kiện để vừa viewport landscape thấp.
- [x] 4.2 Staff/Schedule/Branches/Prestige/Rules/Story/Internal dùng page shell + drawer điều hướng chung; HowTo giữ nội dung 2 cột landscape và dùng cùng drawer. Luồng quay lại/đóng hiện có được giữ.
- [x] 4.3 Thêm các phím tắt desktop đã định nghĩa trong design (D11: `1`–`9`, `Esc`, `Tab`, `M`, con lăn); bỏ qua shortcut khi focus nhập liệu; không thay đổi keyboard behavior của browser khi cần nhập text.
- [x] 4.3a Adapter bàn phím trong `LiveMap`/`ShopScene`: `WASD`/mũi tên gọi lại hit-test ô của chạm; `E`/`Space` tương tác với nội thất ở gần; chỉ bật khi góc trên xuống, bỏ qua trường nhập liệu, modal tạm dừng và live shop.
- [x] 4.3b Tooltip chuột trên kệ/tủ/quầy, dùng lại `fixtureInfo`/giá và nhãn hạn hôm nay từ luồng thông tin Sơ đồ tiệm.
- [ ] 4.4 Hoàn thiện hover/focus/pressed/disabled states, tooltip, focus order cơ bản và độ tương phản nhãn/nút.
- [ ] 4.5 Rà toàn bộ scene để không còn cảnh ngang rơi về canvas dọc bị thu nhỏ hoặc nút nằm ngoài viewport.

## 5. Bảo toàn trạng thái và phát hành

- [x] 5.1 Soát diff: chỉ thay presentation/UI và tài liệu; không đổi `src/core`, `src/data`, cấu trúc/version save, cloud schema hoặc semantics live shop.
- [ ] 5.2 Kiểm tra thủ công dọc 375×812, ngang 812×375, ngang compact 667×375, desktop 1366×768, DPR 1/2 và vùng safe-area.
- [ ] 5.3 Kiểm tra xoay qua lại trong từng pha: Morning, Shop, modal/pause, Summary; xác nhận không mất khách/giỏ/đồng hồ/nội dung đang mở.
- [ ] 5.4 Kiểm tra tải cùng save trên profile khác, local và cloud; xác nhận không migrate hoặc ghi đè tùy chọn layout vào save.
- [ ] 5.4a Xác nhận xoay máy không bao giờ ghi `settings.viewMode`; chỉ thao tác đổi góc nhìn chủ động mới ghi.
- [x] 5.4b `npm run compare:views`: hai góc nhìn cùng seed cho kết quả giống nhau (lãi top-down/side 100.0%).
- [x] 5.5 Build và toàn bộ test dự án qua; kết quả, môi trường, viewport đo và giới hạn còn lại ghi trong `openspec/STATUS.md`.
- [ ] 5.6 Chơi thử trên thiết bị cảm ứng thật và máy tính; tinh chỉnh ngưỡng breakpoint, độ lớn hit area, FPS/độ nét rồi mới đánh dấu hoàn tất.
