## Context

Phase 1 hiện có: hàng đợi tối đa 3 khách ở quầy, khách đầu hàng ở trạng thái `picking`, người chơi gọi `DaySession.pick(shelf, slot)` để nhặt từng món vào túi rồi `checkout()`. Kệ là 3 kệ × 6 ô, món nào đặt vào ô nào cũng được. Toàn bộ logic nằm ở `src/core/day.ts`, `customers.ts`, `stock.ts` (thuần TS, có test), scene chỉ vẽ và nhận chạm.

Mục tiêu mới: khách tự chọn hàng như tiệm thật, người chơi làm 3 việc trong giờ bán: **quét hàng và thối tiền ở quầy**, **canh và nạp khu hàng**, **lấy hàng sau quầy khi khách hỏi**. Phase 2–4 chưa code nên chỉ cần ghi chú chỉnh chữ, không đổi kiến trúc của chúng.

Ràng buộc: giữ tách lõi/hiển thị (core không import Phaser), tick cố định 100ms, RNG có seed, số cân bằng nằm trong JSON, màn dọc 360×640 với vùng chạm ≥ 44px, một ngày ≈ 3 phút thật.

## Goals / Non-Goals

**Goals:**
- Khách tự lấy hàng theo khu, người chơi chỉ can thiệp qua kệ, quầy và hàng sau quầy.
- Có áp lực "canh kệ" thật: khách tới khu hết hàng thì mất món và bị trừ sao.
- Cùng API core cho người chơi và (Phase 3) nhân viên thu ngân: `scanItem`, `scanAll`, `giveChange`, `serveCounterRequest`.
- Test được cả ngày bằng mô phỏng thuần core, cân bằng bằng `scripts/playtest.ts`.

**Non-Goals:**
- Lưới tiệm, đường đi A* và hoạt ảnh khách đi giữa các kệ theo ô (Phase 2). Ở Phase 1 khách chỉ "đi" theo tuyến cố định trên hai hàng kệ, thời gian đi tính bằng timer.
- Kẻ trộm, xe đẩy, nhiều quầy thu ngân (Phase 3).
- Tủ lạnh, hàng tươi (Phase 2).
- Đổi luật nhập hàng, kho, thối tiền, EXP.

## Decisions

### D1. Máy trạng thái khách mới
`Customer.status`: `entering → browsing → waiting → scanning → paying → done`.
- `entering`: vừa vào tiệm, chờ chỗ (giới hạn `maxShoppers` khách đang duyệt).
- `browsing`: khách có danh sách mua (`order`, giống hiện tại) và con trỏ `browseIndex`. Mỗi `zoneWalkSeconds` khách "đi tới" khu của món kế tiếp, mất `pickSeconds` để lấy, rồi chuyển món tiếp.
- `waiting`: đã có giỏ, xếp hàng ở quầy (tối đa `maxQueue`), kiên nhẫn quầy trừ chậm hơn khi chưa tới lượt (như `queuePatienceRate` hiện có).
- `scanning`: tới lượt, giỏ hiện lên quầy để người chơi quét.
- `paying`: giữ nguyên `paying` hiện tại (trả tiền, thối tiền).

Giữ `OrderLine.picked` nhưng đổi ý nghĩa thành "đã bỏ vào giỏ"; thêm `OrderLine.scanned` (số món đã quét) và `OrderLine.missing` (số khách không tìm thấy). Tổng tiền `orderTotal` tính theo `scanned`.

*Thay thế đã cân nhắc:* tạo entity `Basket` riêng. Bỏ vì `OrderLine` đã đủ và test/`playtest.ts` đang dùng nó.

### D2. Kiên nhẫn có hai giai đoạn
Trong `browsing` khách có **thời gian mua sắm** (`shopBudget`, mặc định = số món × (walk + pick) × 1.6) và **kiên nhẫn quầy** (`patience` hiện có, chỉ giảm từ `waiting`). Nếu duyệt quá `shopBudget` thì khách chỉ lấy tới đó rồi ra quầy (không bỏ về). Chỉ kiên nhẫn quầy về 0 mới bỏ về, khi đó giỏ trả lại kệ (khác Phase 1 trả về kho, xem D8).

Lý do: khách đi chọn hàng không nên bị coi là "chờ" người chơi, nếu không người chơi không có cách nào làm khách nhanh hơn mà lại bị phạt.

### D3. Kệ chia khu theo nhóm hàng
`Slot` giữ nguyên; thêm `zones: (Category | null)[]` song song với `shelves` (mỗi kệ một khu). Luật:
- Đặt món vào kệ có khu khác nhóm: `assignSlot` trả lỗi `wrong-zone`, UI rung kệ và hiện "Sai khu".
- Kệ chưa có khu (`null`) nhận món đầu tiên và tự gắn khu theo nhóm món đó; người chơi cũng chạm nhãn khu để đổi khi kệ đang trống.
- Kệ trống hẳn thì khu về `null`.
- Level 1 (chỉ đồ khô, 2 kệ) cho hai kệ đều là khu đồ khô; mở đồ ăn vặt ở level 2 thì kệ 2 (nếu trống) hoặc kệ mới nhận khu ăn vặt. "Tự bày" tôn trọng khu.

Khu quyết định **khách đi đâu**: `browsing` tra khu nào đang chứa món cần; nhiều kệ cùng khu thì lấy ô có hàng đầu tiên. Khu chỉ là nhãn ở Phase 1, Phase 2 dùng vị trí thật.

*Thay thế đã cân nhắc:* khu cố định theo kệ 1/2/3 (đơn giản hơn nhưng level 1–2 có hai kệ mà chỉ một nhóm hàng, nên kệ thứ hai lãng phí) và khu do người chơi tự đặt tên (thừa).

### D4. Lấy hàng của khách là logic core, người chơi không chạm
Trong `tick`, mỗi khách `browsing` đếm timer; tới lúc lấy thì `takeFromShelf(productId)`: trừ `qty` của ô có món trong khu đúng, tăng `picked`. Nếu `shelfQty == 0` thì tăng `missing`, ghi `today.missed[productId]`, phát `itemMissing` (biểu cảm buồn, thêm `penalty` tối đa 1 cho cả khách dù thiếu nhiều món). Nhiều khách duyệt cùng lúc cạnh tranh hàng theo thứ tự tick, nên "canh kệ" có ý nghĩa.

Bỏ hẳn `pick(shelf, slot)`, `wrongPickPenalty`, trạng thái `picking`. `Refill` giữ nguyên (chạm ô để nạp 1 giây) và thêm `refillZone(zone)` nạp tuần tự từng ô của khu, tổng thời gian = số ô cần nạp × `zoneRefillSecondsPerSlot`.

### D5. Cảnh báo khu vơi
`zoneFill(zone)` = tổng `qty` / tổng (`slotCapacity` × số ô có món). Khi < `zoneLowThreshold` (0.4) thì nhãn khu nhấp nháy vàng, < 0.15 thì đỏ; khu có món hết hoàn toàn hiện icon "Hết". Đây là dữ liệu core, scene chỉ vẽ.

### D6. Quét hàng ở quầy
Khi khách `scanning`, giỏ hiện ra là danh sách các dòng còn cần quét (icon + số lượng). Người chơi chạm dòng để quét 1 đơn vị (`scanItem(productId)`, hiệu ứng "bíp"). Nút "Quét hết" gọi `scanAll()`. Quét xong mọi món thì tính tiền rồi chuyển `paying` (dùng lại `customerPayment`, thối tiền, tip).

- Tip combo: quét hết giỏ trong `scanComboSeconds` (mặc định 3s) không bấm "Quét hết" thì cộng `scanTipBonus` vào tip (cùng cơ chế `computeTip`).
- Khách chờ quá lâu khi ở `scanning` vẫn trừ kiên nhẫn như `paying` hiện tại.
- Cài đặt `autoScan` (mặc định **tắt**), bật thì giỏ tự quét khi tới lượt (không combo). Lý do giống bài học "Tự thối tiền": có lối thoát cho người chơi mệt. Mặc định tắt vì đây là hướng 1 của thiết kế; nếu chơi thử thấy chán thì đổi mặc định trong `balance.json`, không đổi code.

### D7. Hàng sau quầy
Danh mục `products.json` thêm thuộc tính tuỳ chọn `behindCounter: true` và nhóm `counter`. Trạng thái: `state.counter: Slot[]` (`counterSlots` ô, mặc định 4, mỗi ô tối đa `counterCapacity`). Người chơi xếp hàng vào đó ở buổi sáng như xếp kệ (tab "Sau quầy").

Khách có xác suất `counterRequestChance` (theo kiểu khách, mở từ level `counterUnlockLevel`) thêm 1 dòng hàng sau quầy vào `order`, đánh dấu `counterLine`. Dòng này không bao giờ được `browsing` lấy; khi khách ở `scanning`, hiện bong bóng "Cho em thẻ cào 50k" và ô tương ứng nhấp nháy. Người chơi chạm ô sau quầy đúng loại để đưa (`serveCounterRequest`); quá `counterRequestSeconds` (mặc định 6) thì khách bỏ dòng đó, trừ 1 sao. Chạm sai ô: khách lắc đầu, kiên nhẫn -2 giây (lấy lại giá trị `wrongPickPenalty` cũ, đổi tên `counterWrongPenalty`).

Danh mục mặc định trong dữ liệu: thẻ cào điện thoại, gas mini, bật lửa. Thuốc lá không đưa vào dữ liệu mặc định (game hướng đến người chơi nhỏ tuổi); vì là dữ liệu JSON nên thêm sau rất dễ nếu muốn.

*Thay thế đã cân nhắc:* giữ `pick()` cho hàng sau quầy (sẽ giữ lại API cũ, khó test). Bỏ vì `serveCounterRequest` gọn hơn và cùng tên với quy tắc của Phase 3 (thu ngân tự phục vụ).

### D8. Hàng trả về khi khách bỏ về
Phase 1 trả hàng đã nhặt về kho. Với khách tự lấy: khách bỏ về ở `waiting` thì **trả giỏ lại đúng ô/khu cũ** nếu còn chỗ, còn không thì trả về kho (tránh mất hàng, tránh người chơi bị phạt kép). Không tính doanh thu.

### D9. Phiên bản lưu game
`GameState.version` 1 → 2. Migrate v1→v2:
- `zones` gán theo nhóm của món đầu tiên đang bày trên kệ (kệ trống thì `null`, kệ lẫn nhiều nhóm thì lấy nhóm chiếm nhiều ô nhất, các ô sai khu được trả về kho).
- `counter` tạo rỗng, `settings.autoScan = false`.
- Khách đang trong ngày (`phase: 'open'`) không lưu được, nên không cần migrate khách; nếu bản lưu ở giữa ngày thì đưa về đầu pha `open` như hiện tại.

Change `add-google-login-cloud-save` nói "thêm khối `sync` mà không tăng version". Hai thay đổi độc lập: change này tăng `version` lên 2 và chạy trước, cloud-save tiếp tục bổ sung `sync` theo cơ chế default; khi chưa gộp thì `save-system` của hai change xung đột chữ, cần thống nhất khi archive (làm change này trước).

### D10. Hiển thị (Phaser)
- `ShopScene`: nền tiệm chia hai hàng kệ hiển thị nhãn khu và thanh đầy; khách là sprite di chuyển giữa các vị trí cố định (cửa → kệ khu 1 → khu 2 → quầy) bằng tween, thời gian khớp timer core; không có va chạm.
- Vùng quầy ở dưới: giỏ khách (chip icon × số lượng, chạm để quét), nút "Quét hết", bong bóng yêu cầu sau quầy và hàng sau quầy 4 ô ngay cạnh, khay thối tiền như cũ.
- `MorningScene`: bố trí kệ theo khu, tab "Sau quầy", "Tự bày" tôn trọng khu.
- Chạm sai vào kệ khi đang bán chỉ còn tác dụng nạp hàng (cùng vùng chạm cũ), nên không còn nhập nhằng giữa "lấy hàng" và "nạp kệ".

## Risks / Trade-offs

- [Người chơi thấy nhàm vì việc quét lặp lại] → nút "Quét hết", cài đặt `autoScan`, tip combo, giá trị cân bằng nằm trong JSON; chơi thử trước khi khóa.
- [Khách duyệt cùng lúc làm khó theo dõi trên màn 360px] → tối đa 3 khách duyệt (`maxShoppers`), sprite nhỏ, chỉ hiện bong bóng "Hết!" khi khách tìm không thấy.
- [Cân bằng doanh thu lệch vì khách không còn phụ thuộc phản xạ người chơi] → doanh thu giờ phụ thuộc kệ đầy và tốc độ quét; chạy lại `scripts/playtest.ts` 7 ngày để nhắm lại mốc L4 sau 5–7 ngày và lãi/ngày như D6 của Phase 1.
- [Khu bắt buộc làm người chơi bực khi "Sai khu"] → thông báo rõ khu hợp lệ, "Tự bày" tự xếp đúng khu, kệ trống nhận khu đầu tiên.
- [Phá vỡ code và test đang chạy] → làm theo nhóm task (core trước, có test, rồi scene), giữ `DaySession` API tối thiểu cần đổi; nhiều file đang thay đổi chưa commit nên commit trước khi bắt đầu.
- [Xung đột spec với `add-google-login-cloud-save`] → xem D7, làm và archive change này trước.

## Migration Plan

1. Commit trạng thái hiện tại của working tree.
2. Thực hiện theo `tasks.md` (core + test trước, scene sau).
3. Nâng `CURRENT_VERSION` lên 2 kèm test migrate với bản lưu v1 thật (mẫu trong `tests/save.test.ts`).
4. Chạy `scripts/playtest.ts` 7 ngày, chỉnh `balance.json`.
5. Chơi thử 375×812, build, deploy Vercel. Rollback bằng redeploy bản trước; bản lưu v2 không đọc được bằng bản cũ (`version` mới hơn game sẽ báo lỗi và giữ `.bak`) nên trước khi phát hành nên giữ `.bak` v1.

## Open Questions

- Số khách duyệt tối đa (`maxShoppers`) và thời gian đi/lấy nên bao nhiêu để có cảm giác đông nhưng dễ theo dõi? Mặc định đề xuất 3, đi 1.2s, lấy 0.6s; chốt sau khi chạy `playtest.ts`.
- "Nạp cả khu" có cần trả phí/thời gian đáng kể để không làm mất ý nghĩa canh kệ? Mặc định 0.5s mỗi ô.
- Hàng sau quầy bắt đầu từ level nào? Đề xuất level 3 (cùng lúc mở kệ thứ 3) để không quá tải người chơi mới.
