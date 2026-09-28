import { Container as PixiContainer, Graphics as PixiGraphics, Text as PixiText, TextStyle, type TextStyleOptions } from 'pixi.js';
import type { Scene } from '../scene/Scene';
import { GameObject } from './GameObject';

export interface TextStyleConfig {
  fontFamily?: string;
  fontSize?: string | number;
  fontStyle?: string;
  color?: string;
  align?: 'left' | 'center' | 'right' | string;
  wordWrap?: { width?: number; useAdvancedWrap?: boolean };
  stroke?: string;
  strokeThickness?: number;
  resolution?: number;
  padding?: { top?: number; bottom?: number; left?: number; right?: number; x?: number; y?: number };
  backgroundColor?: string;
  lineSpacing?: number;
  maxLines?: number;
  fixedWidth?: number;
  fixedHeight?: number;
}

const px = (v: string | number | undefined, fallback: number) => (typeof v === 'number' ? v : v ? parseFloat(v) : fallback);
const SPLIT = /(?:\r\n|\r|\n)/;

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(font: string): CanvasRenderingContext2D {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  if (measureCtx.font !== font) measureCtx.font = font;
  return measureCtx;
}

/** Thuật toán ngắt dòng "advanced" của Phaser, chép nguyên văn để chữ xuống dòng giống hệt bản gốc. */
function advancedWordWrap(text: string, c: CanvasRenderingContext2D, wrapWidth: number): string {
  let output = '';
  const lines = text.replace(/ +/gi, ' ').split(SPLIT);
  let linesCount = lines.length;
  for (let i = 0; i < linesCount; i++) {
    let line = lines[i];
    let out = '';
    line = line.replace(/^ *|\s*$/gi, '');
    if (c.measureText(line).width < wrapWidth) {
      output += line + '\n';
      continue;
    }
    let currentLineWidth = wrapWidth;
    const words = line.split(' ');
    for (let j = 0; j < words.length; j++) {
      const word = words[j];
      const wordWithSpace = word + ' ';
      let wordWidth = c.measureText(wordWithSpace).width;
      if (wordWidth > currentLineWidth) {
        if (j === 0) {
          let newWord = wordWithSpace;
          while (newWord.length) {
            newWord = newWord.slice(0, -1);
            wordWidth = c.measureText(newWord).width;
            if (wordWidth <= currentLineWidth) break;
          }
          if (!newWord.length) throw new Error('wordWrapWidth < a single character');
          words[j] = word.substr(newWord.length);
          out += newWord;
        }
        const offset = words[j].length ? j : j + 1;
        const remainder = words.slice(offset).join(' ').replace(/[ \n]*$/gi, '');
        lines.splice(i + 1, 0, remainder);
        linesCount = lines.length;
        break;
      } else {
        out += wordWithSpace;
        currentLineWidth -= wordWidth;
      }
    }
    output += out.replace(/[ \n]*$/gi, '') + '\n';
  }
  return output.replace(/[\s|\n]*$/gi, '');
}

/** Ngắt dòng "basic" của Phaser. */
function basicWordWrap(text: string, c: CanvasRenderingContext2D, wrapWidth: number): string {
  let result = '';
  const lines = text.split(SPLIT);
  const last = lines.length - 1;
  const whiteSpaceWidth = c.measureText(' ').width;
  for (let i = 0; i <= last; i++) {
    let spaceLeft = wrapWidth;
    const words = lines[i].split(' ');
    const lastWord = words.length - 1;
    for (let j = 0; j <= lastWord; j++) {
      const word = words[j];
      const wordWidth = c.measureText(word).width;
      let wordWidthWithSpace = wordWidth;
      if (j < lastWord) wordWidthWithSpace += whiteSpaceWidth;
      if (wordWidthWithSpace > spaceLeft) {
        if (j > 0) result += '\n';
        spaceLeft = wrapWidth;
      }
      result += word;
      if (j < lastWord) {
        result += ' ';
        spaceLeft -= wordWidthWithSpace;
      } else spaceLeft -= wordWidth;
    }
    if (i < last) result += '\n';
  }
  return result;
}

/**
 * Chữ dùng PixiJS Text (texture canvas, PixiJS chia sẻ texture giữa các chữ giống hệt nhau).
 * Kích thước (`width`/`height`) tính cả phần đệm như Phaser; gốc (origin) quy đổi sang anchor.
 */
export class Text extends GameObject {
  /** Node chữ của PixiJS. `view` là chính node này, hoặc một Container bọc thêm nền khi có màu nền. */
  readonly node: PixiText;
  private bgGraphics: PixiGraphics | null = null;
  private pad = { top: 0, bottom: 0, left: 0, right: 0 };
  private maxLines = 0;
  private rawText = '';
  private fixedW = 0;
  private fixedH = 0;
  private bg: string | null = null;
  private wrapWidth = 0;
  private wrapAdvanced = false;
  /** Bề rộng vùng chữ tính theo đúng công thức Phaser (GetTextSize). */
  private phaserW = 0;

  constructor(scene: Scene, x: number, y: number, text: string | string[], style: TextStyleConfig = {}) {
    const pixiStyle = new TextStyle({ fontSize: 16, fill: '#ffffff', fontFamily: 'Courier', padding: 0 });
    const view = new PixiText({ text: '', style: pixiStyle, resolution: style.resolution ?? 1 });
    view.roundPixels = false;
    super(scene, 'Text', view);
    this.node = view;
    this.view.position.set(x, y);
    this.applyStyle(style);
    this.setText(text);
    if (this.bg) this.drawBackground();
  }

  private applyStyle(s: TextStyleConfig): void {
    const st = this.node.style;
    const opts: Partial<TextStyleOptions> = {};
    if (s.fontFamily !== undefined) opts.fontFamily = s.fontFamily;
    if (s.fontSize !== undefined) opts.fontSize = px(s.fontSize, 16);
    if (s.fontStyle !== undefined) {
      opts.fontWeight = /bold/.test(s.fontStyle) ? 'bold' : 'normal';
      opts.fontStyle = /italic/.test(s.fontStyle) ? 'italic' : 'normal';
    }
    if (s.color !== undefined) opts.fill = s.color;
    if (s.align !== undefined) opts.align = s.align as TextStyleOptions['align'];
    if (s.wordWrap !== undefined) {
      // Ngắt dòng do engine làm theo thuật toán Phaser; PixiJS chỉ vẽ các dòng đã ngắt sẵn.
      this.wrapWidth = s.wordWrap.width ?? 0;
      this.wrapAdvanced = !!s.wordWrap.useAdvancedWrap;
    }
    opts.wordWrap = false;
    if (s.stroke !== undefined || s.strokeThickness !== undefined) {
      const width = s.strokeThickness ?? 0;
      opts.stroke = width > 0 && s.stroke ? { color: s.stroke, width, join: 'round' } : { color: '#000000', width: 0 };
    }
    if (s.lineSpacing !== undefined) opts.leading = s.lineSpacing;
    Object.assign(st, opts);
    if (s.padding) {
      this.pad = {
        top: s.padding.top ?? s.padding.y ?? 0,
        bottom: s.padding.bottom ?? s.padding.y ?? 0,
        left: s.padding.left ?? s.padding.x ?? 0,
        right: s.padding.right ?? s.padding.x ?? 0,
      };
    }
    if (s.resolution !== undefined) this.node.resolution = s.resolution;
    if (s.maxLines !== undefined) this.maxLines = s.maxLines;
    if (s.fixedWidth !== undefined) this.fixedW = s.fixedWidth;
    if (s.fixedHeight !== undefined) this.fixedH = s.fixedHeight;
    if (s.backgroundColor !== undefined) this.bg = s.backgroundColor;
  }

  get text(): string { return this.rawText; }
  set text(v: string) { this.setText(v); }

  get style(): TextStyle { return this.node.style; }

  setText(value: string | string[] | number): this {
    if (!this.active) return this;
    const v = Array.isArray(value) ? value.join('\n') : String(value ?? '');
    if (v === this.rawText && this.node.text !== '') return this;
    this.rawText = v;
    this.relayout();
    return this;
  }

  private font(): string {
    const st = this.node.style;
    return `${st.fontStyle === 'italic' ? 'italic ' : ''}${st.fontWeight === 'bold' ? 'bold' : 'normal'} ${st.fontSize}px ${st.fontFamily}`;
  }

  private wrap(text: string): string {
    if (!this.wrapWidth) return text;
    const c = ctx(this.font());
    return this.wrapAdvanced ? advancedWordWrap(text, c, this.wrapWidth) : basicWordWrap(text, c, this.wrapWidth);
  }

  /** Ngắt dòng, cắt số dòng tối đa và đo bề rộng như Phaser, rồi giao chuỗi đã ngắt cho PixiJS. */
  private relayout(): void {
    if (!this.active) return;
    let lines = this.wrap(this.rawText).split(SPLIT);
    if (this.maxLines > 0 && lines.length > this.maxLines) lines = lines.slice(0, this.maxLines);
    const c = ctx(this.font());
    const stroke = (this.node.style.stroke as { width?: number } | undefined)?.width ?? 0;
    const space = this.wrapWidth ? c.measureText(' ').width : 0;
    let w = 0;
    for (const line of lines) w = Math.max(w, Math.ceil(stroke + c.measureText(line).width - space));
    this.phaserW = w;
    this.node.text = lines.join('\n');
    this.updateOrigin();
    this.syncHitArea();
  }

  /** Các dòng sau khi tự xuống dòng theo bề rộng hiện tại (giống Phaser getWrappedText). */
  getWrappedText(text?: string): string[] {
    return this.wrap(text ?? this.rawText).split(SPLIT);
  }

  private lastMeasured = { w: 0, h: 0 };

  private get measured(): { w: number; h: number } {
    if (!this.active) return this.lastMeasured;
    const b = this.node.bounds;
    this.lastMeasured = { w: b.maxX - b.minX, h: b.maxY - b.minY };
    return this.lastMeasured;
  }

  // Như Phaser: bề rộng mỗi dòng được làm tròn lên số nguyên (kích thước canvas chữ).
  override get width(): number { return this.fixedW || this.phaserW + this.pad.left + this.pad.right; }
  override get height(): number { return this.fixedH || this.measured.h + this.pad.top + this.pad.bottom; }

  protected override updateOrigin(): void {
    if (!this.active) return;
    const { w: mw, h: mh } = this.measured;
    const fullW = this.width;
    const fullH = this.height;
    // Vị trí góc trái-trên của chữ = x - originX*fullW + padLeft ⇒ anchor = (originX*fullW - padLeft) / mw.
    // Phaser căn từng dòng trong bề rộng vùng chữ; PixiJS căn trong khối dòng thật: bù phần chênh.
    const align = this.node.style.align === 'center' ? 0.5 : this.node.style.align === 'right' ? 1 : 0;
    const textW = this.fixedW ? this.fixedW - this.pad.left - this.pad.right : this.phaserW;
    const ax = mw > 0 ? (this.originX * fullW - this.pad.left - align * (textW - mw)) / mw : this.originX;
    const ay = mh > 0 ? (this.originY * fullH - this.pad.top) / mh : this.originY;
    this.node.anchor.set(ax, ay);
    this.syncHitArea();
    if (this.bgGraphics) this.drawBackground();
  }

  /** Vẽ nền chữ (Phaser vẽ nền vào canvas chữ; ở đây là một Graphics nằm dưới chữ). */
  private drawBackground(): void {
    if (!this.active) return;
    if (!this.bg) {
      this.bgGraphics?.clear();
      return;
    }
    if (!this.bgGraphics) {
      const holder = new PixiContainer();
      this.bgGraphics = new PixiGraphics();
      holder.addChild(this.bgGraphics);
      this.wrapView(holder);
    }
    const hex = this.bg.replace('#', '');
    const color = parseInt(hex.slice(0, 6), 16) || 0;
    const alpha = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    const w = this.width;
    const h = this.height;
    this.bgGraphics.clear().rect(-this.originX * w, -this.originY * h, w, h).fill({ color, alpha });
  }

  setStyle(style: TextStyleConfig): this { this.applyStyle(style); this.relayout(); return this; }
  setColor(color: string): this { if (this.active) this.node.style.fill = color; return this; }
  setFill(color: string): this { return this.setColor(color); }
  setFontSize(size: number | string): this { this.node.style.fontSize = px(size, 16); this.relayout(); return this; }
  setFontStyle(style: string): this { this.applyStyle({ fontStyle: style }); this.relayout(); return this; }
  setAlign(align: string): this { this.node.style.align = align as TextStyle['align']; this.updateOrigin(); return this; }
  setWordWrapWidth(width: number | null, advanced = false): this {
    this.wrapWidth = width ?? 0;
    this.wrapAdvanced = advanced;
    this.relayout();
    return this;
  }
  setLineSpacing(spacing: number): this { this.node.style.leading = spacing; this.updateOrigin(); return this; }
  setStroke(color: string, thickness: number): this {
    this.node.style.stroke = thickness > 0 ? { color, width: thickness, join: 'round' } : { color: '#000000', width: 0 };
    this.relayout();
    return this;
  }
  setShadow(): this { return this; }
  setMaxLines(n: number): this { this.maxLines = n; this.relayout(); return this; }
  setFixedSize(w: number, h: number): this { this.fixedW = w; this.fixedH = h; this.updateOrigin(); return this; }
  setResolution(r: number): this { this.node.resolution = r; return this; }
  setPadding(left: number | { left?: number; right?: number; top?: number; bottom?: number; x?: number; y?: number }, top?: number, right?: number, bottom?: number): this {
    if (typeof left === 'object') this.applyStyle({ padding: left });
    else {
      const t = top ?? left;
      this.pad = { left, top: t, right: right ?? left, bottom: bottom ?? t };
    }
    this.updateOrigin();
    return this;
  }
  setBackgroundColor(color: string): this {
    if (color === this.bg) return this;
    this.bg = color;
    this.drawBackground();
    return this;
  }
  get backgroundColor(): string | null { return this.bg; }
  setTint(color: number): this { this.node.tint = color; return this; }
}
