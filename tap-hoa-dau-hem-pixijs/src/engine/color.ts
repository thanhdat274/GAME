/** Tập con Phaser.Display.Color mà game dùng. */
export class ColorObject {
  constructor(public r: number, public g: number, public b: number, public a = 255) {}
  get color(): number { return (this.r << 16) | (this.g << 8) | this.b; }
}

export function IntegerToColor(value: number): ColorObject {
  return new ColorObject((value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

export function HexStringToColor(hex: string): ColorObject {
  let h = hex.replace('#', '').replace(/^0x/i, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(0, 6), 16) || 0;
  return IntegerToColor(v);
}

export function GetColor(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export const Interpolate = {
  /** Nội suy tuyến tính giữa hai màu tại bước `index` / `length`. */
  ColorWithColor(c1: ColorObject, c2: ColorObject, length: number, index: number): ColorObject {
    const t = length === 0 ? 0 : index / length;
    return new ColorObject(
      Math.floor(c1.r + (c2.r - c1.r) * t),
      Math.floor(c1.g + (c2.g - c1.g) * t),
      Math.floor(c1.b + (c2.b - c1.b) * t),
    );
  },
};
