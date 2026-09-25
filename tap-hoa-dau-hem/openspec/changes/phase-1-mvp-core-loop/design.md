## Context

Dự án mới, làm bởi team nhỏ (1–2 người), mục tiêu chơi trên trình duyệt điện thoại. Tham khảo "Ai Mua Xôi Đi" (pixel art, màn dọc) và "Tiệm Mì Cay" (vòng phục vụ khách nhanh). Khác biệt của Tạp Hóa Đầu Hẻm: có lớp quyết định kinh tế (nhập gì, bao nhiêu, bày ở đâu) bên cạnh phần phản xạ (lấy hàng, thối tiền). Kiến trúc giai đoạn 1 phải đủ vững để giai đoạn 2–4 gắn thêm hệ thống (kho lớn, nhân viên, sự kiện) mà không viết lại.

## Goals / Non-Goals

**Goals:**
- Vòng chơi 1 ngày trọn vẹn, chơi mượt 60fps trên điện thoại tầm trung.
- Tách bạch logic (thuần TS, test được) và hiển thị (Phaser).
- Dữ liệu cân bằng nằm trong JSON để chỉnh không cần sửa code.
- Lưu game an toàn, có số phiên bản để migrate ở giai đoạn sau.

**Non-Goals:**
- Mở rộng đất, hạn sử dụng, tủ lạnh, nhân viên, sự kiện (giai đoạn 2–4).
- Tài khoản, đồng bộ cloud (làm ngay sau giai đoạn này trong change `add-google-login-cloud-save`), bảng xếp hạng.
- Bán hàng trả tiền thật / quảng cáo.

## Decisions

### D1. Phaser 3 + Vite + TypeScript
Phaser có sẵn scene, tween, input chạm, scale manager (FIT + center) phù hợp game 2D nhiều sprite di chuyển. Vite cho dev server nhanh và build tĩnh.
- Thay thế đã cân nhắc: HTML/CSS thuần (dễ làm UI nhưng khó animate nhiều khách), PixiJS (chỉ render, phải tự làm scene/input), Godot web (bundle nặng, tải chậm trên 4G).

### D2. Kiến trúc lõi / hiển thị
```
src/
  core/            # thuần TS, không import phaser
    state.ts       # GameState (tiền, level, exp, kho, kệ, ngày...)
    economy.ts     # mua, bán, tính lãi
    change.ts      # thuật toán thối tiền
    customers.ts   # sinh khách, yêu cầu, kiên nhẫn (dùng RNG có seed)
    progression.ts # exp, level, mở khóa
    day.ts         # máy trạng thái pha trong ngày
    events.ts      # event bus có kiểu (typed)
    save.ts
  data/            # products.json, levels.json, customers.json, balance.json
  scenes/          # Boot, Title, Morning(Restock), Shop, Summary, HUD
  ui/              # nút, panel, thanh kiên nhẫn tái sử dụng
```
Scene gọi hàm core → core phát sự kiện → scene cập nhật hình. Nhờ đó giai đoạn 3 (nhân viên tự bán) chỉ cần gọi cùng API core thay cho input của người chơi.

### D3. Vòng thời gian cố định (fixed tick)
Core chạy tick 100ms (đồng hồ game, kiên nhẫn, sinh khách); Phaser render theo frame. Tick tách biệt giúp test mô phỏng cả ngày trong vài ms và sau này tính thu nhập offline.

### D4. RNG có seed
Dùng mulberry32 với seed theo ngày để tái hiện bug và test cân bằng.

### D5. Thối tiền
**Cập nhật sau khi chơi thử:** mặc định bật "Tự thối tiền" từ level 1 (người chơi thấy phải tự chọn tờ mỗi khách là mệt). Mini-game thối tay trở thành tùy chọn để kiếm tip; bật/tắt ở màn tiêu đề và menu tạm dừng. Mô tả gốc bên dưới áp dụng khi tắt tự động.

Khách trả bằng tờ lớn nhất phù hợp (ví dụ đơn 13.000đ → trả 20.000đ). Người chơi chạm các tờ 1k/2k/5k/10k/20k/50k/100k/200k vào khay rồi bấm "Đưa". Đúng số tiền → thành công; thời gian < 4s và không bấm nhầm → tip 1.000–3.000đ. Thiếu → khách phàn nàn (-sao); thừa → mất phần thừa. Có nút "Tự tính" mở khóa ở level 3 cho người chơi lười (không có tip).

### D6. Kinh tế khởi điểm (mặc định, nằm trong balance.json)
- Tiền đầu: 300.000đ. Kho: 30 ô (tăng từ 20 sau chơi thử bằng bot: Lv4 có 14 món, 20 ô gây thiếu hàng liên tục). 2 kệ × 6 ô, mỗi ô chứa tối đa 5 đơn vị cùng loại.
- Lãi gộp mục tiêu 20–40%/món. Một ngày chơi tốt lãi 60–120k ở level 1.
- EXP: +1 mỗi món bán, +3 mỗi khách hài lòng. Mốc level: L2 = 120, L3 = 350, L4 = 700 EXP tích lũy.
- Sao tiệm: trung bình trượt 20 khách gần nhất (1–5 sao).

### D7. Lưu game
`localStorage["thdh.save.v1"]` = JSON `{version, savedAt, state}`. Tự lưu khi kết thúc mỗi pha và khi tab ẩn (`visibilitychange`). Hàm `migrate(save)` theo chuỗi version cho giai đoạn sau. Mọi truy cập bọc try/catch; hỏng thì giữ bản `.bak`.

### D8. Responsive
Kích thước logic 360×640 nhưng canvas thật 720×1280 với camera zoom 2 (chữ và hình vector sắc nét trên màn hình mật độ cao; pixelArt: true chỉ khiến chữ bị răng cưa khi phóng). Sprite pixel art dùng bộ lọc NEAREST riêng cho từng texture. `Scale.FIT` + `autoCenter`. Vùng chạm tối thiểu 44px logic. Chặn zoom khi double-tap, khóa hướng dọc bằng manifest (và hiện thông báo xoay máy nếu ngang).

## Risks / Trade-offs

- [Mini-game thối tiền lặp lại gây chán] → Tip thưởng tốc độ, nút "Tự tính" từ level 3, giai đoạn 3 giao cho thu ngân.
- [Màn hình nhỏ khó chạm đúng món] → Icon 32px trở lên, món được yêu cầu nhấp nháy nhẹ trên kệ ở 2 level đầu.
- [Asset pixel art tốn thời gian] → Dùng asset tạm (hình khối + emoji) ở task đầu, thay dần; khóa kích thước tile để thay không vỡ layout.
- [localStorage bị xóa trên iOS sau 7 ngày không mở] → Chấp nhận ở MVP; giai đoạn sau thêm xuất/nhập mã lưu game.
- [Phaser bundle ~1MB] → Gzip + cache PWA; màn tải có progress bar.

## Migration Plan

Không có dữ liệu cũ. Deploy: `npm run build` → `dist/` → Vercel. Rollback bằng redeploy bản trước trên Vercel.

## Open Questions

- Có dùng nhạc nền riêng hay nhạc miễn phí bản quyền (ví dụ từ OpenGameArt)?
- Tên nhân vật chính / câu chuyện "về quê giữ tiệm của bà" có đưa vào ngay MVP (1 đoạn hội thoại mở đầu) không? Mặc định: có, 3 câu thoại ngắn.
