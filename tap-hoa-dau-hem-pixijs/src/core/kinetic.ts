/**
 * Tính toán cuộn kiểu điện thoại, không phụ thuộc Phaser: kéo theo ngón tay, thả ra thì trôi theo quán tính
 * rồi chậm dần; đang trôi mà chạm vào thì dừng lại (chạm đó không tính là bấm).
 */
export interface KineticTarget {
  /** Vị trí cuộn hiện tại (0 = đầu danh sách). */
  get: () => number;
  set: (value: number) => void;
  /** Vị trí cuộn lớn nhất. */
  max: () => number;
}

export const KINETIC = {
  /** Kéo quá bao nhiêu điểm thì tính là cuộn. */
  threshold: 6,
  /** Tốc độ chậm dần (1/giây); càng lớn dừng càng nhanh. */
  decay: 3.2,
  /** Tốc độ tối đa khi hất và tốc độ tối thiểu để trôi (điểm/giây). */
  maxVelocity: 4200,
  minFling: 60,
  /** Chỉ lấy chuyển động trong khoảng này (ms) trước khi nhấc tay để tính vận tốc. */
  sampleMs: 90,
  /** Ngón tay dừng lâu hơn khoảng này (ms) trước khi nhấc thì không trôi. */
  holdStillMs: 60,
} as const;

export class KineticCore {
  private active = false;
  private dragging = false;
  private startY = 0;
  private startScroll = 0;
  private samples: { t: number; y: number }[] = [];
  velocity = 0;
  /** Chạm hiện tại là thao tác cuộn (hoặc chạm để dừng trôi), không phải bấm. */
  tapBlocked = false;

  constructor(private target: KineticTarget, private threshold: number = KINETIC.threshold) {}

  get moving(): boolean {
    return this.dragging || this.velocity !== 0;
  }

  private apply(value: number): number {
    const v = Math.min(Math.max(0, this.target.max()), Math.max(0, value));
    this.target.set(v);
    return v;
  }

  /** `inside` = điểm chạm nằm trong vùng cuộn. `t` = thời điểm sự kiện (ms). */
  down(y: number, t: number, inside: boolean): void {
    this.active = inside;
    this.dragging = false;
    this.tapBlocked = inside && this.velocity !== 0;
    if (inside) this.velocity = 0;
    this.startY = y;
    this.startScroll = this.target.get();
    this.samples = [{ t, y }];
  }

  move(y: number, t: number): void {
    if (!this.active) return;
    if (!this.dragging) {
      if (Math.abs(y - this.startY) < this.threshold) return;
      // Bắt đầu cuộn từ chỗ ngón tay đang đứng để nội dung không giật một đoạn.
      this.dragging = true;
      this.tapBlocked = true;
      this.startY = y;
      this.startScroll = this.target.get();
    }
    this.apply(this.startScroll - (y - this.startY));
    this.samples.push({ t, y });
    while (this.samples.length > 2 && t - this.samples[0].t > KINETIC.sampleMs) this.samples.shift();
  }

  up(t: number): void {
    if (this.active && this.dragging && this.samples.length >= 2) {
      const first = this.samples[0];
      const last = this.samples[this.samples.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0 && t - last.t < KINETIC.holdStillMs) {
        const v = -(last.y - first.y) / dt;
        this.velocity = Math.abs(v) < KINETIC.minFling ? 0 : Math.max(-KINETIC.maxVelocity, Math.min(KINETIC.maxVelocity, v));
      }
    }
    this.active = false;
    this.dragging = false;
  }

  wheel(dy: number): void {
    this.velocity = 0;
    this.apply(this.target.get() + dy * 0.5);
  }

  /** Bỏ thao tác hiện tại (vd. giữ để nhấc món lên kéo thả). */
  cancel(): void {
    this.active = false;
    this.dragging = false;
    this.velocity = 0;
  }

  stop(): void {
    this.velocity = 0;
  }

  /** Mỗi khung hình: trôi theo quán tính. */
  tick(deltaMs: number): void {
    if (!this.velocity || this.dragging) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    const before = this.target.get();
    const after = this.apply(before + this.velocity * dt);
    if (after === before || after <= 0 || after >= this.target.max()) { this.velocity = 0; return; }
    this.velocity *= Math.exp(-KINETIC.decay * dt);
    if (Math.abs(this.velocity) < 12) this.velocity = 0;
  }
}
