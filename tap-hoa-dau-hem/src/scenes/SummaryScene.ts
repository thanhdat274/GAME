import Phaser from 'phaser';
import { DATA, product } from '../core/data';
import { questDef, questDone } from '../core/quests';
import { startNextDay } from '../core/day';
import { formatClock, formatMoney, type JournalEntry } from '../core/state';
import { G, persist } from '../game';
import { card } from '../ui/page';
import { dispatchLiveCommand } from '../services/liveShop';
import { play } from '../ui/sound';
import { Button, panel } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn tổng kết cuối ngày: doanh thu, lãi, khách, sao, EXP, lên level. */
export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('Summary');
  }

  create(): void {
    setupCamera(this);
    const s = G.state;
    const sum = s.lastSummary;
    if (!sum) {
      this.scene.start('Morning');
      return;
    }
    const hasJournal = (sum.journal?.length ?? 0) > 0;
    const hasChain = s.stores.length > 1;
    // Nút hai bên cố định bề rộng; tiêu đề căn giữa và thu nhỏ cho vừa khoảng trống còn lại.
    const btnW = 76;
    const side = hasJournal || hasChain ? 10 + btnW + 6 : 16;
    const title = txt(this, W / 2, 30, `${hasJournal || hasChain ? '' : '🌙 '}Tổng kết ngày ${sum.day}`, { size: 20, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    const room = W - side * 2;
    if (title.width > room) title.setScale(room / title.width);
    if (hasJournal) new Button(this, W - 10 - btnW / 2, 30, { w: btnW, h: 32, label: '📖 Nhật ký', size: 11, color: C.blue, onTap: () => this.showJournal(sum.journal ?? [], 0) }).setDepth(50);
    if (hasChain) new Button(this, 10 + btnW / 2, 30, { w: btnW, h: 32, label: '🏪 Chuỗi', size: 11, color: C.blue, onTap: () => this.showChainSummary(sum.day) }).setDepth(50);

    const hasLevelUp = sum.levelUps.length > 0;
    const top = 58;
    // Khung vẽ sau khi biết chiều cao nội dung, đặt dưới chữ.
    const card = this.add.container(0, 0).setDepth(-1);
    const rows: [string, string, string?][] = [
      ['Doanh thu', formatMoney(sum.revenue)],
      ['Tiền vốn hàng đã bán', `-${formatMoney(sum.cogs)}`, HEX.muted],
      ['Lãi gộp', formatMoney(sum.grossProfit), sum.grossProfit >= 0 ? HEX.green : HEX.red],
      ['Tiền tip', `+${formatMoney(sum.tips)}`, '#b7791f'],
    ];
    if (sum.overpaid > 0) rows.push(['Thối dư', `-${formatMoney(sum.overpaid)}`, HEX.red]);
    if (sum.spoiledCost) {
      const items = (sum.spoiled ?? []).slice(0, 2).map((x) => `${x.qty} ${product(x.productId).name.toLowerCase()}`).join(', ');
      rows.push([`Hàng hỏng${items ? `: ${items}` : ''}`, `-${formatMoney(sum.spoiledCost)}`, HEX.red]);
    }
    if (sum.electricity) rows.push(['Tiền điện', `-${formatMoney(sum.electricity)}`, HEX.red]);
    if (sum.wages) rows.push([`Lương nhân viên${sum.wageDebt ? ` (nợ ${formatMoney(sum.wageDebt)})` : ''}`, `-${formatMoney(sum.wages)}`, HEX.red]);
    if (sum.bonuses) rows.push(['Thưởng nhân viên', `-${formatMoney(sum.bonuses)}`, HEX.red]);
    if (sum.theftCost) rows.push(['Mất trộm', `-${formatMoney(sum.theftCost)}`, HEX.red]);
    if (sum.fines) rows.push(['Kẻ trộm bồi thường', `+${formatMoney(sum.fines)}`, HEX.green]);
    if (sum.deliveryFees) rows.push(['Phí giao hàng', `+${formatMoney(sum.deliveryFees)}`, HEX.green]);
    if (sum.debtGiven) rows.push(['Cho ghi sổ', formatMoney(sum.debtGiven), '#1f5fa0']);
    if (sum.debtCollectedAmount) rows.push(['Thu nợ', `+${formatMoney(sum.debtCollectedAmount)}`, HEX.green]);
    if (sum.badDebt) rows.push(['Nợ khó đòi', `-${formatMoney(sum.badDebt)}`, HEX.red]);
    if (sum.netProfit !== undefined && (sum.spoiledCost || sum.electricity || sum.debtCollectedAmount || sum.wages || sum.theftCost)) {
      rows.push(['Lãi ròng', formatMoney(sum.netProfit), sum.netProfit >= 0 ? HEX.green : HEX.red]);
    }
    rows.push(
      ['Khách hài lòng', `${sum.happy} / ${sum.served + sum.left}`],
      ['Khách bỏ về', String(sum.left), sum.left > 0 ? HEX.red : HEX.ink],
      ['Sao trung bình', sum.avgRating ? `⭐ ${sum.avgRating.toFixed(1)}` : '–'],
      ['EXP nhận được', `+${sum.expGained}`, HEX.green],
    );
    let y = top + 18;
    const pitch = rows.length > 15 ? 18 : rows.length > 10 ? 22 : 28;
    const size = rows.length > 15 ? 12 : rows.length > 10 ? 13 : 15;
    for (const [label, value, color] of rows) {
      txt(this, 34, y, label, { size, color: HEX.ink });
      txt(this, W - 34, y, value, { size, bold: true, color: color ?? HEX.ink, origin: [1, 0] });
      y += pitch;
    }
    const complaints = sum.priceComplaints ?? [];
    if (complaints.length) {
      const t = txt(this, W / 2, y + 4, `💸 ${complaints.slice(0, 2).map((c) => `${product(c.productId).name}: ${c.qty} khách chê đắt`).join(' · ')}`, { size: 12, bold: true, color: HEX.red, origin: [0.5, 0], align: 'center', wrap: 290 });
      y += t.height + 8;
    }
    if (sum.spoiledCost) {
      const t = txt(this, W / 2, y + 2, 'Mẹo: nhập ít hàng tươi hơn, hoặc bán xả hàng hết hạn trong ngày.', { size: 11, color: HEX.muted, origin: [0.5, 0], align: 'center', wrap: 290 });
      y += t.height + 6;
    }
    if (sum.staffLevelUps?.length) {
      const t = txt(this, W / 2, y + 2, `⭐ ${sum.staffLevelUps.join(' · ')}`, { size: 12, bold: true, color: '#b7411f', origin: [0.5, 0], align: 'center', wrap: 290 });
      y += t.height + 6;
    }
    for (const id of sum.achievements ?? []) {
      const a = DATA.achievements.find((item) => item.id === id);
      if (!a) continue;
      const t = txt(this, W / 2, y + 2, `🏆 Thành tựu: ${a.name}!`, { size: 13, bold: true, color: '#b7411f', origin: [0.5, 0] });
      y += t.height + 6;
    }
    if (sum.bestSeller) {
      const p = product(sum.bestSeller.productId);
      txt(this, W / 2, y + 8, `🏆 Bán chạy nhất: ${p.icon} ${p.name} (${sum.bestSeller.qty})`, { size: 14, bold: true, origin: [0.5, 0], color: HEX.ink });
      y += 34;
    }
    const missed = sum.missed ?? [];
    if (missed.length > 0) {
      const list = missed
        .slice(0, 3)
        .map((m) => `${product(m.productId).name} (${m.qty})`)
        .join(', ');
      const byZone = new Map<string, number>();
      for (const m of missed) {
        const category = product(m.productId).category;
        const zone = ({ dry: 'Đồ khô', snack: 'Ăn vặt', household: 'Đồ dùng', drink: 'Đồ uống', fresh: 'Đồ tươi', frozen: 'Đông lạnh', counter: 'Sau quầy', food: 'Đồ ăn', beverage: 'Đồ pha chế' } as const)[category];
        byZone.set(zone, (byZone.get(zone) ?? 0) + m.qty);
      }
      const busiestZone = [...byZone.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const t = txt(this, W / 2, y + 6, `📦 Khách hỏi mà hết hàng: ${list}\nNhập thêm những món này nhé!`, {
        size: 13,
        bold: true,
        color: HEX.red,
        origin: [0.5, 0],
        align: 'center',
        wrap: 290,
      });
      y += t.height + 10;
      if (busiestZone) {
        const zoneTip = txt(this, W / 2, y, `Khu hay hết nhất: ${busiestZone}`, { size: 12, bold: true, color: HEX.red, origin: [0.5, 0] });
        y += zoneTip.height + 8;
      }
    } else if (sum.left > sum.served && sum.served + sum.left > 0) {
      const tip = txt(this, W / 2, y + 6, 'Mẹo: khách bỏ về nhiều? Nhập đủ các món và nạp kệ thường xuyên.', { size: 12, color: HEX.muted, origin: [0.5, 0], align: 'center', wrap: 280 });
      y += tip.height + 10;
    }
    const h = y - top + 12;
    card.add(panel(this, 16, top, W - 32, h));

    if (hasLevelUp) {
      const lv = sum.levelUps[sum.levelUps.length - 1];
      const labels = sum.levelUps.map((l) => `• ${DATA.levels.levels[l - 1].label}`).join('\n');
      const t = txt(this, W / 2, top + h + 36, `🎉 Lên cấp! Level ${lv}`, { size: 22, bold: true, color: '#b7411f', origin: [0.5, 0.5] });
      const list = txt(this, W / 2, top + h + 60, labels, { size: 14, origin: [0.5, 0], align: 'center', wrap: 280 });
      panel(this, 16, top + h + 12, W - 32, 62 + list.height, 0xfff1c1).setDepth(-1);
      this.tweens.add({ targets: t, scale: 1.12, yoyo: true, repeat: 3, duration: 260 });
      play('levelup');
    } else if (sum.capReached) {
      panel(this, 16, top + h + 12, W - 32, 90, 0xe6f0ff);
      txt(this, W / 2, top + h + 56, `🚧 ${DATA.levels.nextTeaser}\nEXP vẫn được cộng dồn cho bản cập nhật sau!`, {
        size: 14,
        origin: [0.5, 0.5],
        align: 'center',
        wrap: 290,
      });
    }

    const unclaimed = (s.quests?.list ?? []).filter((q) => !q.claimed && questDone(s, questDef(q.id))).length;
    if (unclaimed) {
      new Button(this, W / 2, H - 100, { w: 220, h: 40, label: `🎯 Nhận ${unclaimed} thưởng nhiệm vụ`, color: C.green, size: 13, onTap: () => this.scene.start('Quests', { back: 'Summary' }) });
    }

    new Button(this, W / 2, H - 42, {
      w: 220,
      h: 56,
      label: 'Ngày mới ☀️',
      color: C.red,
      size: 18,
      onTap: () => {
        if (G.liveSnapshot) {
          void dispatchLiveCommand({ type: 'nextDay' }).then(() => this.scene.start('Morning')).catch((error) => {
            this.add.text(W / 2, H - 92, error instanceof Error ? error.message : 'Không mở được ngày mới.', { color: '#b42318', fontSize: '12px', wordWrap: { width: W - 40 } }).setOrigin(0.5);
          });
          return;
        }
        const gift = startNextDay(G.state);
        persist();
        this.scene.start('Morning', { gift });
      },
    });
  }

  /** Tab Nhật ký: các sự việc trong ngày theo giờ game, 14 dòng mỗi trang. */
  private showJournal(entries: JournalEntry[], page: number): void {
    const per = 14;
    const pages = Math.max(1, Math.ceil(entries.length / per));
    const L = this.add.container(0, 0).setDepth(2000);
    L.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive());
    L.add(panel(this, 14, 40, W - 28, H - 80));
    L.add(txt(this, W / 2, 64, `📖 Nhật ký ngày ${G.state.lastSummary?.day ?? ''}`, { size: 18, bold: true, origin: [0.5, 0.5] }));
    entries.slice(page * per, page * per + per).forEach((e, i) => {
      L.add(txt(this, 26, 92 + i * 30, formatClock(e.m), { size: 12, bold: true, color: '#1f5fa0' }));
      L.add(txt(this, 70, 92 + i * 30, e.t, { size: 12, wrap: W - 100 }));
    });
    const go = (p: number) => () => { L.destroy(); this.showJournal(entries, p); };
    L.add(new Button(this, 60, H - 70, { w: 70, h: 36, label: '◀', color: C.wood, onTap: go(page - 1) }).setEnabled(page > 0));
    L.add(txt(this, W / 2 - 50, H - 70, `${page + 1}/${pages}`, { size: 13, origin: [0.5, 0.5] }));
    L.add(new Button(this, 140, H - 70, { w: 70, h: 36, label: '▶', color: C.wood, onTap: go(page + 1) }).setEnabled(page < pages - 1));
    L.add(new Button(this, W - 80, H - 70, { w: 110, h: 40, label: 'Đóng', color: C.grey, onTap: () => L.destroy() }));
  }

  /** Latest per-store ledger plus an at-a-glance chain total. */
  private showChainSummary(day: number): void {
    persist();
    const rows = G.state.stores.map((store) => {
      const records = Array.isArray(store.data.analytics) ? store.data.analytics as { day: number; revenue: number; profit: number; customers: number }[] : [];
      const record = [...records].reverse().find((item) => item.day <= day);
      return { name: store.name, revenue: record?.revenue ?? 0, profit: record?.profit ?? 0, customers: record?.customers ?? 0, recordDay: record?.day ?? null };
    });
    const layer = this.add.container(0, 0).setDepth(2000);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.66).setInteractive());
    layer.add(panel(this, 14, 70, W - 28, H - 140));
    layer.add(txt(this, W / 2, 96, `🏪 Báo cáo chuỗi · ngày ${day}`, { size: 17, bold: true, origin: [0.5, 0.5] }));
    layer.add(txt(this, 30, 130, 'Cửa hàng', { size: 10, bold: true, color: HEX.muted }));
    layer.add(txt(this, W - 30, 130, 'Doanh thu · Lãi · Khách', { size: 10, bold: true, color: HEX.muted, origin: [1, 0] }));
    let y = 150;
    for (const row of rows) {
      layer.add(card(this, 24, y, W - 48, 56, C.panel));
      layer.add(txt(this, 34, y + 7, row.name, { size: 12, bold: true }));
      layer.add(txt(this, 34, y + 29, row.recordDay === null ? 'Chưa có ngày bán được ghi nhận' : `Số liệu ngày ${row.recordDay}`, { size: 9, color: HEX.muted }));
      layer.add(txt(this, W - 34, y + 17, `${formatMoney(row.revenue)}  ·  ${formatMoney(row.profit)}  ·  ${row.customers}`, { size: 10, bold: true, origin: [1, 0] }));
      y += 62;
    }
    const totals = rows.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, profit: sum.profit + row.profit, customers: sum.customers + row.customers }), { revenue: 0, profit: 0, customers: 0 });
    layer.add(panel(this, 24, y + 2, W - 48, 62, 0xe8f5e9));
    layer.add(txt(this, 36, y + 12, 'TỔNG CHUỖI', { size: 12, bold: true, color: HEX.green }));
    layer.add(txt(this, 36, y + 36, `${formatMoney(totals.revenue)} doanh thu  ·  ${formatMoney(totals.profit)} lãi  ·  ${totals.customers} khách`, { size: 10, bold: true, wrap: W - 72 }));
    layer.add(new Button(this, W / 2, Math.max(y + 100, H - 100), { w: 100, h: 38, label: 'Đóng', color: C.grey, onTap: () => layer.destroy() }));
  }
}
