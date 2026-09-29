import type Phaser from 'phaser';
import { compressSave, decompressSave } from '../core/compress';

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
export function installPerfOverlay(game: Phaser.Game, getBenchmarkState?: () => unknown): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('perf') !== '1') return;
  perfEnabled = true;

  const samples: FrameSample[] = [];
  let lastSaveOperation = 'chưa đo';
  const onPerfOperation = (event: Event) => {
    const detail = (event as CustomEvent<{ name?: string; mode?: string; durationMs?: number; sizeChars?: number }>).detail;
    if (!detail || !Number.isFinite(detail.durationMs)) return;
    const size = Number.isFinite(detail.sizeChars) ? ` · ${(detail.sizeChars! / 1024).toFixed(1)} KB` : '';
    lastSaveOperation = `${detail.name ?? 'save'} · ${detail.mode ?? '—'} · ${detail.durationMs!.toFixed(1)} ms${size}`;
  };
  window.addEventListener('thdh-perf-operation', onPerfOperation);
  let previousGameFrame = 0;
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
  let saveBenchResult = '';
  let saveBenchmarkButton: HTMLButtonElement | null = null;
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
  const reset = makeButton('Đặt lại', 'Xóa số liệu đang ghi', () => { samples.length = 0; previousGameFrame = 0; });
  const copy = makeButton('Sao chép', 'Sao chép số liệu để gửi', () => {
    const value = body.textContent ?? '';
    void navigator.clipboard?.writeText(value).then(() => { copy.textContent = 'Đã chép'; setTimeout(() => { copy.textContent = 'Sao chép'; }, 1200); }).catch(() => { copy.textContent = 'Không chép được'; });
  });
  actions.append(reset, copy);
  if (params.get('save-bench') === '1' && getBenchmarkState) {
    saveBenchmarkButton = makeButton('Chờ game', 'Đo save thường và payload lịch sử lớn (không ghi save)', () => {
      if (!game.scene.isActive('Title')) return;
      saveBenchmarkButton!.disabled = true;
      saveBenchmarkButton!.textContent = 'Đang đo…';
      saveBenchResult = 'Benchmark save đang chạy…';
      const source = getBenchmarkState();
      const medium = structuredClone(source);
      const syntheticLarge = makeLargeBenchmarkPayload(source);
      void runSaveBenchmark('Save hiện tại', medium)
        .then((normal) => runSaveBenchmark('Payload lịch sử stress', syntheticLarge).then((large) => {
          saveBenchResult = [normal, large].map((item) => `${item.name} · ${item.sizeKb.toFixed(1)} KB: nén p50 ${item.compressP50.toFixed(1)} / p95 ${item.compressP95.toFixed(1)} ms; giải nén p50 ${item.decompressP50.toFixed(1)} / p95 ${item.decompressP95.toFixed(1)} ms`).join('\n');
        }))
        .catch((error: unknown) => { saveBenchResult = `Benchmark lỗi: ${error instanceof Error ? error.message : String(error)}`; })
        .finally(() => { saveBenchmarkButton!.disabled = false; saveBenchmarkButton!.textContent = 'Save test'; });
    });
    saveBenchmarkButton.disabled = true;
    actions.append(saveBenchmarkButton);
  }
  actions.append(hide);
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
    if (saveBenchmarkButton?.textContent === 'Chờ game' && game.scene.isActive('Title')) {
      saveBenchmarkButton.disabled = false;
      saveBenchmarkButton.textContent = 'Save test';
    }
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
      const countObject = (object: Phaser.GameObjects.GameObject, parentVisible = true): void => {
        shopObjects++;
        const state = object as Phaser.GameObjects.GameObject & { visible?: boolean; alpha?: number; list?: Phaser.GameObjects.GameObject[] };
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
      body.textContent = `FPS Phaser TB: ${mean ? (1000 / mean).toFixed(1) : 'đang đo…'}   ·   p1: ${p99 ? (1000 / p99).toFixed(1) : '—'}\nKhung Phaser >33 ms: ${over33}   ·   >50 ms: ${over50}\nSố mẫu: ${intervals.length} / 5 giây\nCảnh: ${scene}\nShop objects: ${shopVisible}/${shopObjects} hiển thị/tổng\nShop loại nhiều nhất: ${objectTypes}\nShop ms/lần: ${parts}\nPhaser ms/frame: trước ${phaserParts[0]} · cảnh ${phaserParts[1]} · vẽ ${phaserParts[2]}\nSave gần nhất: ${lastSaveOperation}${saveBenchResult ? `\n${saveBenchResult}` : ''}\n${renderer} · DPR ${window.devicePixelRatio || 1} · ${screen.width}×${screen.height}`;
    }
    raf = window.requestAnimationFrame(frame);
  };
  raf = window.requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => {
    window.cancelAnimationFrame(raf);
    window.removeEventListener('thdh-perf-operation', onPerfOperation);
  }, { once: true });
}

interface SaveBenchmarkResult {
  name: string;
  sizeKb: number;
  compressP50: number;
  compressP95: number;
  decompressP50: number;
  decompressP95: number;
}

function makeLargeBenchmarkPayload(source: unknown): unknown {
  const skuCount = 120;
  const analytics = Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    revenue: 1_200_000 + index * 17_351,
    profit: 180_000 + index * 3_119,
    cogs: 730_000 + index * 9_071,
    wages: 110_000,
    electricity: 24_000,
    spoiled: index % 3 ? 0 : 3_600,
    theft: index % 7 ? 0 : 20_000,
    customers: 80 + index,
    avgRating: 4.1 + (index % 9) / 10,
    sold: Object.fromEntries(Array.from({ length: skuCount }, (_, sku) => [`sku_${sku}`, (index * 17 + sku * 11) % 240])),
    hourly: Array.from({ length: 14 }, (_, hour) => (index * 3 + hour * 7) % 22),
    staff: Object.fromEntries(Array.from({ length: 12 }, (_, staff) => [`staff_${staff}`, { served: (index + staff) % 35, jobs: (index * 2 + staff) % 18, ratingCount: 4, ratingSum: 17 }])),
    manager: index % 2 === 0,
    internalCost: index * 1_250,
  }));
  const archive = Array.from({ length: 900 }, (_, index) => ({
    day: index % 365,
    kind: ['sale', 'restock', 'delivery', 'review'][index % 4],
    note: `Giao dịch ${index}: khách ghé tiệm, hàng được kiểm và cập nhật tồn kho.`,
    amount: (index * 7_919) % 500_000,
  }));
  return { source, analytics, archive };
}

async function runSaveBenchmark(name: string, value: unknown): Promise<SaveBenchmarkResult> {
  const compressTimes: number[] = [];
  const decompressTimes: number[] = [];
  let sizeChars = 0;
  for (let i = 0; i < 7; i++) {
    const startCompress = performance.now();
    const packed = await compressSave(value);
    const compressMs = performance.now() - startCompress;
    const startDecompress = performance.now();
    const unpacked = await decompressSave(packed);
    const decompressMs = performance.now() - startDecompress;
    if (!unpacked || typeof unpacked !== 'object') throw new Error('Round-trip save không hợp lệ');
    if (i > 0) { compressTimes.push(compressMs); decompressTimes.push(decompressMs); }
    sizeChars = packed.length;
  }
  const percentile = (values: number[], p: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * p))];
  };
  return {
    name,
    sizeKb: sizeChars * 2 / 1024,
    compressP50: percentile(compressTimes, 0.5),
    compressP95: percentile(compressTimes, 0.95),
    decompressP50: percentile(decompressTimes, 0.5),
    decompressP95: percentile(decompressTimes, 0.95),
  };
}
