# Rà soát triển khai (26/09/2026, cập nhật sau khi làm phase 2)

Đối chiếu `config.yaml`, toàn bộ `tasks.md` và các capability spec với mã hiện tại. Dấu `[x]` trong task là trạng thái ghi nhận của change, không tự động xác nhận kiểm thử trên thiết bị hay triển khai production.

| Change | Đã đánh dấu | Chưa đánh dấu | Trạng thái tiếp theo |
| --- | ---: | ---: | --- |
| `phase-1-mvp-core-loop` | 44 | 2 | Chưa deploy lên Vercel/cổng game và chưa có phản hồi 3–5 người chơi thật. |
| `self-service-shopping` | 42 | 3 | Core/UI và test tự động đã có; còn kiểm thử trên điện thoại thật và deploy. |
| `add-google-login-cloud-save` | 20 | 20 | Code đăng nhập, đồng bộ, xung đột, tài khoản, lời mời sau ngày 3 đã có; còn Firebase Console, Emulator (máy chưa có Java), đổi máy thật, email liên hệ thật cho `privacy.html`, deploy. |
| `realtime-shared-shop` | 13 | 4 | Đã thêm lệnh phiên chung cho mối sỉ, bán xả, mặc cả, ghi sổ; còn emulator race test, hai phiên trình duyệt, đo quota/latency và deploy. |
| `phase-2-shop-expansion` | 39 | 3 | Core, dữ liệu, UI, camera kệ + "Về quầy", RenderTexture (58–60 FPS với 7 khách trên trình duyệt giả lập), pixel art nội thất và mô phỏng 30 ngày xong. Còn 8.2–8.4 (điện thoại thật, bản lưu người chơi thật, deploy). |
| `phase-3-staff-and-manager` | 38 | 3 | Core và UI đã làm; còn đo hiệu năng / chơi trên điện thoại thật và deploy, phản hồi production. |
| `phase-4-events-food-branches` | 32 | 9 | Đang triển khai theo yêu cầu tiếp tục dù các kiểm thử thiết bị/deploy của phase 3 còn mở; core lịch, sự kiện, bếp, truyện, chi nhánh và danh hiệu đã có một phần. |

## Kiểm tra trong repo

- Vitest: 277/277 test qua; có kiểm thử lịch, EffectStack, migrate v4→v5, công thức, nhiệm vụ tuần và quà tuần, giao đơn tiệc, xe chuyển hàng giữ hạn dùng, lưới riêng cho từng chi nhánh, mục tiêu truyện, chi nhánh và thử việc đầu bếp.
- `npm run build` qua (TypeScript + Vite + PWA); `npm run validate:events` và `npm run validate:recipes` đều qua.
- `npm run playtest -- 30 5`: người chơi dùng "Gợi ý" lên L9 ở ngày ~21–22 (mục tiêu 20–30), hàng tươi hỏng 7–9% (mục tiêu < 10%), lãi ròng dương.
- Chơi thử trình duyệt ở khung 375×812 giả lập: migrate bản v2 L7, mở đất, mua/kéo/xoay nội thất, chặn lối đi bị từ chối, nhập hàng, bán xả, mặc cả, ghi sổ, tổng kết và các màn Kho/Giá/Sổ nợ/Nhiệm vụ; ván mới L1 vẫn như giai đoạn 1. Chưa đo 60fps hay thử trên điện thoại thật.

## Việc cần làm tiếp

1. Cloud-save: cài Java + Firebase CLI để chạy test quy tắc bằng Emulator; cấu hình Firebase/OAuth; điền email liên hệ thật vào `public/privacy.html`; thử đăng nhập trên iOS Safari / Chrome Android / Messenger / Zalo.
2. Chơi thử giai đoạn 1b + 2 trên điện thoại thật, đo lại hiệu năng trên máy thật, lấy phản hồi và deploy (phase 1 11.3–11.4, self-service 9.6b, phase 2 8.2–8.4).
3. Phase 3: đã hoàn tất task code và cân bằng; còn 4.3 (hiệu năng trên điện thoại tầm trung), 9.3 (chơi thử các màn quản lý trên điện thoại thật), 9.4 (deploy và thu phản hồi). Chưa đánh dấu các mục này hoàn thành.

Không đánh dấu hoàn thành các task yêu cầu thiết bị thật, Console, Emulator hoặc deploy dựa trên test mô phỏng/trình duyệt cục bộ.

## Cập nhật phase 3 (26/09/2026)

- Đã tích hợp thu nhập offline khi nhấn Chơi tiếp, dùng giờ máy chủ khi có tài khoản và màn “Trong lúc bạn vắng mặt…”; thu nhập được lưu khi đã xử lý ít nhất một ngày game để thời gian vắng ngắn được cộng dồn.
- Mặt tiền tiêu đề đổi nhãn thành “MINI MART ĐẦU HẺM” sau khi mở Đất D. Màn Sắp xếp giải thích rõ khi thiếu Đất D hoặc đã đạt giới hạn món nội thất.
- Rà giao diện bằng trình duyệt cục bộ ở viewport 375×812 được; chỉ kiểm tra được màn tiêu đề vì bản lưu trong trình duyệt không có tiến trình phase 3. Các màn quản lý cần chơi thử trên điện thoại vẫn để mở.

## Cập nhật phase 4 (26/09/2026)

- Đã đánh dấu 32/41 task: save v5/migrate và giới hạn bản lưu dưới 1 MB; lịch 12×10, mùa, HUD/màn Lịch, EffectStack; scheduler và validator sự kiện; 5 sự kiện mùa đủ hàng/trang trí/nhiệm vụ/hội thoại; 6 sự kiện ngẫu nhiên; máy phát điện/cúp điện; tiến độ sự kiện; hiệu ứng mưa/cúp điện/trang trí theo tháng; dữ liệu và menu công thức; chế biến trừ nguyên liệu, chất lượng theo mini-game; mini-game xúc xích canh kim, mì ly rót nước, bánh mì ráp theo thứ tự, trứng luộc canh giờ; thành phẩm hết hạn; Đất E/F/nội thất; AI Đầu bếp/Pha chế và miễn lương thử việc đầu bếp; màn Hành trình; các chương đối thủ (10 ngày, sao/khách quen), bà thăm tiệm và mở chuỗi; nhiệm vụ tuần, tab nhiệm vụ sự kiện, đơn tiệc; bản đồ/mở/ghé chi nhánh với lưới mặc định mỗi khu, AI Quản lý và mô phỏng thu nhập theo lịch sử; xe chuyển hàng tới sáng hôm sau giữ hạn dùng; tổng kết từng tiệm/tổng chuỗi; danh hiệu sau L35; tài liệu thêm sự kiện JSON.
- Thêm 9 công thức cùng nguyên liệu, màn Bếp & quầy nước, menu món, bước chế biến tương tác và đưa thành phẩm vào quầy. Thành phẩm có thể được khách gọi, tính vốn theo nguyên liệu và hỏng cuối ngày.
- Thêm nội dung chương truyện, sự kiện đối thủ −15% khách trong mười ngày, bản đồ ba khu chi nhánh, switch cửa hàng với kho/nhân viên riêng và tiền/level dùng chung; mô phỏng thu nhập chi nhánh từ lịch sử lãi gần đây.
- Sprite cho nội dung phase 4 hiện đang mượn hình pixel art có sẵn đúng footprint; cần vẽ sprite riêng và kiểm tra thị giác. Chưa chơi thử các màn mới trên trình duyệt hoặc điện thoại thật.
- Còn 9/41 task: tái cấu trúc mọi hệ thống nhận storeId; kiểm thử/phát hành 4a; biến thể công thức và yêu cầu món của khách; sổ công thức phủ trong lúc pha chưa có; bàn ghế/khách ngồi/dọn bàn; cân bằng/phát hành 4b; mô phỏng 120 ngày/4 tiệm; kiểm thử điện thoại và phát hành 4c. Mini-game pha chế hiện có thao tác thêm nguyên liệu theo thứ tự rồi khuấy/lắc/xay. Không tính build/test local là đã kiểm thử điện thoại hoặc phát hành.

## Cập nhật phase 4 bổ sung (26/09/2026)

- Chuyển hàng chi nhánh dùng lô FEFO, phí vận chuyển, giao vào `holding` của đích ngày kế tiếp; giữ hạn dùng; có test cho nhiều hạn dùng và lưu/snapshot. Mỗi khu cũng có layout mặc định riêng trên lưới 8×8.
- Màn tổng kết có hộp báo cáo từng tiệm và tổng chuỗi dựa trên lịch sử ngày gần nhất.
- `branches.json` định nghĩa ba lưới nội thất ban đầu riêng; mỗi cửa hàng mới dùng layout theo khu và giữ cửa ra vào thông thoáng.
- Tab nhiệm vụ sự kiện hiện hiển thị tiến độ nhiệm vụ và mốc thưởng của sự kiện đang chạy. Nhiệm vụ tuần L27 rút ổn định 3 mục tiêu mỗi 7 ngày, tích lũy số liệu qua ngày và trao hộp quà khi nhận đủ. Đơn tiệc có thể nhận/từ chối, có hạn 1–2 ngày, cần đủ hàng từ kho/kệ/quầy, trả tiền theo số lượng +30% và tăng thân thiết khách.
- Validator sự kiện kiểm tra tham chiếu hàng/trang trí/phần thưởng, nhiệm vụ và kiểu hiệu ứng; có hướng dẫn thêm event tại `docs/events-json.md`.
- Màn bán hàng có mưa hoạt động khi chạy sự kiện mưa, lớp tối và nhãn cúp điện, cùng họa tiết mùa được tạo theo lịch tháng hiện tại.
- Mini-game bếp tách xúc xích (canh kim), mì ly (rót tới vạch và chờ), bánh mì (thứ tự nguyên liệu), trứng luộc (canh giờ/vớt). Mini-game đồ uống thêm nguyên liệu theo công thức rồi có thao tác khuấy/lắc/xay.
- Kiểm tra: TypeScript, Vite/PWA build, Vitest 277/277, `validate:events` và `validate:recipes` đều qua. Chưa chơi thử các màn mới trên trình duyệt/điện thoại thật.
