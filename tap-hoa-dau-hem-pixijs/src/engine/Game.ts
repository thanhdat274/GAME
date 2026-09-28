import { Application, CanvasTextMetrics, Container as PixiContainer, EventEmitter } from 'pixi.js';
import { world, runtime } from './runtime';
import { InputManager } from './input/Input';
import { SceneManager } from './scene/SceneManager';
import type { Scene } from './scene/Scene';
import { TextureManager } from './textures';
import { sceneQueueSystem, sceneStepSystem } from './systems';

export interface GameConfig {
  parent: string | HTMLElement;
  width: number;
  height: number;
  /** Số điểm ảnh canvas cho mỗi đơn vị logic (tương đương camera zoom của bản Phaser). */
  resolution?: number;
  backgroundColor?: string | number;
  fps?: { limit?: number; target?: number; min?: number; forceSetTimeOut?: boolean };
  antialias?: boolean;
  scene: (new () => Scene)[];
}

/**
 * Đồng hồ khung hình sao chép hành vi TimeStep của Phaser (làm mượt delta 10 khung, giới hạn FPS)
 * để tốc độ mô phỏng hai bản giống hệt nhau; khác biệt khi so sánh chỉ còn ở phần cập nhật + vẽ.
 */
class TimeStep {
  private lastTime = 0;
  private history: number[];
  private index = 0;
  private coolDown = 0;
  private accumulated = 0;
  readonly target: number;
  readonly min: number;
  /**
   * Giới hạn FPS, đặt tên như các trường của Phaser.Core.TimeStep để mã game (powerSaver)
   * có thể hạ / trả nhịp lúc đang chạy y như trên bản Phaser.
   */
  fpsLimit: number;
  readonly hasFpsLimit: boolean;
  _limitRate: number;
  running = false;
  actualFps = 0;
  private framesThisSecond = 0;
  private nextFpsUpdate = 0;

  private readonly useTimeout: boolean;

  constructor(cfg: GameConfig['fps'] = {}, private step: (time: number, delta: number) => void) {
    this.useTimeout = !!cfg.forceSetTimeOut;
    this.target = 1000 / (cfg.target ?? 60);
    this.min = 1000 / (cfg.min ?? 5);
    this.fpsLimit = cfg.limit ?? 0;
    this.hasFpsLimit = this.fpsLimit > 0;
    this._limitRate = this.hasFpsLimit ? 1000 / this.fpsLimit : 0;
    this.history = new Array(10).fill(this.target);
  }

  private smooth(delta: number): number {
    if (this.coolDown > 0) { this.coolDown--; delta = Math.min(delta, this.target); }
    if (delta > this.min) delta = Math.min(this.history[this.index], this.min);
    this.history[this.index] = delta;
    this.index = (this.index + 1) % this.history.length;
    return this.history.reduce((a, b) => a + b, 0) / this.history.length;
  }

  /** Mỗi lần start() tăng thế hệ: khung đã hẹn từ vòng cũ sẽ tự bỏ, tránh chạy hai vòng song song. */
  private generation = 0;

  private frame(gen: number, time: number): void {
    if (!this.running || gen !== this.generation) return;
    // Hẹn khung kế tiếp trước: lỗi trong một khung không làm dừng hẳn vòng lặp.
    this.schedule(gen);
    const delta = this.smooth(Math.max(0, time - this.lastTime));
    if (time >= this.nextFpsUpdate) {
      this.actualFps = this.framesThisSecond;
      this.framesThisSecond = 0;
      this.nextFpsUpdate = time + 1000;
    }
    this.framesThisSecond++;
    this.lastTime = time;
    if (this.hasFpsLimit) {
      this.accumulated += delta;
      if (this.accumulated >= this._limitRate) {
        const d = this.accumulated;
        this.accumulated = 0;
        this.step(time, d);
      }
    } else this.step(time, delta);
  }

  /** Như Phaser `fps.forceSetTimeOut`: dùng setTimeout khi rAF bị trình duyệt hãm (khung xem ẩn). */
  private schedule(gen: number): void {
    if (this.useTimeout) setTimeout(() => this.frame(gen, performance.now()), this.target);
    else requestAnimationFrame((t) => this.frame(gen, t));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.resetDelta();
    this.schedule(++this.generation);
  }

  stop(): void { this.running = false; }
  /** Tên như Phaser TimeStep. */
  sleep(): void { this.stop(); }
  wake(): void { this.start(); }

  resetDelta(): void {
    this.lastTime = performance.now();
    this.history.fill(this.target);
    this.coolDown = 100;
    this.accumulated = 0;
  }
}

/**
 * Phaser 3.90 đo ascent/descent của font bằng chuỗi mẫu "|MÃ‰qgy" (chuỗi "|MÉqÅ" bị lỗi mã hoá trong mã nguồn Phaser).
 * Dùng đúng chuỗi đó để chiều cao dòng và vị trí chân chữ trùng khớp từng điểm ảnh với bản gốc.
 */
CanvasTextMetrics.METRICS_STRING = '|MÃ‰qgy';
CanvasTextMetrics.BASELINE_SYMBOL = '';
CanvasTextMetrics.clearMetrics();

export class Game {
  readonly config: { width: number; height: number; resolution: number };
  readonly events = new EventEmitter();
  readonly textures = new TextureManager();
  readonly app = new Application();
  readonly scene: SceneManager;
  readonly stage = new PixiContainer();
  readonly domLayer: HTMLDivElement;
  readonly parent: HTMLElement;
  canvas!: HTMLCanvasElement;
  input!: InputManager;
  loop!: TimeStep;
  cssScale = 1;
  isBooted = false;
  frame = 0;
  unlockAudio?: () => void;
  /** Đo từng phần của khung hình (bảng ?perf=1). */
  measure = false;

  constructor(private cfg: GameConfig) {
    runtime.game = this;
    this.config = { width: cfg.width, height: cfg.height, resolution: cfg.resolution ?? 1 };
    this.parent = typeof cfg.parent === 'string' ? document.getElementById(cfg.parent)! : cfg.parent;
    this.domLayer = document.createElement('div');
    this.domLayer.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0;';
    this.scene = new SceneManager(this, cfg.scene);
    void this.boot();
  }

  get renderer() { return this.app.renderer; }

  private async boot(): Promise<void> {
    const { width, height, resolution } = this.config;
    await this.app.init({
      width,
      height,
      resolution,
      autoDensity: false,
      antialias: this.cfg.antialias ?? false,
      background: this.cfg.backgroundColor ?? 0x000000,
      preference: 'webgl',
      autoStart: false,
      sharedTicker: false,
      // Chạm do InputManager của engine xử lý; tắt hệ sự kiện của PixiJS để không duyệt cây hai lần.
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
      powerPreference: 'high-performance',
    });
    this.app.ticker.stop();
    runtime.renderer = this.app.renderer;
    this.canvas = this.app.canvas;
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';
    this.app.stage.eventMode = 'none';
    this.app.stage.addChild(this.stage);
    this.parent.style.position ||= 'fixed';
    this.parent.append(this.canvas);
    this.parent.append(this.domLayer);
    this.input = new InputManager(this, this.canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(this.parent);

    world.addSystem(sceneQueueSystem(this.scene));
    world.addSystem(sceneStepSystem(this.scene));

    this.scene.boot();
    this.loop = new TimeStep(this.cfg.fps, (time, delta) => this.step(time, delta));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.events.emit('hidden');
        this.loop.stop();
      } else {
        this.events.emit('visible');
        this.loop.start();
      }
    });
    window.addEventListener('blur', () => this.events.emit('blur'));
    window.addEventListener('focus', () => this.events.emit('focus'));
    this.isBooted = true;
    this.events.emit('ready');
    this.loop.start();
  }

  /** Co canvas vừa khung cha, giữ tỉ lệ (giống Phaser Scale.FIT). */
  private resize(): void {
    if (!this.canvas) return;
    const rect = this.parent.getBoundingClientRect();
    const pw = rect.width || window.innerWidth;
    const ph = rect.height || window.innerHeight;
    const { width, height } = this.config;
    const k = Math.min(pw / width, ph / height);
    this.cssScale = k;
    this.canvas.style.width = `${Math.floor(width * k)}px`;
    this.canvas.style.height = `${Math.floor(height * k)}px`;
    const canvasRect = this.canvas.getBoundingClientRect();
    this.domLayer.style.left = `${canvasRect.left - rect.left}px`;
    this.domLayer.style.top = `${canvasRect.top - rect.top}px`;
  }

  /** Một khung hình: các system ECS (scene, timer, tween, update) rồi PixiJS vẽ. */
  private step(time: number, delta: number): void {
    this.frame++;
    this.events.emit('prestep', time, delta);
    this.events.emit('step', time, delta);
    world.step(delta, time, this.measure);
    this.events.emit('poststep', time, delta);
    for (const scene of this.scene.scenes) if (scene.sys.isLive()) scene.sys.reconcileRenderGroups();
    this.events.emit('prerender', this.app.renderer, time, delta);
    this.app.renderer.render(this.app.stage);
    this.events.emit('postrender', this.app.renderer, time, delta);
  }
}
