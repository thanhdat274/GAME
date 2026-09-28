import { registerSW } from 'virtual:pwa-register';

/** Kiểm tra bản mới định kỳ khi đang mở (app gắn ra màn hình chính ít khi tải lại trang). */
const CHECK_EVERY_MS = 30 * 60 * 1000;
/** Bấm "Kiểm tra cập nhật" (màn chính / tạm dừng) thì chờ tối đa ngần này để xem có bản mới không. */
const MANUAL_CHECK_TIMEOUT_MS = 6000;

export type ManualCheckResult = 'applying' | 'updated' | 'latest' | 'offline' | 'unavailable';

let registration: ServiceWorkerRegistration | undefined;
let updateFound = false;
let bannerShown = false;
let applyUpdateFn: (() => void) | undefined;
let checkFn: (() => void) | undefined;

/**
 * Khi có bản cập nhật mới: hiện nút "Cập nhật" nổi phía trên game. Bấm vào thì lưu game,
 * kích hoạt service worker mới rồi tải lại trang để lấy giao diện mới.
 * Việc tự bấm kiểm tra ngay (đề phòng lúc app không tự báo có bản mới) nằm ở nút
 * "Kiểm tra cập nhật" trên màn hình chính / bảng tạm dừng, gọi qua checkForUpdate().
 */
export function installUpdateBanner(beforeReload: () => void): void {
  const check = () => {
    if (!registration || registration.installing || !navigator.onLine) return;
    registration.update().catch(() => undefined);
  };
  checkFn = check;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      updateFound = true;
      show();
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg;
      if (!reg) return;
      setInterval(check, CHECK_EVERY_MS);
    },
  });

  const applyUpdate = () => {
    try { beforeReload(); } catch { /* vẫn cập nhật dù lưu lỗi */ }
    // Service worker mới không nhận quyền điều khiển (vd. trình duyệt chặn) thì vẫn tải lại sau 3 giây.
    setTimeout(() => window.location.reload(), 3000);
    void updateSW(true);
  };
  applyUpdateFn = applyUpdate;

  // Mở lại app từ nền (iOS giữ trang cũ trong bộ nhớ): kiểm tra ngay.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('online', check);

  let banner: HTMLDivElement | null = null;
  function show(): void {
    if (banner) return;
    bannerShown = true;
    banner = document.createElement('div');
    banner.setAttribute('role', 'alert');
    banner.style.cssText = [
      'position:fixed',
      'left:50%',
      'transform:translateX(-50%)',
      'top:calc(env(safe-area-inset-top) + 8px)',
      'width:max-content',
      'white-space:nowrap',
      'z-index:20',
      'display:flex',
      'align-items:center',
      'gap:8px',
      'padding:6px 4px 6px 12px',
      'max-width:calc(100vw - 32px)',
      'box-sizing:border-box',
      'background:#3b2618',
      'color:#f6e3c4',
      'border:2px solid #f2b632',
      'border-radius:14px',
      'box-shadow:0 4px 14px rgba(0,0,0,.45)',
      'font:600 13px system-ui,sans-serif',
      'touch-action:manipulation',
    ].join(';');
    const text = document.createElement('span');
    text.textContent = '🆕 Có bản cập nhật mới';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Cập nhật';
    btn.style.cssText = 'border:0;border-radius:10px;padding:8px 14px;background:#4caf50;color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Để sau');
    close.style.cssText = 'border:0;background:transparent;color:#f6e3c4;font:700 16px system-ui,sans-serif;padding:4px 6px;cursor:pointer';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = 'Đang tải…';
      applyUpdate();
    });
    close.addEventListener('click', () => {
      banner?.remove();
      banner = null;
    });
    banner.append(text, btn, close);
    document.body.appendChild(banner);
  }
}

/**
 * Kiểm tra bản mới ngay khi được gọi từ nút "Kiểm tra cập nhật" (màn hình chính hoặc bảng
 * tạm dừng). Nếu đã tìm thấy bản mới từ trước thì áp dụng luôn (lưu game rồi tải lại trang).
 */
export function checkForUpdate(): Promise<ManualCheckResult> {
  if (!checkFn) return Promise.resolve('unavailable');
  if (bannerShown) {
    applyUpdateFn?.();
    return Promise.resolve('applying');
  }
  if (!navigator.onLine) return Promise.resolve('offline');
  updateFound = false;
  checkFn();
  return new Promise((resolve) => {
    setTimeout(() => resolve(updateFound ? 'updated' : 'latest'), MANUAL_CHECK_TIMEOUT_MS);
  });
}

/** Thông báo ngắn tương ứng kết quả checkForUpdate(), để hiện qua toast() trong game. */
export function manualCheckMessage(result: ManualCheckResult): string {
  switch (result) {
    case 'applying': return 'Đang tải bản mới…';
    case 'updated': return 'Có bản mới! Bấm nút "Cập nhật" ở đầu màn hình để tải.';
    case 'latest': return 'Đã là bản mới nhất';
    case 'offline': return 'Đang ngoại tuyến, không kiểm tra được';
    case 'unavailable': return 'Chỉ kiểm tra được ở bản đã phát hành';
  }
}
