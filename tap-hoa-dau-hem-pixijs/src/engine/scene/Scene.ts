import { Container as PixiContainer, EventEmitter, Graphics as PixiGraphics } from 'pixi.js';
import type { Game } from '../Game';
import { Components, world } from '../runtime';
import type { Entity } from '../../ecs/world';
import { Container } from '../gameobjects/Container';
import type { GameObject } from '../gameobjects/GameObject';
import { Graphics, type GraphicsOptions } from '../gameobjects/Graphics';
import { Text, type TextStyleConfig } from '../gameobjects/Text';
import { Arc, DOMElement, Image, NineSlice, Rectangle, RenderTexture, TileSprite, Zone } from '../gameobjects/Shapes';
import { InputPlugin } from '../input/Input';
import type { TextureManager } from '../textures';
import { TweenManager } from '../tweens/Tween';
import { Clock } from '../time/TimerEvent';
import type { SceneManager } from './SceneManager';

export const SceneEvents = {
  BOOT: 'boot',
  START: 'start',
  READY: 'ready',
  CREATE: 'create',
  PRE_UPDATE: 'preupdate',
  UPDATE: 'update',
  POST_UPDATE: 'postupdate',
  PAUSE: 'pause',
  RESUME: 'resume',
  SLEEP: 'sleep',
  WAKE: 'wake',
  SHUTDOWN: 'shutdown',
  DESTROY: 'destroy',
} as const;

export const SceneStatus = {
  PENDING: 0,
  START: 2,
  CREATING: 4,
  RUNNING: 5,
  PAUSED: 6,
  SLEEPING: 7,
  SHUTDOWN: 8,
} as const;
export type SceneStatus = (typeof SceneStatus)[keyof typeof SceneStatus];

type Zindexed = PixiContainer & { _zIndex: number };

/** Danh sách đối tượng cấp scene (sắp theo depth, ổn định theo thứ tự thêm). */
export class DisplayList {
  readonly list: GameObject[] = [];
  /** Danh sách cấp scene đã đổi từ lần đối chiếu render group trước. */
  dirty = false;
  constructor(private sys: Systems) {}

  add(go: GameObject): GameObject {
    if (this.list.includes(go)) return go;
    this.dirty = true;
    if (go.parentContainer) go.parentContainer.detach(go);
    this.list.push(go);
    (go.view as Zindexed)._zIndex = 0;
    this.sys.content.addChild(go.view);
    if (go.depth !== 0) go.view.zIndex = go.depth;
    return go;
  }

  detach(go: GameObject): void {
    const i = this.list.indexOf(go);
    if (i < 0) return;
    this.dirty = true;
    this.list.splice(i, 1);
    if (go.view.parent === this.sys.content) this.sys.content.removeChild(go.view);
  }

  remove(go: GameObject): void { this.detach(go); }
  exists(go: GameObject): boolean { return this.list.includes(go); }
  getChildren(): GameObject[] { return this.list; }
  get length(): number { return this.list.length; }

  destroyAll(): void {
    for (const go of this.list.slice()) go.destroy(true);
    this.list.length = 0;
  }
}

let cameraId = 1;

/** Camera của scene: game dùng camera cố định (zoom logic → canvas), chỉ cần màu nền. */
export class Camera {
  readonly id = cameraId++;
  zoom = 1;
  scrollX = 0;
  scrollY = 0;
  private bg: PixiGraphics;

  constructor(private sys: Systems) {
    this.bg = new PixiGraphics();
    this.bg.zIndex = -1e9;
    this.bg.visible = false;
    sys.root.addChild(this.bg);
  }

  get width(): number { return this.sys.game.config.width; }
  get height(): number { return this.sys.game.config.height; }
  get worldView() { return { x: this.scrollX, y: this.scrollY, width: this.width, height: this.height }; }

  setZoom(z: number): this { this.zoom = z; return this; }
  centerOn(_x: number, _y: number): this { return this; }

  setBackgroundColor(color: number | string): this {
    const value = typeof color === 'string' ? parseInt(color.replace('#', '').slice(0, 6), 16) : color;
    const alpha = typeof color === 'string' && color.replace('#', '').length === 8 ? parseInt(color.replace('#', '').slice(6, 8), 16) / 255 : 1;
    this.bg.clear();
    if (alpha > 0) this.bg.rect(0, 0, this.width, this.height).fill({ color: value, alpha });
    this.bg.visible = alpha > 0;
    return this;
  }

  fadeIn(): this { return this; }
  fadeOut(): this { return this; }
  shake(): this { return this; }
  flash(): this { return this; }
}

/** Nội bộ scene: cây hiển thị, trạng thái, các "plugin" (input, tween, clock...). */
export class Systems {
  readonly root = new PixiContainer();
  /** Nơi chứa các đối tượng game; tách khỏi nền camera và lớp mặt nạ. */
  readonly content = new PixiContainer();
  readonly maskLayer = new PixiContainer();
  readonly events = new EventEmitter();
  readonly displayList: DisplayList;
  readonly inputPlugin: InputPlugin;
  readonly camera: Camera;
  readonly settings: { key: string; status: SceneStatus; data: unknown; active: boolean; visible: boolean };
  entity: Entity | null = null;

  constructor(readonly scene: Scene, readonly game: Game, key: string) {
    this.settings = { key, status: SceneStatus.PENDING, data: undefined, active: false, visible: true };
    this.root.label = `scene:${key}`;
    // Mỗi scene là một render group của PixiJS: biến đổi con được tính theo nhóm,
    // danh sách lệnh vẽ chỉ dựng lại khi cấu trúc cây thay đổi.
    this.root.isRenderGroup = true;
    this.root.visible = false;
    this.content.sortableChildren = true;
    this.maskLayer.visible = true;
    this.root.addChild(this.content);
    this.root.addChild(this.maskLayer);
    this.displayList = new DisplayList(this);
    this.inputPlugin = new InputPlugin(scene, game.input);
    this.camera = new Camera(this);
  }

  get textures(): TextureManager { return this.game.textures; }

  isActive(): boolean { return this.settings.status === SceneStatus.RUNNING; }
  isPaused(): boolean { return this.settings.status === SceneStatus.PAUSED; }
  isSleeping(): boolean { return this.settings.status === SceneStatus.SLEEPING; }
  isVisible(): boolean { return this.root.visible; }
  /** Scene đang tồn tại (chạy / tạm dừng / ngủ). */
  isLive(): boolean { const s = this.settings.status; return s >= SceneStatus.START && s <= SceneStatus.SLEEPING; }
  setVisible(v: boolean): void { this.root.visible = v; this.settings.visible = v; }

  private autoGroups = new Set<Container>();

  /**
   * PixiJS v8 dựng lại toàn bộ danh sách lệnh vẽ của một render group khi bất kỳ con nào đổi cấu trúc
   * (thêm/xóa, ẩn/hiện, đổi chữ, vẽ lại Graphics). Mỗi Container cấp scene (kệ, bảng quầy, HUD, sơ đồ...)
   * được tách thành render group riêng để một thay đổi nhỏ chỉ dựng lại nhóm của nó, không phải cả scene.
   * Container nhận chạm (nút bấm) không tách nhóm để vẫn gộp chung lượt vẽ với xung quanh.
   */
  reconcileRenderGroups(): void {
    if (!this.displayList.dirty) return;
    this.displayList.dirty = false;
    const top = new Set<Container>();
    for (const go of this.displayList.list) {
      // Container nhận chạm (nút bấm) nhỏ: vẽ chung lượt với xung quanh, không tách nhóm.
      if (go instanceof Container && go.renderGroupHint && !go.input && go.active) top.add(go);
    }
    for (const c of this.autoGroups) {
      if (top.has(c)) continue;
      this.autoGroups.delete(c);
      if (c.active && !c.view.destroyed && c.view.isRenderGroup) c.view.isRenderGroup = false;
    }
    for (const c of top) {
      if (this.autoGroups.has(c)) continue;
      this.autoGroups.add(c);
      if (!c.view.isRenderGroup) c.view.isRenderGroup = true;
    }
  }

  /** Đăng ký scene vào ECS để SceneUpdateSystem gọi update mỗi khung. */
  attach(): void {
    if (this.entity !== null) return;
    this.entity = world.create();
    Components.scenes.set(this.entity, this.scene);
  }

  detach(): void {
    if (this.entity === null) return;
    world.destroy(this.entity);
    this.entity = null;
  }
}

export class GameObjectFactory {
  constructor(private scene: Scene) {}
  existing<T extends GameObject>(go: T): T { this.scene.sys.displayList.add(go); return go; }
  container(x = 0, y = 0, children?: GameObject | GameObject[]): Container { return this.existing(new Container(this.scene, x, y, children)); }
  graphics(options?: GraphicsOptions): Graphics { return this.existing(new Graphics(this.scene, options)); }
  text(x: number, y: number, text: string | string[], style?: TextStyleConfig): Text { return this.existing(new Text(this.scene, x, y, text, style)); }
  image(x: number, y: number, key: string): Image { return this.existing(new Image(this.scene, x, y, key)); }
  sprite(x: number, y: number, key: string): Image { return this.image(x, y, key); }
  rectangle(x = 0, y = 0, w = 128, h = 128, fill?: number, alpha?: number): Rectangle { return this.existing(new Rectangle(this.scene, x, y, w, h, fill, alpha)); }
  circle(x = 0, y = 0, radius = 128, fill?: number, alpha?: number): Arc { return this.existing(new Arc(this.scene, x, y, radius, fill, alpha)); }
  zone(x: number, y: number, w: number, h: number): Zone { return this.existing(new Zone(this.scene, x, y, w, h)); }
  tileSprite(x: number, y: number, w: number, h: number, key: string): TileSprite { return this.existing(new TileSprite(this.scene, x, y, w, h, key)); }
  nineslice(x: number, y: number, key: string, _frame?: unknown, width?: number, height?: number, left?: number, right?: number, top?: number, bottom?: number): NineSlice {
    return this.existing(new NineSlice(this.scene, x, y, key, width, height, left, right, top, bottom));
  }
  renderTexture(x = 0, y = 0, w = 32, h = 32): RenderTexture { return this.existing(new RenderTexture(this.scene, x, y, w, h)); }
  dom(x: number, y: number, element: HTMLElement): DOMElement { return this.existing(new DOMElement(this.scene, x, y, element)); }
}

export class GameObjectCreator {
  constructor(private scene: Scene) {}
  graphics(options?: GraphicsOptions & { add?: boolean }, addToScene = false): Graphics {
    const g = new Graphics(this.scene, options);
    if (addToScene || options?.add) this.scene.sys.displayList.add(g);
    return g;
  }
  container(options?: { x?: number; y?: number }, addToScene = false): Container {
    const c = new Container(this.scene, options?.x ?? 0, options?.y ?? 0);
    if (addToScene) this.scene.sys.displayList.add(c);
    return c;
  }
  text(options: { x?: number; y?: number; text?: string; style?: TextStyleConfig }, addToScene = false): Text {
    const t = new Text(this.scene, options.x ?? 0, options.y ?? 0, options.text ?? '', options.style);
    if (addToScene) this.scene.sys.displayList.add(t);
    return t;
  }
}

/** API `this.scene` bên trong một scene. */
export class ScenePlugin {
  constructor(private owner: Scene, readonly manager: SceneManager) {}
  get key(): string { return this.owner.sys.settings.key; }
  get settings() { return this.owner.sys.settings; }
  get systems(): Systems { return this.owner.sys; }

  start(key?: string, data?: unknown): this {
    const target = key ?? this.key;
    this.manager.queueOp('stop', this.key);
    this.manager.queueOp('start', target, data);
    return this;
  }
  restart(data?: unknown): this {
    this.manager.queueOp('stop', this.key);
    this.manager.queueOp('start', this.key, data);
    return this;
  }
  launch(key: string, data?: unknown): this {
    if (key && key !== this.key) this.manager.queueOp('start', key, data);
    return this;
  }
  run(key: string, data?: unknown): this {
    const s = this.manager.getScene(key);
    if (s?.sys.isPaused()) this.manager.resume(key, data);
    else if (s?.sys.isSleeping()) this.manager.wake(key, data);
    else this.launch(key, data);
    return this;
  }
  stop(key?: string, data?: unknown): this { this.manager.queueOp('stop', key ?? this.key, data); return this; }
  pause(key?: string, data?: unknown): this { this.manager.pause(key ?? this.key, data); return this; }
  resume(key?: string, data?: unknown): this { this.manager.resume(key ?? this.key, data); return this; }
  sleep(key?: string, data?: unknown): this { this.manager.sleep(key ?? this.key, data); return this; }
  wake(key?: string, data?: unknown): this { this.manager.wake(key ?? this.key, data); return this; }
  get(key: string): Scene { return this.manager.getScene(key)!; }
  isActive(key?: string): boolean { return this.manager.isActive(key ?? this.key); }
  isPaused(key?: string): boolean { return !!this.manager.getScene(key ?? this.key)?.sys.isPaused(); }
  isSleeping(key?: string): boolean { return !!this.manager.getScene(key ?? this.key)?.sys.isSleeping(); }
  isVisible(key?: string): boolean { return !!this.manager.getScene(key ?? this.key)?.sys.isVisible(); }
  setVisible(v: boolean, key?: string): this { this.manager.getScene(key ?? this.key)?.sys.setVisible(v); return this; }
  bringToTop(key?: string): this { this.manager.bringToTop(key ?? this.key); return this; }
}

export interface SceneConfig {
  key: string;
}

/**
 * Lớp gốc cho các màn hình. Các trường (`add`, `tweens`, `input`...) được gắn khi game khởi động,
 * trước lần `create()` đầu tiên.
 */
export class Scene {
  readonly config: SceneConfig;
  sys!: Systems;
  game!: Game;
  add!: GameObjectFactory;
  make!: GameObjectCreator;
  tweens!: TweenManager;
  time!: Clock;
  input!: InputPlugin;
  events!: EventEmitter;
  scene!: ScenePlugin;
  cameras!: { main: Camera };
  children!: DisplayList;
  textures!: TextureManager;

  constructor(config: string | SceneConfig) {
    this.config = typeof config === 'string' ? { key: config } : config;
  }

  /** Gọi một lần bởi SceneManager khi game khởi động. */
  bootScene(game: Game, manager: SceneManager): void {
    this.game = game;
    this.sys = new Systems(this, game, this.config.key);
    this.add = new GameObjectFactory(this);
    this.make = new GameObjectCreator(this);
    this.tweens = new TweenManager(this);
    this.time = new Clock(this);
    this.input = this.sys.inputPlugin;
    this.events = this.sys.events;
    this.scene = new ScenePlugin(this, manager);
    this.cameras = { main: this.sys.camera };
    this.children = this.sys.displayList;
    this.textures = game.textures;
  }

  init?(data?: any): void;
  preload?(): void;
  create?(data?: any): void;
  update?(time: number, delta: number): void;
}
