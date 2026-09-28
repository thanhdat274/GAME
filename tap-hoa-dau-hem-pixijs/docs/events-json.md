# Thêm sự kiện bằng JSON

Sự kiện nằm trong [`src/data/events.json`](../src/data/events.json), chia thành hai danh sách:

- `seasonal`: lặp theo lịch game 12 tháng × 10 ngày. `start` và `end` dùng tháng 1–12, ngày 1–10.
- `random`: có thể được chọn vào buổi sáng, tối đa một sự kiện ngẫu nhiên mỗi ngày. `chance` là xác suất từ 0 đến 1 trước các điều kiện mở khóa.

## Trường dùng chung

Mỗi sự kiện cần `id` duy nhất, `name`, `duration` (số ngày, tối thiểu 1), `dialog` (lời báo buổi sáng) và `effects` (mảng hiệu ứng). Có thể thêm:

- `minLevel`: level tối thiểu để sự kiện xuất hiện.
- `items`: ID mặt hàng trong `src/data/products.json`.
- `decor`: ID trang trí trong `src/data/decor.json`.
- `rewardAt` và `rewardDecor`: mốc tiến độ bán hàng và đồ trang trí thưởng.
- `quests`: mục tiêu bán hàng/ phục vụ, ví dụ:

```json
{
  "id": "summer_cold",
  "text": "Bán 25 món nước đá và kem",
  "metric": "soldProductList",
  "arg": "kem_que,nuoc_da",
  "target": 25,
  "rewardMoney": 75000,
  "rewardExp": 180
}
```

Các `metric` hợp lệ: `soldEventItems`, `soldProduct` (arg là một product ID), `soldProductList` (arg là product ID phân cách bằng dấu phẩy), `soldCategory` (arg là category ID), `served`, `revenue`. Phần thưởng chỉ trả một lần cho mỗi lần sự kiện xuất hiện trong năm game.

Hiệu ứng hiện hỗ trợ `trafficMul`, `wholesaleMul`, `electricityMul` (hệ số dương), `demandCategory`, `demandProduct` (map ID sang hệ số dương) và `powerOut` (boolean). Món đang thịnh hành có thể dùng khóa `"*selected*"` trong `demandProduct`; scheduler sẽ thay bằng món được chọn trong tham số sự kiện.

## Kiểm tra trước khi lưu

Chạy `npm run validate:events`. Validator kiểm tra trigger, ngày mùa, thời lượng, ID hàng/trang trí, nhiệm vụ, hội thoại và kiểu/hệ số hiệu ứng. Có test dữ liệu trong `tests/phase4.test.ts`. Giữ nguyên ID đã phát hành để bản lưu đang theo dõi tiến độ sự kiện không bị mất.
