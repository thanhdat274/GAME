import type * as Engine from '../engine';
import { world } from '../engine/runtime';

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

/** Lightweight browser overlay for collecting mobile PWA frame pacing. */
export function installPerfOverlay(game: Engine.Game): void {
  const params = new URLSearchParams(window.location.search);
  const startOpen = params.get('perf') === '1';

  const samples: FrameSample[] = [];
  let previousGameFrame = 0;
  let lastPaint = 0;
  let phaseStart = 0;
  let raf = 0;
  const root = document.createElement('section');
  root.setAttribute('aria-label', 'Đo hiệu năng');
  root.style.cssText = 'position:fixed;z-index:9999;top:calc(env(safe-area-inset-top,0px) + 8px);left:calc(env(safe-area-inset-left,0px) + 8px);width:min(255px,calc(100vw - 16px));max-height:calc(100dvh - 24px);overflow:auto;font:12px/1.4 system-ui,sans-serif;color:#fff;background:rgba(25,20,17,.92);border:1px solid #c8a77c;border-radius:8px;box-shadow:0 2px 10px #0008;pointer-events:auto;touch-action:pan-y;';
  root.style.display = startOpen ? 'block' : 'none';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;background:#3b2618;border-radius:8px 8px 0 0;font-weight:700;white-space:nowrap;touch-action:none;cursor:move;';
  header.innerHTML = '<span style="font-size:11px">Đo hiệu năng · 5s</span>';
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
  // Kéo bảng khỏi HUD hoặc vùng chơi đang cần quan sát, nhất là trên điện thoại.
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  header.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = root.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const left = Math.max(4, Math.min(window.innerWidth - root.offsetWidth - 4, drag.left + event.clientX - drag.x));
    const top = Math.max(4, Math.min(window.innerHeight - 48, drag.top + event.clientY - drag.y));
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  });
  const finishDrag = () => { drag = null; };
  header.addEventListener('pointerup', finishDrag);
  header.addEventListener('pointercancel', finishDrag);
  const restore = makeButton('FPS', 'Mở bảng đo hiệu năng', () => {
    perfEnabled = true;
    game.measure = true;
    root.style.display = 'block';
    restore.style.display = 'none';
    if (!raf) raf = window.requestAnimationFrame(frame);
  });
  restore.style.cssText += 'position:fixed;z-index:9999;top:50%;left:calc(env(safe-area-inset-left,0px) + 8px);transform:translateY(-50%);pointer-events:auto;touch-action:none;';
  const hide = makeButton('Ẩn', 'Thu gọn bảng đo', () => { root.style.display = 'none'; restore.style.display = 'block'; });
  const reset = makeButton('Đặt lại', 'Xóa số liệu đang ghi', () => { samples.length = 0; previousGameFrame = 0; });
  const copy = makeButton('Sao chép', 'Sao chép số liệu để gửi', () => {
    const value = body.textContent ?? '';
    void navigator.clipboard?.writeText(value).then(() => { copy.textContent = 'Đã chép'; setTimeout(() => { copy.textContent = 'Sao chép'; }, 1200); }).catch(() => { copy.textContent = 'Không chép được'; });
  });
  actions.append(reset, copy, hide);
  header.append(actions);
  root.append(header, body);
  document.body.append(root, restore);
  if (startOpen) {
    perfEnabled = true;
    game.measure = true;
    restore.style.display = 'none';
  }

  // Cùng các mốc vòng khung hình như bản Phaser: trước bước, các scene (ECS systems), rồi vẽ.
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
    if (previousGameFrame > 0 && document.visibilityState === 'visible') {
      samples.push({ at: now, duration: now - previousGameFrame });
    }
    previousGameFrame = now;
  });

  // Rebase after tab switches so background throttling is not counted as a game hitch.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') previousGameFrame = 0;
  });

  const frame = (now: number) => {
    while (samples.length && now - samples[0].at > WINDOW_MS) samples.shift();
    if (now - lastPaint >= 500) {
      lastPaint = now;
      const intervals = samples.map((item) => item.duration).sort((a, b) => a - b);
      const mean = intervals.length ? intervals.reduce((sum, n) => sum + n, 0) / intervals.length : 0;
      const p99 = intervals.length ? intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * 0.99))] : 0;
      const over33 = intervals.filter((n) => n > 33.3).length;
      const over50 = intervals.filter((n) => n > 50).length;
      const scene = game.scene.getScenes(true).map((item) => item.scene.key).join(', ') || '—';
      const shop = game.scene.getScene('Shop');
      let shopObjects = 0;
      let shopVisible = 0;
      const shopTypes = new Map<string, { total: number; visible: number }>();
      const countObject = (object: Engine.GameObjects.GameObject, parentVisible = true): void => {
        shopObjects++;
        const state = object as Engine.GameObjects.GameObject & { visible?: boolean; alpha?: number; list?: Engine.GameObjects.GameObject[] };
        const visible = parentVisible && state.visible !== false && (state.alpha === undefined || state.alpha > 0);
        if (visible) shopVisible++;
        const type = (state as typeof state & { type?: string }).type ?? object.constructor.name;
        const typeCount = shopTypes.get(type) ?? { total: 0, visible: 0 };
        typeCount.total++;
        if (visible) typeCount.visible++;
        shopTypes.set(type, typeCount);
        if (state.list) state.list.forEach((child) => countObject(child, visible));
      };
      if (shop?.sys?.isActive()) shop.children.list.forEach((object) => countObject(object));
      const objectTypes = [...shopTypes.entries()]
        .sort((a, b) => b[1].visible - a[1].visible)
        .slice(0, 4)
        .map(([type, count]) => `${type} ${count.visible}`)
        .join(' · ') || '—';
      // PixiJS RendererType: WEBGL = 1, WEBGPU = 2.
      const renderer = game.renderer.type === 1 ? 'WebGL' : game.renderer.type === 2 ? 'WebGPU' : 'Canvas';
      const systems = [...world.timings.entries()].map(([name, ms]) => `${name} ${ms.toFixed(2)}`).join(' · ');
      const parts = ['sim', 'map', 'ui', 'actors'].map((key) => {
        const value = sectionTimes.get(key);
        return `${key} ${value?.count ? (value.total / value.count).toFixed(1) : '—'}`;
      }).join(' · ');
      const phaserParts = ['phaserPre', 'phaserScenes', 'phaserRender'].map((key) => {
        const value = sectionTimes.get(key);
        return value?.count ? (value.total / value.count).toFixed(1) : '—';
      });
      sectionTimes.clear();
      body.textContent = `FPS PixiJS+ECS TB: ${mean ? (1000 / mean).toFixed(1) : 'đang đo…'}   ·   p1: ${p99 ? (1000 / p99).toFixed(1) : '—'}\nKhung >33 ms: ${over33}   ·   >50 ms: ${over50}\nSố mẫu: ${intervals.length} / 5 giây\nCảnh: ${scene}\nShop objects: ${shopVisible}/${shopObjects} hiển thị/tổng\nShop loại nhiều nhất: ${objectTypes}\nShop ms/lần: ${parts}\nEngine ms/frame: trước ${phaserParts[0]} · cảnh ${phaserParts[1]} · vẽ ${phaserParts[2]}\nECS: ${world.entityCount} entity · ${systems}\n${renderer} · DPR ${window.devicePixelRatio || 1} · ${screen.width}×${screen.height}`;
    }
    raf = window.requestAnimationFrame(frame);
  };
  if (startOpen) raf = window.requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => window.cancelAnimationFrame(raf), { once: true });
}
