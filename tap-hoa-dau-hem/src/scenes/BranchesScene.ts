import Phaser from 'phaser';
import { openBranch, sendBranchShipment, visitStore } from '../core/branches';
import { DATA, product } from '../core/data';
import { formatMoney, warehouseTotals } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

export class BranchesScene extends Phaser.Scene {
  private list!: ScrollArea;
  constructor() { super('Branches'); }
  create(): void {
    setupCamera(this);
    pageFrame(this, '🗺️ Bản đồ thành phố', () => { persist(); this.scene.start('Morning'); }, `Tiền chung · ${formatMoney(G.state.money)}`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    this.render();
  }
  private render(): void {
    this.list.clear();
    const s = G.state;
    let y = 6;
    this.list.add(txt(this, 14, y, `Đang ghé: ${s.stores.find((store) => store.id === s.activeStoreId)?.name ?? 'Tiệm chính'}`, { size: 13, bold: true })); y += 28;
    const defs = [{ id: 'main', name: 'Tiệm chính', icon: '🏪', unlockLevel: 1, cost: 0, description: 'Cửa hàng gốc của bạn.' }, ...DATA.branches];
    for (const def of defs) {
      const store = s.stores.find((item) => item.id === def.id);
      const current = s.activeStoreId === def.id;
      const locked = s.level < def.unlockLevel;
      const h = store && !current ? 116 : 86;
      this.list.add(card(this, 8, y, W - 16, h - 6, current ? 0xe8f5e9 : C.panel));
      this.list.add(txt(this, 18, y + 8, `${def.icon} ${def.name}`, { size: 14, bold: true }));
      this.list.add(txt(this, 18, y + 31, def.description, { size: 10, color: HEX.muted, wrap: W - 42 }));
      const status = current ? 'Bạn đang ở đây' : store ? `Tồn kho riêng · mô phỏng đến ngày ${store.simDay ?? 0}` : locked ? `Mở ở L${def.unlockLevel}` : `Phí mở ${formatMoney(def.cost)}`;
      this.list.add(txt(this, 18, y + 58, status, { size: 10, color: current ? HEX.green : HEX.muted, wrap: W - 130 }));
      if (!current) this.list.add(new Button(this, W - 60, y + 39, { w: 82, h: 34, label: store ? 'Ghé tiệm' : 'Mở tiệm', size: 11, color: store ? C.blue : C.green, onTap: this.list.guard(() => {
        if (store) visitStore(s, def.id);
        else {
          const result = openBranch(s, def.id);
          if (!result.ok) { toast(this, result.reason === 'money' ? 'Chưa đủ tiền mở chi nhánh' : result.reason === 'limit' ? 'Đã đạt giới hạn 4 cửa hàng' : 'Chưa mở chi nhánh này'); return; }
        }
        persist(); this.scene.start('Morning');
      }) }).setEnabled(!locked));
      if (store && !current) this.list.add(new Button(this, W - 60, y + 82, { w: 82, h: 30, label: '🚚 Gửi hàng', size: 10, color: C.wood, onTap: this.list.guard(() => this.openShipment(def.id, def.name)) }));
      y += h;
    }
    this.list.setHeight(y + 20);
  }

  private openShipment(toStoreId: string, toName: string): void {
    const s = G.state;
    let selected = Object.entries(warehouseTotals(s)).find(([, qty]) => qty > 0)?.[0] ?? '';
    let qty = 5;
    const overlay = this.add.container(0, 0).setDepth(1000);
    const draw = () => {
      overlay.removeAll(true);
      overlay.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.66).setInteractive());
      overlay.add(panel(this, 14, 50, W - 28, H - 100));
      overlay.add(txt(this, W / 2, 78, `🚚 Gửi hàng đến ${toName}`, { size: 17, bold: true, origin: [0.5, 0.5] }));
      overlay.add(txt(this, W / 2, 104, 'Xe đến vào buổi sáng ngày mai. Hạn dùng được giữ nguyên.', { size: 10, color: HEX.muted, origin: [0.5, 0.5], wrap: W - 45, align: 'center' }));
      const entries = Object.entries(warehouseTotals(s)).filter(([, amount]) => amount > 0);
      let y = 135;
      for (const [id, amount] of entries.slice(0, 10)) {
        const p = product(id);
        const selectedRow = id === selected;
        overlay.add(card(this, 24, y, W - 48, 38, selectedRow ? 0xe8f5e9 : C.panel));
        overlay.add(txt(this, 34, y + 9, `${p.icon} ${p.name} · ${amount}`, { size: 11, bold: selectedRow }));
        overlay.add(new Button(this, W - 54, y + 19, { w: 50, h: 30, label: selectedRow ? '✓' : 'Chọn', size: 10, color: selectedRow ? C.green : C.blue, onTap: () => { selected = id; qty = Math.min(5, amount); draw(); } }));
        y += 43;
      }
      const available = entries.find(([id]) => id === selected)?.[1] ?? 0;
      qty = Math.max(1, Math.min(qty, available));
      overlay.add(txt(this, W / 2, H - 210, `Số lượng: ${qty} / ${available}   ·   Phí xe: ${formatMoney(500 + qty * 100)}`, { size: 11, bold: true, origin: [0.5, 0.5], align: 'center' }));
      overlay.add(new Button(this, 72, H - 170, { w: 66, h: 38, label: '−', color: C.grey, onTap: () => { qty = Math.max(1, qty - 1); draw(); } }).setEnabled(qty > 1));
      overlay.add(new Button(this, W - 72, H - 170, { w: 66, h: 38, label: '+', color: C.grey, onTap: () => { qty = Math.min(available, qty + 1); draw(); } }).setEnabled(qty < available));
      overlay.add(new Button(this, W / 2, H - 118, { w: 180, h: 42, label: 'Gửi xe hàng', color: C.green, onTap: () => {
        const result = sendBranchShipment(s, toStoreId, selected, qty);
        if (!result.ok) { toast(this, result.reason === 'money' ? 'Không đủ tiền trả phí xe' : result.reason === 'stock' ? 'Kho không đủ hàng' : 'Chọn mặt hàng hợp lệ'); return; }
        persist(); overlay.destroy(); toast(this, `Xe hàng khởi hành · ${formatMoney(result.fee)}`); this.render();
      } }).setEnabled(available > 0));
      overlay.add(new Button(this, W / 2, H - 66, { w: 100, h: 34, label: 'Đóng', color: C.grey, onTap: () => overlay.destroy() }));
    };
    draw();
  }
}
