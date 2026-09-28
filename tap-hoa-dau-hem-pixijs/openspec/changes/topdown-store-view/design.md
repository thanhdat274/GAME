## Context

- Mặt bằng tiệm là lưới 8×8 (`land.json`). `layout.ts` đã có `walkableGrid`, `accessCells` và `findPath` (BFS). `DaySession` dùng chúng để tính thời gian khách đi tới kệ, nhưng góc nhìn ngang chỉ vẽ khách đi theo một đường thẳng.
- Mỗi tiệm trong chuỗi lưu dữ liệu riêng trong `stores[].data`; tiệm đang đứng nằm trực tiếp trên `GameState`.

## Decisions

### D1. Sơ đồ chỉ đọc trạng thái, không đổi mô phỏng
`liveMap.ts` suy ra mục tiêu của từng người từ `DaySession`:
- khách: cửa, kệ `c.at`, hoặc ô thứ *i* trong hàng chờ;
- nhân viên: sau quầy, kệ trong task `refill:r:c`, trạm bếp, kệ kho, đi giao;
- người chơi.

Lớp vẽ tự tìm đường và cho người đi với tốc độ cố định. Thời gian mua hàng vẫn do `DaySession` tính như cũ. Hàng chờ đi từ ô đứng tính tiền về phía cửa; tiệm nhỏ thì nối thêm các ô trống bên cạnh (tối đa 6 ô).

### D2. Luật "phải đứng ở quầy"
`DaySession.playerAtCounter` (mặc định `true`, lưu trong snapshot phiên):
- Khi `false`, `promoteFront` không đưa khách đầu hàng vào quét, nên khách đứng chờ.
- Khách ở quầy người chơi mất kiên nhẫn theo hệ số `topDown.awayPatienceRate`.
- Nếu có quầy thu ngân đang mở, `playerLaneOpen()` trả `false`. Cơ chế có sẵn trong `syncLanes` sẽ chuyển khách chưa quét sang quầy thu ngân.
- `autoPlayer` (bỏ qua ngày, chạy headless) không bị ảnh hưởng.

### D3. Hai góc nhìn trên cùng một phiên
Đổi góc nhìn không khởi động lại `ShopScene`. Sơ đồ chơi là một lớp (depth 262) phủ lên phần kệ nhìn ngang. Phần nhìn ngang bên dưới bị ẩn cho đỡ tốn công vẽ. Các nút nổi (nhiệm vụ, điện thoại, đơn giao) được đẩy lên depth 270. Chữ nổi của góc ngang bị tắt khi đang ở góc trên xuống.

### D4. Thao tác tại nội thất
Dùng lại API có sẵn:
- `startRefill` và `refillZone` để nạp ô, nạp cả khu;
- `assignSlot` để bày món vào ô trống, tức thì như buổi sáng;
- `setClearance` để bán xả;
- `prepareRecipe` cho "Nấu nhanh" (chất lượng 0,85). "Nấu kỹ" mở `CookScene` với cờ `fromShop` và tạm dừng tiệm, giống màn Nhập thêm hàng.

### D5. Cân bằng
`scripts/compare-views.ts` chạy bot "Bình thường" ở hai góc nhìn, cùng seed. Bot góc trên xuống chỉ rời quầy khi hàng chờ ≤ 1 người, hoặc khi ô kệ đã hết hàng. Kết quả với thông số mặc định (8 ván, lãi góc trên xuống so với góc ngang):

| Tiệm | Số ngày | Tỉ lệ lãi |
| --- | ---: | ---: |
| Nhỏ | 10 | 100,2% |
| Nhỏ | 20 | 99,8% |
| Lớn | 20 | 106,7% |

Tỉ lệ khách bỏ về vì chờ không tăng. Người thật chậm hơn bot, nên giữ hệ số kiên nhẫn 0,6.

## Risks / Trade-offs

- **Khách đi qua nhau:** khách và nhân viên đi xuyên qua nhau vì không có tránh va chạm khi di chuyển. Chỉ những người đứng yên chung một ô mới được dàn ra.
- **Nội thất chưa vẽ riêng:** nội thất vẫn dùng sprite của màn Sắp xếp. Nhân vật mới có dáng mặt trước, quay lưng và lật trái phải, chưa có sprite nghiêng thật.
- **Bản đồ cố định 8×8:** mở rộng mặt bằng là thay đổi dữ liệu `land.json` và bố cục màn Sắp xếp, để lại cho một change sau.
- **Hiệu năng chưa đo được thật:** trong trình duyệt giả lập vẽ bằng CPU, riêng phần cập nhật sơ đồ tốn khoảng 0,1 ms mỗi khung hình, nhưng FPS tuyệt đối thấp ở cả hai góc nhìn khi có khách. Cần đo trên điện thoại thật.
