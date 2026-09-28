import { EventEmitter, Point, type Container as PixiContainer } from 'pixi.js';
import type { GameObject } from '../gameobjects/GameObject';
import type { Scene } from '../scene/Scene';
import type { Game } from '../Game';
import { Pointer } from './Pointer';

export interface EventData {
  stopPropagation(): void;
}

type Hit = { go: GameObject; x: number; y: number };
type Tagged = PixiContainer & { __go?: GameObject };

const tmp = new Point();

/**
 * `scene.input`: phát sự kiện cấp scene (pointerdown/move/up, wheel) và giữ danh sách đối tượng nhận chạm.
 */
export class InputPlugin extends EventEmitter {
  enabled = true;
  topOnly = true;
  private interactive = new Set<GameObject>();

  constructor(readonly scene: Scene, private manager: InputManager) {
    super();
  }

  get activePointer(): Pointer { return this.manager.activePointer; }
  get mousePointer(): Pointer { return this.manager.pointers[0]; }
  get pointer1(): Pointer { return this.manager.pointers[1]; }
  get pointer2(): Pointer { return this.manager.pointers[2]; }

  enable(go: GameObject): void { this.interactive.add(go); }
  disable(go: GameObject): void { this.interactive.delete(go); }
  get count(): number { return this.interactive.size; }

  setDefaultCursor(cursor: string): void { this.manager.canvas.style.cursor = cursor; }

  /** Gỡ mọi thứ khi scene dừng (giống Phaser InputPlugin.shutdown). */
  shutdown(): void {
    this.interactive.clear();
    this.removeAllListeners();
  }

  /**
   * Tìm đối tượng nhận chạm trên cùng tại điểm (tọa độ thế giới).
   * Duyệt cây hiển thị theo thứ tự ngược với thứ tự vẽ, bỏ nhánh đang ẩn.
   */
  hitTest(wx: number, wy: number): Hit | null {
    if (!this.interactive.size) return null;
    tmp.set(wx, wy);
    return this.walk(this.scene.sys.root, tmp);
  }

  private walk(node: PixiContainer, p: Point): Hit | null {
    if (!node.visible || !node.renderable) return null;
    node.sortChildren();
    const kids = node.children;
    for (let i = kids.length - 1; i >= 0; i--) {
      const hit = this.walk(kids[i], p);
      if (hit) return hit;
    }
    const go = (node as Tagged).__go;
    if (!go || !go.input || !go.input.enabled || !this.interactive.has(go)) return null;
    const local = node.worldTransform.applyInverse(p);
    const x = local.x + go.displayOriginX;
    const y = local.y + go.displayOriginY;
    if (!go.input.hitAreaCallback(go.input.hitArea, x, y, go)) return null;
    return { go, x, y };
  }
}

/**
 * Bộ nhận sự kiện DOM toàn cục: đổi tọa độ, rồi chuyển cho các scene từ trên xuống.
 * Scene nào có đối tượng trúng chạm thì các scene bên dưới không nhận (globalTopOnly của Phaser).
 */
export class InputManager {
  readonly pointers: Pointer[] = [new Pointer(0), new Pointer(1), new Pointer(2), new Pointer(3)];
  activePointer: Pointer = this.pointers[0];
  private over = new Map<Pointer, GameObject | null>();
  private cursorOwner: GameObject | null = null;

  constructor(private game: Game, readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Nhả chuột ngoài canvas (khi không bắt được pointer capture).
    window.addEventListener('pointerup', this.onWindowUp);
  }

  private pointerFor(e: PointerEvent, create: boolean): Pointer | null {
    if (e.pointerType === 'mouse') return this.pointers[0];
    const found = this.pointers.find((p) => p.domId === e.pointerId);
    if (found || !create) return found ?? null;
    const free = this.pointers.slice(1).find((p) => p.domId < 0) ?? this.pointers[1];
    free.domId = e.pointerId;
    return free;
  }

  private place(p: Pointer, e: PointerEvent | WheelEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const { width: W, height: H, resolution } = this.game.config;
    const wx = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * W : 0;
    const wy = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * H : 0;
    p.prevPosition.x = p.x;
    p.prevPosition.y = p.y;
    p.worldX = wx;
    p.worldY = wy;
    p.x = wx * resolution;
    p.y = wy * resolution;
    p.event = e;
  }

  private inside(e: PointerEvent): boolean {
    const r = this.canvas.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /** Các scene nhận chạm, từ trên xuống. */
  private scenes(): Scene[] {
    return this.game.scene.inputOrder();
  }

  private dispatch(p: Pointer, kind: 'down' | 'move' | 'up' | 'upoutside' | 'wheel'): void {
    let top: Hit | null = null;
    let stopped = false;
    const eventData: EventData = { stopPropagation: () => { stopped = true; } };
    for (const scene of this.scenes()) {
      const input = scene.sys.inputPlugin;
      if (!input.enabled) continue;
      const hit = kind === 'upoutside' ? null : input.hitTest(p.worldX, p.worldY);
      const over = hit ? [hit.go] : [];
      if (hit && !top) top = hit;
      if (hit) {
        const go = hit.go;
        if (kind === 'down') { go.emit('pointerdown', p, hit.x, hit.y, eventData); if (!stopped) input.emit('gameobjectdown', p, go, eventData); }
        else if (kind === 'up') { go.emit('pointerup', p, hit.x, hit.y, eventData); if (!stopped) input.emit('gameobjectup', p, go, eventData); }
        else if (kind === 'move') go.emit('pointermove', p, hit.x, hit.y, eventData);
        else if (kind === 'wheel') go.emit('wheel', p, p.deltaX, p.deltaY, p.deltaZ, eventData);
      }
      if (!stopped) {
        if (kind === 'down') input.emit('pointerdown', p, over);
        else if (kind === 'up') input.emit('pointerup', p, over);
        else if (kind === 'upoutside') input.emit('pointerupoutside', p);
        else if (kind === 'move') input.emit('pointermove', p, over);
        else if (kind === 'wheel') input.emit('wheel', p, over, p.deltaX, p.deltaY, p.deltaZ);
      }
      if ((hit && input.topOnly) || stopped) break;
    }
    if (kind === 'move' || kind === 'down') this.updateOver(p, top);
  }

  private updateOver(p: Pointer, hit: Hit | null): void {
    const prev = this.over.get(p) ?? null;
    const next = hit?.go ?? null;
    if (prev !== next) {
      if (prev && prev.active) prev.emit('pointerout', p, { stopPropagation() {} });
      if (next) next.emit('pointerover', p, hit!.x, hit!.y, { stopPropagation() {} });
      this.over.set(p, next);
    }
    if (p.id === 0) {
      const cursor = next?.input?.cursor || '';
      if (next !== this.cursorOwner || this.canvas.style.cursor !== cursor) {
        this.cursorOwner = next;
        this.canvas.style.cursor = cursor || 'default';
      }
    }
  }

  private clearOver(p: Pointer): void {
    const prev = this.over.get(p);
    if (prev && prev.active) prev.emit('pointerout', p, { stopPropagation() {} });
    this.over.set(p, null);
  }

  private onDown = (e: PointerEvent): void => {
    const p = this.pointerFor(e, true);
    if (!p) return;
    this.game.unlockAudio?.();
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* không hỗ trợ */ }
    this.place(p, e);
    p.isDown = true;
    p.button = e.button;
    p.wasTouch = e.pointerType !== 'mouse';
    p.downX = p.x;
    p.downY = p.y;
    p.downTime = e.timeStamp || performance.now();
    this.activePointer = p;
    this.dispatch(p, 'down');
  };

  private onMove = (e: PointerEvent): void => {
    const p = this.pointerFor(e, false) ?? (e.pointerType === 'mouse' ? this.pointers[0] : null);
    if (!p) return;
    this.place(p, e);
    p.moveTime = e.timeStamp || performance.now();
    this.activePointer = p;
    this.dispatch(p, 'move');
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointerFor(e, false);
    if (!p || !p.isDown) return;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    this.place(p, e);
    p.isDown = false;
    p.upX = p.x;
    p.upY = p.y;
    p.upTime = e.timeStamp || performance.now();
    this.activePointer = p;
    this.dispatch(p, e.type === 'pointercancel' || !this.inside(e) ? 'upoutside' : 'up');
    if (p.wasTouch) {
      this.clearOver(p);
      p.domId = -1;
    }
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.target === this.canvas) return;
    const p = this.pointerFor(e, false);
    if (!p || !p.isDown) return;
    this.onUp(e);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = this.pointers[0];
    this.place(p, e);
    p.deltaX = e.deltaX;
    p.deltaY = e.deltaY;
    p.deltaZ = e.deltaZ;
    this.dispatch(p, 'wheel');
  };
}
