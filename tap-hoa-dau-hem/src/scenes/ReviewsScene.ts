import Phaser from 'phaser';
import { averageRating } from '../core/progression';
import {
  REPLY_WINDOW_DAYS, ratingBreakdown, ratingWindow, replyOptions, replyToReview, type Review,
} from '../core/reviews';
import { formatClock } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

type Filter = 'all' | 'unreplied' | 'bad';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'unreplied', label: 'Chưa trả lời' },
  { id: 'bad', label: 'Xấu (≤3★)' },
];

function starText(n: number): string {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}

/** Đánh giá của khách: vì sao sao tăng / giảm, đọc từng lời khách viết và trả lời. */
export class ReviewsScene extends Phaser.Scene {
  private list!: ScrollArea;
  private back = 'Morning';
  private filter: Filter = 'all';
  private leftPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Reviews');
  }

  create(data: { back?: string }): void {
    setupCamera(this);
    this.back = data?.back ?? 'Morning';
    this.filter = 'all';
    pageFrame(this, '⭐ Đánh giá', () => { persist(); this.scene.start(this.back); }, 'Khách nhận xét gì về tiệm');

    const landscape = W > H;
    const rightX = landscape ? 246 : 0;
    const rightW = landscape ? W - rightX - 8 : W;

    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8, undefined, landscape ? { x: rightX, width: rightW } : undefined);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    this.leftPanel?.destroy(true);
    this.leftPanel = null;

    const landscape = W > H;
    const cardW = landscape ? W - 254 : W - 16;
    const startX = landscape ? 246 : 8;

    if (landscape) {
      this.renderLeftSummary();
    }

    let y = 4;
    if (!landscape) {
      y = this.summaryCard(y, cardW, startX);
      const fw = (cardW - 16) / FILTERS.length;
      FILTERS.forEach((f, i) => {
        this.list.add(new Button(this, startX + fw / 2 + i * (fw + 8), y + 18, {
          w: fw, h: 30, size: 11, label: f.label, color: this.filter === f.id ? C.blue : C.grey,
          onTap: this.list.guard(() => { this.filter = f.id; this.render(); }),
        }));
      });
      y += 44;
    }

    const shown = s.reviews.filter((r) => (this.filter === 'unreplied' ? !r.reply : this.filter === 'bad' ? r.stars <= 3 : true));
    if (!shown.length) {
      const msg = s.reviews.length ? 'Không có đánh giá nào ở mục này.' : 'Chưa có đánh giá nào.\nBán hàng để khách để lại lời nhận xét nhé!';
      this.list.add(txt(this, startX + cardW / 2, y + 40, msg, { size: 13, color: HEX.muted, origin: [0.5, 0.5], align: 'center' }));
      y += 90;
    }
    for (const r of shown) {
      y = this.reviewCard(r, y, cardW, startX) + 8;
    }
    this.list.setHeight(y + 20);
  }

  /** Bảng sao trung bình và bộ lọc cố định bên trái khi màn hình ngang. */
  private renderLeftSummary(): void {
    const s = G.state;
    const container = this.add.container(0, 0);
    this.leftPanel = container;
    const lx = 8;
    const ly = PAGE_TOP + 4;
    const lw = 230;
    const lh = 176;

    container.add(card(this, lx, ly, lw, lh));
    const avg = averageRating(s);
    const total = s.ratings.length;

    container.add(txt(this, lx + 44, ly + 36, avg.toFixed(1), { size: 28, bold: true, origin: [0.5, 0.5] }));
    container.add(txt(this, lx + 44, ly + 60, starText(avg), { size: 11, color: '#e0a100', origin: [0.5, 0.5] }));
    container.add(txt(this, lx + 44, ly + 78, `${total} lượt`, { size: 9.5, color: HEX.muted, origin: [0.5, 0.5] }));

    const rows = ratingBreakdown(s);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const bx = lx + 92;
    const bw = lw - 108;
    const g = this.add.graphics();
    rows.forEach((row, i) => {
      const ry = ly + 14 + i * 16;
      container.add(txt(this, bx - 4, ry, `${row.stars}★`, { size: 10, bold: true, color: HEX.ink, origin: [1, 0] }));
      g.fillStyle(0xe8dcc8, 1).fillRoundedRect(bx, ry + 2, bw, 8, 3);
      const w = (bw * row.count) / max;
      if (row.count) g.fillStyle(row.stars >= 4 ? C.green : row.stars === 3 ? C.yellow : C.red, 1).fillRoundedRect(bx, ry + 2, Math.max(6, w), 8, 3);
      container.add(txt(this, bx + bw + 4, ry, String(row.count), { size: 9, color: HEX.muted }));
    });
    container.add(g);
    container.add(txt(this, lx + 10, ly + 104,
      `Sao = TB ${ratingWindow()} lượt gần nhất.\nXin lỗi trong ${REPLY_WINDOW_DAYS} ngày để gỡ lại uy tín; cãi khách thì mất điểm.`,
      { size: 9, color: HEX.muted, wrap: lw - 18 }));

    // Bộ lọc bên dưới
    const fy = ly + lh + 8;
    FILTERS.forEach((f, i) => {
      container.add(new Button(this, lx + lw / 2, fy + 16 + i * 36, {
        w: lw, h: 30, size: 11, label: f.label, color: this.filter === f.id ? C.blue : C.grey,
        onTap: () => { this.filter = f.id; this.render(); },
      }));
    });
  }

  private summaryCard(y: number, cardW: number, startX: number): number {
    const s = G.state;
    const h = 158;
    this.list.add(card(this, startX, y, cardW, h));
    const avg = averageRating(s);
    const total = s.ratings.length;
    this.list.add(txt(this, startX + 54, y + 40, avg.toFixed(1), { size: 34, bold: true, origin: [0.5, 0.5] }));
    this.list.add(txt(this, startX + 54, y + 70, starText(avg), { size: 13, color: '#e0a100', origin: [0.5, 0.5] }));
    this.list.add(txt(this, startX + 54, y + 90, `${total} lượt chấm`, { size: 10, color: HEX.muted, origin: [0.5, 0.5] }));
    const rows = ratingBreakdown(s);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const bx = startX + 128;
    const bw = cardW - 168;
    const g = this.add.graphics();
    rows.forEach((row, i) => {
      const ry = y + 16 + i * 17;
      this.list.add(txt(this, bx - 6, ry, `${row.stars}★`, { size: 11, bold: true, color: HEX.ink, origin: [1, 0] }));
      g.fillStyle(0xe8dcc8, 1).fillRoundedRect(bx, ry + 3, bw, 9, 4);
      const w = (bw * row.count) / max;
      if (row.count) g.fillStyle(row.stars >= 4 ? C.green : row.stars === 3 ? C.yellow : C.red, 1).fillRoundedRect(bx, ry + 3, Math.max(8, w), 9, 4);
      this.list.add(txt(this, bx + bw + 6, ry, String(row.count), { size: 10, color: HEX.muted }));
    });
    this.list.add(g);
    this.list.add(txt(this, startX + 12, y + 108,
      `Sao = trung bình ${ratingWindow()} lượt chấm gần nhất: khách nào về cũng chấm, chỉ một số viết nhận xét. `
      + `Xin lỗi đánh giá xấu trong ${REPLY_WINDOW_DAYS} ngày sẽ gỡ lại uy tín; cãi khách thì mất điểm.`,
      { size: 10, color: HEX.muted, wrap: cardW - 20 }));
    return y + h + 8;
  }

  private reviewCard(r: Review, y: number, cardW: number, startX: number): number {
    const s = G.state;
    const pad = 10;
    const inner = cardW - pad * 2;
    const items: Phaser.GameObjects.GameObject[] = [];
    const name = txt(this, startX + pad, y + 10, r.name, { size: 13, bold: true });
    const stars = txt(this, startX + cardW - pad, y + 10, starText(r.stars), { size: 12, color: r.stars >= 4 ? '#e0a100' : r.stars === 3 ? '#b7791f' : HEX.red, origin: [1, 0] });
    const when = txt(this, startX + pad, y + 27, `Ngày ${r.day} · ${formatClock(r.minute)}${r.day === s.day ? ' · mới' : ''}`, { size: 9.5, color: HEX.muted });
    const body = txt(this, startX + pad, y + 42, r.text, { size: 11.5, color: HEX.ink, wrap: inner });
    items.push(name, stars, when, body);
    let cy = y + 42 + body.height + 8;
    if (r.reply) {
      const reply = txt(this, startX + pad + 8, cy + 5, `💬 Chủ tiệm: ${r.reply.text}`, { size: 10.5, color: r.reply.kind === 'argue' ? HEX.red : '#1f5fa0', wrap: inner - 16 });
      const box = this.add.graphics();
      box.fillStyle(0xf1e6d2, 1).fillRoundedRect(startX + pad, cy, inner, reply.height + 10, 6);
      items.push(box, reply);
      cy += reply.height + 10 + 8;
    } else {
      const opts = replyOptions(r);
      const gap = 6;
      const bw = Math.min(100, Math.floor((inner - (opts.length - 1) * gap) / opts.length));
      opts.forEach((o, i) => {
        items.push(new Button(this, startX + pad + bw / 2 + i * (bw + gap), cy + 15, {
          w: bw, h: 28, size: 10, label: o.label, color: o.kind === 'argue' ? C.red : o.kind === 'sorry' ? C.blue : C.green,
          onTap: this.list.guard(() => this.reply(r, o.kind)),
        }).setEnabled(!G.liveSnapshot));
      });
      if (r.stars <= 3 && s.day - r.day > REPLY_WINDOW_DAYS) {
        items.push(txt(this, startX + cardW - pad, cy + 15, 'Đã cũ, không gỡ sao', { size: 8.5, color: HEX.muted, origin: [1, 0.5], align: 'right' }));
      }
      cy += 36;
    }
    this.list.add(card(this, startX, y, cardW, cy - y, r.stars <= 2 ? 0xfbe4dc : C.panel));
    this.list.add(items);
    return cy;
  }

  private reply(r: Review, kind: 'thanks' | 'sorry' | 'argue'): void {
    if (G.liveSnapshot) { toast(this, 'Đang chơi chung: trả lời đánh giá ở chế độ chơi một mình nhé'); return; }
    const effect = replyToReview(G.state, r.id, kind);
    if (!effect) return;
    persist();
    if (effect === 'recovered') toast(this, '🙇 Khách khác thấy tiệm có tâm: gỡ lại chút uy tín', undefined, C.greenDark);
    else if (effect === 'hurt') toast(this, '😬 Cãi khách công khai: người đọc chê tiệm', undefined, C.redDark);
    else toast(this, '💬 Đã trả lời');
    this.render();
  }
}
