export class Rectangle {
  constructor(public x = 0, public y = 0, public width = 0, public height = 0) {}
  setSize(w: number, h = w): this { this.width = w; this.height = h; return this; }
  setTo(x: number, y: number, w: number, h: number): this { this.x = x; this.y = y; this.width = w; this.height = h; return this; }
  contains(x: number, y: number): boolean { return Rectangle.Contains(this, x, y); }
  get left(): number { return this.x; }
  get right(): number { return this.x + this.width; }
  get top(): number { return this.y; }
  get bottom(): number { return this.y + this.height; }
  get centerX(): number { return this.x + this.width / 2; }
  get centerY(): number { return this.y + this.height / 2; }
  static Contains(rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean {
    if (rect.width <= 0 || rect.height <= 0) return false;
    return rect.x <= x && rect.x + rect.width >= x && rect.y <= y && rect.y + rect.height >= y;
  }
}

export class Circle {
  constructor(public x = 0, public y = 0, public radius = 0) {}
  static Contains(c: Circle, x: number, y: number): boolean {
    const dx = c.x - x;
    const dy = c.y - y;
    return c.radius > 0 && dx * dx + dy * dy <= c.radius * c.radius;
  }
}
