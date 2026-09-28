import * as Engine from '../engine';
import { branchAvailable, maxStores, openBranch, sendBranchShipment, visitStore } from '../core/branches';
import { DATA, product } from '../core/data';
import { formatMoney, storeView, warehouseTotals } from '../core/state';
import { missingCook } from '../core/production';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, panel, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

export class BranchesScene extends Engine.Scene {
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
    // Chỉ hiện khu đã đủ level (và tính năng riêng, vd. Tiệm xôi cần `shop_xoi`) hoặc đã có tiệm.
    const branches = DATA.branches.filter((def) => branchAvailable(s, def) || s.stores.some((store) => store.id === def.id));
    const defs = [{ id: 'main', name: 'Tiệm chính', icon: '🏪', unlockLevel: 1, cost: 0, description: 'Cửa hàng gốc của bạn.' }, ...branches];
    for (const def of defs) {
      const store = s.stores.find((item) => item.id === def.id);
      const current = s.activeStoreId === def.id;
      const locked = s.level < def.unlockLevel;
      const h = store ? 136 : 86;
      this.list.add(card(this, 8, y, W - 16, h - 6, current ? 0xe8f5e9 : C.panel));
      this.list.add(txt(this, 18, y + 8, `${def.icon} ${def.name}`, { size: 14, bold: true }));
      this.list.add(txt(this, 18, y + 31, def.description, { size: 10, color: HEX.muted, wrap: W - 42 }));
      const noCook = !!store && missingCook(s, store.id);
      if (store) {
        const data = storeView(s, store.id);
        const stockKinds = data.warehouse.filter((lot) => lot.qty > 0).length;
        const simDay = current ? s.day : store.simDay ?? s.branchLastSimDay[store.id] ?? 0;
        this.list.add(txt(this, 18, y + 57, `Cấp chuỗi Lv${s.level} (dùng chung) · ${data.staff.length} nhân viên · ${stockKinds} mặt hàng trong kho`, { size: 10, color: HEX.ink, wrap: W - 34 }));
        this.list.add(txt(this, 18, y + 77, noCook ? '⚠ Thiếu Thợ nấu xôi · không sản xuất khi vắng' : `${current ? 'Đang hoạt động' : 'Mô phỏng'} đến ngày ${simDay}`, { size: 10, color: noCook ? HEX.red : current ? HEX.green : HEX.muted, wrap: W - 130 }));
      } else {
        const status = locked ? `Mở ở L${def.unlockLevel}` : `Phí mở ${formatMoney(def.cost)}`;
        this.list.add(txt(this, 18, y + 58, status, { size: 10, color: HEX.muted, wrap: W - 130 }));
      }
      if (!current) this.list.add(new Button(this, W - 60, y + 39, { w: 82, h: 34, label: store ? 'Ghé tiệm' : 'Mở tiệm', size: 11, color: store ? C.blue : C.green, onTap: this.list.guard(() => {
        if (store) visitStore(s, def.id);
        else {
          const result = openBranch(s, def.id);
          if (!result.ok) { toast(this, result.reason === 'money' ? 'Chưa đủ tiền mở chi nhánh' : result.reason === 'limit' ? `Đã đạt giới hạn ${maxStores()} cửa hàng` : 'Chưa mở chi nhánh này'); return; }
        }
        persist(); this.scene.start('Morning');
      }) }).setEnabled(!locked));
      if (store) this.list.add(new Button(this, current ? W - 60 : W - 150, y + 111, { w: 82, h: 30, label: '🗺️ Xem kệ', size: 10, color: C.wood, onTap: this.list.guard(() => { persist(); this.scene.start('StoreMap', { storeId: def.id, back: 'Branches' }); }) }));
      if (store && !current) this.list.add(new Button(this, W - 60, y + 111, { w: 82, h: 30, label: '🚚 Gửi hàng', size: 10, color: C.wood, onTap: this.list.guard(() => this.openShipment(def.id, def.name)) }));
      y += h;
    }
    this.list.setHeight(y + 20);
  }

  private openShipment(toStoreId: string, toName: string): void {
    const s = G.state;
    let selected = Object.entries(warehouseTotals(s)).find(([, qty]) => qty > 0)?.[0] ?? '';
    let qty = 5;
    const overlay = this.add.container(0, 0).setDepth(1000);
    const listTop = 122;
    const listBottom = H - 232;
    const rows = new ScrollArea(this, listTop, listBottom);
    rows.content.setDepth(1001);
    const controls = this.add.container(0, 0).setDepth(1002);
    overlay.add([
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.66).setInteractive(),
      panel(this, 14, 50, W - 28, H - 100),
      txt(this, W / 2, 76, `🚚 Gửi hàng đến ${toName}`, { size: 14, bold: true, origin: [0.5, 0.5], wrap: W - 48, align: 'center' }),
      txt(this, W / 2, 103, 'Xe đến vào buổi sáng ngày mai. Hạn dùng được giữ nguyên.', { size: 10, color: HEX.muted, origin: [0.5, 0.5], wrap: W - 45, align: 'center' }),
      rows.content, controls,
    ]);
    const draw = () => {
      controls.removeAll(true);
      const entries = Object.entries(warehouseTotals(s)).filter(([, amount]) => amount > 0);
      rows.clear();
      rows.content.setDepth(1001);
      // Keep the scrollable rows between the instructions and quantity controls.
      let y = 0;
      for (const [id, amount] of entries) {
        const p = product(id);
        const selectedRow = id === selected;
        rows.add(card(this, 24, y, W - 48, 38, selectedRow ? 0xe8f5e9 : C.panel));
        rows.add(txt(this, 34, y + 9, `${p.icon} ${p.name} · ${amount}`, { size: 11, bold: selectedRow, wrap: W - 120 }));
        rows.add(new Button(this, W - 54, y + 19, { w: 50, h: 30, label: selectedRow ? '✓' : 'Chọn', size: 10, color: selectedRow ? C.green : C.blue, onTap: () => { selected = id; qty = Math.min(5, amount); draw(); } }));
        y += 43;
      }
      rows.setHeight(y);
      const available = entries.find(([id]) => id === selected)?.[1] ?? 0;
      qty = Math.max(1, Math.min(qty, available));
      controls.add(txt(this, W / 2, H - 210, `Số lượng: ${qty} / ${available}   ·   Phí xe: ${formatMoney(500 + qty * 100)}`, { size: 11, bold: true, origin: [0.5, 0.5], align: 'center' }));
      controls.add(new Button(this, 72, H - 170, { w: 66, h: 38, label: '−', color: C.grey, onTap: () => { qty = Math.max(1, qty - 1); draw(); } }).setEnabled(qty > 1));
      controls.add(new Button(this, W - 72, H - 170, { w: 66, h: 38, label: '+', color: C.grey, onTap: () => { qty = Math.min(available, qty + 1); draw(); } }).setEnabled(qty < available));
      controls.add(new Button(this, W / 2, H - 118, { w: 180, h: 42, label: 'Gửi xe hàng', color: C.green, onTap: () => {
        const result = sendBranchShipment(s, toStoreId, selected, qty);
        if (!result.ok) { toast(this, result.reason === 'money' ? 'Không đủ tiền trả phí xe' : result.reason === 'stock' ? 'Kho không đủ hàng' : 'Chọn mặt hàng hợp lệ'); return; }
        persist(); rows.clear(); overlay.destroy(); toast(this, `Xe hàng khởi hành · ${formatMoney(result.fee)}`); this.render();
      } }).setEnabled(available > 0));
      controls.add(new Button(this, W / 2, H - 66, { w: 100, h: 34, label: 'Đóng', color: C.grey, onTap: () => { rows.clear(); overlay.destroy(); } }));
    };
    draw();
  }
}
