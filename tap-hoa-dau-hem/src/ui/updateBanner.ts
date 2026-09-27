import { registerSW } from 'virtual:pwa-register';

/** Kiểm tra bản mới định kỳ khi đang mở (app gắn ra màn hình chính ít khi tải lại trang). */
const CHECK_EVERY_MS = 30 * 60 * 1000;
/** Bấm nút "Kiểm tra cập nhật" thì chờ tối đa ngần này để xem có bản mới không. */
const MANUAL_CHECK_TIMEOUT_MS = 6000;

/**
 * Khi có bản cập nhật mới: hiện nút "Cập nhật" nổi phía trên game. Bấm vào thì lưu game,
 * kích hoạt service worker mới rồi tải lại trang để lấy giao diện mới.
 * Ngoài ra có 1 nút nhỏ luôn hiện để tự bấm kiểm tra ngay (đề phòng lúc app không tự báo có bản mới).
 */
export function installUpdateBanner(beforeReload: () => void): void {
  let registration: ServiceWorkerRegistration | undefined;
  let updateFound = false;

  const check = () => {
    if (!registration || registration.installing || !navigator.onLine) return;
    registration.update().catch(() => undefined);
  };

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

  // Mở lại app từ nền (iOS giữ trang cũ trong bộ nhớ): kiểm tra ngay.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('online', check);

  let banner: HTMLDivElement | null = null;
  function show(): void {
    if (banner) return;
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

  let toastEl: HTMLDivElement | null = null;
  function toast(msg: string): void {
    toastEl?.remove();
    toastEl = document.createElement('div');
    toastEl.textContent = msg;
    toastEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'transform:translateX(-50%)',
      'bottom:calc(env(safe-area-inset-bottom) + 72px)',
      'z-index:21',
      'padding:8px 16px',
      'background:#3b2618',
      'color:#f6e3c4',
      'border:2px solid #f2b632',
      'border-radius:12px',
      'box-shadow:0 4px 14px rgba(0,0,0,.45)',
      'font:600 13px system-ui,sans-serif',
      'white-space:nowrap',
    ].join(';');
    document.body.appendChild(toastEl);
    setTimeout(() => { toastEl?.remove(); toastEl = null; }, 2200);
  }

  // Nút nhỏ luôn hiện ở góc màn hình để tự bấm kiểm tra bản mới bất cứ lúc nào.
  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.title = 'Kiểm tra cập nhật';
  checkBtn.setAttribute('aria-label', 'Kiểm tra cập nhật');
  checkBtn.textContent = '⟳';
  checkBtn.style.cssText = [
    'position:fixed',
    'right:calc(env(safe-area-inset-right) + 8px)',
    'bottom:calc(env(safe-area-inset-bottom) + 8px)',
    'z-index:19',
    'width:34px',
    'height:34px',
    'border-radius:50%',
    'border:2px solid #f2b632',
    'background:#3b2618',
    'color:#f6e3c4',
    'font:700 16px system-ui,sans-serif',
    'line-height:1',
    'cursor:pointer',
    'opacity:.85',
    'touch-action:manipulation',
  ].join(';');
  checkBtn.addEventListener('click', () => {
    if (checkBtn.disabled) return;
    if (banner) { applyUpdate(); return; }
    if (!navigator.onLine) { toast('Đang ngoại tuyến, không kiểm tra được'); return; }
    checkBtn.disabled = true;
    checkBtn.textContent = '⏳';
    updateFound = false;
    check();
    setTimeout(() => {
      checkBtn.disabled = false;
      if (updateFound) {
        // Banner "Cập nhật" đã hiện; bấm nút này lần nữa cũng áp dụng bản mới luôn.
        checkBtn.textContent = '🆕';
      } else {
        checkBtn.textContent = '⟳';
        toast('Đã là bản mới nhất');
      }
    }, MANUAL_CHECK_TIMEOUT_MS);
  });
  document.body.appendChild(checkBtn);
}
