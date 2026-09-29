# Rà soát triển khai (cập nhật 27/09/2026)

## Chọn bố cục Dọc/Ngang khi điện thoại khóa xoay (29/09/2026)

- Menu Tạm dừng có nút đổi màn dọc/ngang. Khi iPhone vẫn ở tư thế dọc và khóa xoay, game xoay riêng vùng canvas 90°; chạm nút lần nữa để về dọc. Lựa chọn được lưu cục bộ, không đổi `GameState` hoặc `settings.viewMode`.
- Phaser dùng `setGameSize` cho `Scale.FIT`; Shop dựng lại phần trình bày bằng cùng `DaySession`, giữ ngày/giờ bán và mở lại menu Tạm dừng. Tọa độ chạm được đổi theo canvas xoay.
- Đã thử trong trình duyệt tích hợp với viewport dọc trên desktop: Shop dọc → ngang ảo → dọc, menu và nút chạm hoạt động, không về Title. Chưa xác minh trên iPhone thật, Dynamic Island/safe-area hoặc màn Restock/Kitchen đang phủ Shop.
- Production build qua. Full Vitest 918/919, một benchmark `baristaBrew.test.ts` timeout 5 giây khi chạy toàn bộ; chạy riêng file qua 8/8. Đây không phải test của bố cục.

Đối chiếu `config.yaml`, toàn bộ `tasks.md` và các capability spec với mã hiện tại. Dấu `[x]` trong task là trạng thái ghi nhận của change, không tự động xác nhận kiểm thử trên thiết bị hay triển khai production.

| Change | Đã đánh dấu | Chưa đánh dấu | Trạng thái tiếp theo |
| --- | ---: | ---: | --- |
| `phase-1-mvp-core-loop` | 45 | 1 | 11.3 deploy Vercel + thẻ cổng game. |
| `self-service-shopping` | 42 | 3 | 8.8c, 9.1 điện thoại thật; 9.6b deploy. |
| `add-google-login-cloud-save` | 33 | 12 | Rules đã test bằng Emulator, khách không tải Firebase đã kiểm; còn Console/OAuth (1.1–1.5), email thật (6.4a), đăng nhập/đổi máy/offline trên thiết bị thật (3.3a, 7.1–7.4), deploy (7.6). |
| `realtime-shared-shop` | 14 | 3 | Emulator test callable đạt; còn 4.2 hai phiên trình duyệt + offline, 4.3 quota/latency, 4.4 deploy. |
| `phase-2-shop-expansion` | 41 | 1 | 8.2 điện thoại thật. |
| `phase-3-staff-and-manager` | 39 | 2 | 9.3 điện thoại thật, 9.4 deploy. |
| `topdown-store-view` | 15 | 7 | 4.2–4.4 điện thoại/người chơi/deploy; 5.1–5.4 để cho change sau. |
| `sticky-rice-shop` | 34 | 3 | Còn playtest viewport 375×812 (4.7, 5.6), điện thoại thật và deploy (6.4). |
| `phase-4-events-food-branches` | — | — | Đã lưu trữ (`archive/2026-09-27-…`). |

Tổng còn mở: 32 task (27/09/2026).

## Kiểm tra trong repo

- Vitest hiện có 707 test: lượt full tuần tự qua 706/707; test duy nhất timeout 5 giây ở `tests/phase3.test.ts` (xe đẩy), nhưng chạy riêng qua trong 2.7 giây. Test `yearSimulation` trong lượt này bỏ ngày tối đa 433 ms. Nhóm test tiệm xôi/đơn nội bộ qua 33/33.
- TypeScript, Vite/PWA build, `validate:events` và `validate:recipes` đều qua bằng Node runtime đóng gói. `npm` trực tiếp trả `EPERM` khi kiểm tra `C:\Users\Admin`; các script được chạy bằng binary local/Vite SSR.
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

## Cập nhật sơ đồ tiệm và góc nhìn trên xuống (26/09/2026)

- Change mới `topdown-store-view`: đã đánh dấu 15/22 task.
  - **Sơ đồ tiệm:** xem kệ, giá và kho của mọi tiệm trong chuỗi.
  - **Sơ đồ trực tiếp:** khách và nhân viên đi lại trên sơ đồ trong giờ bán.
  - **Góc nhìn trên xuống để chơi:** chạm ô để đi, tới kệ mới nạp, ở quầy mới tính tiền. Khi có thu ngân, quầy người chơi tạm đóng lúc người chơi rời quầy.
- Kiểm tra:
  - Vitest và build đều qua.
  - `npm run compare:views`: lãi góc trên xuống bằng 99,8–106,7% góc ngang.
  - Chơi thử trên trình duyệt ở khung 375×667.
- Còn mở:
  - Đo FPS trên điện thoại thật.
  - Chơi thử bằng người thật để chỉnh tốc độ đi và hệ số kiên nhẫn.
  - Deploy.
  - Nhóm việc để lại cho change sau: sprite riêng, bản đồ lớn hơn, tránh va chạm, đồng bộ phiên chung.

## Cập nhật kiểm thử Emulator (27/09/2026)

- Thêm `npm run test:emulator` (`tests-emulator/`, cấu hình `vitest.rules.config.ts`): 12 test rules Firestore (save/meta/live/leaderboards) và 10 test callable phiên chung (chưa đăng nhập, mở phiên, lệnh hợp lệ, lệnh trùng, 6 lệnh đồng thời từ hai máy, sai phase, envelope sai, UID khác, pulse). Tất cả 22 test qua.
- Test phát hiện hai lỗi khiến phiên chung không bao giờ mở được trên Firebase thật: GameState có trường `undefined` và mảng lồng mảng (kệ, lưới) mà Firestore từ chối. Sửa: `ignoreUndefinedProperties`, document `live/main` lưu `state`/`dayRuntime` trong chuỗi JSON `payload`, receipt lưu phản hồi dạng chuỗi JSON; client giải mã qua `decodeLiveShopDoc`.
- Bản build production trên trình duyệt: khách ở màn tiêu đề và khi vào chơi chỉ tải `index`, `phaser`, `workbox`, không tải chunk Firebase.
- Vitest 428/428, build web và Functions qua.

## Tiệm xôi — Đợt A (27/09/2026)

- `storeView(state, storeId)` đọc/ghi dữ liệu tiệm không đứng; `takeLots`, `addLot`, `prepareRecipe`, `expirePreparedFood` nhận `StoreData`.
- `shopTypes.json` (`grocery`, `xoi`) + `shopTypes.ts` (`shopTypeOf`, `activeShopType`, `ShopTypeBehavior`); `validate:recipes` kiểm cả shopTypes và `branches.shopType`.
- Bản lưu v6 (`shopType`, `internalOrders`, `recurringOrders`, `soakBatches`, `cookedRice`) + migrate v5→v6, fixture `tests/fixtures/save-v5.json` 3 tiệm.
- Giới hạn chuỗi đọc từ `balance.json › chain.maxStores` = 6. Khu Tiệm xôi đã có trong `branches.json` nhưng khóa bằng tính năng `shop_xoi` (thêm vào L29 ở Đợt B), nên người chơi chưa thấy thay đổi.
- Vitest 441/441, build, `validate:events`, `validate:recipes` qua; chạy bản build ở 375×812 với bản lưu v5 thấy tạp hóa như cũ.

## Tiệm xôi — Đợt B (27/09/2026)

- Dữ liệu: nguyên liệu xôi mở ở L29 (bán cả ở tạp hóa), trà đá, 4 món xôi + 4 món xôi gói, biến thể "Thêm topping" tốn thêm nguyên liệu, thùng ngâm/xửng hấp/quầy xôi, `balance.stickyRice`, L29 thêm `shop_xoi`.
- Core `stickyRice.ts`: ngâm (≥ 6 giờ, chua sau 24 giờ), hấp ra nếp chín (5 phần/kg), giữ nóng 5 giờ, nếp nguội chặn chất lượng, bỏ nếp thừa cuối ngày; `prepareRecipe` lấy `nep_chin` từ mẻ hấp cũ nhất.
- Khách tiệm xôi gọi 1–3 món ở quầy theo đường cong mật độ riêng; 40% ngồi ăn nếu còn bàn sạch và có thể gọi thêm trà đá/sữa đậu nành. Tạp hóa không nấu được xôi.
- UI: màn Bếp xôi (ngâm, hấp, nếp chín, menu), mini-game hấp và gói, nút Bếp xôi trong bảng tạm dừng, Bản đồ mở từ L29, "Ngâm cho mai" ở tổng kết.
- Kiểm tra: Vitest (thêm `tests/stickyRice.test.ts`, gồm một ngày tiệm xôi chạy tự động), build, validator. Trên trình duyệt 375×812 đã xem Bản đồ, Bếp xôi (ngâm thật), mở cửa và mở Bếp giữa giờ bán; trình duyệt nhúng chỉ đạt 1 FPS nên chưa chơi thử mini-game và phục vụ khách thời gian thực (task 3.9 còn mở).
- Khác spec: tiệm xôi mở cùng giờ chung 8h–20h nên cao điểm là 8h–10h thay vì 5h–10h.

## Tiệm xôi — Đợt C (27/09/2026)

- Đặt hàng nội bộ lấy mối từ `shopTypes.json`; hai tiệm giữ kho, kệ và quầy riêng. Nguyên liệu từ tạp hóa tới kho riêng của tiệm xôi vào sáng hôm sau theo FEFO; xôi gói giao vào ô sau quầy riêng của tạp hóa lúc 7h. Báo cáo tính vốn ở tiệm nhận và không trừ tiền chung hai lần.
- Màn Nhập hàng có nút “Hàng nhà mình” ở hàng riêng bên dưới các nút mối sỉ; vào màn nội bộ để đặt một lần/đặt mỗi ngày, xem năng lực làm, số lượng, phí xe và đơn gần đây. Tên các chi nhánh cùng loại được phân biệt.
- Tiệm xôi có quầy trưng bày riêng trong layout mặc định. Món xôi nằm ở quầy tiệm xôi để khách gọi; không cần đặt kệ tạp hóa. Khi chuyển xôi gói, hàng tới quầy sau của tiệm nhận.
- Thợ nấu xôi ưu tiên đơn nội bộ; mô phỏng tiệm vắng chủ ghi số làm/bán/giao/hỏng và cảnh báo nếu thiếu thợ. Giá vốn hàng nội bộ hiện riêng theo tiệm.
- Trình duyệt local xác nhận nút “Hàng nhà mình” mở đúng màn đơn nội bộ; màn này nêu rõ mỗi tiệm có kho/quầy riêng, nguyên liệu vào kho xôi và xôi gói vào quầy sau tạp hóa. Core test đã qua cả hai chiều và kịch bản tạp hóa chạy 3 ngày với xôi vắng chủ, đơn định kỳ tới quầy.
- Đã cập nhật `docs/shop-types-json.md` và bảng trạng thái. Còn 5/37 task: viewport 375×812 (3.9, 4.7, 5.6), cân bằng chuỗi 6.1 chưa đạt mục tiêu, điện thoại thật và deploy (6.4). So sánh mô phỏng/đứng chơi 6.2 đã qua với cùng seed 1010: 181.000đ so với 194.500đ, lệch 6.9%.
- TypeScript, Vite/PWA build, hai validator và 33 test tiệm xôi/đơn nội bộ qua. `npm run playtest` đã được mở rộng; lượt 10 ngày/1 seed hiện báo tỉ lệ lãi xôi/Chợ 577.6%, lãi ròng tăng thêm do đơn định kỳ -71.0%, hàng hỏng 0.4%, và bot Gợi ý không đủ vốn mở Chợ sau giỏ hàng. Chưa đánh dấu 6.1 hoàn thành.

## Tiệm xôi — cân bằng 6.1 (27/09/2026)

- Kịch bản chuỗi mới trong `npm run playtest` (chạy riêng: `npm run playtest -- 10 3 chain`): tạp hóa L30 đứng chơi bằng "Gợi ý" 3 ngày khởi động + 7 ngày đo, so từng cặp có/không có tiệm xôi cùng seed; tiệm xôi 2 thợ vắng chủ, nhập nguyên liệu mỗi sáng; tạp hóa đặt 6 xôi gói/ngày. Tiền tiệm xôi tách khỏi quỹ nhập hàng tạp hóa khi so lãi.
- Kết quả (3 và 6 seed): lãi xôi ≈ 62% lãi Chợ ước tính (1 thợ ≈ 20%, 3 thợ ≈ 105%), xôi gói tăng lãi tạp hóa 6–8% (đã trừ gói bỏ và phí xe), hỏng/bỏ 6%, đủ tiền mở Chợ với vốn giả định 3.000.000đ. Các bot thường không đổi.
- Lỗi tìm ra khi đo và đã sửa: mô phỏng cho một thợ làm ~75 phần/ngày trong khi đứng chơi chỉ ~15 (`cookPortionsPerHour` 6 → 1,2); thợ vắng chủ ngâm nếp theo số đã bán nên sản lượng tự giảm dần, và mức ngâm tối thiểu 20 phần vượt năng lực 1 thợ; mô phỏng bán theo giá niêm yết còn đứng chơi bán theo chất lượng; khách tạp hóa hầu như không hỏi xôi gói (thêm `sourcedRequestChance` = 0,1 cho `grocery`).
- Test benchmark 100 ngày × 6 tiệm lấy lần nhanh nhất trong 3 lần chạy (trước đó chập chờn cả ở HEAD khi cả bộ test chạy song song).

## Tiệm xôi — chơi thử 3.9 (27/09/2026)

- Trình duyệt tích hợp, khung 375×812 giả lập trên máy tính, bản lưu L29 đứng ở tiệm xôi, 1 Thợ nấu xôi, bàn 2 chỗ; chơi 3 ngày game: ngâm ở Bếp xôi và bằng nút "Ngâm N kg cho mai" ở tổng kết, hấp (giữ lửa trong vùng xanh ra "Ngon", chất lượng 1,16; không giữ lửa ra "Tạm được" 0,75), làm món bằng mini-game chạm nguyên liệu, mở cửa (cảnh báo quầy chưa có xôi), bán, khách ngồi ăn gọi thêm và dọn bàn, tổng kết.
- FPS lúc cao điểm 8h–10h: trung bình ~63, phần lớn 64–75, một lần tụt 18–36 trong vài giây rồi hồi. Chưa đo trên điện thoại thật.
- Lỗi đã sửa: ghi chú "Thợ nấu xôi đã ngâm N kg" bị ghi đè ở `endDay`; thông báo "nếp đã nguội" hiện cả khi nếp còn nóng (nay phân biệt nếp nguội và mẻ hấp chưa đều); tiệm xôi dùng lời nhắc tạp hóa ("nạp kệ", "nhập & bày hàng", "Nhập thêm những món này", "Khu hay hết nhất", mẹo hàng tươi); nút "Về bếp" đè nút "GIỮ LỬA" sau khi hấp.
- Cần quyết định cân bằng: khách tới tiệm xôi đứng chơi (~97/ngày) vượt xa số phần 1 thợ + người chơi làm kịp (~45–50). Không làm sẵn trước giờ mở thì chỉ ~41% khách được phục vụ và sao tụt từ 3,3 xuống 1,0 trong một ngày; làm sẵn 8 phần thì cao điểm phục vụ ~72%.
- Đã sửa tiếp: ở tiệm xôi, tab "Bày kệ" buổi sáng thành "🍙 Quầy xôi" (thẻ tóm tắt món ở quầy, nếp chín, mẻ ngâm, nút vào Bếp xôi; nút "Tự bày" thành "Bếp xôi"; kho chỉ để xem, không chọn/kéo món). Nút "Nhập & bày hàng" giữa giờ thành "Nhập nguyên liệu", màn nhập bỏ tab bày kệ, và liệt kê đủ nguyên liệu (trước đó danh sách trống vì lọc theo chỗ trên kệ). Tạp hóa giữ nguyên.

## Responsive ngang — tiến độ ban đầu (28/09/2026)

- `landscape-responsive-layout` và `topdown-carry-stock` là thay đổi chưa commit do người dùng chuẩn bị; giữ nguyên trạng thái này.
- Thêm `src/ui/layout.ts` với profile/bounds, hàm `effectiveViewMode` theo D8 và test thuần. Shop có listener resize dọn đúng vòng đời; lựa chọn tường minh đổi góc nhìn không restart scene/ghi thêm vào `settings.viewMode`. Mặc định top-down ngang vẫn được chặn cho tới khi có kết quả FPS thật của 4.2.
- Góc trên xuống có adapter WASD/mũi tên đi theo hit-test chạm, E/Space tương tác gần nội thất, điện thoại bàn chỉ vẽ trong map, nhắc đơn giao sắp tới, xe ba gác trình bày, dấu hàng chờ chạm xem lô và dấu thùng trên nhân viên có task `receive`.
- Màn nhập thêm ETA theo mối và số ô kho còn trống dự kiến sau giỏ hàng.
- `npm run build`, `npm run test -- --run tests/layout.test.ts` (3 test) và `npm run compare:views` đều qua; compare cho lãi top-down/side 100.0%. `openspec validate landscape-responsive-layout --strict` hợp lệ.
- Rà lại sau các bổ sung UI: `npm run build` qua; `npm test` qua 30 file / 716 test; `npm run compare:views` hai góc nhìn cùng kết quả; validator strict qua. Môi trường: Windows, Node 20.19, trình duyệt desktop 1536×864 CSS px, DPR 1.25. Chỉ quan sát Title/Morning trong phép đo FPS; chưa đo Shop hoặc responsive landscape.
- Chưa xác minh các thao tác UI mới trực tiếp trong trình duyệt.
- FPS trình duyệt tích hợp khi ở Title/Morning trên desktop giả lập: khoảng 25 FPS, DPR 1–1.25, không có khách. Đây không phải phép đo 4.2: chưa vào được Shop trong phiên tự động hóa và không có điện thoại tầm trung thật; 4.2/4.3 cùng điều kiện trước D8 vẫn mở.
- D12 còn thiếu hotbar bố trí đúng hàng, hộp thoại Restock 2 cột/compact tab, và cảnh hẻm đầy đủ; shell responsive cho các scene khác cũng còn mở. Không dùng số đo Title/Morning để kết luận hiệu năng góc trên xuống.

## Responsive ngang — tiếp tục triển khai (29/09/2026)

- Bỏ lớp phủ “Xoay dọc” trên điện thoại ngang và listener chỉ phát cảnh báo xoay; viewport landscape không còn bị che.
- Menu tiêu đề có bố cục gọn bên phải ở canvas ngang để vào được save; đã mở save max-level trong trình duyệt ngang và đi từ Title → Morning → Shop.
- Khung canvas khởi tạo theo hướng/vùng khả dụng. Màn Nhập hàng có panel hai cột khi `landscape-wide`; còn thiếu bố cục tab một cột cho `landscape-compact` và tab Bày kệ trong panel ngang.
- Xác minh: `npm run build`, toàn bộ 30 file / 717 test, `npx openspec validate landscape-responsive-layout --strict`, `npm run compare:views` qua; mô phỏng so sánh vẫn 100% lãi hai góc nhìn.
- Giới hạn hiện tại: đổi hướng khi đang chơi chưa cập nhật kích thước Phaser và dựng lại toàn bộ scene; Morning/Shop cùng các màn quản lý còn nhiều tọa độ dọc cố định. Shop ngang đang dùng bố cục cũ, nên đây chưa phải giao diện ngang hoàn chỉnh.
- Đo UI trong browser desktop 1536×864 CSS px / DPR 1.25 chỉ ghi nhận FPS Shop nhìn ngang qua perf overlay, kết quả dao động khoảng 24–38 FPS, p1 khoảng 17–35 FPS trong các cửa sổ ngắn. Chưa đo góc trên xuống khi đông khách và chưa có điện thoại tầm trung thật; không dùng các mẫu này làm cổng hiệu năng 4.2.
- Cần người chơi thử thao tác thật và đo trên điện thoại tầm trung trước khi đóng 4.2/4.3/5.6; D8 vẫn giữ mặc định ngang nhìn ngang cho tới khi đủ phép đo.

## Responsive ngang — nhập hàng compact và lượt đo bổ sung (29/09/2026)

- Restock ở `landscape-compact` dùng một cột với nút chuyển Danh mục/Giỏ; giỏ hiện tổng, tiền, số ô kho còn trống sau đơn, cảnh báo/giờ giao và nút mua. Ở profile ngang, nền Restock trong suốt một phần để Shop đang tạm dừng còn thấy mờ phía sau. Task 3.4c được đánh dấu hoàn tất.
- `npm run build` qua; `npm test` qua 30 file / 717 test; `openspec validate landscape-responsive-layout --strict` hợp lệ.
- Đo overlay trên Codex In-app Browser tại desktop Windows: WebGL, 1536×864 màn hình, DPR 1.25; khoảng 24–25 FPS ở Title/Morning. Đây không phải điện thoại tầm trung, không có khách đông, và chưa đo được cảnh Shop/top-down trong lượt này nên không dùng làm kết quả topdown-store-view 4.2.
- Chưa có phản hồi người chơi thật. topdown-store-view 4.3, responsive 5.6 và cổng FPS 4.2 vẫn mở; D8 vẫn giữ mặc định ngang nhìn ngang.

## Responsive ngang — phím điều hướng Shop (29/09/2026)

- Shop nhận `Esc` để đóng Sơ đồ/menu Tạm dừng hoặc mở menu Tạm dừng, `M` để mở/đóng Sơ đồ, và `2` để vào Nhập hàng/Bếp ở cả hai góc nhìn. Phím di chuyển vẫn chỉ hoạt động ở góc trên xuống; mọi shortcut bỏ qua khi đang nhập text.
- `npm run build`, 4 test layout và `openspec validate landscape-responsive-layout --strict` qua.
- Chưa có điện thoại tầm trung hay người chơi thật trong lượt này. Không đánh dấu `topdown-store-view` 4.2/4.3 hoặc điều kiện bật mặc định D8 hoàn tất; các task shell ngang còn mở.

## Responsive ngang — tinh chỉnh Shop compact (29/09/2026)

- Bảng quầy trong Shop top-down ngang compact dùng drawer nổi bên phải, nằm trên hotbar; ngang wide dùng rail phải có chiều rộng giới hạn thay vì kéo hết phần trống. Hotbar compact tăng chiều cao nút để dễ chạm. Các thay đổi này chỉ chạy ở landscape; nhánh portrait không đổi.
- Xác minh sau chỉnh sửa: `npm run build` thành công; `npm test` thành công (31 file, 736 test).
- Chưa hoàn tất toàn bộ `landscape-responsive-layout`: resize/reflow xuyên scene, bố cục nhìn ngang, Morning/Summary và các scene quản lý, kiểm tra clipping trên viewport nhiều cỡ, cùng test thiết bị thật vẫn còn mở. Không đánh dấu các task đó hoàn tất khi chưa triển khai và kiểm chứng.
- Bổ sung viền sáng theo ô dưới con trỏ chuột ở LiveMap khi chơi top-down; touch vẫn dùng vòng đánh dấu sau khi chạm. Đây là chỉ báo trình bày, không đổi hit-test hoặc gameplay.
- Xác minh lại sau chỉ báo hover: `npm run build` thành công; `npm test` thành công (31 file, 736 test).

## Thử nghiệm Web Worker cho save cloud (29/09/2026)

- Thêm `src/workers/save.worker.ts`; `compressSave`/`decompressSave` trong `src/core/compress.ts` thử chạy stringify/parse và LZString ở worker module. Nếu Worker không được hỗ trợ, không khởi tạo được, lỗi hoặc hết 30 giây, API quay về implementation hiện tại trên main thread. Không đổi schema/version save.
- `npm run build` tạo được `dist/assets/save.worker-*.js`; `npm test` qua 31 file / 736 test (test runner dùng fallback vì không có browser Worker).
- Chưa đo thời gian/độ giật thực tế trong trình duyệt với save lớn; structured clone khi gửi object qua worker vẫn có chi phí. Đây là tối ưu thử nghiệm cho lưu/đọc cloud, không áp dụng mô phỏng frame-by-frame.

## Kế hoạch đo hiệu năng và worker save (29/09/2026)

- Thêm `docs/performance-modernization-plan.md` với các giai đoạn baseline → worker → tối ưu đường nóng → ranh giới hệ thống → lưu trữ, tiêu chí chấp nhận và quyết định dùng IndexedDB theo nhu cầu.
- Overlay `?perf=1` nhận phép đo end-to-end nén/giải nén, mode worker/fallback và kích thước chuỗi. Có thể ép đối chứng fallback bằng `?perf=1&save-worker=0`; luồng xuất/nhập mã backup cũng dùng cùng compression API.
- Firebase/Firestore vẫn là save đồng bộ giữa thiết bị; localStorage là save cục bộ đọc đồng bộ lúc khởi động. Chưa chuyển dữ liệu sang IndexedDB vì save bị giới hạn nhỏ và không có lịch sử lớn cần query; không tạo bản sao lưu trùng giữa hai storage.
- Kiểm chứng cần làm tiếp trong browser với cùng save ở cả hai URL để so thời gian và frame pacing; không suy ra worker nhanh hơn chỉ từ build/test.

## Baseline save browser sơ bộ (29/09/2026)

- Đo ba lượt mỗi chế độ trong Codex In-app Browser, Windows desktop, viewport thực 677×312 CSS px, DPR 1.2, WebGL, scene Title, save max. Mỗi payload có 6 mẫu timed sau warm-up; không ghi save. Payload hiện tại ~31 KB; stress tổng hợp 30 ngày analytics/900 log/120 SKU ~69.7 KB.
- Median của ba p50 theo ms, thứ tự nén/giải nén: payload hiện tại fallback 42.9/25.9, worker 37.3/15.2; payload stress fallback 67.3/27.5, worker 63.5/14.9. Dải giữa ba lượt lần lượt: hiện tại fallback 42.9–64.2/25.9–35.0, worker 32.9–48.3/8.4–19.7; stress fallback 67.3–73.2/26.2–27.5, worker 61.0–130.9/14.3–31.2. Nén stress bằng worker biến thiên lớn.
- FPS Title trong cửa sổ ngắn 33.2–37.8 TB; chưa đo Shop đông khách, landscape đa viewport hay điện thoại thật. Đây là baseline save sơ bộ, không phải bằng chứng worker cải thiện gameplay. Giai đoạn 0 còn mở cho baseline frame pacing đại diện; chưa chuyển mô phỏng sang worker hoặc thêm IndexedDB.

## Profiling Shop và tối ưu tái sử dụng khay tiền (29/09/2026)

- Vào được Shop từ save max riêng và đo trực tiếp chế độ nhìn trên xuống tại cửa sổ 1920×1080/DPR 1 trên desktop. Khi đang chạy mô phỏng đông khách, một cửa sổ ổn định ghi ~32.7 FPS, `sim/map/ui/actors` lần lượt ~0.8/0.6/1.6/0.0 ms; có 87 khách đã phục vụ và 1 người chờ. Số liệu một phiên ngắn, không đại diện điện thoại.
- Từ code inspection thấy `renderTray()` hủy toàn bộ tiền vẽ và cấp phát lại Graphics/Text/Container mỗi sự kiện khay đổi. Đã thêm pool tối đa 8 tờ tiền, cập nhật texture/hình/chữ trên object hiện có và ẩn slot dư. Không đổi gameplay, save schema hoặc layout portrait.
- Xác minh `vite build` thành công và toàn bộ Vitest 31 file / 736 test qua. Chưa có A/B benchmark tái lập hoặc phép đo trên máy điện thoại; chưa tuyên bố mức tăng FPS. Scene construction, responsive ngang các viewport, điện thoại thật và benchmark worker vẫn còn trong plan.

## Điều hướng page ngang và Lịch landscape (29/09/2026)

- `pageFrame` có nút drawer điều hướng ngang dùng chung, chia tab Tiệm / Quản lý / Sổ sách / Mở rộng. Các route ghi save trước khi rời màn; drawer tự ẩn nếu Shop đang chạy, pause hoặc sleep để không làm mất phiên `DaySession`. Portrait không tạo drawer.
- `CalendarScene` giữ nguyên nhánh dọc; ở landscape chuyển sang hai cột lịch 10 ngày và các hạn thuế/sự kiện sắp tới để vừa canvas thấp.
- `DiningScene` chuyển thành lưới hai cột khi landscape thấp (tối đa 6 bàn); `KitchenScene` dời hàng tùy chọn món để không đè prompt. `HowToScene` landscape dùng cùng drawer điều hướng.
- `Button` có phản hồi hover sáng nhẹ riêng khi khởi tạo ở profile landscape; pressed/disabled hiện có được giữ. Portrait giữ nguyên màu khi hover.
- Đã đánh dấu OpenSpec 1.6, 3.1, 3.3, 3.4, 4.1 và 4.2 hoàn tất theo phần code. Sau đợt sửa cuối sẽ chạy lại build/test/validate.
- Sau sửa đổi cuối: production build qua; Vitest 31 file / 736 test qua; `openspec validate landscape-responsive-layout --strict` hợp lệ; `git diff --check` sạch.
- Cần kiểm tra trực quan ngang trên viewport phù hợp và hoàn thành các nhóm scene còn lại trước khi đóng change.
- `landscape-responsive-layout` vẫn còn hạng mục lớn: Phaser resize/reflow xuyên orientation mà không mất Shop session (1.4/1.7/2.5), desktop cửa sổ hẹp (3.5), focus order/độ tương phản hoàn chỉnh (4.4), rà clipping toàn scene (4.5). 2.0/2.6, 5.2–5.4a và 5.6 cần ma trận viewport, pha chơi, tải save và thiết bị/người chơi thật; chưa thể khép change bằng build đơn thuần.
