import type { Game } from '../Game';
import { Scene, SceneEvents, SceneStatus } from './Scene';

type Op = { op: 'start' | 'stop'; key: string; data?: unknown };
type SceneCtor = new () => Scene;

/**
 * Quản lý vòng đời scene. Như Phaser: start/stop/restart được xếp hàng và xử lý ở đầu khung hình kế tiếp
 * (SceneQueueSystem trong ECS), còn pause/resume áp dụng ngay.
 */
export class SceneManager {
  readonly scenes: Scene[] = [];
  private keys = new Map<string, Scene>();
  private queue: Op[] = [];
  private booted = false;

  constructor(private game: Game, list: (SceneCtor | Scene)[]) {
    for (const item of list) {
      const scene = item instanceof Scene ? item : new item();
      this.scenes.push(scene);
      this.keys.set(scene.config.key, scene);
    }
  }

  boot(): void {
    for (const scene of this.scenes) {
      scene.bootScene(this.game, this);
      this.game.stage.addChild(scene.sys.root);
    }
    this.booted = true;
    // Scene đầu tiên tự chạy (giống Phaser khi không đặt active cho scene khác).
    if (this.scenes[0]) this.queueOp('start', this.scenes[0].config.key);
  }

  getScene(key: string): Scene | undefined { return this.keys.get(key); }

  getScenes(activeOnly = true): Scene[] {
    return this.scenes.filter((s) => (activeOnly ? s.sys.isActive() : true));
  }

  isActive(key: string): boolean { return !!this.keys.get(key)?.sys.isActive(); }
  isPaused(key: string): boolean { return !!this.keys.get(key)?.sys.isPaused(); }

  /** Scene nhận chạm, từ trên xuống (scene tạm dừng / ngủ / ẩn không nhận). */
  inputOrder(): Scene[] {
    const out: Scene[] = [];
    for (let i = this.scenes.length - 1; i >= 0; i--) {
      const s = this.scenes[i];
      if (s.sys.isActive() && s.sys.isVisible()) out.push(s);
    }
    return out;
  }

  queueOp(op: Op['op'], key: string, data?: unknown): void {
    this.queue.push({ op, key, data });
  }

  processQueue(): void {
    if (!this.booted || !this.queue.length) return;
    const ops = this.queue;
    this.queue = [];
    for (const { op, key, data } of ops) {
      if (op === 'start') this.start(key, data);
      else this.stop(key, data);
    }
  }

  start(key: string, data?: unknown): void {
    const scene = this.keys.get(key);
    if (!scene) return;
    if (scene.sys.isLive()) this.stop(key);
    const sys = scene.sys;
    sys.settings.data = data;
    sys.settings.status = SceneStatus.START;
    scene.tweens.resetClock();
    sys.settings.active = true;
    sys.setVisible(true);
    sys.events.emit(SceneEvents.START, scene);
    sys.events.emit(SceneEvents.READY, scene, data);
    scene.init?.(data ?? {});
    sys.settings.status = SceneStatus.CREATING;
    scene.create?.(data ?? {});
    // Scene có thể đã tự dừng / chuyển cảnh ngay trong create.
    if (sys.settings.status !== SceneStatus.CREATING) return;
    sys.settings.status = SceneStatus.RUNNING;
    sys.attach();
    sys.events.emit(SceneEvents.CREATE, scene);
  }

  stop(key: string, data?: unknown): void {
    const scene = this.keys.get(key);
    if (!scene || !scene.sys.isLive()) return;
    const sys = scene.sys;
    sys.settings.status = SceneStatus.SHUTDOWN;
    sys.settings.active = false;
    sys.detach();
    // "Plugin" dọn trước, rồi mới tới trình nghe của màn chơi (thứ tự đăng ký như Phaser).
    scene.tweens.killAll();
    scene.time.shutdown();
    sys.inputPlugin.shutdown();
    sys.displayList.destroyAll();
    sys.maskLayer.removeChildren().forEach((m) => m.destroy());
    sys.setVisible(false);
    sys.events.emit(SceneEvents.SHUTDOWN, scene, data);
  }

  pause(key: string, data?: unknown): void {
    const scene = this.keys.get(key);
    if (!scene || !scene.sys.isActive()) return;
    scene.sys.settings.status = SceneStatus.PAUSED;
    scene.sys.settings.active = false;
    scene.sys.events.emit(SceneEvents.PAUSE, scene, data);
  }

  resume(key: string, data?: unknown): void {
    const scene = this.keys.get(key);
    if (!scene || !scene.sys.isPaused()) return;
    scene.sys.settings.status = SceneStatus.RUNNING;
    scene.sys.settings.active = true;
    scene.sys.events.emit(SceneEvents.RESUME, scene, data);
  }

  sleep(key: string, data?: unknown): void {
    const scene = this.keys.get(key);
    if (!scene || !scene.sys.isLive()) return;
    scene.sys.settings.status = SceneStatus.SLEEPING;
    scene.sys.settings.active = false;
    scene.sys.setVisible(false);
    scene.sys.events.emit(SceneEvents.SLEEP, scene, data);
  }

  wake(key: string, data?: unknown): void {
    const scene = this.keys.get(key);
    if (!scene || !scene.sys.isSleeping()) return;
    scene.sys.settings.status = SceneStatus.RUNNING;
    scene.sys.settings.active = true;
    scene.sys.setVisible(true);
    scene.sys.events.emit(SceneEvents.WAKE, scene, data);
  }

  bringToTop(key: string): void {
    const scene = this.keys.get(key);
    if (!scene) return;
    const i = this.scenes.indexOf(scene);
    this.scenes.splice(i, 1);
    this.scenes.push(scene);
    this.game.stage.setChildIndex(scene.sys.root, this.game.stage.children.length - 1);
  }
}
