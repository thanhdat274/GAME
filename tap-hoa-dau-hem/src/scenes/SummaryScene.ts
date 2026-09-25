import Phaser from 'phaser';
import { DATA, product } from '../core/data';
import { startNextDay } from '../core/day';
import { formatMoney } from '../core/state';
import { G, persist } from '../game';
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
    txt(this, W / 2, 30, `🌙 Tổng kết ngày ${sum.day}`, { size: 22, bold: true, color: HEX.cream, origin: [0.5, 0.5] });

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
    rows.push(
      ['Khách hài lòng', `${sum.happy} / ${sum.served + sum.left}`],
      ['Khách bỏ về', String(sum.left), sum.left > 0 ? HEX.red : HEX.ink],
      ['Sao trung bình', sum.avgRating ? `⭐ ${sum.avgRating.toFixed(1)}` : '–'],
      ['EXP nhận được', `+${sum.expGained}`, HEX.green],
    );
    let y = top + 18;
    for (const [label, value, color] of rows) {
      txt(this, 34, y, label, { size: 15, color: HEX.ink });
      txt(this, W - 34, y, value, { size: 15, bold: true, color: color ?? HEX.ink, origin: [1, 0] });
      y += 28;
    }
    if (sum.bestSeller) {
      const p = product(sum.bestSeller.productId);
      txt(this, W / 2, y + 8, `🏆 Bán chạy nhất: ${p.icon} ${p.name} (${sum.bestSeller.qty})`, { size: 14, bold: true, origin: [0.5, 0], color: HEX.ink });
      y += 34;
    }
    if (sum.left > sum.served && sum.served + sum.left > 0) {
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

    new Button(this, W / 2, H - 42, {
      w: 220,
      h: 56,
      label: 'Ngày mới ☀️',
      color: C.red,
      size: 18,
      onTap: () => {
        const gift = startNextDay(G.state);
        persist();
        this.scene.start('Morning', { gift });
      },
    });
  }
}
