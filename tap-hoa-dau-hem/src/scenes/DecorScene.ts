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

/** Cửa hàng trang trí: mua / bán lại 50%, xem điểm thu hút. */
export class DecorScene extends Phaser.Scene {
  private list!: ScrollArea;
  private meter!: Bar;
  private meterText!: Phaser.GameObjects.Text;

  constructor() {
    super('Decor');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🪴 Trang trí', () => this.scene.start('Morning'));
    this.meterText = txt(this, 14, PAGE_TOP + 2, '', { size: 13, bold: true });
    this.meter = new Bar(this, 14, PAGE_TOP + 24, W - 28, 10, C.yellow, 0x000000);
    txt(this, 14, PAGE_TOP + 40, 'Thu hút càng cao, khách tới càng đông (tối đa +25%).', { size: 11, color: HEX.muted });
    this.list = new ScrollArea(this, PAGE_TOP + 60, H - 12);
    this.render();
  }

  private render(): void {
    const s = G.state;
    const a = attraction(s);
    this.meterText.setText(`✨ Thu hút ${a}/${DATA.balance.attraction.max} · khách +${Math.round((attractionMultiplier(s) - 1) * 100)}%`);
    this.meter.set(a / DATA.balance.attraction.max);
    this.list.clear();
    const unlocked = hasFeature(s.level, 'decor');
    let y = 4;
    for (const d of DATA.decor) {
      const owned = s.decorOwned.includes(d.id) || s.fixtures.some((f) => f.type === d.id);
      if (d.exclusive && !owned) continue;
      const h = 64;
      this.list.add(card(this, 8, y, W - 16, h - 6, owned ? 0xe3f3e6 : C.panel));
      this.list.add(emoji(this, 34, y + h / 2 - 3, d.icon, 26));
      this.list.add(txt(this, 58, y + 8, d.name, { size: 14, bold: true }));
      this.list.add(txt(this, 58, y + 28, `${SLOT_NAME[d.slot]} · +${d.attraction} thu hút${d.cat ? ' · khách chờ vuốt mèo' : ''}`, { size: 10, color: HEX.muted }));
      const bx = W - 58;
      const by = y + h / 2 - 3;
      if (owned && d.slot !== 'floor') {
        if (d.exclusive) this.list.add(txt(this, bx, by, 'Độc quyền', { size: 11, bold: true, color: HEX.green, origin: [0.5, 0.5] }));
        else this.list.add(new Button(this, bx, by, { w: 86, h: 32, size: 11, color: C.grey, label: `Bán ${formatMoney(Math.floor(d.cost * DATA.balance.sellBackRatio))}`, onTap: this.list.guard(() => {
          if (sellDecor(G.state, d.id)) { play('coin'); persist(); this.render(); }
        }) }));
      } else if (d.slot === 'floor') {
        this.list.add(new Button(this, bx, by, { w: 86, h: 32, size: 11, color: C.blue, label: 'Đặt sàn…', onTap: this.list.guard(() => {
          dialog(this, { icon: d.icon, title: d.name, body: 'Đồ đặt sàn mua trong chế độ 🏗️ Sắp xếp để chọn chỗ đặt.', buttons: [
            { label: 'Đóng', color: C.grey },
            { label: 'Mở Sắp xếp', color: C.green, onTap: () => this.scene.start('Build', { buy: d.id }) },
          ] });
        }) }).setEnabled(unlocked && s.level >= d.unlockLevel));
      } else {
        const can = unlocked && s.level >= d.unlockLevel;
        this.list.add(new Button(this, bx, by, { w: 86, h: 32, size: 11, color: C.green, label: can ? formatMoney(d.cost) : `Lv ${Math.max(d.unlockLevel, 8)}`, onTap: this.list.guard(() => {
          const r = buyDecor(G.state, d.id);
          if (r === 'ok') { play('cash'); persist(); toast(this, `Đã mua ${d.name}!`); this.render(); }
          else toast(this, r === 'money' ? 'Chưa đủ tiền' : 'Chưa mở khóa', H * 0.5, C.red);
        }) }).setEnabled(can));
      }
      y += h;
    }
    this.list.setHeight(y + 20);
  }
}
