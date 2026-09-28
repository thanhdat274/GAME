import { RenderTexture, Texture, type TextureSource } from 'pixi.js';
import type { GameObject } from './gameobjects/GameObject';
import { drawToTexture } from './gameobjects/Shapes';

export const FilterMode = { LINEAR: 0, NEAREST: 1 } as const;

/** Texture đã đăng ký theo khóa (giống Phaser.Textures.Texture ở mức game dùng). */
export class TextureEntry {
  constructor(readonly key: string, readonly texture: Texture) {}
  get source(): TextureSource { return this.texture.source; }
  get width(): number { return this.texture.width; }
  get height(): number { return this.texture.height; }
  setFilter(mode: number): this {
    this.texture.source.scaleMode = mode === FilterMode.NEAREST ? 'nearest' : 'linear';
    return this;
  }
  getSourceImage(): unknown { return this.texture.source.resource; }
}

/** Texture vẽ bằng Canvas 2D; gọi `refresh()` sau khi vẽ để tải lên GPU. */
export class CanvasTextureEntry extends TextureEntry {
  constructor(key: string, readonly canvas: HTMLCanvasElement) {
    super(key, Texture.from(canvas));
  }
  getContext(): CanvasRenderingContext2D { return this.canvas.getContext('2d')!; }
  getCanvas(): HTMLCanvasElement { return this.canvas; }
  refresh(): this {
    this.texture.source.update();
    return this;
  }
}

/** Texture vẽ động (Phaser DynamicTexture): vẽ đối tượng game lên, dùng lại theo khóa. */
export class DynamicTextureEntry extends TextureEntry {
  constructor(key: string, readonly rt: RenderTexture) {
    super(key, rt);
  }
  draw(entries: GameObject | GameObject[], x = 0, y = 0): this {
    drawToTexture(this.rt, entries, x, y);
    return this;
  }
}

export class TextureManager {
  private map = new Map<string, TextureEntry>();

  exists(key: string): boolean { return this.map.has(key); }

  get(key: string): TextureEntry {
    const entry = this.map.get(key);
    if (entry) return entry;
    return new TextureEntry(key, Texture.WHITE);
  }

  getTexture(key: string): Texture {
    return this.map.get(key)?.texture ?? Texture.EMPTY;
  }

  addTexture(key: string, texture: Texture): TextureEntry {
    this.remove(key);
    const entry = new TextureEntry(key, texture);
    this.map.set(key, entry);
    return entry;
  }

  addImage(key: string, image: HTMLImageElement | HTMLCanvasElement | ImageBitmap): TextureEntry | null {
    if (this.map.has(key)) return null;
    return this.addTexture(key, Texture.from(image));
  }

  createCanvas(key: string, width = 256, height = 256): CanvasTextureEntry | null {
    if (this.map.has(key)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const entry = new CanvasTextureEntry(key, canvas);
    this.map.set(key, entry);
    return entry;
  }

  addDynamicTexture(key: string, width = 256, height = 256): DynamicTextureEntry | null {
    if (this.map.has(key)) return null;
    const rt = RenderTexture.create({ width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), resolution: 1, antialias: false });
    const entry = new DynamicTextureEntry(key, rt);
    this.map.set(key, entry);
    return entry;
  }

  remove(key: string): void {
    const old = this.map.get(key);
    if (!old) return;
    this.map.delete(key);
    old.texture.destroy(true);
  }

  get count(): number { return this.map.size; }
}
