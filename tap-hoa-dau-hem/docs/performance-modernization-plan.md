# Kế hoạch nâng cấp hiệu năng và khả năng mở rộng

## Mục tiêu

Giữ phản hồi thao tác mượt khi số khách, nội thất, dữ liệu lưu và số màn tăng lên; chỉ thêm hạ tầng khi số đo cho thấy lợi ích. Không đổi luật mô phỏng, cân bằng hay định dạng save nếu không có migration được duyệt riêng.

## Kế hoạch theo giai đoạn

### 0. Lập đường cơ sở

- Dùng overlay `?perf=1` hiện có để đo frame pacing, p99, frame trên 33/50 ms và thời gian `sim/map/ui/actors`.
- Bổ sung số đo thời gian nén/giải nén save; kiểm tra ở save thường và save lớn.
- Ghi thiết bị, viewport, DPR, renderer, scene và trạng thái tải trong mọi phép so sánh.
- Chạy mỗi cấu hình nhiều lượt; so sánh median và p95, không kết luận từ một mẫu ngắn.

### 1. Chuyển tác vụ độc lập khỏi main thread

- Dùng Web Worker cho JSON/LZ nén và giải nén save cloud; giữ fallback tương thích khi Worker lỗi hoặc không có.
- So sánh thời gian hoàn tất và độ trễ frame trong lúc tác vụ chạy.
- Chỉ chuyển mô phỏng ngày/tìm đường/phân tích sang worker nếu profiler cho thấy tác vụ chiếm đáng kể ngân sách frame. Không để worker sửa trực tiếp object Phaser hoặc trạng thái game đang chạy.

### 2. Tối ưu đường nóng sau khi đo

- Ưu tiên giảm cập nhật UI không đổi, tạo/hủy object lặp, tính lại dữ liệu dẫn xuất và vẽ ngoài viewport.
- Dùng dirty flags, cache, object reuse hoặc batching theo đúng hệ thống được profiler xác định.
- Giữ benchmark gameplay với cùng seed để bảo đảm thay đổi trình bày không làm đổi kết quả mô phỏng.

### 3. Chuẩn hóa ranh giới hệ thống

- Dần tách lệnh/trạng thái nghiệp vụ khỏi scene; scene gửi intent và render state, không sở hữu luật chơi.
- Đưa layout, navigation, modal, loading/error/empty states vào component dùng chung theo từng lát màn.
- Không viết lại toàn bộ Phaser hoặc migrate framework trong một đợt.

### 4. Lưu trữ theo đúng vai trò

- `localStorage`: save cục bộ hiện tại và dữ liệu nhỏ cần đọc đồng bộ lúc khởi động.
- Firestore/Firebase: bản save đồng bộ giữa thiết bị khi người chơi đăng nhập.
- IndexedDB: chỉ thêm cho cache, hàng đợi offline, archive hoặc lịch sử lớn cần truy vấn bất đồng bộ; không lưu thêm bản sao save chính nếu chưa có yêu cầu cụ thể.
- Nếu chuyển save chính sang IndexedDB, trước tiên phải đổi boot/load/save sang async có migration một lần, checksum/backup, xử lý quota và fallback; giữ Firebase là đồng bộ cloud.

## Tiêu chí chấp nhận

- Build và toàn bộ test qua.
- Mô phỏng cùng seed cho kết quả giống trước.
- Save cũ tải được; lỗi worker/IndexedDB không làm mất bản local.
- So sánh cùng thiết bị/cùng scene/cùng trạng thái; báo median và p95 cho frame interval, thao tác lưu và giải nén.
- Không đánh dấu đạt hiệu năng điện thoại khi chưa đo trên điện thoại mục tiêu.

## Thực hiện trong lượt này

- Đã có Web Worker thử nghiệm cho nén/giải nén cloud save với fallback.
- Overlay `?perf=1` hiện thêm thời gian hoàn tất nén/giải nén, kích thước chuỗi và mode (`worker`/`fallback`). Mở `?perf=1&save-worker=0` để ép fallback và so cùng save; backup code là luồng có thể đo mà không cần tài khoản cloud.
- Chưa thêm IndexedDB vì save chính hiện nhỏ, cần đọc đồng bộ ở boot, và đã có localStorage + Firebase; thêm bản sao IndexedDB lúc này sẽ tạo thêm trạng thái đồng bộ, không cải thiện đường chơi đã được đo.

## Kết quả baseline trình duyệt (29/09/2026)

- Phép đo dùng Codex In-app Browser trên Windows desktop, URL local Vite, WebGL; viewport thực tế đọc được là 677×312 CSS px, DPR 1.2 (màn hình vật lý 1920×1080). Profile save max đã nạp; scene `Title`; mỗi lượt đo khoảng 5 giây FPS. Đây không phải phép đo trên điện thoại hay scene Shop.
- Harness `?perf=1&save-bench=1&simulate=max` chạy 6 mẫu có tính thời gian sau 1 lượt warm-up cho mỗi payload, kiểm tra round-trip; chạy ba lượt cho mỗi chế độ. Payload hiện tại khoảng 31 KB; payload stress tổng hợp (30 ngày analytics, 900 log, 120 SKU) khoảng 69.7 KB. Không ghi vào save.
- So sánh p50 mỗi lượt (ms), theo thứ tự compress/decompress; đây là median của ba p50, trong ngoặc là dải thấp–cao giữa ba lượt:

| Payload | Fallback main thread | Worker |
| --- | --- | --- |
| Save hiện tại ~31 KB | 42.9 / 25.9 (42.9–64.2 / 25.9–35.0) | 37.3 / 15.2 (32.9–48.3 / 8.4–19.7) |
| Stress tổng hợp ~69.7 KB | 67.3 / 27.5 (67.3–73.2 / 26.2–27.5) | 63.5 / 14.9 (61.0–130.9 / 14.3–31.2) |

- Kết quả chỉ gợi ý worker giảm độ trễ giải nén trong những lượt này; nén stress có biến thiên lớn và một lượt worker chậm (p50 130.9 ms). Mỗi phép đo chỉ có 6 mẫu timed, nên đây là số sơ bộ, không phải benchmark kết luận hay bảo đảm cải thiện gameplay.
- FPS Title dao động khoảng 33.2–37.8 TB giữa các cửa sổ ngắn, và số khung >33 ms thay đổi rõ giữa lượt. Harness chưa chạy khi Shop đông khách; thêm benchmark worker có thể tự ảnh hưởng frame. Không dùng các số này làm cổng hiệu năng Shop/top-down hay điện thoại.
- Kết luận giai đoạn 0: đã có đường đo save và ghi lại baseline sơ bộ. Chưa hoàn tất baseline frame pacing theo yêu cầu: cần cùng save/cùng thiết bị, Shop đông khách, nhiều viewport ngang, và điện thoại mục tiêu. Chưa có cơ sở chuyển mô phỏng sang Worker hoặc thêm IndexedDB.

## Tối ưu đầu tiên sau profiling (29/09/2026)

- Chạy save mô phỏng max trong Shop nhìn từ trên xuống trên cùng In-app Browser desktop/WebGL (1920×1080 vật lý, DPR 1; game canvas chiếm gần hết cửa sổ). Ở thời điểm quan sát có 87 khách đã phục vụ và 1 khách chờ; số khách đang hiện thay đổi theo tiến trình mô phỏng. Sau khi bỏ qua khởi tạo, các cửa sổ ngắn ghi FPS ~32.7, `sim/map/ui/actors` khoảng 0.8/0.6/1.6/0.0 ms; đây là một lần đo tương tác, không phải benchmark lặp chuẩn hóa hoặc máy mục tiêu.
- Profile không chỉ ra mô phỏng ngày là nút nghẽn ổn định ở trạng thái này. Code inspection phát hiện khay tiền (`trayChanged`) trước đây hủy rồi tạo lại các Container/Graphics/Text cho tối đa 8 tờ. Đã chuyển sang pool tối đa 8 Container; đổi hình/chữ theo mệnh giá và ẩn phần tử dư. Không đổi luật bán hàng và chỉ áp dụng ở luồng hiển thị Shop.
- Cần benchmark A/B có thể tái lập và điện thoại thật để định lượng FPS/GC trước khi coi mức cải thiện là đáng kể. Nếu còn hitch, bước tiếp theo là ghi riêng scene construction/frame long tasks và đo customer/map workloads có cùng seed.

## Đo lõi mô phỏng không giao diện (29/09/2026)

- Công cụ: `npm run bench:sim -- [ngày] [lượt]` (`scripts/bench-sim.ts`). Hồ sơ max, seed cố định theo ngày, 1 lượt khởi động JIT rồi đo; in p50/p95/p99/max mỗi `DaySession.tick` và chữ ký kết quả (tiền, level, số khách) để kiểm tra tối ưu không đổi mô phỏng. Chữ ký giống nhau giữa các lượt và trước/sau tối ưu: `money=30464400 level=35 served=768`.
- Kết quả trên Node 20, máy dev (không phải điện thoại; có nhiễu do máy đang chạy tác vụ khác): tick p50 ≈ 0.04 ms, p95 ≈ 0.45–0.6 ms, p99 ≈ 0.8–1.3 ms, max 3–16 ms giữa các lượt (ngân sách khung 60 fps là 16.7 ms). Một ngày mô phỏng đủ ~2100 tick ≈ 200 ms ("Bỏ qua ngày"). `endDay` ≈ 0.7 ms, `startNextDay` ≈ 2.5 ms, serialize save ~270 KB ≈ 3 ms.
- Kết luận: mô phỏng ngày không phải nút nghẽn ở khối lượng này, **chưa có cơ sở chuyển sang Worker** (đúng với kết luận giai đoạn 1 ở trên). Cần đo lại khi số khách, số tiệm hoặc số SKU tăng hẳn.
- Điểm nóng tìm được bằng CPU profile: `checkCart` (gọi trong vòng lặp nhập hàng và mỗi lần chạm +/-) tốn 0.2–0.65 ms/lần vì `warehouseCellsUsed` sao chép bảng tồn hai lần và dựng Set món mở khóa cả khi giỏ rỗng. Đã bỏ bản sao thừa và bỏ dựng Set khi giỏ rỗng: micro-benchmark 0.217→0.16 ms (giỏ 1 dòng), 0.365→0.165 ms (10 dòng), 0.657→0.52 ms (200 dòng). Chi phí cố định còn lại chủ yếu ở `unlockedProducts`.
- Chưa làm: các vòng lặp gọi `checkCart` từng đơn vị (auto-restock, gợi ý nhập) vẫn O(n²) theo số đơn vị; chỉ nên tối ưu nếu đo trên màn thật cho thấy khựng khi mở màn Nhập hàng.
