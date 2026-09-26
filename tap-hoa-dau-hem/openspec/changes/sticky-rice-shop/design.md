## Context

Hiện trạng liên quan (sau phase 4):

- `GameState` dùng mô hình "tráo tiệm". Các trường của tiệm đang đứng (`STORE_KEYS`) nằm trực tiếp trên state, tiệm khác lưu snapshot trong `stores[].data`. Chuyển tiệm bằng `activateStore`/`syncActiveStore` (`src/core/state.ts`).
- `StoreSnapshot.kind` (`main | market | school | industrial`) chỉ là khu vực. Mọi tiệm đều là tạp hóa. `branches.json` có `demand` theo khu nhưng core hiện chưa đọc (không có tham chiếu trong `src/core`).
- Tiệm vắng chủ được cộng tiền trong `simulateBranches`, tính bằng lãi trung bình 7 ngày × hiệu suất × lượng khách. Kho của tiệm đó không thay đổi.
- `sendBranchShipment` chỉ **đẩy** hàng từ kho của tiệm đang đứng. Nó lấy lô FEFO bằng `takeLots(state, …)` và giao vào `holding` của tiệm đích vào sáng hôm sau.
- Công thức (`recipes.json`, `recipes.ts`) trừ nguyên liệu trong `state.warehouse` rồi ra thành phẩm `*_tp` (`recipeOnly`, `behindCounter`, hạn 1 ngày). Mini-game nằm trong `KitchenScene`. Vai trò Đầu bếp/Pha chế tự làm món.
- Nhà cung cấp là danh sách tĩnh trong `suppliers.json` (Cô Tư, Anh Ba).
- Task phase 4 "tái cấu trúc mọi hệ thống nhận storeId" chưa xong. Đây là rào cản chính: muốn kéo hàng từ kho tiệm khác và mô phỏng sản xuất thì phải thao tác được trên dữ liệu của tiệm *không* đang đứng.

## Goals / Non-Goals

**Goals:**
- Có loại cửa hàng thứ hai (tiệm xôi) với vòng chơi riêng: lên kế hoạch ngâm, hấp buổi sáng, bán cao điểm sáng.
- Có đặt hàng nội bộ theo hai chiều, xôi gói và nguyên liệu, để người chơi có lý do quan tâm tới quan hệ giữa các tiệm.
- Khung `shopTypes` và `internalSupply` đủ tổng quát để Tiệm trà sữa sau này chủ yếu chỉ cần thêm dữ liệu và mini-game.
- Tạp hóa, chi nhánh và bản lưu hiện có giữ nguyên hành vi.

**Non-Goals:**
- Tiệm trà sữa hoặc loại tiệm thứ ba (làm ở change sau).
- Tách tiền riêng cho từng tiệm. Tiền vẫn dùng chung, và giao dịch nội bộ không có lãi.
- Mô phỏng sản xuất cho tạp hóa vắng chủ. Tạp hóa vẫn dùng `profit_average`.
- Vẽ sprite riêng hoàn chỉnh. Giai đoạn đầu mượn sprite có sẵn, như phase 4.
- Chơi hai tiệm cùng lúc trên một màn hình.

## Decisions

### D1. `shopType` tách khỏi `kind` (khu vực)
Thêm `StoreSnapshot.shopType` (`'grocery' | 'xoi' | …`), giữ `kind` là khu vực. `branches.json` thêm trường `shopType` (mặc định `grocery`) và một mục mới `xoi` (L31, 700.000đ). Định nghĩa loại tiệm nằm trong `shopTypes.json`: `categories`, `fixtures`, `customers`, `densityCurve`, `sim: 'profit_average' | 'production'`, `recipes`.
- *Vì sao*: sau này có thể có "tiệm xôi ở Cổng trường". Hai trục khu vực và loại tiệm độc lập với nhau.
- *Phương án bị loại*: thêm `'xoi'` vào `kind`. Làm vậy sẽ trộn khu vực với loại tiệm và phải đụng mọi chỗ `switch (kind)`.

### D2. Truy cập dữ liệu tiệm bất kỳ (phần "storeId" tối thiểu)
Thêm kiểu `StoreData` (các trường trong `STORE_KEYS`) và hàm `storeView(state, storeId): StoreData`. Hàm này trả chính `state` khi là tiệm đang đứng, và `stores[i].data` đã được gõ kiểu khi là tiệm khác. Chuyển `takeLots`, `addLots`, `prepareRecipe`, `expirePreparedFood` sang nhận `StoreData` thay cho `GameState`. Chỉ tái cấu trúc những hệ thống change này cần (kho, công thức, nhân viên, thống kê ngày). Phần còn lại của task phase 4 để nguyên.
- *Vì sao*: phải kéo nguyên liệu từ kho tạp hóa khi đang đứng ở tiệm xôi, và mô phỏng tiệm xôi khi đang ở tạp hóa.
- *Phương án bị loại*: tạm `activateStore` sang tiệm kia, thao tác, rồi tráo về. Cách này dễ lỗi, đụng HUD và scene, và khó test.

### D3. Tiệm xôi chạy trên `DaySim` hiện có
Dùng lại `DaySim` và `ShopScene`, với cờ từ `shopType`: khách không đi kệ mà xếp hàng ở quầy và gọi món trong `recipes` của loại tiệm (giống luồng khách gọi món ở quầy phase 4). Mật độ khách lấy `densityCurve` của loại tiệm thay cho `densityAt` mặc định. Thêm `XoiPrepPanel` cho ngâm/hấp và bảng Đơn nội bộ. Mini-game hấp/múc/gói thêm vào `KitchenScene`.
- *Vì sao*: tái dùng được HUD, nhân viên, đánh giá, tổng kết và sự kiện.
- *Phương án bị loại*: viết `XoiDaySim` riêng. Nhân đôi hàng nghìn dòng (`day.ts` ~1.500 dòng).

### D4. Nếp: ngâm và nếp chín là trạng thái riêng, không phải lô hàng
Lô hàng hiện tính hạn theo *ngày*, còn nếp cần đồng hồ theo *phút game*. Thêm vào dữ liệu tiệm:
- `soakBatches: { id, kg, startDay, startMinute }[]`: sẵn sàng khi ≥ `soak.minMinutes` (360), hỏng khi > `soak.maxMinutes` (1440).
- `cookedRice: { portions, cookedDay, cookedMinute, quality }[]`: nóng trong `rice.warmMinutes` (300). Công thức xôi khai báo nguyên liệu ảo `nep_chin`, và `prepareRecipe` lấy từ `cookedRice` (mẻ cũ nhất trước) thay vì từ `warehouse`.
- Mọi hằng số đặt trong `balance.json › stickyRice`.
- *Phương án bị loại*: biến "nếp chín" thành sản phẩm có lô. Hạn theo ngày quá thô, nên phải đổi đơn vị hạn cho cả hệ thống kho.

### D5. Đơn nội bộ là dữ liệu chung của chuỗi
`GameState.internalOrders: InternalOrder[]` và `recurringOrders: RecurringOrder[]` nằm ở phần chung, không nằm trong snapshot, để cả hai tiệm cùng thấy.
```
InternalOrder { id, fromStoreId, toStoreId, items: Record<productId, qty>, filled: Record<productId, qty>,
                createdDay, dueDay, dueMinute, status, shortReason? }
```
Mối nội bộ hiện ở màn Nhập hàng dưới dạng nhà cung cấp ảo `internal:<storeId>`, do hàm `internalSuppliers(state)` sinh ra (không ghi vào `suppliers.json`). Có hai hướng:
- **Xôi gói → tạp hóa** (*pull theo đơn*): đơn `pending` được lấp khi tiệm xôi làm món có đầu ra `*_goi`. Lúc `dueMinute` (mặc định 420 = 7h) xe chở phần đã lấp vào `holding` tạp hóa **cùng ngày**. `BranchShipment` được mở rộng thêm `arriveMinute`.
- **Nguyên liệu → tiệm xôi** (*kéo từ kho tạp hóa*): `pullFromStore(state, fromId, productId, qty)` dùng `storeView` + `takeLots` trên kho tạp hóa và tạo `BranchShipment` tới sáng hôm sau. Giữ lô FEFO và dùng phí xe cũ.

### D6. Giá nội bộ = giá vốn, không có EXP
Tiền dùng chung nên lãi nội bộ vô nghĩa, lại dễ bị lợi dụng. Đơn xôi gói tính `Σ giá vốn nguyên liệu + bao gói`. Nguyên liệu kéo từ tạp hóa tính giá vốn lô. `ledger` ghi `internal_transfer` để tổng kết từng tiệm đúng: tiệm nhận ghi chi phí, tiệm giao không ghi doanh thu. Không có EXP cho việc giao; EXP tính khi bán lẻ.

### D7. Mô phỏng sản xuất (`sim: 'production'`) chạy **đầu ngày**
Hàm `simulateProductionDay(state, storeId, day, rng)` tất định, chạy ở bước xử lý buổi sáng (cùng chỗ `deliverBranchShipments`) cho mỗi tiệm `production` đang vắng chủ:
1. Hỏng các mẻ ngâm quá hạn. Hấp các mẻ đã sẵn sàng (chất lượng lấy từ `accuracy` của thợ).
2. Năng lực = Σ thợ `portionsPerHour(speed) × workHours`, nhân `efficiency` của khu.
3. Lấp các `internalOrders` đến hạn hôm nay trước, rồi đặt shipment giao lúc 7h.
4. Bán lẻ `min(phần còn lại, nhu cầu ước tính theo densityCurve × traffic)`, cộng tiền và 50% EXP.
5. Thợ tự ngâm cho hôm sau theo trung bình bán 3 ngày gần nhất, giới hạn bởi nếp trong kho. Trừ lương.
Chạy đầu ngày thì tạp hóa nhận xôi kịp lúc 7h. Kết quả được ghi vào `analytics` của tiệm xôi để hiện ở tổng kết.
- Thời gian vắng dài (offline nhiều ngày): chạy lặp từng ngày. Hết nguyên liệu thì tự dừng.
- *Phương án bị loại*: chạy cuối ngày. Khi đó hàng phải tới hôm sau nữa, và đơn định kỳ bị lệch một ngày.

### D8. Tạp hóa vắng chủ nhận xôi gói
Tạp hóa vắng chủ vẫn dùng `profit_average`, nên hàng giao tới sẽ nằm yên. Quy tắc bổ sung: với hàng `recipeOnly` được giao tới tiệm `profit_average` vắng chủ, bán `floor(qty × efficiency)` theo giá bán hiện tại (cộng tiền và 50% EXP). Phần còn lại hỏng cuối ngày. Nhờ vậy đơn định kỳ vẫn có ý nghĩa khi người chơi đang đứng ở tiệm xôi.

### D9. Bản lưu v6
`migrate_5_to_6`: gán `shopType: 'grocery'` cho mọi snapshot, thêm `internalOrders = []` và `recurringOrders = []`, gán `soakBatches`/`cookedRice` rỗng cho dữ liệu tiệm. Thêm `soakBatches` và `cookedRice` vào `STORE_KEYS`. Kiểm tra kích thước với fixture 5 tiệm: đơn nội bộ đã `delivered`/`cancelled` được dọn sau 7 ngày.

### D10. Mở khóa và cân bằng mặc định
L31: `shop_xoi` + nguyên liệu xôi + Thợ nấu xôi. Giá mở 700.000đ, rẻ hơn chi nhánh Chợ, vì tiệm xôi nhỏ và phụ thuộc tạp hóa. Mẻ 5 kg nếp ra 25 phần. Giá xôi 12k–25k, xôi gói bán ở tạp hóa 15k–22k. Mục tiêu: lãi tiệm xôi đứng chơi ≈ 60–80% lãi chi nhánh Chợ, và đơn định kỳ xôi gói tăng lãi tạp hóa 5–10%. Mọi số nằm trong JSON, và được kiểm lại bằng `npm run playtest`.

## Risks / Trade-offs

- [Tái cấu trúc `storeView` làm vỡ hệ thống cũ] → Làm thành đợt riêng đầu tiên, và giữ 277 test hiện có luôn xanh trước khi thêm tính năng.
- [Mô phỏng sản xuất lệch xa so với chơi thật, khiến người chơi thấy "vắng chủ lời hơn"] → Hiệu suất trần 0,9 như chi nhánh. Thêm test so sánh mô phỏng với playtest cùng seed, sai lệch không quá 20%.
- [Đơn định kỳ bị bỏ quên, gây giao thiếu mãi] → Sau 3 lần `short` liên tiếp thì tự tạm dừng và báo ở màn Buổi sáng.
- [Người chơi thấy phiền với việc ngâm từ hôm trước] → Tổng kết cuối ngày có nút "Ngâm cho mai" gợi ý số kg. Có thợ thì thợ tự làm.
- [ShopScene bị nhồi quá nhiều nhánh `if (shopType)`] → Gom khác biệt vào đối tượng `ShopTypeBehavior` (cách sinh khách, danh sách nội thất, panel phụ). Scene chỉ gọi qua giao diện này.
- [Hiệu năng khi 5 tiệm cùng mô phỏng lúc tải offline dài] → Mô phỏng thuần số học, không sinh khách từng người. Đặt ngưỡng 100 ngày × 5 tiệm dưới 200 ms trong test.

## Migration Plan

1. Đợt A (nền): `storeView`, `shopType`, `shopTypes.json`, save v6 + migrate. Phát hành được, vì không có thay đổi nào người chơi thấy được.
2. Đợt B (tiệm xôi chơi trực tiếp): nguyên liệu, ngâm/hấp, món, mini-game, khách, mở trên bản đồ.
3. Đợt C (chuỗi cung ứng): đơn nội bộ hai chiều, mô phỏng sản xuất, Thợ nấu xôi, tổng kết.
4. Cân bằng, chơi thử trên điện thoại, deploy.

Rollback: nếu bản v6 lỗi, bản v5 cũ vẫn tải được bằng build trước vì migrate chỉ thêm trường. Giữ bản sao v5 trong localStorage (`save_backup_v5`) một tuần sau khi migrate.

## Open Questions

- Mở ở **L31** (cùng Xe tải) có quá muộn không? Hay nên mở ở L29/L30 để người chơi thấy sớm hơn?
- Có cho **tạp hóa bán xôi nóng** (tự làm ở góc đồ ăn), hay xôi chỉ đến từ tiệm xôi? Đề xuất: chỉ đến từ tiệm xôi, để chuỗi cung ứng có ý nghĩa.
- Tiệm xôi có cần **bàn ghế ăn tại chỗ** không, hay chỉ bán mang đi?
- Giới hạn **5 tiệm** có đủ chỗ cho tiệm trà sữa sau này không (tiệm chính + 3 chi nhánh + xôi + trà sữa = 6)?
