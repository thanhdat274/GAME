import { Container as PixiContainer, EventEmitter, Graphics as PixiGraphics, Matrix } from 'pixi.js';
import type { Scene } from '../scene/Scene';
import { Rectangle as GeomRectangle } from '../geom';
import type { GeometryMask } from './Graphics';

export const GameObjectEvents = { DESTROY: 'destroy' } as const;

export type HitAreaCallback = (hitArea: any, x: number, y: number, gameObject: GameObject) => boolean;

export interface InteractiveObject {
  gameObject: GameObject;
  enabled: boolean;
  hitArea: any;
  hitAreaCallback: HitAreaCallback;
  cursor: string | false;
}

export interface InteractiveConfig {
  hitArea?: any;
  hitAreaCallback?: HitAreaCallback;
  useHandCursor?: boolean;
  cursor?: string;
}

/** Ma trận biến đổi theo tọa độ thế giới (logic 360×H), cùng dạng với Phaser.GameObjects.Components.TransformMatrix. */
export class WorldMatrix {
  constructor(private m: Matrix) {}
  get tx(): number { return this.m.tx; }
  get ty(): number { return this.m.ty; }
  get a(): number { return this.m.a; }
  get b(): number { return this.m.b; }
  get c(): number { return this.m.c; }
  get d(): number { return this.m.d; }
  get scaleX(): number { return Math.sqrt(this.m.a * this.m.a + this.m.b * this.m.b); }
  get scaleY(): number { return Math.sqrt(this.m.c * this.m.c + this.m.d * this.m.d); }
  transformPoint(x: number, y: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    out.x = this.m.a * x + this.m.c * y + this.m.tx;
    out.y = this.m.b * x + this.m.d * y + this.m.ty;
    return out;
  }
}

const rectContains: HitAreaCallback = (area: GeomRectangle, x, y) => GeomRectangle.Contains(area, x, y);

/**
 * Lớp gốc của mọi đối tượng hiển thị. Là một "vỏ" mỏng bọc display object của PixiJS (`view`):
 * vị trí, độ trong, độ sâu, vùng chạm... ghi thẳng vào node PixiJS, không có vòng đồng bộ nào mỗi khung.
 */
export abstract class GameObject extends EventEmitter {
  view: PixiContainer;
  scene: Scene;
  readonly type: string;
  active = true;
  depth = 0;
  name = '';
  parentContainer: import('./Container').Container | null = null;
  input: InteractiveObject | null = null;
  originX = 0;
  originY = 0;
  private flipX = false;
  private flipY = false;
  private _scaleX = 1;
  private _scaleY = 1;
  private dataStore?: Map<string, unknown>;
  private maskGraphics: PixiContainer | null = null;

  constructor(scene: Scene, type: string, view: PixiContainer) {
    super();
    this.scene = scene;
    this.type = type;
    this.view = view;
    (view as PixiContainer & { __go?: GameObject }).__go = this;
  }

  /**
   * Thay node PixiJS đại diện (vd. chữ cần thêm nền): chuyển biến đổi, vị trí trong cây và mặt nạ sang node mới.
   * Node cũ trở thành con của node mới.
   */
  protected wrapView(next: PixiContainer): void {
    const old = this.view;
    const parent = old.parent;
    const index = parent ? parent.getChildIndex(old) : -1;
    next.position.copyFrom(old.position);
    next.scale.copyFrom(old.scale);
    next.rotation = old.rotation;
    next.alpha = old.alpha;
    next.visible = old.visible;
    next.renderable = old.renderable;
    next.mask = old.mask;
    next.label = old.label;
    (next as PixiContainer & { _zIndex: number })._zIndex = (old as PixiContainer & { _zIndex: number })._zIndex;
    old.mask = null;
    old.position.set(0, 0);
    old.scale.set(1, 1);
    old.rotation = 0;
    old.alpha = 1;
    old.visible = true;
    old.renderable = true;
    next.addChild(old);
    if (parent && index >= 0) parent.addChildAt(next, index);
    delete (old as PixiContainer & { __go?: GameObject }).__go;
    (next as PixiContainer & { __go?: GameObject }).__go = this;
    this.view = next;
  }

  // ---------- Kích thước (mặc định 0; lớp con ghi đè) ----------
  get width(): number { return 0; }
  set width(_v: number) {}
  get height(): number { return 0; }
  set height(_v: number) {}
  get displayWidth(): number { return this.width * this._scaleX; }
  set displayWidth(v: number) { if (this.width) this.scaleX = v / this.width; }
  get displayHeight(): number { return this.height * this._scaleY; }
  set displayHeight(v: number) { if (this.height) this.scaleY = v / this.height; }
  get displayOriginX(): number { return this.originX * this.width; }
  get displayOriginY(): number { return this.originY * this.height; }

  // ---------- Biến đổi ----------
  get x(): number { return this.view.position.x; }
  set x(v: number) { this.view.position.x = v; }
  get y(): number { return this.view.position.y; }
  set y(v: number) { this.view.position.y = v; }
  get alpha(): number { return this.view.alpha; }
  set alpha(v: number) { this.view.alpha = v; }
  get visible(): boolean { return this.view.visible; }
  set visible(v: boolean) { this.view.visible = v; }
  get angle(): number { return this.view.angle; }
  set angle(v: number) { this.view.angle = v; }
  get rotation(): number { return this.view.rotation; }
  set rotation(v: number) { this.view.rotation = v; }
  get scaleX(): number { return this._scaleX; }
  set scaleX(v: number) { this._scaleX = v; this.view.scale.x = this.flipX ? -v : v; }
  get scaleY(): number { return this._scaleY; }
  set scaleY(v: number) { this._scaleY = v; this.view.scale.y = this.flipY ? -v : v; }
  /** Giống Phaser: đọc `scale` trả về scaleX, gán thì đặt cả hai trục. */
  get scale(): number { return this._scaleX; }
  set scale(v: number) { this.setScale(v); }

  setPosition(x = 0, y = x): this { this.view.position.set(x, y); return this; }
  setX(x = 0): this { this.x = x; return this; }
  setY(y = 0): this { this.y = y; return this; }
  setAlpha(a = 1): this { this.view.alpha = a; return this; }
  setVisible(v: boolean): this { this.view.visible = v; return this; }
  setAngle(deg = 0): this { this.view.angle = deg; return this; }
  setRotation(rad = 0): this { this.view.rotation = rad; return this; }
  setScale(x = 1, y = x): this { this.scaleX = x; this.scaleY = y; return this; }
  setFlipX(v: boolean): this { this.flipX = v; this.scaleX = this._scaleX; return this; }
  setFlipY(v: boolean): this { this.flipY = v; this.scaleY = this._scaleY; return this; }
  setName(name: string): this { this.name = name; this.view.label = name; return this; }
  setScrollFactor(_x: number, _y?: number): this { return this; }
  setOrigin(x = 0.5, y = x): this { this.originX = x; this.originY = y; this.updateOrigin(); return this; }
  setDisplaySize(w: number, h: number): this { this.displayWidth = w; this.displayHeight = h; return this; }
  /** Lớp con cập nhật neo/pivot của PixiJS khi gốc (origin) đổi. */
  protected updateOrigin(): void {}

  setDepth(depth: number): this {
    this.depth = depth;
    // Chỉ con trực tiếp của scene được sắp theo độ sâu (giống Phaser: Container giữ thứ tự thêm vào).
    if (this.view.parent && this.view.parent === this.scene?.sys.content) this.view.zIndex = depth;
    return this;
  }

  setData(key: string, value: unknown): this { (this.dataStore ??= new Map()).set(key, value); return this; }
  getData(key: string): unknown { return this.dataStore?.get(key); }

  // ---------- Chạm ----------
  setInteractive(config: InteractiveConfig = {}): this {
    const hitArea = config.hitArea ?? new GeomRectangle(0, 0, this.width, this.height);
    const cursor = config.cursor ?? (config.useHandCursor ? 'pointer' : false);
    if (this.input) {
      this.input.enabled = true;
      if (config.hitArea) { this.input.hitArea = hitArea; this.input.hitAreaCallback = config.hitAreaCallback ?? rectContains; }
      if (cursor) this.input.cursor = cursor;
    } else {
      this.input = { gameObject: this, enabled: true, hitArea, hitAreaCallback: config.hitAreaCallback ?? rectContains, cursor };
    }
    this.scene?.sys.inputPlugin.enable(this);
    return this;
  }

  disableInteractive(): this { if (this.input) this.input.enabled = false; return this; }
  removeInteractive(): this { this.scene?.sys.inputPlugin.disable(this); this.input = null; return this; }

  /** Kích thước vùng chạm mặc định theo khung hiện tại (gọi khi đối tượng đổi cỡ). */
  protected syncHitArea(): void {
    const area = this.input?.hitArea;
    if (area instanceof GeomRectangle && area.x === 0 && area.y === 0) area.setSize(this.width, this.height);
  }

  // ---------- Mặt nạ ----------
  setMask(mask: GeometryMask): this {
    this.clearMask(true);
    // Mỗi đối tượng một node mặt nạ riêng nhưng dùng chung hình học (GraphicsContext) với mặt nạ gốc,
    // nên nhiều đối tượng dùng chung một mặt nạ như Phaser mà không phải dựng lại hình.
    const src = mask.geometryMask.view;
    const g = new PixiGraphics(src.context);
    g.position.copyFrom(src.position);
    g.scale.copyFrom(src.scale);
    g.rotation = src.rotation;
    // Mặt nạ cần nằm trong cây hiển thị của scene để có ma trận thế giới đúng (tọa độ thế giới như Phaser).
    this.scene?.sys.maskLayer.addChild(g);
    mask.geometryMask.maskClones.add(g);
    this.maskGraphics = g;
    this.view.mask = g;
    return this;
  }

  clearMask(_destroyMask = false): this {
    if (!this.maskGraphics) return this;
    this.view.mask = null;
    if (!this.maskGraphics.destroyed) this.maskGraphics.destroy({ context: false } as never);
    this.maskGraphics = null;
    return this;
  }

  getWorldTransformMatrix(): WorldMatrix {
    return new WorldMatrix(this.view.worldTransform);
  }

  getBounds(): GeomRectangle {
    const b = this.view.getBounds();
    return new GeomRectangle(b.x, b.y, b.width, b.height);
  }

  /** Đối tượng cùng mọi cha đều đang hiện (dùng cho kiểm tra chạm). */
  willRender(): boolean {
    let v: PixiContainer | null = this.view;
    while (v) {
      if (!v.visible || !v.renderable) return false;
      v = v.parent;
    }
    return true;
  }

  // ---------- Vòng đời ----------
  /** Tách khỏi cha hiện tại (scene hoặc container) mà không hủy. */
  removeFromDisplayList(): this {
    if (this.parentContainer) this.parentContainer.remove(this);
    else this.scene?.sys.displayList.remove(this);
    return this;
  }

  addToDisplayList(): this {
    this.scene?.sys.displayList.add(this);
    return this;
  }

  destroy(_fromScene?: boolean): void {
    if (!this.active && !this.scene) return;
    this.emit(GameObjectEvents.DESTROY, this);
    this.removeAllListeners();
    if (this.input) this.removeInteractive();
    if (this.parentContainer) this.parentContainer.detach(this);
    else this.scene?.sys.displayList.detach(this);
    this.active = false;
    this.clearMask();
    const last = this.view;
    const ghost = this.makeGhost();
    ghost.position.copyFrom(last.position);
    ghost.scale.copyFrom(last.scale);
    ghost.alpha = last.alpha;
    ghost.rotation = last.rotation;
    ghost.visible = last.visible;
    this.destroyView();
    // Như Phaser: đọc/gán x, y, alpha... trên đối tượng đã hủy không lỗi (vd. callback tween muộn).
    this.view = ghost;
    (this as { scene: Scene | undefined }).scene = undefined;
  }

  /** Node thay thế sau khi hủy (không nằm trong cây hiển thị). */
  protected makeGhost(): PixiContainer {
    return new PixiContainer();
  }

  protected destroyView(): void {
    if (!this.view.destroyed) this.view.destroy({ children: false });
  }
}

export type GameObjectLike = GameObject;
