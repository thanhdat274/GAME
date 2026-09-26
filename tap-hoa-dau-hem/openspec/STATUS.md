# Rà soát triển khai (26/09/2026, cập nhật sau khi làm phase 2)

Đối chiếu `config.yaml`, toàn bộ `tasks.md` và các capability spec với mã hiện tại. Dấu `[x]` trong task là trạng thái ghi nhận của change, không tự động xác nhận kiểm thử trên thiết bị hay triển khai production.

| Change | Đã đánh dấu | Chưa đánh dấu | Trạng thái tiếp theo |
| --- | ---: | ---: | --- |
| `phase-1-mvp-core-loop` | 44 | 2 | Chưa deploy lên Vercel/cổng game và chưa có phản hồi 3–5 người chơi thật. |
| `self-service-shopping` | 42 | 3 | Core/UI và test tự động đã có; còn kiểm thử trên điện thoại thật và deploy. |
| `add-google-login-cloud-save` | 20 | 20 | Code đăng nhập, đồng bộ, xung đột, tài khoản, lời mời sau ngày 3 đã có; còn Firebase Console, Emulator (máy chưa có Java), đổi máy thật, email liên hệ thật cho `privacy.html`, deploy. |
| `realtime-shared-shop` | 13 | 4 | Đã thêm lệnh phiên chung cho mối sỉ, bán xả, mặc cả, ghi sổ; còn emulator race test, hai phiên trình duyệt, đo quota/latency và deploy. |
| `phase-2-shop-expansion` | 39 | 3 | Core, dữ liệu, UI, camera kệ + "Về quầy", RenderTexture (58–60 FPS với 7 khách trên trình duyệt giả lập), pixel art nội thất và mô phỏng 30 ngày xong. Còn 8.2–8.4 (điện thoại thật, bản lưu người chơi thật, deploy). |
| `phase-3-staff-and-manager` | 0 | 41 | Chưa bắt đầu; phụ thuộc phase 2 được chơi và deploy. |
| `phase-4-events-food-branches` | 0 | 41 | Chưa bắt đầu; phụ thuộc phase 3. |

## Kiểm tra trong repo

- Vitest: 193/193 test qua (13 file), trong đó `tests/phase2.test.ts` có 45 test cho mặt bằng, kho lô FEFO, hạn dùng, tủ lạnh/điện, mối sỉ, giá bán, sổ nợ, mặc cả, nhiệm vụ, thành tựu, trang trí, mèo quầy, migrate v2→v3 (fixture `tests/fixtures/save-v2.json`) và mã sao lưu.
- TypeScript client và Functions biên dịch qua; `npm run build` (Vite + PWA) qua.
- `npm run playtest -- 30 5`: người chơi dùng "Gợi ý" lên L9 ở ngày ~21–22 (mục tiêu 20–30), hàng tươi hỏng 7–9% (mục tiêu < 10%), lãi ròng dương.
- Chơi thử trình duyệt ở khung 375×812 giả lập: migrate bản v2 L7, mở đất, mua/kéo/xoay nội thất, chặn lối đi bị từ chối, nhập hàng, bán xả, mặc cả, ghi sổ, tổng kết và các màn Kho/Giá/Sổ nợ/Nhiệm vụ; ván mới L1 vẫn như giai đoạn 1. Chưa đo 60fps hay thử trên điện thoại thật.

## Việc cần làm tiếp

1. Cloud-save: cài Java + Firebase CLI để chạy test quy tắc bằng Emulator; cấu hình Firebase/OAuth; điền email liên hệ thật vào `public/privacy.html`; thử đăng nhập trên iOS Safari / Chrome Android / Messenger / Zalo.
2. Chơi thử giai đoạn 1b + 2 trên điện thoại thật, đo lại hiệu năng trên máy thật, lấy phản hồi và deploy (phase 1 11.3–11.4, self-service 9.6b, phase 2 8.2–8.4).
3. Chỉ bắt đầu `phase-3-staff-and-manager` sau khi phase 2 đã chơi được trên production theo `config.yaml`.

Không đánh dấu hoàn thành các task yêu cầu thiết bị thật, Console, Emulator hoặc deploy dựa trên test mô phỏng/trình duyệt cục bộ.
