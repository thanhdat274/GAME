import Phaser from 'phaser';
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
}

export class KineticScroll {
  private core: KineticCore;

  constructor(scene: Phaser.Scene, o: KineticOptions) {
    this.core = new KineticCore({ get: o.get, set: o.set, max: o.max }, o.threshold);
    const input = scene.input;
    const enabled = () => (o.enabled ? o.enabled() : true);
    const down = (p: Phaser.Input.Pointer) => this.core.down(p.worldY, eventTime(p, 'down'), enabled() && o.inView(p.worldY));
    // Dùng thời điểm của sự kiện chạm (không phải lúc xử lý): trình duyệt có thể gom nhiều lần chạm vào một khung hình.
    const move = (p: Phaser.Input.Pointer) => { if (p.isDown) this.core.move(p.worldY, eventTime(p, 'move')); };
    const up = (p: Phaser.Input.Pointer) => this.core.up(eventTime(p, 'up'));
    const wheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (enabled() && o.inView(p.worldY)) this.core.wheel(dy);
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
function eventTime(p: Phaser.Input.Pointer, kind: 'down' | 'move' | 'up'): number {
  const t = kind === 'down' ? p.downTime : kind === 'move' ? p.moveTime : p.upTime;
  return t > 0 ? t : performance.now();
}

/** Làm tròn vị trí theo điểm ảnh thật của canvas (tránh chữ rung khi cuộn). */
export function snap(y: number): number {
  return Math.round(y * ZOOM) / ZOOM;
}

// ---------- Chỉ vẽ phần đang nhìn thấy ----------

const ARGS: Record<number, number> = { 0: 7, 1: 0, 2: 0, 3: 4, 4: 2, 5: 2, 6: 3, 7: 2, 8: 0, 9: 0, 10: 6, 11: 6, 14: 0, 15: 0, 21: 8, 22: 6 };

/** Khoảng dọc (theo tọa độ riêng) mà một Graphics đã vẽ; null nếu không đọc được. */
export function graphicsBand(g: Phaser.GameObjects.Graphics): [number, number] | null {
  const buf = g.commandBuffer as number[];
  let min = Infinity;
  let max = -Infinity;
  let pad = 0;
  for (let i = 0; i < buf.length;) {
    const cmd = buf[i];
    const n = ARGS[cmd];
    if (n === undefined) return null; // có biến đổi (translate/scale/rotate): không đoán
    const a = buf.slice(i + 1, i + 1 + n);
    if (cmd === 3) { min = Math.min(min, a[1]); max = Math.max(max, a[1] + a[3]); }
    else if (cmd === 4 || cmd === 5) { min = Math.min(min, a[1]); max = Math.max(max, a[1]); }
    else if (cmd === 0) { min = Math.min(min, a[1] - a[2]); max = Math.max(max, a[1] + a[2]); }
    else if (cmd === 10 || cmd === 11) { min = Math.min(min, a[1], a[3], a[5]); max = Math.max(max, a[1], a[3], a[5]); }
    else if (cmd === 6) pad = Math.max(pad, a[0]);
    i += 1 + n;
  }
  if (min === Infinity) return null;
  return [min - pad - 4, max + pad + 4];
}

type Sized = Phaser.GameObjects.GameObject & { y: number; displayHeight?: number; height?: number; originY?: number; scaleY?: number };

/** Khoảng dọc của một đối tượng trong container cha. */
function itemBand(obj: Phaser.GameObjects.GameObject): [number, number] | null {
  const o = obj as Sized;
  if (obj instanceof Phaser.GameObjects.Graphics) {
    const b = graphicsBand(obj);
    return b ? [b[0] * obj.scaleY + obj.y, b[1] * obj.scaleY + obj.y] : null;
  }
  if (obj instanceof Phaser.GameObjects.Container) {
    // Nút (Button) có kích thước, gốc ở giữa; container khác (icon) lấy biên độ an toàn.
    const h = obj.height > 0 ? obj.height * obj.scaleY : 60;
    return [obj.y - h / 2, obj.y + h / 2];
  }
  const h = o.displayHeight ?? o.height ?? 0;
  if (!(h > 0)) return [o.y - 40, o.y + 40];
  const top = o.y - (o.originY ?? 0) * h;
  return [top, top + h];
}

/**
 * Bỏ qua việc vẽ các con của `container` nằm ngoài khung nhìn [top, bottom] (tọa độ thế giới).
 * Dùng bộ lọc camera (`cameraFilter`) nên không đụng tới trạng thái hiện/ẩn mà màn chơi tự đặt.
 */
export class Culler {
  private bands = new WeakMap<Phaser.GameObjects.GameObject, [number, number] | null>();

  constructor(private camera: Phaser.Cameras.Scene2D.Camera, private margin = 80) {}

  /** Gọi khi danh sách được dựng lại / vẽ lại để tính lại vùng. */
  reset(): void {
    this.bands = new WeakMap();
  }

  cull(container: Phaser.GameObjects.Container, top: number, bottom: number): void {
    const offset = container.y;
    const bit = this.camera.id;
    for (const child of container.list) {
      let band = this.bands.get(child);
      if (band === undefined) {
        band = itemBand(child);
        this.bands.set(child, band);
      }
      if (!band) continue;
      const inside = band[1] + offset >= top - this.margin && band[0] + offset <= bottom + this.margin;
      if (inside) child.cameraFilter &= ~bit;
      else child.cameraFilter |= bit;
    }
  }
}
