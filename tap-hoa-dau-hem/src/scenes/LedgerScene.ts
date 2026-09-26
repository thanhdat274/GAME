import Phaser from 'phaser';
import { debtLimit, isOverdue, openDebtTotal, remindDebt } from '../core/ledger';
import { Rng } from '../core/rng';
import { formatMoney, type Debt } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn Sổ nợ: danh sách khoản nợ, hạn, trạng thái, nút Nhắc nợ. */
export class LedgerScene extends Phaser.Scene {
  private list!: ScrollArea;
  private header!: Phaser.GameObjects.Text;

  constructor() {
    super('Ledger');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '📒 Sổ nợ', () => this.scene.start('Morning'));
    this.header = txt(this, 14, PAGE_TOP + 4, '', { size: 13, bold: true, wrap: W - 28 });
    txt(this, 14, PAGE_TOP + 44, 'Nhắc nợ khi đã quá hạn thì khách trả sớm hơn.\nNhắc khi chưa tới hạn: khách phật ý (2 sao).', { size: 11, color: HEX.muted });
    this.list = new ScrollArea(this, PAGE_TOP + 80, H - 12);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.header.setText(`Đang cho nợ ${formatMoney(openDebtTotal(s))} · hạn mức ${formatMoney(debtLimit(s))} (20% tiền mặt)`);
    this.list.clear();
    const order = { open: 0, bad: 1, paid: 2 } as const;
    const debts = [...s.ledger].sort((a, b) => order[a.status] - order[b.status] || a.dueDay - b.dueDay);
    let y = 4;
    if (!debts.length) this.list.add(txt(this, W / 2, 50, 'Chưa có ai ghi sổ.', { size: 14, color: HEX.muted, origin: [0.5, 0.5] }));
    for (const d of debts) y = this.row(d, y);
    this.list.setHeight(y + 20);
  }

  private row(d: Debt, y: number): number {
    const s = G.state;
    const h = 60;
    const overdue = isOverdue(s, d);
    this.list.add(card(this, 8, y, W - 16, h - 4, d.status === 'open' ? (overdue ? 0xffe4dc : 0xfff6e6) : 0xeee6d8));
    const strike = d.status !== 'open';
    const title = txt(this, 18, y + 8, `${d.name} · ${formatMoney(d.amount)}`, { size: 14, bold: true, color: strike ? HEX.muted : HEX.ink });
    this.list.add(title);
    if (strike) {
      const line = this.add.graphics();
      line.lineStyle(2, 0x7a6552, 1).lineBetween(18, y + 17, 18 + title.width, y + 17);
      this.list.add(line);
    }
    const status = d.status === 'paid' ? '✓ Đã trả' : d.status === 'bad' ? '✗ Nợ khó đòi' : overdue ? `Quá hạn ${s.day - d.dueDay} ngày` : `Hạn ngày ${d.dueDay}`;
    this.list.add(txt(this, 18, y + 32, `Ghi ngày ${d.day} · ${status}${d.reminded ? ' · đã nhắc' : ''}`, { size: 11, color: d.status === 'bad' || overdue ? HEX.red : HEX.muted }));
    if (d.status === 'open') {
      this.list.add(new Button(this, W - 56, y + h / 2 - 2, { w: 84, h: 34, label: '📣 Nhắc nợ', size: 11, color: overdue ? C.red : C.grey, onTap: this.list.guard(() => this.remind(d)) }).setEnabled(!d.reminded));
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
