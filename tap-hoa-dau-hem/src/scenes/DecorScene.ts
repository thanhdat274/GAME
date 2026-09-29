import Phaser from 'phaser';
import { DATA, hasFeature, type DecorDef } from '../core/data';
import { attraction, attractionMultiplier, buyDecor, sellDecor } from '../core/decor';
import { formatMoney } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Bar, Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, emoji, setupCamera, txt } from '../ui/theme';

const SLOT_NAME: Record<DecorDef['slot'], string> = { sign: 'Biển hiệu', wall: 'Treo tường', floor: 'Đặt sàn', counter: 'Trên quầy' };

/** Cửa hàng trang trí: mua / bán lại 50%, xem điểm thu hút, hỗ trợ màn hình ngang 2 cột. */
export class DecorScene extends Phaser.Scene {
  private list!: ScrollArea;
  private meter!: Bar;
  private meterText!: Phaser.GameObjects.Text;
  private leftPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Decor');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🪴 Trang trí', () => this.scene.start('Morning'));

    const landscape = W > H;
    const rightX = landscape ? 216 : 0;
    const rightW = landscape ? W - rightX - 8 : W;
    const topY = landscape ? PAGE_TOP + 4 : PAGE_TOP + 60;

    if (!landscape) {
      this.meterText = txt(this, 14, PAGE_TOP + 2, '', { size: 13, bold: true });
      this.meter = new Bar(this, 14, PAGE_TOP + 24, W - 28, 10, C.yellow, 0x000000);
      txt(this, 14, PAGE_TOP + 40, 'Thu hút càng cao, khách tới càng đông (tối đa +25%).', { size: 11, color: HEX.muted });
    }

    this.list = new ScrollArea(this, topY, H - 12, undefined, landscape ? { x: rightX, width: rightW } : undefined);
    this.render();
  }

  private render(): void {
    const s = G.state;
    const a = attraction(s);
    const max = DATA.balance.attraction.max;
    const boostPct = Math.round((attractionMultiplier(s) - 1) * 100);

    this.list.clear();
    this.leftPanel?.destroy(true);
    this.leftPanel = null;

    const landscape = W > H;
    if (landscape) {
      this.renderLeftPanel(a, max, boostPct);
    } else {
      this.meterText.setText(`✨ Thu hút ${a}/${max} · khách +${boostPct}%`);
      this.meter.set(a / max);
    }

    const unlocked = hasFeature(s.level, 'decor');
    const startX = landscape ? 216 : 8;
    const cardW = landscape ? W - startX - 12 : W - 16;
    let y = 4;

    for (const d of DATA.decor) {
      const owned = s.decorOwned.includes(d.id) || s.fixtures.some((f) => f.type === d.id);
      if (d.exclusive && !owned) continue;
      const h = 64;
      this.list.add(card(this, startX, y, cardW, h - 6, owned ? 0xe3f3e6 : C.panel));
      this.list.add(emoji(this, startX + 26, y + (h - 6) / 2, d.icon, 24));
      this.list.add(txt(this, startX + 52, y + 8, d.name, { size: 13, bold: true }));
      this.list.add(txt(this, startX + 52, y + 28, `${SLOT_NAME[d.slot]} · +${d.attraction} thu hút${d.cat ? ' · khách vuốt mèo' : ''}`, { size: 9.5, color: HEX.muted, wrap: cardW - 146 }));

      const bx = startX + cardW - 50;
      const by = y + (h - 6) / 2;
      if (owned && d.slot !== 'floor') {
        if (d.exclusive) {
          this.list.add(txt(this, bx, by, 'Độc quyền', { size: 11, bold: true, color: HEX.green, origin: [0.5, 0.5] }));
        } else {
          this.list.add(new Button(this, bx, by, {
            w: 84, h: 32, size: 10.5, color: C.grey,
            label: `Bán ${formatMoney(Math.floor(d.cost * DATA.balance.sellBackRatio))}`,
            onTap: this.list.guard(() => {
              if (sellDecor(G.state, d.id)) { play('coin'); persist(); this.render(); }
            }),
          }));
        }
      } else if (d.slot === 'floor') {
        this.list.add(new Button(this, bx, by, {
          w: 84, h: 32, size: 11, color: C.blue, label: 'Đặt sàn…',
          onTap: this.list.guard(() => {
            dialog(this, {
              icon: d.icon, title: d.name, body: 'Đồ đặt sàn mua trong chế độ 🏗️ Sắp xếp để chọn chỗ đặt.',
              buttons: [
                { label: 'Đóng', color: C.grey },
                { label: 'Mở Sắp xếp', color: C.green, onTap: () => this.scene.start('Build', { buy: d.id }) },
              ],
            });
          }),
        }).setEnabled(unlocked && s.level >= d.unlockLevel));
      } else {
        const can = unlocked && s.level >= d.unlockLevel;
        this.list.add(new Button(this, bx, by, {
          w: 84, h: 32, size: 10.5, color: C.green,
          label: can ? formatMoney(d.cost) : `Lv ${Math.max(d.unlockLevel, 8)}`,
          onTap: this.list.guard(() => {
            const r = buyDecor(G.state, d.id);
            if (r === 'ok') { play('cash'); persist(); toast(this, `Đã mua ${d.name}!`); this.render(); }
            else toast(this, r === 'money' ? 'Chưa đủ tiền' : 'Chưa mở khóa', H * 0.5, C.red);
          }),
        }).setEnabled(can));
      }
      y += h;
    }
    this.list.setHeight(y + 20);
  }

  private renderLeftPanel(a: number, max: number, boostPct: number): void {
    const container = this.add.container(0, 0);
    this.leftPanel = container;
    const lx = 8;
    const ly = PAGE_TOP + 4;
    const lw = 200;
    const lh = H - PAGE_TOP - 16;

    container.add(card(this, lx, ly, lw, lh, C.panel));
    container.add(txt(this, lx + 12, ly + 14, '✨ Điểm thu hút', { size: 12, bold: true }));
    container.add(txt(this, lx + 12, ly + 36, `${a}/${max}`, { size: 24, bold: true, color: HEX.ink }));

    const bar = new Bar(this, lx + 12, ly + 68, lw - 24, 8, C.yellow, 0x000000);
    bar.set(a / max);
    container.add(bar);

    container.add(txt(this, lx + 12, ly + 84, `Khách vãng lai: +${boostPct}%`, { size: 11, bold: true, color: HEX.green }));
    container.add(txt(this, lx + 12, ly + 116, 'Lợi ích trang trí:', { size: 11, bold: true }));
    container.add(txt(this, lx + 12, ly + 136,
      '• Biển hiệu & đồ treo tường giúp hút thêm khách vãng lai (tối đa +25%).\n• Đồ đặt sàn mua và bài trí trong màn Sắp xếp.\n• Bán lại thu hồi 50% vốn.',
      { size: 9.5, color: HEX.muted, wrap: lw - 24 }));
  }
}
