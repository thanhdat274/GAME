## Bối cảnh và hiện trạng

- Dự án dùng Vite, TypeScript, Phaser 3; `src/core` giữ logic thuần, scene và `src/ui` trình bày/nhận input.
- `src/ui/theme.ts` hiện định nghĩa `W = 360`, `H = computeGameHeight()` và `ZOOM = 2`; camera và nhiều scene đặt đối tượng trực tiếp theo W/H. H dọc thay đổi theo viewport, nhưng chiều rộng logic vẫn cố định.
- `src/main.ts` khởi tạo Phaser bằng `Scale.FIT`. `index.html` hiện bật `#rotate` trên màn ngang của thiết bị cảm ứng. `ShopScene` có listener `thdh-orientation` để xử lý tình huống này.
- Màn tiệm có sẵn sơ đồ tiệm và `LiveMap` từ trên xuống; đó là nền tảng phù hợp để làm vùng chơi trung tâm rộng hơn. Tuy nhiên, không được mặc định rằng mọi màn quản lý đều đã responsive.
- Game hỗ trợ save cục bộ, cloud và phiên chơi chung. Thay đổi layout không được chạm vào logic đồng bộ hoặc runtime snapshot.

### Kiểm kê phụ thuộc W/H cố định (task 1.1)

`src/ui/theme.ts` xuất khung logic cố định; `src/main.ts` khởi tạo Phaser theo khung này và `Scale.FIT`. Rà các import `W`/`H` cho thấy các scene sau có tọa độ hoặc vùng cuộn được dựng từ khung đó:

| Nhóm | Scene / component | Rủi ro khi viewport đổi |
|---|---|---|
| Gameplay và pha ngày | `ShopScene`, `MorningScene`, `SummaryScene`, `DiningScene`, `KitchenScene`, `RestockScene` | HUD, playfield, modal, mini-game và footer có tọa độ cố định; Shop giữ phiên và cần reflow tại chỗ. |
| Bản đồ / bố trí | `StoreMapScene`, `BuildScene`, `DecorScene`, `WarehouseScene` | Mặt nạ cuộn, vùng kéo/chọn và camera phụ thuộc bounds dựng ban đầu. |
| Quản lý / điều hướng | `AnalyticsScene`, `BranchesScene`, `CalendarScene`, `HowToScene`, `InternalScene`, `LedgerScene`, `PrestigeScene`, `PricesScene`, `QuestsScene`, `ReviewsScene`, `RulesScene`, `ScheduleScene`, `StaffScene`, `StoryScene`, `TaxScene`, `TitleScene` | Phần lớn vẽ một lần trong `create()`; theo D3 có thể restart khi đổi profile sau khi giữ trạng thái tab/cuộn/mục chọn. |
| Thành phần dùng chung | `hud`, `page`, `shelves`, `liveMap`, `scroll`, `widgets`, `art`, `backupCode`, `levelRoadmap` | Có bounds, hit area hoặc nội dung bake từ W/H lúc khởi tạo; cần cấp descriptor cho từng lát chuyển. |

Phân loại này dựa trên import và điểm dựng tọa độ hiện tại; không đồng nghĩa toàn bộ scene đã được chuyển sang layout descriptor.

## Mục tiêu thiết kế

1. Một trạng thái game duy nhất; hướng màn hình chỉ chọn cách trình bày.
2. Giữ trải nghiệm dọc hiện có làm chuẩn hồi quy, không tự ép khóa hướng thiết bị.
3. Bản ngang ưu tiên quan sát thế giới tiệm và truy cập nhanh vào thông tin cần thiết.
4. Duy trì độ nét pixel art, vùng bấm cảm ứng và khả năng đọc trên laptop nhỏ.
5. Tái sử dụng component/layout primitives; tránh tạo hai bản logic cho mỗi scene.

## Bố cục mục tiêu

### Điện thoại dọc

Giữ nguyên bố cục dọc hiện tại: HUD, cảnh, bảng thao tác và cách cuộn. Chỉ sửa lỗi hồi quy cần thiết do bộ chọn layout/resize mới.

### Điện thoại ngang

- Dải trên: ngày/giờ, tiền, sao và tạm dừng; giới hạn thông tin ở trạng thái quan trọng.
- Trung tâm: khu chơi rộng, ưu tiên mặt bằng và nhân vật/khách; các bảng phủ chỉ mở khi thao tác cần chúng.
- Cạnh phải hoặc drawer: nhiệm vụ, đơn hàng và trạng thái tiệm; cho phép thu gọn khi viewport thấp.
- Dải dưới: nhóm lối tắt có nhãn/icon rõ ràng (Tiệm, Kho, Nhiệm vụ, Quản lý); nút chạm không nhỏ hơn chuẩn hiện hành.
- Không để HUD che cửa/kệ/quầy hoặc vùng chạm trong gameplay; cân nhắc safe-area của tai thỏ và thanh điều hướng.

### Desktop

- Dùng vùng chơi trung tâm và giới hạn chiều rộng nội dung để pixel art không bị kéo méo.
- HUD và điều hướng có thể đặt ở hai cạnh khi viewport đủ rộng; ở cửa sổ hẹp, chuyển về cấu hình ngang gọn.
- Hỗ trợ click, hover có ích, wheel cho vùng cuộn/zoom phù hợp, và các phím tắt không xung đột nhập liệu.
- Không yêu cầu toàn màn hình; responsive khi resize trình duyệt.

## Nguyên tắc cảm hứng từ Stardew Valley

- Thế giới là tâm điểm: vùng chơi chiếm ưu tiên thị giác, thông tin phụ không phủ kín màn hình.
- Thanh truy cập nhanh: nhóm lối tắt nhất quán, có thể thao tác nhanh và dễ nhận diện. Bối cảnh tạp hóa dùng lối tắt cho Tiệm/Kho/Nhiệm vụ/Quản lý thay vì sao chép hotbar nông cụ.
- HUD theo ngữ cảnh: giữ ngày/giờ/tiền/trạng thái cần ra quyết định; thông tin dài nằm trong màn/tab tương ứng.
- Quản lý theo tab/bảng: gom kho, nhân viên, lịch và sổ sách vào luồng dễ tìm, tránh nhồi hết vào HUD.
- Nhịp ấm áp, pixel art và các tấm bảng có cảm giác thủ công phải thống nhất với bảng màu gỗ/kem hiện có của Tạp Hóa Đầu Hẻm.

## Quyết định kiến trúc

### D1. Chọn layout từ viewport, không từ save

Tạo một bộ phân loại thuần/nhẹ dựa trên kích thước vùng `#game` thực tế (sau safe-area), với ba profile: `portrait`, `landscape-compact`, `landscape-wide`. Điểm gãy chính xác được hiệu chỉnh khi dựng prototype; hướng màn hình là tín hiệu, nhưng viewport khả dụng quyết định profile. Không ghi profile vào GameState/localStorage.

### D2. Layout descriptor dùng chung

Tạo module trình bày (ví dụ `src/ui/layout.ts`) cung cấp profile, vùng chơi, bounds và tiện ích đặt/ẩn/collapse vùng phụ. Scene dùng descriptor và vẫn sở hữu nội dung riêng. Không đưa layout logic vào `src/core`.

### D3. Thay đổi kích thước khi đang chơi

Resize/orientation cập nhật Phaser scale/camera và bố cục scene đang active mà không tạo DaySession mới, pause/resume mô phỏng, hoặc phát lệnh gameplay. Cần rà vòng đời listener để không đăng ký trùng.

Chia scene làm hai nhóm theo việc có giữ phiên hay không:

- **Scene giữ phiên** (Shop, và Cook/Restock/Kitchen khi mở từ Shop trong giờ bán): MUST reflow tại chỗ (reposition/redraw), không `scene.start`/`scene.restart`.
- **Scene không giữ phiên** (Morning, Summary, Title và các màn quản lý như Kho, Giá, Sổ, Thuế, Nhiệm vụ, Nhân viên...): MAY `scene.restart()` với cùng dữ liệu khởi tạo khi đổi profile. Trước khi restart phải giữ lại trạng thái trình bày cần khôi phục (tab đang mở, vị trí cuộn, mục đang chọn) nếu có; không gọi `persist()` hay đổi GameState chỉ vì đổi profile.

Cách này tránh phải viết hàm reflow riêng cho khoảng 20 màn quản lý dựng tọa độ một lần trong `create()`.

Ghi chú kỹ thuật: đổi `export const W/H` trong `theme.ts` thành `export let` (cập nhật qua một hàm set duy nhất) để các module đang `import { W, H }` tự nhận giá trị mới nhờ live binding của ES module. Những chỗ đã dùng W/H để vẽ lúc dựng (ví dụ `fillRect(0, 0, W, H)`, mặt nạ `ScrollArea`) vẫn phải được vẽ lại hoặc restart theo quy tắc trên.

### D4. Tách vùng chơi và lớp HUD

Bản ngang tổ chức thành các lớp hiển thị có bounds: header, playfield, contextual rail/drawer, bottom shortcuts. Các scene con có thể bỏ qua vùng phụ nếu không áp dụng. Modal và tooltip vẫn nằm trong viewport, có quy tắc ưu tiên z-depth rõ.

### D5. Migration theo lát dọc (vertical slice)

Trước tiên làm shell responsive và màn Shop ở cả portrait/landscape, gồm view ngang hiện tại và top-down. Sau đó chuyển các màn chơi/chuyển pha cốt lõi và cuối cùng các màn quản lý. Không phát hành một shell ngang mà phần lớn điều hướng lại rơi vào cảnh dọc bị thu nhỏ.

### D6. Chuột/bàn phím là adapter trình bày

Bổ sung shortcut/hover mà không sửa API core. Phím không kích hoạt khi focus ở input/textarea/contenteditable; Escape đóng modal trước rồi mới mở/tắt pause. Touch vẫn là input hạng nhất.

### D7. Không đổi save hoặc gameplay

Không thêm trường layout vào `GameState`, không tăng save version, không sửa `src/core`, `src/data`, thuật toán mô phỏng, giá trị cân bằng hay semantics lệnh live shop. Nếu phát hiện một thay đổi layout buộc phải đổi semantics gameplay, tách thành change riêng.

### D8. Profile ngang ưu tiên góc nhìn trên xuống

Góc nhìn trên xuống (change `topdown-store-view`) là giao diện chính của Shop ở profile ngang: lưới mặt bằng có chỗ hiển thị rõ, nhân vật đi lại trong tiệm đúng tinh thần Stardew, và `compare:views` cho thấy hai góc nhìn cân bằng tương đương.

Tách hai khái niệm:

- **Lựa chọn của người chơi:** `settings.viewMode` (`'side' | 'topdown' | undefined`), đã có trong save, chỉ được ghi khi người chơi chủ động đổi góc nhìn (menu Tạm dừng, sơ đồ, sơ đồ trực tiếp).
- **Góc nhìn hiệu lực:** hàm trình bày thuần (ví dụ `effectiveViewMode(profile, viewMode, isLive)` trong `src/ui/layout.ts`), không lưu:
  1. có `G.liveSnapshot` → `'side'` (vị trí người chơi chưa đồng bộ trong phiên chơi chung);
  2. `viewMode` đã được chọn → theo lựa chọn đó;
  3. chưa chọn → profile ngang dùng `'topdown'`, profile dọc dùng `'side'` như hiện tại.

Xoay máy MUST NOT ghi `settings.viewMode`. Vì vậy profile ngang vẫn phải có bố cục cho góc nhìn ngang (dùng cho phiên chơi chung và người chơi đã chọn `'side'`).

Nếu đổi profile làm góc nhìn hiệu lực đổi theo trong giờ bán, chuyển góc nhìn bằng cơ chế sẵn có của `ShopScene.setViewMode` (lớp phủ, không restart), nhưng không ghi vào settings và không hiện lại hướng dẫn nếu đã xem. Nếu hướng dẫn góc trên xuống chưa xem, được phép hiện một lần như bình thường.

Điều kiện tiên quyết: hoàn tất task 4.2 của `topdown-store-view` (đo FPS trên điện thoại tầm trung khi đông khách) trước khi bật mặc định này, vì canvas ngang lớn hơn làm tăng số pixel phải vẽ.

### D9. Tỉ lệ phóng nguyên cho pixel art

`Scale.FIT` với hệ số lẻ (ví dụ 1,37×) làm pixel art nhòe hoặc răng cưa không đều.

- **Desktop (`landscape-wide`, con trỏ chuột):** chọn hệ số phóng nguyên lớn nhất vừa vùng `#game`; phần dư thành viền nền (gỗ/tường theo bảng màu hiện có), căn giữa. Có thể cho phép hệ số lẻ khi hệ số nguyên để lại quá nhiều khoảng trống (ví dụ vùng chơi < 75% viewport), ngưỡng hiệu chỉnh khi prototype.
- **Điện thoại:** chấp nhận hệ số lẻ để lấp đầy màn hình; ưu tiên dùng hết diện tích hơn độ nét tuyệt đối.
- Kiểm tra lại `resolution` của text trong `theme.ts` theo hệ số mới để chữ không mờ và không tốn bộ nhớ texture thừa.

### D10. Bố cục Shop trên xuống ở profile ngang

- **Playfield:** lưới mặt bằng đặt lệch phải trong vùng chơi. Cửa tiệm ở cạnh trái (`land.json › door.x = 0`), nên dải trống bên trái được vẽ thành **vỉa hè và con hẻm** (khách đi bộ ngang qua, xe máy dựng, bảng hiệu tiệm). Khách mới xuất hiện từ mép hẻm rồi đi vào cửa, khách về đi ra hẻm. Phần này chỉ là trình bày: mục tiêu và thời điểm vẫn lấy từ `liveMap`/`DaySession`, không đổi thời gian mô phỏng.
- **Rail phải:** bảng tính tiền của quầy người chơi, hàng chờ, đơn đang nấu và nhiệm vụ trong ngày. Ở `landscape-compact` rail thu thành drawer, còn bảng tính tiền thu thành nút nổi cạnh quầy.
- **Hotbar đáy:** Kho, Nhập hàng, Bếp, Giá, Nhân viên, Sơ đồ, Tạm dừng; mỗi ô có icon, nhãn ngắn và số phím tắt 1–9 trên desktop.
- **Chỉ báo trên thế giới:** viền sáng ô đang trỏ/sắp đi tới; dấu "!" trên kệ hết hàng hoặc có món hết hạn hôm nay; bong bóng nhỏ trên khách sắp bỏ về. Dùng dữ liệu có sẵn, không thêm luật mới.
- **Không khí theo giờ:** lớp phủ màu nhẹ trên playfield theo đồng hồ trong ngày (sáng vàng nhạt, trưa trung tính, chiều cam, tối xanh), độ đậm thấp để không giảm độ đọc; tắt được khi bật chế độ tiết kiệm pin (`powerSaver`).
- **Đồng hồ/lịch:** HUD ngang đặt ngày, mùa, giờ và tiền trong một khung gỗ ở góc phải trên, thay cho dải HUD phẳng của bản dọc.

### D11. Input kiểu Stardew trên desktop

Các adapter dưới đây chỉ gọi lại đúng những hành động mà chạm/click đang gọi (đi tới ô, thao tác tại nội thất, mở màn), không thêm API core:

| Phím / chuột | Hành động |
|---|---|
| `W A S D` / phím mũi tên | Đi từng ô ở góc trên xuống (giữ phím để đi liên tục, tốc độ theo `topDown.playerTilesPerSecond`) |
| `E` / `Space` | Thao tác với nội thất kề bên hoặc đang đối diện (nạp kệ, mở kho, nấu, về quầy) |
| `1`–`9` | Ô hotbar tương ứng |
| `Esc` | Đóng modal/drawer trên cùng; không còn gì để đóng thì mở/tắt Tạm dừng |
| `Tab` | Mở/thu rail thông tin |
| `M` | Mở Sơ đồ tiệm |
| Con lăn | Cuộn `ScrollArea`; trên playfield thì zoom quanh con trỏ (`mapView.zoomAt`) |
| Rê chuột lên kệ/tủ/quầy | Tooltip: tên món, số lượng, giá, hạn dùng (dùng lại nội dung popup của Sơ đồ tiệm) |
| Click ô trống | Đi tới ô (giống chạm) |

Phím di chuyển bị bỏ qua khi đang mở modal, khi focus ở trường nhập liệu, hoặc khi góc nhìn hiệu lực là `'side'`. Ở góc nhìn ngang, `1`–`9`, `Esc`, `Tab` vẫn hoạt động.

### D12. Nhập hàng ở bản ngang

Chỉ đổi cách trình bày và lối vào; luật mua hàng, giá, thời gian giao và việc tiệm tạm dừng khi mở màn Nhập hàng giữ nguyên. Luật "cầm hàng trên tay" và "đặt hàng tại điện thoại" thuộc change riêng `topdown-carry-stock`.

1. **Ô hotbar "Nhập hàng"** (phím `2`; tiệm xôi là "Bếp"/"Nhập nguyên liệu" như nút hiện tại): gọi đúng `ShopScene.openRestock()`/`openKitchen()`; mở được từ bất kỳ đâu. Thay nút 📦 nổi ở cạnh phải của bản dọc; hiệu ứng nhún khi khách hỏi món đã hết (`itemMissing`) chuyển sang ô hotbar này.
2. **Điện thoại bàn cạnh quầy:** vẽ trên quầy ở góc trên xuống (không thêm nội thất vào `furniture.json`, không chiếm ô lưới). Đứng ở quầy rồi bấm `E` hoặc chạm vào điện thoại cũng gọi `openRestock()`. Đây là lối vào thứ hai, không bắt buộc.
3. **RestockScene dạng hộp thoại hai cột** ở profile ngang:
   - cột trái: tab Nhập hàng/Bày kệ, bộ lọc danh mục, danh sách món và mối sỉ;
   - cột phải: giỏ hàng, tổng tiền, số ô kho còn trống sau khi mua, giờ giao dự kiến của từng mối (`deliverMinute`, "giao ngay" nếu `delayDays = 0`), nút Mua;
   - Shop vẫn hiện mờ phía sau (scene Shop đang pause, không ẩn); `landscape-compact` dùng một cột có tab Danh mục/Giỏ.
4. **Giao hàng trong thế giới** (góc trên xuống, dựa trên sự kiện `delivery` và task `receive` có sẵn):
   - xe ba gác của mối dừng ở hẻm (D10) khi có `delivery`, thay hoạt ảnh xe tải của góc ngang;
   - nếu có người nhận task `receive` (nhân viên hoặc người chơi), họ đi ra xe rồi bê thùng vào kệ kho gần nhất (hoặc quầy nếu tiệm chưa có kệ kho); nếu không, thùng tự vào kho như hiện tại;
   - hàng không vừa kho (`held`, nằm trong `state.holding`) hiện thành chồng thùng cạnh cửa, chạm vào xem danh sách;
   - chỉ trình bày: số lượng, thời điểm vào kho và `stowHolding` không đổi.
5. **Nhắc hàng sắp giao:** rail (hoặc HUD ở `landscape-compact`) có dòng "🚚 <mối> giao lúc HH:MM" cho mỗi đơn trong `state.deliveries` của hôm nay, sắp theo giờ; biến mất khi đơn tới.

## Tổ chức scene theo cảm hứng

| Khu vực | Trình bày ngang dự kiến | Tương đồng ở mức nguyên tắc |
|---|---|---|
| Shop | Góc nhìn trên xuống mặc định (D8), hẻm bên trái, bảng tính tiền và nhiệm vụ/đơn ở rail, hotbar đáy (D10) | Thế giới trung tâm, nhân vật đi lại, HUD ngắn gọn |
| Shop (phiên chơi chung / chọn góc ngang) | Kệ nhìn ngang ở giữa, quầy và hàng chờ ở rail | Như trên, nhưng không có nhân vật đi lại |
| Kho/nhập hàng | Hộp thoại hai cột phủ lên tiệm: danh mục/bộ lọc bên trái, giỏ/tổng tiền/ô kho/giờ giao bên phải; mở từ hotbar hoặc điện thoại bàn (D12) | Mua hàng ở quầy của cửa hàng, hàng giao tới tận nơi |
| Sắp xếp/trang trí | Mặt bằng rộng, công cụ chọn/xoay/đặt ở cạnh | Không gian thao tác là trọng tâm |
| Nhiệm vụ/lịch/sổ sách | Thanh tab, bảng nội dung rộng, điều hướng nhất quán | Thông tin được chia nhóm dễ tìm |
| Điện thoại ngang thấp | Thanh trên gọn, playfield ưu tiên, rail thành drawer | HUD tự thu gọn theo không gian |

## Rủi ro và cách giảm

- **Nhiều scene tọa độ cứng:** chuyển từng nhóm, dùng prototype làm chuẩn và lưu kiểm tra ảnh theo kích thước.
- **Canvas fit làm chữ/icon quá nhỏ trên desktop:** đặt giới hạn upscale, kiểm tra độ nét và vùng chơi trên DPR 1/2.
- **Viewport ngang thấp:** profile compact, drawer thu gọn, scroll nội bộ và tránh che playfield.
- **Resize giữa phiên bán:** không tái tạo session; xác nhận bằng kiểm tra phiên/đồng hồ/khách/giỏ giữ nguyên.
- **Shop canvas hiện có nhiều nút tọa độ cố định:** phân chia rõ playfield và vùng điều khiển trước khi di chuyển nút.
- **Save/cloud/realtime regressions:** kiểm chứng diff không đổi schema/core và chơi thử layout khi local/cloud/live state đang hoạt động.
- **Xoay máy vô tình ghi `settings.viewMode`:** góc nhìn hiệu lực là hàm thuần có test; chỉ đường thao tác chủ động của người chơi được ghi settings (D8).
- **FPS góc trên xuống trên canvas ngang:** chờ số đo thật của `topdown-store-view` 4.2; lớp phủ theo giờ và cảnh hẻm tắt khi bật tiết kiệm pin hoặc khi FPS thấp.
- **Restart màn quản lý làm mất vị trí cuộn/tab:** lưu trạng thái trình bày tối thiểu trước restart (D3); kiểm tra từng màn khi chuyển.
- **Mặt bằng 10×10 vuông trong khung 16:9:** phần ngang dư dùng cho hẻm (D10) và rail; mặt bằng lớn hơn và camera đi theo nhân vật thuộc `topdown-store-view` 5.2, không làm trong change này.

## Phụ thuộc

- `topdown-carry-stock` (change sau): luật cầm hàng trên tay và đặt hàng tại điện thoại; dựa trên điện thoại bàn, hotbar và cảnh giao hàng của D12.
- `topdown-store-view`: dùng lại sơ đồ chơi, `mapView`, `liveMap`, luật rời quầy. Task 4.2 (đo FPS thật) là điều kiện trước khi bật D8. Task 5.2 (mặt bằng lớn, camera theo nhân vật) và 5.4 (đồng bộ vị trí người chơi trong phiên chung) sẽ tận dụng thêm không gian ngang nhưng không chặn change này.

## Tham khảo

- Stardew Valley Wiki, Inventory: hàng inventory và hotbar cung cấp truy cập nhanh tới đồ dùng: https://stardewvalleywiki.com/Inventory
- Stardew Valley Wiki, Player Menu: các tab tách inventory, bản đồ, kỹ năng và thông tin người chơi: https://stardewvalleywiki.com/Player_Menu
- Stardew Valley Wiki, Controls: thao tác chuột/bàn phím và các phím tắt: https://stardewvalleywiki.com/Controls
- Dùng làm cảm hứng về phân cấp và tương tác; không dùng screenshot/assets/copy UI làm tài sản sản phẩm.
