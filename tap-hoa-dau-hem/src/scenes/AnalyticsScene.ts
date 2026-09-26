import Phaser from 'phaser';
import { hourlyAverage, lastDays, slowMovers, staffTable, topSellers } from '../core/analytics';
import { product } from '../core/data';
import { formatMoney } from '../core/state';
import { G } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

const CARD_W = W - 16;

/** Màn Phân tích: mỗi biểu đồ một thẻ, cuộn dọc (không cần cuộn ngang trên 375x812). */
export class AnalyticsScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Analytics');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📊 Phân tích', () => this.scene.start('Morning'), `${G.state.analytics.length} ngày dữ liệu (giữ 30 ngày)`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    let y = 4;
    if (!G.state.analytics.length) {
      this.list.add(txt(this, W / 2, 60, 'Chưa có dữ liệu. Bán hết một ngày để xem báo cáo.', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      return;
    }
    y = this.revenueCard(y);
    y = this.productsCard(y);
    y = this.hourlyCard(y);
    y = this.staffCard(y);
    this.list.setHeight(y + 20);
  }

  private title(y: number, text: string, sub?: string): void {
    this.list.add(txt(this, 18, y + 8, text, { size: 14, bold: true }));
    if (sub) this.list.add(txt(this, 18, y + 26, sub, { size: 10, color: HEX.muted }));
  }

  /** Doanh thu (cột) và lãi ròng (cột nhỏ) 7 ngày gần nhất. */
  private revenueCard(y: number): number {
    const days = lastDays(G.state, 7);
    const h = 200;
    this.list.add(card(this, 8, y, CARD_W, h));
    const total = days.reduce((s, d) => s + d.profit, 0);
    this.title(y, 'Doanh thu & lãi ròng 7 ngày', `Tổng lãi ròng ${formatMoney(total)} · TB ${formatMoney(total / days.length)}/ngày`);
    const max = Math.max(1, ...days.map((d) => d.revenue));
    const base = y + h - 30;
    const top = y + 50;
    const slot = (CARD_W - 40) / 7;
    const g = this.add.graphics();
    g.lineStyle(1, C.panelEdge, 1).lineBetween(24, base, CARD_W - 8, base);
    days.forEach((d, i) => {
      const x = 28 + i * slot;
      const rh = ((base - top) * d.revenue) / max;
      const ph = ((base - top) * Math.max(0, d.profit)) / max;
      g.fillStyle(0xe8b774, 1).fillRect(x, base - rh, slot * 0.45, rh);
      g.fillStyle(d.profit >= 0 ? C.green : C.red, 1).fillRect(x + slot * 0.48, base - (d.profit >= 0 ? ph : 6), slot * 0.35, d.profit >= 0 ? ph : 6);
      this.list.add(txt(this, x + slot * 0.4, base + 4, `N${d.day}`, { size: 9, color: HEX.muted, origin: [0.5, 0] }));
    });
    this.list.add(g);
    this.list.add(txt(this, CARD_W - 8, y + 8, '■ doanh thu  ■ lãi', { size: 9, color: HEX.muted, origin: [1, 0] }));
    return y + h + 8;
  }

  private productsCard(y: number): number {
    const top = topSellers(G.state, 7);
    const slow = slowMovers(G.state);
    const h = 60 + Math.max(top.length, 1) * 30 + 34 + Math.max(slow.length, 1) * 30;
    this.list.add(card(this, 8, y, CARD_W, h));
    this.title(y, 'Bán chạy 7 ngày');
    let yy = y + 34;
    const maxQ = Math.max(1, ...top.map((t) => t.qty));
    for (const t of top) {
      const p = product(t.productId);
      this.list.add(productIcon(this, 32, yy + 12, p, 22));
      this.list.add(txt(this, 50, yy + 4, p.name, { size: 11 }));
      const g = this.add.graphics();
      g.fillStyle(C.green, 1).fillRoundedRect(170, yy + 6, (130 * t.qty) / maxQ, 10, 4);
      this.list.add(g);
      this.list.add(txt(this, CARD_W - 6, yy + 4, String(t.qty), { size: 11, bold: true, origin: [1, 0] }));
      yy += 30;
    }
    if (!top.length) { this.list.add(txt(this, 18, yy + 4, 'Chưa bán được món nào.', { size: 11, color: HEX.muted })); yy += 30; }
    this.list.add(txt(this, 18, yy + 8, 'Món ế (5 ngày không bán được)', { size: 14, bold: true }));
    yy += 34;
    for (const x of slow) {
      const p = product(x.productId);
      this.list.add(productIcon(this, 32, yy + 12, p, 22));
      this.list.add(txt(this, 50, yy + 4, `${p.name} · còn ${x.stock}`, { size: 11 }));
      this.list.add(txt(this, CARD_W - 6, yy + 4, x.hint, { size: 10, color: HEX.red, origin: [1, 0] }));
      yy += 30;
    }
    if (!slow.length) this.list.add(txt(this, 18, yy + 4, G.state.analytics.length < 5 ? 'Cần ít nhất 5 ngày dữ liệu.' : 'Không có món ế. Tốt lắm!', { size: 11, color: HEX.muted }));
    return y + h + 8;
  }

  private hourlyCard(y: number): number {
    const hours = hourlyAverage(G.state, 7);
    const h = 170;
    this.list.add(card(this, 8, y, CARD_W, h));
    const peak = hours.indexOf(Math.max(...hours));
    this.title(y, 'Khách theo giờ (TB 7 ngày)', `Đông nhất ${8 + peak}:00–${9 + peak}:00`);
    const max = Math.max(1, ...hours);
    const base = y + h - 24;
    const top = y + 48;
    const slot = (CARD_W - 32) / hours.length;
    const g = this.add.graphics();
    hours.forEach((v, i) => {
      const bh = ((base - top) * v) / max;
      g.fillStyle(i === peak ? C.red : C.blue, 1).fillRect(24 + i * slot, base - bh, slot * 0.7, bh);
      if (i % 2 === 0) this.list.add(txt(this, 24 + i * slot + slot * 0.35, base + 4, `${8 + i}h`, { size: 9, color: HEX.muted, origin: [0.5, 0] }));
    });
    this.list.add(g);
    return y + h + 8;
  }

  private staffCard(y: number): number {
    const rows = staffTable(G.state, 7);
    const h = 44 + Math.max(1, rows.length) * 46;
    this.list.add(card(this, 8, y, CARD_W, h));
    this.title(y, 'Hiệu suất nhân viên (7 ngày)');
    let yy = y + 36;
    if (!rows.length) this.list.add(txt(this, 18, yy + 4, 'Chưa có số liệu nhân viên.', { size: 11, color: HEX.muted }));
    for (const r of rows) {
      const g = this.add.graphics();
      g.fillStyle(0xf3e7d0, 1).fillRoundedRect(16, yy, CARD_W - 16, 40, 8);
      this.list.add(g);
      this.list.add(txt(this, 24, yy + 4, r.name, { size: 12, bold: true }));
      this.list.add(txt(this, 24, yy + 21, `Phục vụ ${r.served} · việc khác ${r.jobs} · sai ${r.mistakes}${r.served ? ` (${Math.round((100 * r.mistakes) / r.served)}%)` : ''}`, { size: 10, color: HEX.muted }));
      this.list.add(txt(this, CARD_W - 4, yy + 12, r.ratingCount ? `⭐ ${r.avgStars.toFixed(1)}` : '–', { size: 13, bold: true, origin: [1, 0] }));
      yy += 46;
    }
    return y + h + 8;
  }
}
