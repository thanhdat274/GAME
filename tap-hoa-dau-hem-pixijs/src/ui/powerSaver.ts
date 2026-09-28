import type * as Engine from '../engine';

/** Nhịp khi màn hình đứng yên (đang mở bảng/menu, không chạm): đủ cho nút sáng/nhấp nháy, máy được nghỉ. */
const IDLE_FPS = 15;
/** Sau lần chạm/cuộn cuối cùng giữ nhịp đầy đủ chừng này để hiệu ứng mở bảng và cuộn danh sách vẫn mượt. */
const INPUT_GRACE_MS = 1500;

interface LimitedLoop {
  fpsLimit: number;
  hasFpsLimit: boolean;
  _limitRate: number;
}

let game: Engine.Game | null = null;
let baseFps = 60;
let idleWanted = false;
let lastInputAt = 0;
let throttled = false;

function applyCap(fps: number): void {
  const loop = game?.loop as unknown as LimitedLoop | undefined;
  // Chỉ chỉnh khi vòng lặp đã chạy chế độ giới hạn FPS (cấu hình fps.limit > 0 ở main.ts).
  if (!loop?.hasFpsLimit) return;
  loop.fpsLimit = fps;
  loop._limitRate = 1000 / fps;
}

function refresh(now = performance.now()): void {
  const shouldThrottle = idleWanted && now - lastInputAt >= INPUT_GRACE_MS;
  if (shouldThrottle === throttled) return;
  throttled = shouldThrottle;
  applyCap(throttled ? Math.min(IDLE_FPS, baseFps) : baseFps);
}

/**
 * Hạ nhịp khung hình khi scene báo đang đứng yên. Chạm/cuộn/phím bất kỳ trả lại nhịp đầy đủ ngay lập tức,
 * nên người chơi không cảm thấy khựng; thời gian game vẫn đúng vì Phaser cộng dồn delta giữa các khung.
 */
export function installPowerSaver(target: Engine.Game, fps: number): void {
  game = target;
  baseFps = fps;
  const wake = () => {
    lastInputAt = performance.now();
    refresh(lastInputAt);
  };
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const) {
    window.addEventListener(type, wake, { passive: true, capture: true });
  }
  target.events.on('step', () => refresh());
}

/** Scene gọi mỗi khung hình (hoặc khi đổi trạng thái): true = màn hình tĩnh, được phép hạ nhịp. */
export function setPowerIdle(idle: boolean): void {
  if (idle === idleWanted) return;
  idleWanted = idle;
  refresh();
}
