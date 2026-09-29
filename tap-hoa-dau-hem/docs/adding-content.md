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
