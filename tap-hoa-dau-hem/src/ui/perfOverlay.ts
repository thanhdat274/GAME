import type Phaser from 'phaser';

interface FrameSample {
  at: number;
  duration: number;
}

const WINDOW_MS = 5000;
export let perfEnabled = false;

interface SectionTime { total: number; count: number; max: number }
const sectionTimes = new Map<string, SectionTime>();

/** Add an optional timing sample from instrumented game sections. */
export function recordPerfSection(name: string, durationMs: number): void {
  if (!perfEnabled) return;
  const current = sectionTimes.get(name) ?? { total: 0, count: 0, max: 0 };
  current.total += durationMs;
  current.count++;
  current.max = Math.max(current.max, durationMs);
  sectionTimes.set(name, current);
}

/** Lightweight, URL-gated browser overlay for collecting mobile PWA frame pacing. */
export function installPerfOverlay(game: Phaser.Game): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('perf') !== '1') return;
  perfEnabled = true;

  const samples: FrameSample[] = [];
  let previous = 0;
  let lastPaint = 0;
  let phaseStart = 0;
  let raf = 0;
  const root = document.createElement('section');
  root.setAttribute('aria-label', 'Đo hiệu năng');
  root.style.cssText = 'position:fixed;z-index:9999;top:calc(env(safe-area-inset-top,0px) + 8px);left:calc(env(safe-area-inset-left,0px) + 8px);width:min(255px,calc(100vw - 16px));font:12px/1.4 system-ui,sans-serif;color:#fff;background:rgba(25,20,17,.92);border:1px solid #c8a77c;border-radius:8px;box-shadow:0 2px 10px #0008;pointer-events:auto;touch-action:none;';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:#3b2618;border-radius:8px 8px 0 0;font-weight:700;';
  header.innerHTML = '<span>Đo hiệu năng · 5 giây</span>';
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:5px;';
  const body = document.createElement('div');
  body.style.cssText = 'padding:7px 9px;white-space:pre-line;font-variant-numeric:tabular-nums;';
  const makeButton = (label: string, title: string, handler: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.style.cssText = 'border:0;border-radius:4px;padding:3px 6px;background:#f6e3c4;color:#3b2a1f;font:600 11px system-ui;';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      handler();
    });
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
    return button;
  };
  const restore = makeButton('FPS', 'Mở bảng đo hiệu năng', () => { root.style.display = 'block'; restore.style.display = 'none'; });
  restore.style.cssText += 'position:fixed;z-index:9999;top:50%;left:calc(env(safe-area-inset-left,0px) + 8px);transform:translateY(-50%);pointer-events:auto;touch-action:none;';
  const hide = makeButton('Ẩn', 'Thu gọn bảng đo', () => { root.style.display = 'none'; restore.style.display = 'block'; });
  const reset = makeButton('Đặt lại', 'Xóa số liệu đang ghi', () => { samples.length = 0; previous = 0; });
  const copy = makeButton('Sao chép', 'Sao chép số liệu để gửi', () => {
    const value = body.textContent ?? '';
    void navigator.clipboard?.writeText(value).then(() => { copy.textContent = 'Đã chép'; setTimeout(() => { copy.textContent = 'Sao chép'; }, 1200); }).catch(() => { copy.textContent = 'Không chép được'; });
  });
  actions.append(reset, copy, hide);
  header.append(actions);
  root.append(header, body);
  document.body.append(root, restore);

  // Phaser's global step lifecycle: managers, active scenes, then renderer.
  game.events.on('prestep', () => { phaseStart = performance.now(); });
  game.events.on('step', () => {
    const now = performance.now();
    if (phaseStart) recordPerfSection('phaserPre', now - phaseStart);
    phaseStart = now;
  });
  game.events.on('poststep', () => {
    const now = performance.now();
    if (phaseStart) recordPerfSection('phaserScenes', now - phaseStart);
    phaseStart = now;
  });
  game.events.on('postrender', () => {
    const now = performance.now();
    if (phaseStart) recordPerfSection('phaserRender', now - phaseStart);
    phaseStart = 0;
  });

  const frame = (now: number) => {
    if (previous > 0 && document.visibilityState === 'visible') {
      const duration = now - previous;
      // Ignore large gaps caused by switching tabs; count them separately as stalls.
      samples.push({ at: now, duration });
    }
    previous = now;
    while (samples.length && now - samples[0].at > WINDOW_MS) samples.shift();
    if (now - lastPaint >= 500) {
      lastPaint = now;
      const intervals = samples.map((item) => item.duration).sort((a, b) => a - b);
      const mean = intervals.length ? intervals.reduce((sum, n) => sum + n, 0) / intervals.length : 0;
      const p99 = intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.99))] : 0;
      const over33 = intervals.filter((n) => n > 33.3).length;
      const over50 = intervals.filter((n) => n > 50).length;
      const scene = game.scene.getScenes(true).map((item) => item.scene.key).join(', ') || '—';
      // Phaser renderer constants: CANVAS = 1, WEBGL = 2.
      const renderer = game.renderer.type === 2 ? 'WebGL' : 'Canvas';
      const parts = ['sim', 'map', 'ui', 'actors'].map((key) => {
        const value = sectionTimes.get(key);
        return `${key} ${value?.count ? (value.total / value.count).toFixed(1) : '—'}`;
      }).join(' · ');
      const phaserParts = ['phaserPre', 'phaserScenes', 'phaserRender'].map((key) => {
        const value = sectionTimes.get(key);
        return value?.count ? (value.total / value.count).toFixed(1) : '—';
      });
      sectionTimes.clear();
      body.textContent = `FPS TB: ${mean ? (1000 / mean).toFixed(1) : 'đang đo…'}   ·   p1: ${p99 ? (1000 / p99).toFixed(1) : '—'}\nKhung hình >33 ms: ${over33}   ·   >50 ms: ${over50}\nSố mẫu: ${intervals.length} / 5 giây\nCảnh: ${scene}\nShop ms/lần: ${parts}\nPhaser ms/frame: trước ${phaserParts[0]} · cảnh ${phaserParts[1]} · vẽ ${phaserParts[2]}\n${renderer} · DPR ${window.devicePixelRatio || 1} · ${screen.width}×${screen.height}`;
    }
    raf = window.requestAnimationFrame(frame);
  };
  raf = window.requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(raf), { once: true });
}
