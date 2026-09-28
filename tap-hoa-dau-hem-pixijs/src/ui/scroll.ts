import * as Engine from '../engine';
import { KineticCore } from '../core/kinetic';
import { ZOOM } from './theme';

/**
 * Cuộn dọc kiểu điện thoại: kéo theo ngón tay, thả ra thì trôi tiếp theo quán tính rồi chậm dần;
 * đang trôi mà chạm vào thì dừng lại (và chạm đó không tính là bấm nút).
 */
export interface KineticOptions {
  /** Điểm chạm (tọa độ thế giới) có nằm trong vùng cuộn không. */
  inView: (worldY: number) => boolean;
  /** Vị trí cuộn hiện tại (0 = đầu danh sách). */
  get: () => number;
  set: (value: number) => void;
  /** Vị trí cuộn lớn nhất. */
  max: () => number;
  /** Tắt tạm (vd. tab khác đang hiện). */
  enabled?: () => boolean;
  /** Kéo quá bao nhiêu điểm thì tính là cuộn (mặc định 6). */
  threshold?: number;
  /** Cuộn ngang (kéo theo trục X); `inView` vẫn nhận tọa độ Y để biết chạm có nằm trong dải cuộn không. */
  horizontal?: boolean;
}

export class KineticScroll {
  private core: KineticCore;

  constructor(scene: Engine.Scene, o: KineticOptions) {
    this.core = new KineticCore({ get: o.get, set: o.set, max: o.max }, o.threshold);
    const input = scene.input;
    const enabled = () => (o.enabled ? o.enabled() : true);
    const axis = (p: Engine.Input.Pointer) => (o.horizontal ? p.worldX : p.worldY);
    const down = (p: Engine.Input.Pointer) => this.core.down(axis(p), eventTime(p, 'down'), enabled() && o.inView(p.worldY));
    // Dùng thời điểm của sự kiện chạm (không phải lúc xử lý): trình duyệt có thể gom nhiều lần chạm vào một khung hình.
    const move = (p: Engine.Input.Pointer) => { if (p.isDown) this.core.move(axis(p), eventTime(p, 'move')); };
    const up = (p: Engine.Input.Pointer) => this.core.up(eventTime(p, 'up'));
    const wheel = (p: Engine.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      // Cuộn ngang: lăn chuột thường (dy) cũng kéo dải sang ngang; vuốt ngang trên touchpad (dx) cũng được.
      if (enabled() && o.inView(p.worldY)) this.core.wheel(o.horizontal && Math.abs(dx) > Math.abs(dy) ? dx : dy);
    };
    const update = (_t: number, deltaMs: number) => this.core.tick(deltaMs);
    input.on('pointerdown', down);
    input.on('pointermove', move);
    input.on('pointerup', up);
    input.on('pointerupoutside', up);
    input.on('wheel', wheel);
    scene.events.on('update', update);
    scene.events.once('shutdown', () => {
      input.off('pointerdown', down);
      input.off('pointermove', move);
      input.off('pointerup', up);
      input.off('pointerupoutside', up);
      input.off('wheel', wheel);
      scene.events.off('update', update);
    });
  }

  /** Chạm hiện tại là thao tác cuộn (hoặc chạm để dừng quán tính), không phải bấm. */
  get blockTap(): boolean {
    return this.core.tapBlocked;
  }

  get moving(): boolean {
    return this.core.moving;
  }

  get velocity(): number {
    return this.core.velocity;
  }

  stop(): void {
    this.core.stop();
  }

  /** Bỏ thao tác hiện tại (vd. người chơi giữ để nhấc món lên kéo thả thay vì cuộn). */
  cancel(): void {
    this.core.cancel();
  }
}

/** Thời điểm (ms) của sự kiện chạm theo đồng hồ của trình duyệt. */
function eventTime(p: Engine.Input.Pointer, kind: 'down' | 'move' | 'up'): number {
  const t = kind === 'down' ? p.downTime : kind === 'move' ? p.moveTime : p.upTime;
  return t > 0 ? t : performance.now();
}

/**
 * Cho đối tượng (Container đã setSize) nhận chạm, nhưng chỉ phần nằm trong khung nhìn `inView` (tọa độ Y thế giới).
 * Mask chỉ che hình chứ không che vùng chạm: không cắt thì món đã cuộn ra ngoài khung vẫn nuốt chạm
 * của nút nằm cùng chỗ (vd. tab Nhập hàng / Bày kệ / Tiệm phía trên kệ).
 */
export function clipInteractive(obj: Engine.GameObjects.Container, inView: (worldY: number) => boolean): void {
  obj.setInteractive({
    hitArea: new Engine.Geom.Rectangle(0, 0, obj.width, obj.height),
    hitAreaCallback: (area: Engine.Geom.Rectangle, x: number, y: number) => {
      if (!Engine.Geom.Rectangle.Contains(area, x, y)) return false;
      const m = obj.getWorldTransformMatrix();
      return inView(m.ty + (y - obj.displayOriginY) * m.scaleY);
    },
    useHandCursor: true,
  });
}

/** Làm tròn vị trí theo điểm ảnh thật của canvas (tránh chữ rung khi cuộn). */
export function snap(y: number): number {
  return Math.round(y * ZOOM) / ZOOM;
}

// ---------- Chỉ vẽ phần đang nhìn thấy ----------

/** Khoảng dọc của một đối tượng trong container cha (theo khung bao cục bộ PixiJS tính sẵn). */
function itemBand(obj: Engine.GameObjects.GameObject): [number, number] | null {
  if (obj instanceof Engine.GameObjects.Container && obj.height > 0) {
    const halfHeight = obj.height * obj.scaleY / 2;
    return [obj.y - halfHeight, obj.y + halfHeight];
  }
  const b = obj.view.getLocalBounds();
  if (b.maxY <= b.minY) return null;
  // Khung bao cục bộ đã tính tỉ lệ + vị trí của chính đối tượng trong cha.
  const sy = obj.scaleY;
  return [obj.y + b.minY * sy - 4, obj.y + b.maxY * sy + 4];
}

/**
 * Bỏ qua việc vẽ các con của `container` nằm ngoài khung nhìn [top, bottom] (tọa độ thế giới).
 * Dùng cờ `renderable` của PixiJS nên không đụng tới trạng thái hiện/ẩn mà màn chơi tự đặt.
 */
export class Culler {
  private bands = new WeakMap<Engine.GameObjects.GameObject, [number, number] | null>();

  constructor(_camera: Engine.Cameras.Scene2D.Camera, private margin = 80) {}

  /** Gọi khi danh sách được dựng lại / vẽ lại để tính lại vùng. */
  reset(): void {
    this.bands = new WeakMap();
  }

  cull(container: Engine.GameObjects.Container, top: number, bottom: number): void {
    const offset = container.y;
    for (const child of container.list) {
      let band = this.bands.get(child);
      if (band === undefined) {
        band = itemBand(child);
        this.bands.set(child, band);
      }
      if (!band) continue;
      child.view.renderable = band[1] + offset >= top - this.margin && band[0] + offset <= bottom + this.margin;
    }
  }
}
