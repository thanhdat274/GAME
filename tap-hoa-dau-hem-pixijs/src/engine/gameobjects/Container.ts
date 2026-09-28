import { Container as PixiContainer } from 'pixi.js';
import type { Scene } from '../scene/Scene';
import { GameObject } from './GameObject';

type Zindexed = PixiContainer & { _zIndex: number };

/**
 * Nhóm đối tượng. Như Phaser: con được vẽ theo thứ tự thêm vào (không sắp theo depth),
 * vùng chạm mặc định lấy tâm ở giữa (origin 0.5) theo kích thước đặt bằng setSize.
 */
export class Container extends GameObject {
  readonly list: GameObject[] = [];
  /** Khi nằm trực tiếp trong scene: tách thành render group riêng của PixiJS (xem Systems.reconcileRenderGroups). */
  renderGroupHint = true;
  private w = 0;
  private h = 0;

  constructor(scene: Scene, x = 0, y = 0, children?: GameObject | GameObject[]) {
    super(scene, 'Container', new PixiContainer());
    this.originX = 0.5;
    this.originY = 0.5;
    this.view.position.set(x, y);
    if (children) this.add(children);
  }

  override get width(): number { return this.w; }
  override set width(v: number) { this.w = v; this.syncHitArea(); }
  override get height(): number { return this.h; }
  override set height(v: number) { this.h = v; this.syncHitArea(); }

  setSize(w: number, h: number): this {
    this.w = w;
    this.h = h;
    this.syncHitArea();
    return this;
  }

  get length(): number { return this.list.length; }

  add(child: GameObject | GameObject[]): this {
    if (Array.isArray(child)) {
      for (const c of child) this.addAt(c, this.list.length);
      return this;
    }
    return this.addAt(child, this.list.length);
  }

  addAt(child: GameObject | GameObject[], index = 0): this {
    if (Array.isArray(child)) {
      child.forEach((c, i) => this.addAt(c, index + i));
      return this;
    }
    if (child === this || !child.active) return this;
    if (child.parentContainer === this) return this;
    child.removeFromDisplayList();
    const i = Math.max(0, Math.min(index, this.list.length));
    this.list.splice(i, 0, child);
    child.parentContainer = this;
    // Trong container thứ tự vẽ là thứ tự danh sách: bỏ zIndex để PixiJS không tự sắp lại.
    (child.view as Zindexed)._zIndex = 0;
    this.view.addChildAt(child.view, i);
    return this;
  }

  /** Tách con khỏi danh sách (không hủy). */
  detach(child: GameObject): void {
    const i = this.list.indexOf(child);
    if (i < 0) return;
    this.list.splice(i, 1);
    child.parentContainer = null;
    if (child.view.parent === this.view) this.view.removeChild(child.view);
  }

  remove(child: GameObject | GameObject[], destroyChild = false): this {
    for (const c of Array.isArray(child) ? child : [child]) {
      this.detach(c);
      if (destroyChild) c.destroy();
    }
    return this;
  }

  removeAll(destroyChild = false): this {
    const items = this.list.slice();
    for (const c of items) {
      this.detach(c);
      if (destroyChild) c.destroy();
    }
    return this;
  }

  getAt(index: number): GameObject | undefined { return this.list[index]; }
  getIndex(child: GameObject): number { return this.list.indexOf(child); }
  getAll(): GameObject[] { return this.list.slice(); }
  getByName(name: string): GameObject | null { return this.list.find((c) => c.name === name) ?? null; }
  exists(child: GameObject): boolean { return this.list.includes(child); }
  each(fn: (child: GameObject) => void): this { for (const c of this.list.slice()) fn(c); return this; }
  first(): GameObject | undefined { return this.list[0]; }

  bringToTop(child: GameObject): this {
    const i = this.list.indexOf(child);
    if (i >= 0 && i < this.list.length - 1) {
      this.list.splice(i, 1);
      this.list.push(child);
      this.view.setChildIndex(child.view, this.view.children.length - 1);
    }
    return this;
  }

  sendToBack(child: GameObject): this {
    const i = this.list.indexOf(child);
    if (i > 0) {
      this.list.splice(i, 1);
      this.list.unshift(child);
      this.view.setChildIndex(child.view, 0);
    }
    return this;
  }

  /** Sắp con theo một thuộc tính số (vd. 'depth'), ổn định với thứ tự cũ. */
  sort(property: string): this {
    const key = property as keyof GameObject;
    const before = this.list.slice();
    this.list.sort((a, b) => (a[key] as number) - (b[key] as number));
    let changed = false;
    for (let i = 0; i < before.length; i++) if (before[i] !== this.list[i]) { changed = true; break; }
    if (!changed) return this;
    this.list.forEach((c, i) => this.view.setChildIndex(c.view, i));
    return this;
  }

  override destroy(fromScene?: boolean): void {
    if (!this.active) return;
    // Hủy con trước (giống Phaser: container hủy toàn bộ nội dung của nó).
    for (const c of this.list.slice()) c.destroy(fromScene);
    this.list.length = 0;
    super.destroy(fromScene);
  }
}
