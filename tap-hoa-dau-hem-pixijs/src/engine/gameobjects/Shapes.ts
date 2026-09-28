import { Container as PixiContainer, Graphics as PixiGraphics, Matrix, NineSliceSprite, RenderTexture as PixiRenderTexture, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Scene } from '../scene/Scene';
import { GameObject } from './GameObject';
import { renderer } from '../runtime';

/** Ảnh từ texture đã đăng ký (gốc mặc định ở giữa như Phaser). */
export class Image extends GameObject {
  declare readonly view: Sprite;
  textureKey: string;

  constructor(scene: Scene, x: number, y: number, key: string) {
    super(scene, 'Image', new Sprite(scene.sys.textures.getTexture(key)));
    this.textureKey = key;
    this.view.position.set(x, y);
    this.setOrigin(0.5, 0.5);
  }

  override get width(): number { return this.view.texture.orig.width; }
  override get height(): number { return this.view.texture.orig.height; }

  protected override updateOrigin(): void { this.view.anchor.set(this.originX, this.originY); }

  get texture(): { key: string } { return { key: this.textureKey }; }

  setTexture(key: string): this {
    if (key === this.textureKey) return this;
    this.textureKey = key;
    this.view.texture = this.scene.sys.textures.getTexture(key);
    this.syncHitArea();
    return this;
  }

  setFrame(): this { return this; }
  setTint(color: number): this { this.view.tint = color; return this; }
  clearTint(): this { this.view.tint = 0xffffff; return this; }
  get tintTopLeft(): number { return Number(this.view.tint); }
}

/** Nền lặp (tileSprite). */
export class TileSprite extends GameObject {
  declare readonly view: TilingSprite;
  constructor(scene: Scene, x: number, y: number, w: number, h: number, key: string) {
    super(scene, 'TileSprite', new TilingSprite({ texture: scene.sys.textures.getTexture(key), width: w, height: h }));
    this.view.position.set(x, y);
    this.setOrigin(0.5, 0.5);
  }
  override get width(): number { return this.view.width / Math.abs(this.view.scale.x || 1); }
  override get height(): number { return this.view.height / Math.abs(this.view.scale.y || 1); }
  protected override updateOrigin(): void { this.view.anchor.set(this.originX, this.originY); }
  get tilePositionX(): number { return this.view.tilePosition.x; }
  set tilePositionX(v: number) { this.view.tilePosition.x = v; }
  get tilePositionY(): number { return this.view.tilePosition.y; }
  set tilePositionY(v: number) { this.view.tilePosition.y = v; }
}

/** Hình có tô/viền được vẽ lại khi đổi thuộc tính (Rectangle, Arc). */
abstract class Shape extends GameObject {
  declare readonly view: PixiGraphics;
  fillColor: number;
  fillAlpha: number;
  isFilled: boolean;
  strokeColor = 0xffffff;
  strokeAlpha = 1;
  lineWidth = 1;
  isStroked = false;

  constructor(scene: Scene, type: string, fill?: number, alpha?: number) {
    super(scene, type, new PixiGraphics());
    this.fillColor = fill ?? 0xffffff;
    this.fillAlpha = alpha ?? 1;
    this.isFilled = fill !== undefined;
  }

  protected abstract redraw(): void;
  protected override makeGhost(): PixiGraphics { return new PixiGraphics(); }
  protected override updateOrigin(): void { this.redraw(); this.syncHitArea(); }

  setFillStyle(color?: number, alpha = 1): this {
    this.isFilled = color !== undefined;
    if (color !== undefined) this.fillColor = color;
    this.fillAlpha = alpha;
    this.redraw();
    return this;
  }

  setStrokeStyle(width?: number, color?: number, alpha = 1): this {
    this.isStroked = width !== undefined && width > 0;
    this.lineWidth = width ?? 1;
    this.strokeColor = color ?? 0xffffff;
    this.strokeAlpha = alpha;
    this.redraw();
    return this;
  }

  protected paint(): void {
    if (this.isFilled) this.view.fill({ color: this.fillColor, alpha: this.fillAlpha });
    if (this.isStroked) this.view.stroke({ width: this.lineWidth, color: this.strokeColor, alpha: this.strokeAlpha });
  }
}

export class Rectangle extends Shape {
  private w: number;
  private h: number;

  constructor(scene: Scene, x: number, y: number, w = 128, h = 128, fill?: number, alpha?: number) {
    super(scene, 'Rectangle', fill, alpha);
    this.w = w;
    this.h = h;
    this.view.position.set(x, y);
    this.originX = 0.5;
    this.originY = 0.5;
    this.redraw();
  }

  override get width(): number { return this.w; }
  override set width(v: number) { this.w = v; this.redraw(); this.syncHitArea(); }
  override get height(): number { return this.h; }
  override set height(v: number) { this.h = v; this.redraw(); this.syncHitArea(); }

  setSize(w: number, h: number): this { this.w = w; this.h = h; this.redraw(); this.syncHitArea(); return this; }

  protected redraw(): void {
    const g = this.view;
    g.clear();
    if (!this.isFilled && !this.isStroked) return;
    g.rect(-this.originX * this.w, -this.originY * this.h, this.w, this.h);
    this.paint();
  }
}

export class Arc extends Shape {
  private r: number;

  constructor(scene: Scene, x: number, y: number, radius = 128, fill?: number, alpha?: number) {
    super(scene, 'Arc', fill, alpha);
    this.r = radius;
    this.view.position.set(x, y);
    this.originX = 0.5;
    this.originY = 0.5;
    this.redraw();
  }

  get radius(): number { return this.r; }
  set radius(v: number) { this.r = v; this.redraw(); }
  setRadius(v: number): this { this.radius = v; return this; }
  override get width(): number { return this.r * 2; }
  override get height(): number { return this.r * 2; }

  protected redraw(): void {
    const g = this.view;
    g.clear();
    if (!this.isFilled && !this.isStroked) return;
    g.circle((0.5 - this.originX) * this.r * 2, (0.5 - this.originY) * this.r * 2, this.r);
    this.paint();
  }
}

/** Vùng chạm vô hình. */
export class Zone extends GameObject {
  private w: number;
  private h: number;

  constructor(scene: Scene, x: number, y: number, w = 1, h = w) {
    super(scene, 'Zone', new PixiContainer());
    this.view.position.set(x, y);
    this.w = w;
    this.h = h;
    this.originX = 0.5;
    this.originY = 0.5;
  }

  override get width(): number { return this.w; }
  override get height(): number { return this.h; }
  setSize(w: number, h: number): this { this.w = w; this.h = h; this.syncHitArea(); return this; }
}

/** Texture vẽ sẵn: gom nhiều đối tượng tĩnh thành một ảnh. */
export class RenderTexture extends GameObject {
  declare readonly view: Sprite;
  readonly rt: PixiRenderTexture;

  constructor(scene: Scene, x: number, y: number, w = 32, h = 32) {
    const rt = PixiRenderTexture.create({ width: Math.max(1, Math.ceil(w)), height: Math.max(1, Math.ceil(h)), resolution: 1, antialias: false });
    super(scene, 'RenderTexture', new Sprite(rt));
    this.rt = rt;
    this.view.position.set(x, y);
    this.setOrigin(0.5, 0.5);
  }

  override get width(): number { return this.rt.width; }
  override get height(): number { return this.rt.height; }
  protected override updateOrigin(): void { this.view.anchor.set(this.originX, this.originY); }

  /** Vẽ đối tượng (theo biến đổi riêng của nó) lên texture tại (x, y). */
  draw(entries: GameObject | GameObject[], x = 0, y = 0): this {
    drawToTexture(this.rt, entries, x, y);
    return this;
  }

  clear(): this {
    renderer().render({ container: new PixiContainer(), target: this.rt, clear: true });
    return this;
  }

  override destroy(fromScene?: boolean): void {
    super.destroy(fromScene);
    this.rt.destroy(true);
  }
}

/** Vẽ một / nhiều đối tượng (theo biến đổi riêng của chúng) lên render texture tại (x, y), giống Phaser. */
export function drawToTexture(rt: PixiRenderTexture, entries: GameObject | GameObject[], x = 0, y = 0): void {
  const holder = new PixiContainer();
  for (const go of Array.isArray(entries) ? entries : [entries]) {
    const parent = go.view.parent;
    const index = parent ? parent.getChildIndex(go.view) : -1;
    holder.addChild(go.view);
    renderer().render({ container: holder, target: rt, clear: false, transform: new Matrix().translate(x, y) });
    holder.removeChild(go.view);
    if (parent && index >= 0) parent.addChildAt(go.view, Math.min(index, parent.children.length));
  }
  holder.destroy();
}

/**
 * Ảnh co giãn 9 ô (Phaser NineSlice): 4 góc giữ nguyên, cạnh và giữa kéo giãn.
 * Kích thước tính theo điểm ảnh texture (game thường setScale(1 / ZOOM)), gốc mặc định ở giữa.
 */
export class NineSlice extends GameObject {
  declare readonly view: NineSliceSprite;
  textureKey: string;
  private w: number;
  private h: number;

  constructor(scene: Scene, x: number, y: number, key: string, width = 0, height = 0, left = 10, right = 10, top = 0, bottom = 0) {
    const texture = scene.sys.textures.getTexture(key);
    const view = new NineSliceSprite({ texture, leftWidth: left, rightWidth: right, topHeight: top, bottomHeight: bottom, width: width || texture.width, height: height || texture.height });
    super(scene, 'NineSlice', view);
    this.textureKey = key;
    this.w = view.width;
    this.h = view.height;
    this.view.position.set(x, y);
    this.setOrigin(0.5, 0.5);
  }

  override get width(): number { return this.w; }
  override get height(): number { return this.h; }
  protected override updateOrigin(): void { this.view.pivot.set(this.originX * this.w, this.originY * this.h); }

  setTexture(key: string): this {
    if (key === this.textureKey) return this;
    this.textureKey = key;
    this.view.texture = this.scene.sys.textures.getTexture(key);
    return this;
  }

  setSize(width: number, height: number): this {
    this.w = width;
    this.h = height;
    this.view.width = width;
    this.view.height = height;
    this.updateOrigin();
    this.syncHitArea();
    return this;
  }

  setSlices(width: number, height: number, left: number, right: number, top: number, bottom: number): this {
    const v = this.view;
    v.leftWidth = left;
    v.rightWidth = right;
    v.topHeight = top;
    v.bottomHeight = bottom;
    return this.setSize(width, height);
  }

  setTint(color: number): this { this.view.tint = color; return this; }
}

/** Phần tử HTML đặt chồng lên canvas theo tọa độ game. */
export class DOMElement extends GameObject {
  readonly node: HTMLElement;

  constructor(scene: Scene, x: number, y: number, element: HTMLElement) {
    super(scene, 'DOMElement', new PixiContainer());
    this.node = element;
    this.view.position.set(x, y);
    element.style.position = 'absolute';
    element.style.transformOrigin = '0 0';
    scene.sys.game.domLayer.append(element);
    this.view.onRender = () => this.sync();
  }

  private sync(): void {
    const m = this.view.worldTransform;
    const k = this.scene.sys.game.cssScale;
    const shown = this.willRender();
    this.node.style.display = shown ? '' : 'none';
    if (shown) this.node.style.transform = `matrix(${m.a * k},${m.b * k},${m.c * k},${m.d * k},${(m.tx - this.displayOriginX) * k},${(m.ty - this.displayOriginY) * k})`;
  }

  override get width(): number { return this.node.offsetWidth; }
  override get height(): number { return this.node.offsetHeight; }

  override setVisible(v: boolean): this {
    super.setVisible(v);
    this.node.style.display = v ? '' : 'none';
    return this;
  }

  override destroy(fromScene?: boolean): void {
    this.node.remove();
    super.destroy(fromScene);
  }
}

export { Texture };
