# Thêm nội dung bằng dữ liệu

Toàn bộ nội dung nằm trong `src/data/*.json`, nạp qua `DATA` (`src/core/data.ts`). Thêm nội dung không cần sửa code nếu dùng các cơ chế có sẵn.

## Kiểm tra

```bash
npm run validate:data
```

Lệnh chạy `validateContent()` (`src/core/content.ts`): schema từng file và tham chiếu chéo. `npm run build` và `tests/content.test.ts` cũng chạy nó, nên dữ liệu hỏng không qua được build. Mỗi lỗi có dạng `file.id: nội dung`.

## Thêm mặt hàng (`products.json`)

Bắt buộc: `id`, `name`, `category`, `icon`, `color`, `cost`, `price` (>= `cost`), `size`, `unlockLevel`. Tùy chọn: `shelfLifeDays`, `requiresCold` (`fridge`/`freezer`), `refPrice`, `recipeOnly`, `eventOnly`.

Loại tiệm nào bán mặt hàng này do `categories` trong `shopTypes.json` quyết định, hoặc do `ingredients`, `addOns`, `sourcesFrom` của loại tiệm liệt kê đích danh.

## Thêm công thức (`recipes.json`)

Đầu ra phải là mặt hàng `recipeOnly` + `behindCounter`, có `cost` đúng bằng tổng giá nguyên liệu. Trạm (`station`) phải là nội thất có trong `furniture.json` và có trong `fixtures` của loại tiệm dùng công thức đó.

## Thêm loại cửa hàng (`shopTypes.json`)

Cần: `fixtures` (có ít nhất một quầy thu ngân), `customers` (id trong `customers.json`), `categories`, `recipes`, `sim` (`profit_average` hoặc `production`), `dineInChance`, `densityCurve` (hoặc `null`). Nếu mở qua chi nhánh, thêm bản ghi vào `branches.json` với `shopType` và `feature` (`feature` phải có trong `features` của một level ở `levels.json`).

Loại tiệm bán theo kệ (`service: "shelves"`, `sim: "profit_average"`) không cần code: id loại tiệm và `kind` của chi nhánh là chuỗi tự do, `validate:data` kiểm tra mọi tham chiếu. Ví dụ đã có: `greengrocer` (tiệm rau củ), `drink_kiosk` (quầy giải khát, dùng lại công thức đồ uống), `household` (gia dụng). Quy trình thêm một loại:

1. Thêm bản ghi vào `shopTypes.json` (nhóm hàng, khách, nội thất, `densityCurve`).
2. Thêm chi nhánh vào `branches.json` (`shopType`, `feature`, `defaultLayout` nằm trong mặt bằng đầu và chỉ dùng nội thất loại tiệm cho phép).
3. Thêm `feature` vào `features` của một level trong `levels.json`.
4. Thêm một lô đất có `storeId` là id chi nhánh vào bản đồ phố (`scripts/make-city-map.ts` rồi `npm run city-map`), và nếu muốn, một dòng màu trong `LOOKS` của `src/ui/cityTiles.ts` (không có thì dùng màu mặc định).
5. Nếu số cửa hàng vượt `chain.maxStores` trong `balance.json`, tăng giá trị đó.
6. Thêm test theo mẫu `tests/newShopTypes.test.ts` (mở theo level, bố cục, hàng bán, chạy một ngày).

Loại có cơ chế riêng (quầy gọi món, sản xuất như tiệm xôi) vẫn cần code.

## Các tham chiếu được kiểm tra

- quests / weeklyQuests: `soldCategory` cần `arg` là nhóm hàng, `soldProduct` cần `arg` là id mặt hàng.
- partyOrders: khóa `items` là id mặt hàng hoặc tên nhóm hàng.
- achievements: `decor` phải có trong `decor.json`.
- furniture: `requiresPlot` phải là id trong `land.json`.
- staff: `unlockFeature` phải có trong `levels.json`.
- shopTypes / branches: nội thất, khách, công thức, mặt hàng, layout mặc định.

## Tra cứu

Dùng `product(id)`, `furniture(id)`, `supplier(id)`, `recipeById(id)`, `recipeByOutput(output)`, `shopTypeById(id)` (đều O(1)) thay cho `DATA.xxx.find(...)`.

## Bản đồ phố (`src/data/cityMap.json`)

Định dạng Tiled JSON (mở/sửa được bằng Tiled; tileset "city" 16×16 do `src/ui/cityTiles.ts` vẽ lúc chạy). Lớp `ground` và `objects` là ô; lớp đối tượng `lots` là các lô đất với thuộc tính `storeId` (`main`, id chi nhánh trong `branches.json`, hoặc rỗng = đất trống), `doorX`, `doorY`. Thêm chi nhánh mới: thêm bản ghi vào `branches.json` **và** một lô có `storeId` tương ứng, nếu không `npm run validate:data` báo lỗi. Bản đồ khởi đầu sinh bằng `npm run city-map` (ghi đè file, dùng khi chưa sửa tay).

### Cơ chế riêng của loại tiệm (`mechanics`)

Khối tùy chọn trong `shopTypes.json`; tham số nào thiếu thì bằng 1, nên tạp hóa và tiệm xôi không đổi. Không cần sửa code:

- `shelfLifeMul: { "fresh": 0.6 }` nhân hạn dùng hàng nhập vào theo nhóm (chỉ lô nhập sau đó).
- `demandMul: { "fresh": 1.4 }` nhân nhu cầu của khách theo nhóm hàng.
- `seasonSensitivity: 1.6` lũy thừa nhu cầu theo mùa/sự kiện (>1: mùa nóng bùng nổ, mùa lạnh vắng).
- `qtyMul: 2` nhân số lượng mỗi dòng hàng khách mua (bán sỉ).
- `trafficMul: 0.65` nhân lượng khách chung.

Mô tả hiển thị cho người chơi (bảng thông tin ở bản đồ phố) tự sinh từ các số này (`describeMechanics`). Hiện có: rau củ (`shelfLifeMul` + `demandMul`), giải khát (`seasonSensitivity`), gia dụng (`qtyMul` + `trafficMul`).

### Bản đồ phố: giờ, mưa, dân phố

Chỉ là lớp hiển thị, không đổi tiền, kho hay save. Giờ chạy từ đồng hồ game (`timeOfDay.ts`); mưa tất định theo ngày và mùa, và có mưa lớn khi sự kiện `heavy_rain` diễn ra (`cityWeather.ts`); dân phố chọn tiệm theo sở thích, độ đông và hàng còn trên kệ (`cityShopping.ts`); bấm vào một người để xem danh sách định mua.

### Tiệm trà sữa và level 36–50

- **Nội dung trà sữa sinh bằng script:** sửa bảng nguyên liệu/món trong `scripts/make-tea-content.ts` rồi chạy `npm run tea-content` (ghi lại `products.json`, `recipes.json`; giá vốn thành phẩm luôn khớp nguyên liệu, giá bán = giá vốn × 1.9, giá biến thể theo chi phí thêm).
- **`shopOnly: true`** trên sản phẩm: chỉ loại tiệm liệt kê nó trong `ingredients` mới nhập/bán (không lẫn vào tạp hóa). `barGroup` (`cup`, `tea`, `syrup`, `topping`, `foam`, `mix`) xếp ô trong mini-game pha ly.
- **`minigame: "tea"`** trên công thức: mở màn pha ly (`TeaScene`) thay vì màn Cook mặc định; thứ tự chạm lấy từ `src/core/teaBar.ts`.
- **Level:** `levels.json` là dữ liệu; `maxLevel` phải bằng số dòng. Danh hiệu (`prestige`) bắt đầu ở level tối đa và giao diện đọc `maxLevel` từ dữ liệu, nên thêm level mới chỉ cần thêm dòng và dời tính năng `prestige` xuống dòng cuối.
- **Tiệm mới:** thêm loại tiệm (`shopTypes.json`), chi nhánh (`branches.json`), tính năng ở level (`levels.json`), lô đất (`make-city-map.ts`) như các mục trên.
- **Kiểu phục vụ món trà:** `serve: "order"` trên công thức nghĩa là pha theo đơn (không pha sẵn được; khách gọi thì bấm Pha ngay, ly mất `prepSeconds`); thiếu `serve` là pha sẵn để trên quầy. Thời gian chờ thêm và tốc độ mất kiên nhẫn khi đang pha chỉnh ở `balance.json › madeToOrder`. `orderWeight` trên tùy chọn là trọng số khách gọi tùy chọn đó. Chất lượng ly pha theo đơn chỉ đổi giá (hệ số 0.75–1.25): bấm Pha ngay ra `madeToOrder.autoQuality`, Pha tay (mini-game) tối đa 1.1, nhân viên pha chế theo chỉ số chuẩn xác; pha chế viên tự pha theo đơn song song, kể cả cho khách đang xếp hàng.
