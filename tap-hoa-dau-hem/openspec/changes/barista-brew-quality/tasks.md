## 1. Chất lượng và giá

- [x] 1.1 `customCups.ts`: `handBrewQuality`, `staffBrewQuality`, `qualityLabel`, `brewedCupPrice`; `Balance.madeToOrder.autoQuality` và `balance.json`

## 2. Lõi phục vụ

- [x] 2.1 `day.ts`: `startBrew(quality)`, `brewByHand`, `serveBrewed`, giá ly theo chất lượng, thu ngân dùng chất lượng theo chuẩn xác
- [x] 2.2 Mẻ pha chế viên: `brewTarget`, `startStaffBrew`, `finishStaffBrew`, `prebrewed`, hủy khi khách rời, `brewProgress().by`
- [x] 2.3 Thu ngân và `beginCounterRequest` dùng ly pha sẵn của pha chế viên

## 3. Giao diện

- [x] 3.1 `TeaScene`: chế độ pha cho khách (khóa tùy chọn, Giao cho khách)
- [x] 3.2 `ShopScene`: nút Pha tay, tên pha chế viên trên nút, nhãn chất lượng khi giao ly

## 4. Kiểm tra

- [x] 4.1 `tests/baristaBrew.test.ts`, cập nhật `tests/madeToOrder.test.ts`
- [x] 4.2 `tsc`, `vitest` toàn bộ
- [x] 4.3 Chạy thử trình duyệt (pha tay, pha chế viên)
