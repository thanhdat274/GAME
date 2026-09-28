import { FillGradient, Graphics as PixiGraphics, Matrix, Rectangle, Texture } from 'pixi.js';
import type { Scene } from '../scene/Scene';
import { GameObject } from './GameObject';
import { renderer, runtime } from '../runtime';

export type RoundedRectRadius = { tl?: number; tr?: number; bl?: number; br?: number };
type Radius = number | RoundedRectRadius;

export interface GraphicsOptions {
  x?: number;
  y?: number;
  fillStyle?: { color?: number; alpha?: number };
  lineStyle?: { width?: number; color?: number; alpha?: number };
}

export class GeometryMask {
  /** Các node mặt nạ đang dùng chung hình học này (mỗi đối tượng bị che một node). */
  constructor(readonly geometryMask: Graphics) {}
  destroy(): void { this.geometryMask.destroy(); }
  /** Cập nhật vị trí các node mặt nạ khi Graphics gốc di chuyển. */
  sync(): void { this.geometryMask.syncMaskClones(); }
}

/**
 * Vẽ hình theo kiểu "đặt màu rồi vẽ" (fillStyle → fillRect...) trên PixiJS Graphics.
 * PixiJS gom các lệnh vẽ thành hình học trên GPU và chỉ dựng lại khi `clear()` + vẽ lại.
 */
export class Graphics extends GameObject {
  declare readonly view: PixiGraphics;
  private fillColor = 0xffffff;
  private fillAlpha = 1;
  private lineWidth = 1;
  private lineColor = 0xffffff;
  private lineAlpha = 1;
  private readonly defaults: { fc: number; fa: number; lw: number; lc: number; la: number };
  private pendingGradient: [number, number, number, number] | null = null;

  constructor(scene: Scene, options: GraphicsOptions = {}) {
    super(scene, 'Graphics', new PixiGraphics());
    this.view.position.set(options.x ?? 0, options.y ?? 0);
    this.defaults = {
      fc: options.fillStyle?.color ?? 0xffffff,
      fa: options.fillStyle?.alpha ?? 1,
      lw: options.lineStyle?.width ?? 1,
      lc: options.lineStyle?.color ?? 0xffffff,
      la: options.lineStyle?.alpha ?? 1,
    };
    this.resetStyles();
  }

  private resetStyles(): void {
    this.fillColor = this.defaults.fc;
    this.fillAlpha = this.defaults.fa;
    this.lineWidth = this.defaults.lw;
    this.lineColor = this.defaults.lc;
    this.lineAlpha = this.defaults.la;
    this.pendingGradient = null;
  }

  private get fill() {
    return { color: this.fillColor, alpha: this.fillAlpha };
  }

  private get stroke() {
    return { width: this.lineWidth, color: this.lineColor, alpha: this.lineAlpha, alignment: 0.5 };
  }

  clear(): this {
    this.view.clear();
    for (const t of this.gradientTextures) t.destroy(true);
    this.gradientTextures = [];
    this.resetStyles();
    return this;
  }

  fillStyle(color: number, alpha = 1): this {
    this.fillColor = color;
    this.fillAlpha = alpha;
    this.pendingGradient = null;
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lineWidth = width;
    this.lineColor = color;
    this.lineAlpha = alpha;
    return this;
  }

  /** Gradient 4 góc như Phaser (màu nội suy theo đỉnh của hai tam giác TL-BL-BR và TL-BR-TR). */
  fillGradientStyle(topLeft: number, topRight: number, bottomLeft: number, bottomRight: number, alphaTL = 1): this {
    this.fillAlpha = alphaTL;
    this.pendingGradient = [topLeft, topRight, bottomLeft, bottomRight];
    return this;
  }

  private gradientFor(x: number, y: number, w: number, h: number) {
    const [tl, tr, bl, br] = this.pendingGradient!;
    if (tl === tr && bl === br) {
      // Chỉ đổi theo chiều dọc: gradient tuyến tính của PixiJS cho kết quả trùng khớp.
      const g = new FillGradient(0, y, 0, y + h);
      g.addColorStop(0, tl);
      g.addColorStop(1, bl);
      return { fill: g, alpha: this.fillAlpha };
    }
    // Màu khác nhau theo cả hai trục: vẽ đúng phép nội suy theo tam giác của Phaser vào texture ở độ phân giải canvas.
    const res = runtime.game?.config.resolution ?? 1;
    const tw = Math.max(1, Math.round(w * res));
    const th = Math.max(1, Math.round(h * res));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const c2d = canvas.getContext('2d')!;
    const img = c2d.createImageData(tw, th);
    const ch = (v: number, k: number) => (v >> k) & 0xff;
    for (let py = 0; py < th; py++) {
      const v = (py + 0.5) / th;
      for (let px = 0; px < tw; px++) {
        const u = (px + 0.5) / tw;
        // Tam giác TL-BL-BR (dưới đường chéo) hoặc TL-BR-TR (trên đường chéo).
        const [a, b, cc, wa, wb, wc] = v >= u ? [tl, bl, br, 1 - v, v - u, u] : [tl, tr, br, 1 - u, u - v, v];
        const o = (py * tw + px) * 4;
        for (const [k, off] of [[16, 0], [8, 1], [0, 2]] as const) img.data[o + off] = ch(a, k) * wa + ch(b, k) * wb + ch(cc, k) * wc;
        img.data[o + 3] = 255;
      }
    }
    c2d.putImageData(img, 0, 0);
    const texture = Texture.from(canvas);
    this.gradientTextures.push(texture);
    return { texture, alpha: this.fillAlpha, matrix: new Matrix().scale(w / tw, h / th).translate(x, y) };
  }

  private gradientTextures: Texture[] = [];

  fillRect(x: number, y: number, w: number, h: number): this {
    if (w === 0 || h === 0) return this;
    this.view.rect(x, y, w, h).fill(this.pendingGradient ? this.gradientFor(x, y, w, h) : this.fill);
    return this;
  }

  strokeRect(x: number, y: number, w: number, h: number): this {
    this.view.rect(x, y, w, h).stroke(this.stroke);
    return this;
  }

  private roundPath(x: number, y: number, w: number, h: number, radius: Radius): void {
    const max = Math.max(0, Math.min(w, h) / 2);
    const clamp = (v: number | undefined) => Math.max(0, Math.min(max, v ?? 20));
    if (typeof radius === 'number') {
      this.view.roundRect(x, y, w, h, clamp(radius));
      return;
    }
    const tl = clamp(radius.tl);
    const tr = clamp(radius.tr);
    const br = clamp(radius.br);
    const bl = clamp(radius.bl);
    const g = this.view;
    g.moveTo(x + tl, y);
    g.lineTo(x + w - tr, y);
    if (tr) g.arc(x + w - tr, y + tr, tr, -Math.PI / 2, 0);
    g.lineTo(x + w, y + h - br);
    if (br) g.arc(x + w - br, y + h - br, br, 0, Math.PI / 2);
    g.lineTo(x + bl, y + h);
    if (bl) g.arc(x + bl, y + h - bl, bl, Math.PI / 2, Math.PI);
    g.lineTo(x, y + tl);
    if (tl) g.arc(x + tl, y + tl, tl, Math.PI, Math.PI * 1.5);
    g.closePath();
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, radius: Radius = 20): this {
    if (w <= 0 || h <= 0) return this;
    this.roundPath(x, y, w, h, radius);
    this.view.fill(this.pendingGradient ? this.gradientFor(x, y, w, h) : this.fill);
    return this;
  }

  strokeRoundedRect(x: number, y: number, w: number, h: number, radius: Radius = 20): this {
    if (w <= 0 || h <= 0) return this;
    this.roundPath(x, y, w, h, radius);
    this.view.stroke(this.stroke);
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    if (r <= 0) return this;
    this.view.circle(x, y, r).fill(this.fill);
    return this;
  }

  strokeCircle(x: number, y: number, r: number): this {
    if (r <= 0) return this;
    this.view.circle(x, y, r).stroke(this.stroke);
    return this;
  }

  fillEllipse(x: number, y: number, w: number, h: number): this {
    this.view.ellipse(x, y, w / 2, h / 2).fill(this.fill);
    return this;
  }

  strokeEllipse(x: number, y: number, w: number, h: number): this {
    this.view.ellipse(x, y, w / 2, h / 2).stroke(this.stroke);
    return this;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.view.poly([x0, y0, x1, y1, x2, y2]).fill(this.fill);
    return this;
  }

  strokeTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    this.view.poly([x0, y0, x1, y1, x2, y2]).stroke(this.stroke);
    return this;
  }

  fillPoints(points: { x: number; y: number }[]): this {
    this.view.poly(points.flatMap((p) => [p.x, p.y])).fill(this.fill);
    return this;
  }

  strokePoints(points: { x: number; y: number }[], closeShape = false): this {
    this.view.poly(points.flatMap((p) => [p.x, p.y]), closeShape).stroke(this.stroke);
    return this;
  }

  lineBetween(x1: number, y1: number, x2: number, y2: number): this {
    this.view.moveTo(x1, y1).lineTo(x2, y2).stroke(this.stroke);
    return this;
  }

  beginPath(): this { this.view.beginPath(); return this; }
  closePath(): this { this.view.closePath(); return this; }
  moveTo(x: number, y: number): this { this.view.moveTo(x, y); return this; }
  lineTo(x: number, y: number): this { this.view.lineTo(x, y); return this; }
  arc(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    this.view.arc(x, y, r, start, end, anticlockwise);
    return this;
  }

  slice(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    this.view.moveTo(x, y).arc(x, y, r, start, end, anticlockwise).closePath();
    return this;
  }

  strokePath(): this { this.view.stroke(this.stroke); return this; }
  fillPath(): this { this.view.fill(this.fill); return this; }

  /** Vẽ nội dung ra texture `key` kích thước w×h (tính từ gốc tọa độ riêng). */
  generateTexture(key: string, width: number, height: number): this {
    const tex = renderer().generateTexture({ target: this.view, frame: new Rectangle(0, 0, width, height), resolution: 1, antialias: false });
    this.scene.sys.textures.addTexture(key, tex);
    return this;
  }

  /** Node mặt nạ tạo từ Graphics này (chung GraphicsContext). */
  readonly maskClones = new Set<PixiGraphics>();

  createGeometryMask(): GeometryMask {
    return new GeometryMask(this);
  }

  syncMaskClones(): void {
    for (const g of this.maskClones) {
      if (g.destroyed) { this.maskClones.delete(g); continue; }
      g.position.copyFrom(this.view.position);
      g.scale.copyFrom(this.view.scale);
      g.rotation = this.view.rotation;
    }
  }

  override setPosition(x = 0, y = x): this {
    super.setPosition(x, y);
    if (this.maskClones.size) this.syncMaskClones();
    return this;
  }

  protected override makeGhost(): PixiGraphics {
    return new PixiGraphics();
  }

  protected override destroyView(): void {
    // Hình học có thể còn được node mặt nạ khác dùng: giữ lại GraphicsContext cho tới khi chúng bị hủy.
    if (!this.view.destroyed) this.view.destroy({ context: this.maskClones.size === 0 } as never);
  }
}
