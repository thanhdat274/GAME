## Why

Hiện game chỉ có một loại cửa hàng. Ba chi nhánh (Chợ, Cổng trường, Khu công nghiệp) vẫn là tạp hóa, chỉ khác hồ sơ nhu cầu. Tiệm không đứng chơi thì chỉ được cộng tiền theo lãi trung bình, nên sau L30 người chơi không có lý do nào để quan tâm tới quan hệ giữa các tiệm. "Tiệm xôi" là loại cửa hàng thứ hai và là **chuỗi cung ứng nội bộ** đầu tiên: tiệm xôi lấy nguyên liệu từ tạp hóa, rồi làm ra xôi gói để tạp hóa đặt về bán. Change này cũng dựng khung chung (loại cửa hàng dữ liệu hóa, đặt hàng nội bộ) để sau này thêm Tiệm trà sữa và các tiệm khác chỉ bằng dữ liệu cùng một mini-game mới.

## What Changes

- **Loại cửa hàng dữ liệu hóa** (`shopTypes.json`): mỗi loại khai báo nhóm hàng được bán, nội thất/trạm nấu được đặt, hồ sơ khách, giờ cao điểm và cách mô phỏng khi vắng chủ. `grocery` là loại hiện có. Thêm loại `xoi`.
- **Tiệm xôi** (mở ở L31, đặt trên Bản đồ thành phố như một chi nhánh):
  - Nguyên liệu mới bán ở tạp hóa và các mối sỉ: nếp, đậu xanh, hành phi, chà bông, lạp xưởng, dừa nạo, lá chuối/hộp giấy (trứng gà dùng hàng có sẵn).
  - Quy trình 2 bước: **ngâm nếp** từ hôm trước (phải lên kế hoạch), rồi **hấp mẻ** trong xửng vào buổi sáng ra "nếp chín", giữ nóng trong một số giờ game.
  - 4 món: xôi đậu xanh, xôi mặn (chà bông + lạp xưởng + hành phi), xôi trứng, xôi dừa. Có biến thể "thêm topping".
  - 3 mini-game: canh lửa hấp, múc xôi và rắc topping theo thứ tự, gói lá/hộp.
  - Khách đông từ 5h–10h sáng (người đi làm, học sinh, công nhân), mua mang đi ở quầy.
  - Vai trò nhân viên **Thợ nấu xôi** (dùng lại cơ chế Đầu bếp): tự hấp và gói theo chỉ số.
- **Đặt hàng nội bộ giữa các tiệm:**
  - Tạp hóa có mối mới "Tiệm xôi nhà mình" để đặt **xôi gói** (thành phẩm để trên kệ tạp hóa, hạn trong ngày). Có thể đặt một lần hoặc đặt định kỳ mỗi ngày.
  - Tiệm xôi có mối "Tạp hóa nhà mình" để lấy nguyên liệu từ kho tạp hóa theo giá vốn (FEFO, giữ hạn dùng), dùng xe chuyển hàng có sẵn.
  - Đơn nội bộ có trạng thái (chờ làm → đã làm → đang chở → đã giao / thiếu hàng). Thiếu hàng thì giao một phần và ghi chú vào buổi sáng.
- **Mô phỏng sản xuất khi vắng chủ**: tiệm xôi không đứng chơi vẫn *thực sự* tiêu nguyên liệu và làm ra xôi theo năng lực Thợ nấu xôi. Nó ưu tiên đơn nội bộ, phần còn lại bán lẻ theo hồ sơ khách. Tiệm xôi không dùng cách "lãi trung bình × hiệu suất" như tạp hóa.
- Giới hạn chuỗi tăng từ 4 lên **5 cửa hàng**.
- **BREAKING (dữ liệu lưu)**: bản lưu v6 thêm `StoreSnapshot.shopType`, `internalOrders`, mẻ ngâm/hấp; có migrate v5 → v6 (mọi tiệm cũ thành `grocery`).

## Capabilities

### New Capabilities
- `shop-types`: Định nghĩa loại cửa hàng bằng dữ liệu, quyết định hàng, nội thất, khách, giờ cao điểm và kiểu mô phỏng khi vắng chủ.
- `sticky-rice-shop`: Tiệm xôi: nguyên liệu, ngâm và hấp nếp, món và biến thể, mini-game, khách buổi sáng, Thợ nấu xôi.
- `internal-supply`: Đặt hàng giữa các tiệm trong chuỗi (một lần hoặc định kỳ), trạng thái đơn, giao thiếu, mô phỏng sản xuất khi vắng chủ.

### Modified Capabilities
- `branch-network`: Mở được tiệm thuộc loại khác tạp hóa, giới hạn 5 tiệm, và tiệm sản xuất dùng mô phỏng sản xuất thay cho lãi trung bình.
- `progression`: L31 mở thêm Tiệm xôi. Nguyên liệu xôi mở ở tạp hóa từ L31.
- `save-system`: Bản lưu v6 và migrate v5 → v6.

## Impact

- **Việc phải làm trước**: task phase 4 "tái cấu trúc mọi hệ thống nhận storeId" chưa xong. Change này cần hoàn tất việc đó cho các hệ thống đụng tới: kho, công thức, nhân viên, khách, tổng kết.
- Core: `shopTypes.ts` (mới), `internalSupply.ts` (mới), `stickyRice.ts` (mới: ngâm, hấp, giữ nóng), mở rộng `branches.ts` (mở theo loại, giới hạn 5, mô phỏng sản xuất), `recipes.ts` (nguyên liệu trung gian "nếp chín"), `customers.ts` (hồ sơ khách theo loại tiệm), `state.ts`/`save.ts` (v6).
- Scene: `XoiShopScene` (hoặc ShopScene ở chế độ quầy món), mini-game hấp/múc/gói trong `KitchenScene`, thêm lựa chọn mối nội bộ ở màn Nhập hàng, bảng "Đơn nội bộ" ở màn Buổi sáng, khu Tiệm xôi trên `BranchesScene`.
- Dữ liệu: `shopTypes.json`, thêm vào `products.json`, `recipes.json`, `furniture.json` (xửng hấp, thùng ngâm, quầy xôi), `staff.json`, `levels.json`, `branches.json`.
- Asset: mặt tiền tiệm xôi, xửng hấp, thùng ngâm, sprite món xôi và nguyên liệu (giai đoạn đầu được mượn sprite có sẵn như phase 4).
- Test: Vitest cho ngâm/hấp/giữ nóng, đặt hàng nội bộ (đủ, thiếu, định kỳ), mô phỏng sản xuất, migrate v5 → v6. Chạy `npm run playtest` với chuỗi có tiệm xôi.
