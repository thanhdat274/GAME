import Phaser from 'phaser';
import { debtLimit, isOverdue, openDebtTotal, remindDebt } from '../core/ledger';
import { Rng } from '../core/rng';
import { formatMoney, type Debt } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn Sổ nợ: danh sách khoản nợ, hạn, trạng thái, nút Nhắc nợ, hỗ trợ màn hình ngang 2 cột. */
export class LedgerScene extends Phaser.Scene {
  private list!: ScrollArea;
  private header!: Phaser.GameObjects.Text;
  private leftPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Ledger');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📒 Sổ nợ', () => this.scene.start('Morning'));

    const landscape = W > H;
    const rightX = landscape ? 226 : 0;
    const rightW = landscape ? W - rightX - 8 : W;
    const topY = landscape ? PAGE_TOP + 4 : PAGE_TOP + 80;

    if (!landscape) {
      this.header = txt(this, 14, PAGE_TOP + 4, '', { size: 13, bold: true, wrap: W - 28 });
      txt(this, 14, PAGE_TOP + 44, 'Nhắc nợ khi đã quá hạn thì khách trả sớm hơn.\nNhắc khi chưa tới hạn: khách phật ý (2 sao).', { size: 11, color: HEX.muted });
    }

    this.list = new ScrollArea(this, topY, H - 12, undefined, landscape ? { x: rightX, width: rightW } : undefined);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    this.leftPanel?.destroy(true);
    this.leftPanel = null;

    const landscape = W > H;
    if (landscape) {
      this.renderLeftPanel();
    } else {
      this.header.setText(`Đang cho nợ ${formatMoney(openDebtTotal(s))} · hạn mức ${formatMoney(debtLimit(s))} (20% tiền mặt)`);
    }

    const order = { open: 0, bad: 1, paid: 2 } as const;
    const debts = [...s.ledger].sort((a, b) => order[a.status] - order[b.status] || a.dueDay - b.dueDay);
    const startX = landscape ? 226 : 8;
    const cardW = landscape ? W - startX - 12 : W - 16;

    let y = 4;
    if (!debts.length) {
      this.list.add(txt(this, startX + cardW / 2, 50, 'Chưa có ai ghi sổ.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
    }
    for (const d of debts) {
      y = this.row(d, y, startX, cardW);
    }
    this.list.setHeight(y + 20);
  }

  private renderLeftPanel(): void {
    const s = G.state;
    const container = this.add.container(0, 0);
    this.leftPanel = container;
    const lx = 8;
    const ly = PAGE_TOP + 4;
    const lw = 210;
    const lh = H - PAGE_TOP - 16;

    const open = openDebtTotal(s);
    const limit = debtLimit(s);
    const ratio = limit > 0 ? Math.min(1, open / limit) : 0;

    container.add(card(this, lx, ly, lw, lh, C.panel));
    container.add(txt(this, lx + 12, ly + 14, 'Tổng nợ đang cho', { size: 11, color: HEX.muted }));
    container.add(txt(this, lx + 12, ly + 32, formatMoney(open), { size: 18, bold: true, color: open > limit * 0.8 ? HEX.red : HEX.ink }));

    container.add(txt(this, lx + 12, ly + 64, `Hạn mức: ${formatMoney(limit)}`, { size: 10.5, bold: true }));
    const bar = new Bar(this, lx + 12, ly + 84, lw - 24, 8, ratio >= 0.9 ? C.red : ratio >= 0.7 ? C.yellow : C.green, 0x000000);
    bar.set(ratio);
    container.add(bar);
    container.add(txt(this, lx + 12, ly + 96, `(Tối đa 20% tiền mặt · ${Math.round(ratio * 100)}%)`, { size: 9, color: HEX.muted }));

    container.add(txt(this, lx + 12, ly + 130, 'Quy tắc nhắc nợ:', { size: 11, bold: true }));
    container.add(txt(this, lx + 12, ly + 150,
      '• Quá hạn: Khách sẽ thu xếp trả sớm hơn.\n• Chưa tới hạn: Khách sẽ phật ý và bị đánh giá 2 sao.\n• Nợ khó đòi: Không thể đòi lại được.',
      { size: 9.5, color: HEX.muted, wrap: lw - 24 }));
  }

  private row(d: Debt, y: number, startX: number, cardW: number): number {
    const s = G.state;
    const h = 58;
    const overdue = isOverdue(s, d);
    this.list.add(card(this, startX, y, cardW, h - 4, d.status === 'open' ? (overdue ? 0xffe4dc : 0xfff6e6) : 0xeee6d8));

    const strike = d.status !== 'open';
    const title = txt(this, startX + 12, y + 8, `${d.name} · ${formatMoney(d.amount)}`, { size: 13, bold: true, color: strike ? HEX.muted : HEX.ink });
    this.list.add(title);
    if (strike) {
      const line = this.add.graphics();
      line.lineStyle(2, 0x7a6552, 1).lineBetween(startX + 12, y + 17, startX + 12 + title.width, y + 17);
      this.list.add(line);
    }
    const status = d.status === 'paid' ? '✓ Đã trả' : d.status === 'bad' ? '✗ Nợ khó đòi' : overdue ? `Quá hạn ${s.day - d.dueDay} ngày` : `Hạn ngày ${d.dueDay}`;
    this.list.add(txt(this, startX + 12, y + 30, `Ghi ngày ${d.day} · ${status}${d.reminded ? ' · đã nhắc' : ''}`, { size: 10, color: d.status === 'bad' || overdue ? HEX.red : HEX.muted }));
    if (d.status === 'open') {
      const bx = startX + cardW - 48;
      this.list.add(new Button(this, bx, y + (h - 4) / 2, {
        w: 80, h: 32, label: '📣 Nhắc nợ', size: 10.5, color: overdue ? C.red : C.grey,
        onTap: this.list.guard(() => this.remind(d)),
      }).setEnabled(!d.reminded));
    }
    return y + h;
  }

  private remind(d: Debt): void {
    const go = () => {
      const result = remindDebt(G.state, d.id, new Rng(G.state.day * 1000 + d.id));
      persist();
      if (result === 'early') { play('wrong'); toast(this, `${d.name} phật ý: "Chưa tới hạn mà!" (2 sao)`, H * 0.5, C.red); }
      else if (result === 'ok') { play('tap'); toast(this, `Đã nhắc ${d.name}. Chắc vài hôm nữa sẽ trả.`); }
      this.render();
    };
    if (!isOverdue(G.state, d)) {
      dialog(this, { icon: '🤔', title: 'Chưa tới hạn', body: `Khoản này hạn ngày ${d.dueDay}. Nhắc bây giờ khách sẽ phật ý.`, buttons: [
        { label: 'Thôi', color: C.grey },
        { label: 'Vẫn nhắc', color: C.red, onTap: go },
      ] });
      return;
    }
    go();
  }
}
