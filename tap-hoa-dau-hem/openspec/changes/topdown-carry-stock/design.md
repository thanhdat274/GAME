## Bối cảnh

- Góc nhìn trên xuống (`topdown-store-view`): người chơi chạm ô để đi, tới kệ thì bấm + từng ô. `DaySession.startRefill(shelf, slot)` nhận việc nạp (task `refill:r:c` claim bởi `PLAYER`), sau `refillSeconds` (1 giây) gọi `refillSlot()` lấy hàng từ kho theo lô (hạn dùng) cho tới đầy ô (`slotCapacity` 20 × `capacityMul`).
- Kho là trừu tượng: sức chứa = bậc kho (`warehouseTier`) + ô của các kệ kho (`storage_rack`, mở ở level 9). Tiệm mới chưa có kệ kho nào trên mặt bằng.
- `startRefill()` cũng được `autoRefill` của chơi hộ gọi, và bot `compare:views` dùng cho cả hai góc nhìn.
- Snapshot phiên (`DaySessionSnapshot`) lưu các trường tùy chọn để snapshot cũ vẫn đọc được (`playerAtCounter?`, `fleeing?`...).
- Màn Nhập hàng (`RestockScene`) mở qua `ShopScene.openRestock()`, tạm dừng tiệm.

## Mục tiêu

1. Cảm giác tự tay bê hàng, bày hàng; đặt hàng ở điện thoại quầy.
2. Không bao giờ mất hàng hoặc nhân đôi hàng, kể cả khi đổi góc nhìn, tải lại, hết ngày, đồng bộ cloud.
3. Không đụng góc nhìn ngang, nhân viên, chơi hộ, phiên chơi chung, luật mua hàng và giao hàng.
4. Có số liệu cân bằng trước khi bàn chuyện bật mặc định.

## Quyết định

### D1. Hai tùy chọn độc lập, mặc định tắt

`settings.carryStock?: boolean` và `settings.orderAtPhone?: boolean`. Chưa đặt = tắt. Chỉ có hiệu lực khi góc nhìn hiệu lực là trên xuống (xem `landscape-responsive-layout` D8) và không ở phiên chơi chung. Ở góc ngang, hai tùy chọn bị bỏ qua (không xóa giá trị).

Tách hai tùy chọn để cân bằng và thu phản hồi riêng: cầm hàng ảnh hưởng tốc độ bày kệ, còn đặt hàng tại điện thoại chủ yếu tốn thêm thời gian đi bộ.

Chỉ cân nhắc bật mặc định cho `carryStock` sau khi có số liệu `compare:views` (D7) và phản hồi người chơi thật; quyết định đó là change sau.

### D2. Cầm hàng là giữ chỗ, không rút khỏi kho

`DaySession.carrying: CarryStack[]` với `CarryStack = { productId: string; qty: number }`.

- Lấy hàng: chỉ ghi giữ chỗ. `qty` bị chặn bởi `carryUnitsPerStack` và số còn lấy được = `warehouseQty(productId) − tổng qty đang cầm của món đó`.
- Bày lên ô: `startRefillFromHand(shelf, slot, productId)` giống `startRefill` nhưng khi xong thì chỉ lấy từ kho tối đa `min(chỗ trống trong ô, qty đang cầm)`, qua `takeLots` như `refillSlot` (giữ nguyên thứ tự hạn dùng). Trừ đúng số món thực bày khỏi `qty` đang cầm; `qty = 0` thì bỏ stack.
- Kho ít hơn số đang cầm (ví dụ nhân viên vừa nạp món đó): bày theo lượng kho thực có, giảm `qty` đang cầm về đúng lượng còn lại trong kho, toast "Kho vừa hết bớt <món>".
- Không đổi `state.warehouse` khi lấy/trả, nên sức chứa kho, hàng chờ (`holding`), `stowHolding`, giao hàng và hỏi kho của khách (`stockAsked`) không bị ảnh hưởng.

Lý do chọn giữ chỗ thay vì rút hàng thật khỏi kho:
- Không có trạng thái "hàng nằm ngoài kho" cần cứu khi crash, đổi góc nhìn, tải lại hay hết ngày.
- Không phải xử lý hàng hết hạn trên tay, hay trả hàng vào kho đã đầy.

Nhược điểm: nhân viên có thể lấy mất phần người chơi đang cầm. Chấp nhận ở bản đầu, xử lý bằng cách giảm `qty` như trên; nếu phản hồi cho thấy khó chịu thì cho `autoRefill`/nhân viên bỏ qua phần đang giữ chỗ trong change sau.

### D3. Điểm lấy hàng

- Có kệ kho (`storage_rack`) trên mặt bằng: lấy ở kệ kho gần nhân vật nhất (theo `walkTiles`).
- Chưa có kệ kho: lấy ở quầy ("kho sau quầy"), đứng ở ô đứng tính tiền.

Hệ quả cân bằng: tiệm chưa có kệ kho có quãng đi gần như cũ (quầy → kệ → quầy), chỉ khác giới hạn số món và loại món mỗi chuyến; kệ kho đặt xa quầy làm tăng quãng đi. Ghi rõ điều này trong hướng dẫn để người chơi biết đặt kệ kho gần khu kệ.

Bảng lấy hàng: danh sách món trong kho (như `openWarehouseSheet` hiện có), mỗi dòng có nút "+1 thùng" (lấy đầy một stack) và bộ đếm số lượng; nút "Lấy hàng cho kệ thiếu" tự chọn tối đa `carryStacks` món đang có ô kệ ≤ 25% sức chứa, ưu tiên ô hết hàng.

### D4. Bày hàng từ tay

- Đứng cạnh kệ: bảng nạp chỉ hiện nút + ở ô cùng món đang cầm (và ô trống khi món đang cầm đặt được vào kệ đó theo `placeError`).
- Ô trống: bày món đang cầm bằng `assignSlot` nhưng số lượng lấy bị chặn bởi `qty` đang cầm; nếu cầm nhiều loại hợp lệ thì hỏi chọn món.
- Không cầm gì mà chạm kệ: nhắc "Tay không · ra kho lấy hàng" và nút đi tới điểm lấy hàng gần nhất.
- Bán xả (`setClearance`) và xem thông tin ô vẫn làm được khi tay không.
- "Nạp cả khu" ẩn cho người chơi khi bật `carryStock`.
- Trả hàng: đứng ở điểm lấy hàng có nút "Cất lại" xóa stack (chỉ xóa giữ chỗ).

### D5. Vòng đời stack

`carrying` nằm trong `DaySession` và snapshot phiên (`carrying?: CarryStack[]`, tùy chọn). Xóa rỗng khi:
- hết ngày / đóng tiệm;
- đổi góc nhìn hiệu lực sang ngang (kể cả do xoay máy);
- tắt `carryStock`.

Vì là giữ chỗ nên xóa không làm mất hàng. Không lưu trong `GameState`, không đổi save version.

### D6. Đặt hàng tại điện thoại

Khi bật `orderAtPhone`, trong giờ bán ở góc trên xuống:
- Đứng ở quầy: ô hotbar Nhập hàng, điện thoại bàn và `E` mở màn Nhập hàng như cũ.
- Đang ở xa: ô hotbar Nhập hàng (và nút 📦 nếu còn) cho nhân vật tự đi về quầy theo đường tìm được, tới nơi mới gọi `openRestock()`. Chạm chỗ khác trên đường thì hủy. Tiệm vẫn chạy trong lúc đi.
- Tiệm xôi: áp dụng cho màn Bếp mở từ hotbar theo cùng cách (đi tới trạm bếp gần nhất thay vì quầy).
- Menu Tạm dừng vẫn có lối "Nhập hàng" nhưng khi bật tùy chọn thì hiện "Đi tới điện thoại" và đóng menu Tạm dừng rồi đi.
- Buổi sáng (`MorningScene`), góc ngang và phiên chơi chung giữ nguyên.

Luật này nằm hoàn toàn ở tầng UI (đường đi của nhân vật đã là UI); core không đổi.

### D7. Cân bằng

Mở rộng `scripts/compare-views.ts` với chế độ `carry`:
- bot chờ như chế độ `topdown` (chỉ rời quầy khi hàng chờ ≤ 1 hoặc có ô hết hàng);
- đi tới điểm lấy hàng, lấy tối đa `carryStacks` món thiếu nhất, đi tới từng kệ cần, bày, rồi về quầy;
- thời gian đi dựa trên `walkTiles` giữa quầy, điểm lấy hàng và kệ (tổng quát hóa `playerTripSeconds` thành hàm giữa hai fixture).

Chạy tiệm nhỏ 10/20 ngày và tiệm lớn 20 ngày (có và không có kệ kho đặt xa). Tiêu chí để giữ thông số mặc định:
- lãi của `carry` ≥ 95% lãi góc ngang;
- tỉ lệ khách bỏ về vì chờ không tăng quá 2 điểm phần trăm so với `topdown`.

Không đạt thì chỉnh theo thứ tự: tăng `carryUnitsPerStack`, tăng `carryStacks`, rồi mới xem lại `awayPatienceRate`. Thông số khởi đầu: `carryStacks = 2`, `carryUnitsPerStack = 20`.

## Ngoài phạm vi

- Xe đẩy hàng / nâng cấp sức mang (dạng nội thất hoặc kỹ năng).
- Nhân viên tôn trọng phần giữ chỗ của người chơi.
- Đồng bộ tay cầm trong phiên chơi chung (phụ thuộc `topdown-store-view` 5.4).
- Bật mặc định `carryStock`.

## Rủi ro

- **Chậm, gây bực khi đông khách:** mặc định tắt; hướng dẫn gợi ý thuê nhân viên nạp kệ; bot chứng minh cân bằng trước.
- **Chênh giữa đang cầm và kho thật:** đã xử lý bằng chặn theo kho thực có ở D2; có test cho trường hợp nhân viên lấy mất.
- **Snapshot phiên cũ:** `carrying` tùy chọn, thiếu thì coi là tay không.
- **Chạm trên điện thoại khó chọn số lượng:** mặc định lấy đầy một stack bằng một chạm, bộ đếm chỉ là tùy chọn.
