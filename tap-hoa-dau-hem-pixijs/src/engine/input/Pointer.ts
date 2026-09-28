/**
 * Con trỏ / ngón tay. Tọa độ `x/y/downX/...` theo điểm ảnh canvas (logic × ZOOM) như Phaser,
 * `worldX/worldY` theo tọa độ thế giới logic (360 × H).
 */
export class Pointer {
  x = 0;
  y = 0;
  worldX = 0;
  worldY = 0;
  downX = 0;
  downY = 0;
  upX = 0;
  upY = 0;
  downTime = 0;
  upTime = 0;
  moveTime = 0;
  isDown = false;
  button = 0;
  wasTouch = false;
  event: PointerEvent | WheelEvent | null = null;
  deltaX = 0;
  deltaY = 0;
  deltaZ = 0;
  prevPosition = { x: 0, y: 0 };
  /** Id DOM của ngón tay hiện đang gắn với con trỏ này. */
  domId = -1;

  constructor(readonly id: number) {}

  get primaryDown(): boolean { return this.isDown; }
  get active(): boolean { return this.domId >= 0 || this.id === 0; }

  /** Khoảng cách từ lúc chạm xuống tới vị trí hiện tại (đang giữ) hoặc lúc nhả tay. */
  getDistance(): number {
    const x = this.isDown ? this.x : this.upX;
    const y = this.isDown ? this.y : this.upY;
    return Math.hypot(x - this.downX, y - this.downY);
  }

  getDuration(): number {
    return this.isDown ? performance.now() - this.downTime : this.upTime - this.downTime;
  }

  leftButtonDown(): boolean { return this.isDown && this.button === 0; }
}
