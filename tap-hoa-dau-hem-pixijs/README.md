# Tạp Hóa Đầu Hẻm · PixiJS + Custom ECS

Bản chuyển toàn bộ game Tạp Hóa Đầu Hẻm (bản gốc Phaser 3.90) sang **PixiJS v8 + ECS tự viết**,
để so độ mượt khi dự án scale (nhiều sản phẩm, nhiều khách, nhiều màn chơi).

- **Mốc đối chứng:** thư mục `../tap-hoa-dau-hem` hiện tại (gồm cả các thay đổi chưa commit: NineSlice,
  nền ô kệ in sẵn, dùng lại chữ nổi, `core/ecs.ts`, `ui/powerSaver.ts`, 30 FPS trên điện thoại).
- Toàn bộ `src/core`, `src/data`, `src/services`, `src/scenes` và `src/ui` giống nguyên văn bản gốc, chỉ khác dòng
  import engine. Ngoại lệ bắt buộc do engine: `ui/scroll.ts` (cắt vùng vẽ theo khung nhìn), `ui/liveMap.ts`
  (nhân vật sơ đồ là component ECS), `ui/perfOverlay.ts` (nhãn bảng đo), `ui/roundrect.ts` (vá lỗi riêng của
  Phaser, không cần), `main.ts`, `game.ts` và `core/save.ts` (khóa lưu `thdh.pixijs.*`).
- Đồng bộ lại khi bản gốc đổi: `python bench/sync_from_original.py` (thêm `--dry` để chỉ xem file nào khác), trừ các file trên.

## Chạy

```sh
npm ci
npm run dev
npm run build
npm test
```

## Kiến trúc

```
src/
  ecs/world.ts        ECS tối giản: entity = số nguyên (có thế hệ), component lưu trong sparse set,
                      system chạy theo thứ tự ưu tiên.
  engine/             Engine chạy trên PixiJS v8, API đặt tên theo phần Phaser mà game dùng:
    Game.ts           Ứng dụng PixiJS + vòng khung hình chép TimeStep của Phaser (làm mượt delta, giới hạn FPS).
    systems.ts        System mỗi khung: hàng đợi scene → timer → tween → update của scene.
    tweens/, time/    Tween và hẹn giờ là entity ECS.
    scene/            Scene, vòng đời (start/stop/pause/launch), danh sách hiển thị, camera.
    gameobjects/      Container, Graphics, Text, Image, Rectangle, Zone, RenderTexture...
    input/            Nhận chạm, hit-test theo thứ tự vẽ, chỉ đối tượng trên cùng nhận chạm.
  game/agents.ts      Khách / nhân viên / người chơi trên sơ đồ là component ECS; system di chuyển,
                      hoạt ảnh bước chân và đặt hình duyệt một lượt mỗi khung.
  scenes/, ui/        Màn chơi và widget (giữ nguyên từ bản gốc).
bench/                Công cụ so sánh dùng chung cho cả hai bản.
```

### Những chỗ engine chép đúng hành vi Phaser (để so sánh công bằng)

- Vòng khung hình: làm mượt delta 10 khung, giới hạn FPS (mặc định 60, `?fps=30`) như `Phaser.Core.TimeStep`.
- Tween chạy theo đồng hồ thực với cơ chế bỏ qua giật lag (500 ms → 33 ms, tối đa 240 nhịp/giây) như `TweenManager`.
- Chữ: thuật toán ngắt dòng `advancedWordWrap`, công thức bề rộng/chiều cao của `GetTextSize`, và chuỗi đo font
  `"|MÃ‰qgy"` (chuỗi mẫu bị lỗi mã hoá trong Phaser 3.90) — nên xuống dòng và vị trí chữ trùng khớp.
- Gradient 4 góc tô theo hai tam giác như bộ vẽ WebGL của Phaser.

### Khác biệt có chủ ý

- **Render group:** PixiJS v8 dựng lại danh sách lệnh vẽ của cả nhóm khi có thay đổi cấu trúc (đổi chữ, ẩn/hiện,
  thêm/xóa, vẽ lại Graphics). Engine tách mỗi Container cấp scene (kệ, bảng quầy, HUD, sơ đồ) thành render group
  riêng; nút nhỏ thì không (`renderGroupHint = false`). Không đổi hình ảnh.
- Nhân vật trên sơ đồ chạy bằng ECS (cùng thuật toán di chuyển).

### Mức độ giống bản gốc (kiểm chứng tự động bằng `bench/compare.js`)

- 24 màn: số đối tượng từng loại, nội dung và vị trí mọi dòng chữ trùng khớp.
- Màn bán hàng sau 600 khung trên cùng state: mô phỏng (giờ, tiền, khách) trùng khớp; số đối tượng và vị trí
  mọi dòng chữ — kể cả chữ nổi đang bay — trùng khớp (so bằng đồng hồ ảo để tween không phụ thuộc tốc độ máy).
- `bench/textprobe.js`: vị trí điểm ảnh của chữ mẫu trên canvas trùng khớp (chữ căn giữa lệch tối đa 0,5 px).
- Khác biệt duy nhất còn lại là cấu hình: bản gốc có `.env.local` (Firebase) nên HUD có nút đồng bộ cloud;
  bản PixiJS chưa có file này.

## So sánh hiệu năng

```sh
# Bản gốc (Phaser)
npm --prefix ../tap-hoa-dau-hem run dev -- --port 5186
# Bản PixiJS + ECS
npm run dev -- --port 5174
```

- Chơi thử: mở `/?simulate=max&reset=1&perf=1` ở cả hai (bảng đo cùng định dạng; bản PixiJS thêm số entity
  ECS và thời gian từng system).
- Tự động (DevTools console, tab phải đang hiển thị):

```js
await import('http://localhost:5174/bench/benchmark.js')
const s = JSON.stringify(thdh.G.state)          // ngay sau khi mở ?simulate=max&reset=1
await thdhBench({ state: s, realtime: 8, view: 'side', extra: 150, managerSpeed: 4 })
// view: 'side' | 'top' | 'watch'; extra: số khách thêm; managerSpeed: tốc độ mô phỏng
// realtime: số giây đo bằng vòng lặp thật; bỏ kết quả có valid: false (tab bị ẩn giữa chừng)
```

### Kết quả (hồ sơ max level, cùng state, 8 giây mỗi kịch bản, canvas 720×1280)

Máy đo: cửa sổ trình duyệt trong ứng dụng, màn hình 75 Hz. Với giới hạn 60 FPS kiểu Phaser, cả hai bản
bước mỗi 2 nhịp màn hình nên trần là 37,5 FPS; cột "xử lý" cho biết còn bao nhiêu dư địa.

| Kịch bản | Phaser (bản gốc hiện tại): FPS · xử lý TB/p95 (ms) | PixiJS + ECS: FPS · xử lý TB/p95 (ms) |
|---|---|---|
| Nhìn ngang, khách bình thường | 37,5 · 3,9 / 8,0 | 37,5 · 2,0 / 5,2 |
| Nhìn ngang, +60 khách | 37,5 · 3,6 / 7,1 | 37,5 · 1,6 / 3,4 |
| Sơ đồ trên xuống, +60 khách | 37,5 · 3,7 / 7,9 | 37,5 · 2,3 / 5,0 |
| Nhìn ngang, +150 khách, mô phỏng x4 | 37,5 · 4,0 / 8,1 | 37,5 · 2,6 / 5,6 |

Trước các tối ưu chưa commit (commit `e68b742`), bản Phaser ở màn nhìn ngang tốn ~49–79 ms/khung (11–20 FPS)
trên cùng máy. Số liệu phụ thuộc máy; hãy đo lại trên điện thoại mục tiêu.

## Tham số URL

- `simulate=max&reset=1` – hồ sơ max level để thử tải (save riêng).
- `perf=1` – bảng đo hiệu năng; `fps=30` – giới hạn 30 FPS.
- `loop=timeout` – vòng lặp bằng setTimeout (như `forceSetTimeOut` của Phaser), dùng khi tab bị hãm rAF.
