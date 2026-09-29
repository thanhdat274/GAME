import Phaser from 'phaser';
import { hourlyAverage, lastDays, slowMovers, staffTable, topSellers } from '../core/analytics';
import { product } from '../core/data';
import { demandSignals } from '../core/stock';
import { formatMoney, totalQty } from '../core/state';
import { G } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn Phân tích: mỗi biểu đồ một thẻ, cuộn dọc; 2 cột dạng dashboard ở màn hình ngang. */
export class AnalyticsScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Analytics');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📊 Phân tích', () => this.scene.start('Morning'), `${G.state.analytics.length} ngày dữ liệu (giữ 30 ngày)`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    if (!G.state.analytics.length) {
      this.list.add(txt(this, W / 2, 60, 'Chưa có dữ liệu. Bán hết một ngày để xem báo cáo.', { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      return;
    }

    const landscape = W > H;
    if (landscape) {
      const colW = Math.floor((W - 24) / 2);
      let yLeft = 4;
      yLeft = this.revenueCard(8, yLeft, colW);
      yLeft = this.hourlyCard(8, yLeft, colW);

      let yRight = 4;
      yRight = this.productsCard(16 + colW, yRight, colW);
      yRight = this.restockCard(16 + colW, yRight, colW);
      yRight = this.staffCard(16 + colW, yRight, colW);

      this.list.setHeight(Math.max(yLeft, yRight) + 20);
    } else {
      const cardW = W - 16;
      let y = 4;
      y = this.revenueCard(8, y, cardW);
      y = this.productsCard(8, y, cardW);
      y = this.restockCard(8, y, cardW);
      y = this.hourlyCard(8, y, cardW);
      y = this.staffCard(8, y, cardW);
      this.list.setHeight(y + 20);
    }
  }

  private title(x: number, y: number, text: string, sub?: string): void {
    this.list.add(txt(this, x + 10, y + 8, text, { size: 13, bold: true }));
    if (sub) this.list.add(txt(this, x + 10, y + 26, sub, { size: 10, color: HEX.muted }));
  }

  /** Doanh thu (cột) và lãi ròng (cột nhỏ) 7 ngày gần nhất. */
  private revenueCard(x: number, y: number, cardW: number): number {
    const days = lastDays(G.state, 7);
    const h = 200;
    this.list.add(card(this, x, y, cardW, h));
    const total = days.reduce((s, d) => s + d.profit, 0);
    this.title(x, y, 'Doanh thu & lãi ròng 7 ngày', `Tổng lãi ${formatMoney(total)} · TB ${formatMoney(total / Math.max(1, days.length))}/ngày`);
    const max = Math.max(1, ...days.map((d) => d.revenue));
    const base = y + h - 30;
    const top = y + 50;
    const slot = (cardW - 40) / 7;
    const g = this.add.graphics();
    g.lineStyle(1, C.panelEdge, 1).lineBetween(x + 16, base, x + cardW - 8, base);
    days.forEach((d, i) => {
      const dx = x + 20 + i * slot;
      const rh = ((base - top) * d.revenue) / max;
      const ph = ((base - top) * Math.max(0, d.profit)) / max;
      g.fillStyle(0xe8b774, 1).fillRect(dx, base - rh, slot * 0.45, rh);
      g.fillStyle(d.profit >= 0 ? C.green : C.red, 1).fillRect(dx + slot * 0.48, base - (d.profit >= 0 ? ph : 6), slot * 0.35, d.profit >= 0 ? ph : 6);
      this.list.add(txt(this, dx + slot * 0.4, base + 4, `N${d.day}`, { size: 9, color: HEX.muted, origin: [0.5, 0] }));
    });
    this.list.add(g);
    this.list.add(txt(this, x + cardW - 8, y + 8, '■ thu  ■ lãi', { size: 9, color: HEX.muted, origin: [1, 0] }));
    return y + h + 8;
  }

  private productsCard(x: number, y: number, cardW: number): number {
    const top = topSellers(G.state, 7);
    const slow = slowMovers(G.state);
    const h = 60 + Math.max(top.length, 1) * 30 + 34 + Math.max(slow.length, 1) * 30;
    this.list.add(card(this, x, y, cardW, h));
    this.title(x, y, 'Bán chạy 7 ngày');
    let yy = y + 34;
    const maxQ = Math.max(1, ...top.map((t) => t.qty));
    for (const t of top) {
      const p = product(t.productId);
      this.list.add(productIcon(this, x + 24, yy + 12, p, 22));
      const name = txt(this, x + 42, yy + 4, p.name, { size: 11 });
      name.setScale(Math.min(1, (cardW - 140) / name.width));
      this.list.add(name);
      const g = this.add.graphics();
      const barMaxW = Math.max(40, cardW - 180);
      g.fillStyle(C.green, 1).fillRoundedRect(x + cardW - 55 - (barMaxW * t.qty) / maxQ, yy + 8, (barMaxW * t.qty) / maxQ, 8, 4);
      this.list.add(g);
      this.list.add(txt(this, x + cardW - 8, yy + 4, String(t.qty), { size: 11, bold: true, origin: [1, 0] }));
      yy += 30;
    }
    if (!top.length) { this.list.add(txt(this, x + 10, yy + 4, 'Chưa bán được món nào.', { size: 11, color: HEX.muted })); yy += 30; }
    this.list.add(txt(this, x + 10, yy + 8, 'Món ế (5 ngày chưa bán)', { size: 13, bold: true }));
    yy += 34;
    for (const s of slow) {
      const p = product(s.productId);
      this.list.add(productIcon(this, x + 24, yy + 12, p, 22));
      const name = txt(this, x + 42, yy + 4, `${p.name} · còn ${s.stock}`, { size: 11 });
      name.setScale(Math.min(1, (cardW - 140) / name.width));
      this.list.add(name);
      this.list.add(txt(this, x + cardW - 8, yy + 4, s.hint, { size: 10, color: HEX.red, origin: [1, 0] }));
      yy += 30;
    }
    if (!slow.length) this.list.add(txt(this, x + 10, yy + 4, G.state.analytics.length < 5 ? 'Cần ít nhất 5 ngày dữ liệu.' : 'Không có món ế. Tốt lắm!', { size: 11, color: HEX.muted }));
    return y + h + 8;
  }

  private restockCard(x: number, y: number, cardW: number): number {
    const s = G.state;
    const signals = demandSignals(s);
    const rows = Object.entries(signals)
      .filter(([id, value]) => value > 0 && (() => { try { product(id); return true; } catch { return false; } })())
      .map(([id, value]) => ({ id, value, stock: totalQty(s, id), complaints: s.reviews.filter((r) => r.productId === id && r.issue === 'missing' && r.day >= s.day - 7).length }))
      .sort((a, b) => (a.stock < 5 ? 1 : 0) === (b.stock < 5 ? 1 : 0) ? b.value - a.value : a.stock < 5 ? -1 : 1)
      .slice(0, 5);
    const h = 50 + Math.max(rows.length, 1) * 36;
    this.list.add(card(this, x, y, cardW, h));
    this.title(x, y, 'Xu hướng nhập hàng', 'Bán gần đây · hỏi thiếu · đánh giá 7 ngày');
    let yy = y + 43;
    if (!rows.length) this.list.add(txt(this, x + 10, yy, 'Chưa đủ tín hiệu từ khách.', { size: 11, color: HEX.muted }));
    for (const r of rows) {
      const name = txt(this, x + 10, yy, `${product(r.id).name} · còn ${r.stock}`, { size: 11, bold: r.stock < 5 });
      name.setScale(Math.min(1, (cardW - 120) / name.width));
      this.list.add(name);
      const reason = r.stock < 5 ? 'Sắp hết' : r.complaints ? `${r.complaints} đánh giá thiếu` : 'Đang bán chạy';
      this.list.add(txt(this, x + cardW - 8, yy, reason, { size: 10, color: r.stock < 5 ? HEX.red : HEX.muted, origin: [1, 0] }));
      yy += 36;
    }
    return y + h + 8;
  }

  private hourlyCard(x: number, y: number, cardW: number): number {
    const hours = hourlyAverage(G.state, 7);
    const h = 170;
    this.list.add(card(this, x, y, cardW, h));
    const peak = hours.indexOf(Math.max(...hours));
    this.title(x, y, 'Khách theo giờ (TB 7 ngày)', `Đông nhất ${8 + peak}:00–${9 + peak}:00`);
    const max = Math.max(1, ...hours);
    const base = y + h - 24;
    const top = y + 48;
    const slot = (cardW - 32) / hours.length;
    const g = this.add.graphics();
    hours.forEach((v, i) => {
      const bh = ((base - top) * v) / max;
      g.fillStyle(i === peak ? C.red : C.blue, 1).fillRect(x + 16 + i * slot, base - bh, slot * 0.7, bh);
      if (i % 2 === 0) this.list.add(txt(this, x + 16 + i * slot + slot * 0.35, base + 4, `${8 + i}h`, { size: 9, color: HEX.muted, origin: [0.5, 0] }));
    });
    this.list.add(g);
    return y + h + 8;
  }

  private staffCard(x: number, y: number, cardW: number): number {
    const rows = staffTable(G.state, 7);
    const h = 44 + Math.max(1, rows.length) * 46;
    this.list.add(card(this, x, y, cardW, h));
    this.title(x, y, 'Hiệu suất nhân viên (7 ngày)');
    let yy = y + 36;
    if (!rows.length) this.list.add(txt(this, x + 10, yy + 4, 'Chưa có số liệu nhân viên.', { size: 11, color: HEX.muted }));
    for (const r of rows) {
      const g = this.add.graphics();
      g.fillStyle(0xf3e7d0, 1).fillRoundedRect(x + 8, yy, cardW - 16, 40, 8);
      this.list.add(g);
      this.list.add(txt(this, x + 14, yy + 4, r.name, { size: 12, bold: true }));
      this.list.add(txt(this, x + 14, yy + 21, `Phục vụ ${r.served} · khác ${r.jobs} · sai ${r.mistakes}${r.served ? ` (${Math.round((100 * r.mistakes) / r.served)}%)` : ''}`, { size: 10, color: HEX.muted }));
      this.list.add(txt(this, x + cardW - 12, yy + 12, r.ratingCount ? `⭐ ${r.avgStars.toFixed(1)}` : '–', { size: 13, bold: true, origin: [1, 0] }));
      yy += 46;
    }
    return y + h + 8;
  }
}
