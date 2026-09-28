## 1. Sơ đồ tiệm (buổi sáng)

- [x] 1.1 `storeMap.ts`: `storeView` cho tiệm bất kỳ, `fixtureInfo`, `warehouseLines`, `warehouseUsage`; test
- [x] 1.2 `StoreMapScene`: mặt bằng, chấm mức hàng, chi tiết kệ, quầy, trạm bếp, nhà kho, tab các tiệm trong chuỗi
- [x] 1.3 Lối vào từ menu Tiệm và từ Bản đồ thành phố; chơi thử trên trình duyệt ở khung 375×667

## 2. Sơ đồ trực tiếp (xem)

- [x] 2.1 `liveMap.ts`: mục tiêu của khách, nhân viên, người chơi; hàng chờ nối về phía cửa; test
- [x] 2.2 `ui/liveMap.ts` chế độ xem: tìm đường, bước chân, biểu tượng sự kiện, chạm người hoặc kệ để xem
- [x] 2.3 Nút Sơ đồ ở màn bán; chơi thử có nhân viên

## 3. Góc nhìn trên xuống (chơi)

- [x] 3.1 `DaySession.playerAtCounter`, lưu trong snapshot; khách đầu hàng chờ khi người chơi vắng; test
- [x] 3.2 Chạm ô, kệ hoặc quầy để đi; bảng nạp ô; lớp che quầy kèm nút Về quầy; bắt trộm khi lại gần
- [x] 3.3 Đổi góc nhìn trong ngày (menu Tạm dừng, sơ đồ); ẩn phần nhìn ngang và chữ nổi khi ở góc trên xuống
- [x] 3.4 Có thu ngân: quầy người chơi tạm đóng khi người chơi rời quầy, khách sang quầy thu ngân; test
- [x] 3.5 Thao tác tại nội thất: bày món vào ô trống, bán xả, nạp cả khu, xem kho, nấu nhanh, nấu kỹ (`CookScene` mở từ lúc đang bán)
- [x] 3.6 Nhân vật quay lưng khi đi lên hoặc đứng nhìn vào kệ; dàn người đứng chung một ô
- [x] 3.7 Hướng dẫn một lần khi bật góc trên xuống
- [x] 3.8 Chơi thử trên trình duyệt ở khung 375×667: nạp, bày món, nấu nhanh, nấu kỹ, rời quầy có và không có thu ngân, đổi góc nhìn

## 4. Cân bằng và phát hành

- [x] 4.1 `balance.json › topDown`; `npm run compare:views` so sánh bot hai góc nhìn (tiệm nhỏ và lớn); lãi góc trên xuống bằng 99,8–106,7% góc ngang
- [ ] 4.2 Đo FPS trên điện thoại tầm trung khi đông khách ở góc nhìn trên xuống (trình duyệt giả lập vẽ bằng CPU nên không đo được)
- [ ] 4.3 Chơi thử bằng người thật; chỉnh `playerTilesPerSecond` và `awayPatienceRate` nếu góc trên xuống quá khó
- [ ] 4.4 Deploy và thu phản hồi

## 5. Để lại cho change sau

- [ ] 5.1 Sprite nội thất vẽ riêng cho góc trên xuống; sprite nhân vật nghiêng thật
- [ ] 5.2 Mở rộng mặt bằng lớn hơn 8×8 kèm camera đi theo nhân vật (đổi `land.json` và màn Sắp xếp)
- [ ] 5.3 Tránh va chạm khi khách và nhân viên đi qua nhau
- [ ] 5.4 Đồng bộ vị trí người chơi trong phiên chơi chung để dùng được góc trên xuống
