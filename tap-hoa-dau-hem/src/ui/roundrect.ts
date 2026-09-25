import Phaser from 'phaser';

type Radius = number | Phaser.Types.GameObjects.Graphics.RoundedRectRadius;

/**
 * Thay fillRoundedRect của Phaser: bản gốc (WebGL) để lại một vạch mảnh ở x = mép trái + bán kính
 * trên các khung cao. Ở đây ghép hình từ các hình chữ nhật và 4 góc tròn không chồng lên nhau,
 * nên cũng đúng với màu bán trong suốt (bóng đổ) mà không bị đậm chỗ giao nhau.
 */
function fillRoundedRect(this: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, radius: Radius = 20) {
  const max = Math.max(0, Math.min(w, h) / 2);
  const clamp = (v: number | undefined) => Math.max(0, Math.min(max, v ?? 20));
  const r =
    typeof radius === 'number'
      ? { tl: clamp(radius), tr: clamp(radius), bl: clamp(radius), br: clamp(radius) }
      : { tl: clamp(radius.tl), tr: clamp(radius.tr), bl: clamp(radius.bl), br: clamp(radius.br) };
  if (w <= 0 || h <= 0) return this;

  const left = Math.max(r.tl, r.bl);
  const right = Math.max(r.tr, r.br);
  const rect = (rx: number, ry: number, rw: number, rh: number) => {
    if (rw > 0 && rh > 0) this.fillRect(rx, ry, rw, rh);
  };
  const corner = (cx: number, cy: number, rad: number, from: number) => {
    if (rad <= 0) return;
    this.slice(cx, cy, rad, from, from + Math.PI / 2, false);
    this.fillPath();
  };

  // Cột giữa cao hết cỡ.
  rect(x + left, y, w - left - right, h);
  // Cột trái: phần giữa hai góc, cộng phần bù khi hai góc trái khác bán kính.
  rect(x, y + r.tl, left, h - r.tl - r.bl);
  rect(x + r.tl, y, left - r.tl, r.tl);
  rect(x + r.bl, y + h - r.bl, left - r.bl, r.bl);
  // Cột phải tương tự.
  rect(x + w - right, y + r.tr, right, h - r.tr - r.br);
  rect(x + w - right, y, right - r.tr, r.tr);
  rect(x + w - right, y + h - r.br, right - r.br, r.br);
  // Bốn góc.
  corner(x + r.tl, y + r.tl, r.tl, Math.PI);
  corner(x + w - r.tr, y + r.tr, r.tr, Math.PI * 1.5);
  corner(x + w - r.br, y + h - r.br, r.br, 0);
  corner(x + r.bl, y + h - r.bl, r.bl, Math.PI / 2);
  return this;
}

export function installRoundedRectFix(): void {
  Phaser.GameObjects.Graphics.prototype.fillRoundedRect = fillRoundedRect;
}
