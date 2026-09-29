import Phaser from 'phaser';
import { ACTIVE_BRANCH_IDS, branchAvailable, maxStores, openBranch, sendBranchShipment, visitStore } from '../core/branches';
import { DATA, product } from '../core/data';
import { formatMoney, storeView, warehouseTotals } from '../core/state';
import { missingCook } from '../core/production';
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
    // Chỉ hiện khu đã đủ level (và tính năng riêng, vd. Tiệm xôi cần `shop_xoi`) hoặc đã có tiệm.
    const branches = DATA.branches.filter((def) => ACTIVE_BRANCH_IDS.includes(def.id as (typeof ACTIVE_BRANCH_IDS)[number]) && (branchAvailable(s, def) || s.stores.some((store) => store.id === def.id)));
    const defs = [{ id: 'main', name: 'Tiệm chính', icon: '🏪', unlockLevel: 1, cost: 0, description: 'Cửa hàng gốc của bạn.' }, ...branches];
    const landscape = W > H;
    const colW = landscape ? Math.floor((W - 24) / 2) : W - 16;
    const h = 138;

    defs.forEach((def, index) => {
      const store = s.stores.find((item) => item.id === def.id);
      const current = s.activeStoreId === def.id;
      const locked = s.level < def.unlockLevel;
      const cardH = store ? h : 86;

      const col = landscape ? index % 2 : 0;
      const row = landscape ? Math.floor(index / 2) : index;
      const cx = 8 + col * (colW + 8);
      const cy = y + (landscape ? row * h : 0);

      this.list.add(card(this, cx, cy, colW, cardH - 6, current ? 0xe8f5e9 : C.panel));
      this.list.add(txt(this, cx + 10, cy + 8, `${def.icon} ${def.name}`, { size: 13.5, bold: true }));
      this.list.add(txt(this, cx + 10, cy + 29, def.description, { size: 9.5, color: HEX.muted, wrap: colW - (current ? 20 : 96) }));
      const noCook = !!store && missingCook(s, store.id);

      if (store) {
        const data = storeView(s, store.id);
        const stockKinds = data.warehouse.filter((lot) => lot.qty > 0).length;
        const simDay = current ? s.day : store.simDay ?? s.branchLastSimDay[store.id] ?? 0;
        this.list.add(txt(this, cx + 10, cy + 54, `Lv${s.level} · ${data.staff.length} nhân viên · ${stockKinds} món kho`, { size: 9.5, color: HEX.ink, wrap: colW - 20 }));
        this.list.add(txt(this, cx + 10, cy + 74, noCook ? '⚠ Thiếu Thợ nấu xôi' : `${current ? 'Đang hoạt động' : 'Mô phỏng'} đến ngày ${simDay}`, { size: 9.5, color: noCook ? HEX.red : current ? HEX.green : HEX.muted, wrap: colW - 20 }));

        const btnRowY = cy + cardH - 24;
        if (current) {
          this.list.add(new Button(this, cx + colW / 2, btnRowY, { w: colW - 24, h: 28, label: '🗺️ Xem kệ', size: 10, color: C.wood, onTap: this.list.guard(() => { persist(); this.scene.start('StoreMap', { storeId: def.id, back: 'Branches' }); }) }));
        } else {
          const bw = Math.floor((colW - 28) / 2);
          this.list.add(new Button(this, cx + 8 + bw / 2, btnRowY, { w: bw, h: 28, label: '🗺️ Xem kệ', size: 10, color: C.wood, onTap: this.list.guard(() => { persist(); this.scene.start('StoreMap', { storeId: def.id, back: 'Branches' }); }) }));
          this.list.add(new Button(this, cx + 14 + bw * 1.5, btnRowY, { w: bw, h: 28, label: '🚚 Gửi hàng', size: 10, color: C.wood, onTap: this.list.guard(() => this.openShipment(def.id, def.name)) }));
        }
      } else {
        const status = locked ? `Mở ở L${def.unlockLevel}` : `Phí mở ${formatMoney(def.cost)}`;
        this.list.add(txt(this, cx + 10, cy + 54, status, { size: 10, color: HEX.muted, wrap: colW - 96 }));
      }

      if (!current) {
        this.list.add(new Button(this, cx + colW - 46, cy + 32, {
          w: 78, h: 32, label: store ? 'Ghé tiệm' : 'Mở tiệm', size: 11, color: store ? C.blue : C.green,
          onTap: this.list.guard(() => {
            if (store) visitStore(s, def.id);
            else {
              const result = openBranch(s, def.id);
              if (!result.ok) { toast(this, result.reason === 'money' ? 'Chưa đủ tiền mở chi nhánh' : result.reason === 'limit' ? `Đã đạt giới hạn ${maxStores()} cửa hàng` : 'Chưa mở chi nhánh này'); return; }
            }
            persist(); this.scene.start('Morning');
          }),
        }).setEnabled(!locked));
      }

      if (!landscape) {
        y += cardH;
      }
    });

    if (landscape) {
      const rows = Math.ceil(defs.length / 2);
      y += rows * h;
    }
    this.list.setHeight(y + 20);
  }

  private openShipment(toStoreId: string, toName: string): void {
    const s = G.state;
    const landscape = W > H;
    let selected = Object.entries(warehouseTotals(s)).find(([, qty]) => qty > 0)?.[0] ?? '';
    let qty = 5;
    const overlay = this.add.container(0, 0).setDepth(1000);
    const panelTop = landscape ? 12 : 50;
    const panelH = landscape ? H - 24 : H - 100;
    const panelW = W - 28;
    const panelX = 14;

    const leftW = landscape ? Math.round(panelW * 0.54) : panelW;
    const listTop = landscape ? panelTop + 44 : 122;
    const listBottom = landscape ? panelTop + panelH - 10 : H - 232;
    const rows = new ScrollArea(this, listTop, listBottom, undefined, { x: panelX + 6, width: leftW - 12 });
    rows.content.setDepth(1001);
    const controls = this.add.container(0, 0).setDepth(1002);

    overlay.add([
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.66).setInteractive(),
      panel(this, panelX, panelTop, panelW, panelH),
      txt(this, landscape ? panelX + 16 : W / 2, panelTop + (landscape ? 14 : 26), `🚚 Gửi hàng đến ${toName}`, { size: 14, bold: true, origin: landscape ? [0, 0] : [0.5, 0.5] }),
      txt(this, landscape ? panelX + 16 : W / 2, panelTop + (landscape ? 30 : 53), 'Xe đến sáng mai. Hạn dùng giữ nguyên.', { size: 10, color: HEX.muted, origin: landscape ? [0, 0] : [0.5, 0.5] }),
      rows.content, controls,
    ]);

    const draw = () => {
      controls.removeAll(true);
      const entries = Object.entries(warehouseTotals(s)).filter(([, amount]) => amount > 0);
      rows.clear();
      rows.content.setDepth(1001);

      let y = 0;
      for (const [id, amount] of entries) {
        const p = product(id);
        const selectedRow = id === selected;
        const rowW = leftW - 20;
        rows.add(card(this, panelX + 10, y, rowW, 36, selectedRow ? 0xe8f5e9 : C.panel));
        rows.add(txt(this, panelX + 18, y + 8, `${p.icon} ${p.name} · ${amount}`, { size: 11, bold: selectedRow, wrap: rowW - 68 }));
        rows.add(new Button(this, panelX + 10 + rowW - 28, y + 18, { w: 46, h: 26, label: selectedRow ? '✓' : 'Chọn', size: 10, color: selectedRow ? C.green : C.blue, onTap: () => { selected = id; qty = Math.min(5, amount); draw(); } }));
        y += 40;
      }
      rows.setHeight(y + 4);
      const available = entries.find(([id]) => id === selected)?.[1] ?? 0;
      qty = Math.max(1, Math.min(qty, available));

      if (landscape) {
        const rightX = panelX + leftW + 10;
        const rightW = panelW - leftW - 20;
        const selProduct = selected ? product(selected) : null;
        controls.add(card(this, rightX, panelTop + 14, rightW, panelH - 28, 0xfffcf7));
        controls.add(txt(this, rightX + rightW / 2, panelTop + 28, selProduct ? `${selProduct.icon} ${selProduct.name}` : 'Chưa chọn món', { size: 13, bold: true, origin: [0.5, 0.5], align: 'center', wrap: rightW - 20 }));
        controls.add(txt(this, rightX + rightW / 2, panelTop + 54, `Còn trong kho: ${available} món`, { size: 11, color: HEX.muted, origin: [0.5, 0.5] }));

        const stepY = panelTop + 90;
        controls.add(new Button(this, rightX + 36, stepY, { w: 44, h: 34, label: '−', color: C.grey, onTap: () => { qty = Math.max(1, qty - 1); draw(); } }).setEnabled(qty > 1));
        controls.add(txt(this, rightX + rightW / 2, stepY, `${qty}`, { size: 16, bold: true, origin: [0.5, 0.5] }));
        controls.add(new Button(this, rightX + rightW - 36, stepY, { w: 44, h: 34, label: '+', color: C.grey, onTap: () => { qty = Math.min(available, qty + 1); draw(); } }).setEnabled(qty < available));

        controls.add(txt(this, rightX + rightW / 2, panelTop + 130, `Phí xe: ${formatMoney(500 + qty * 100)}`, { size: 12, bold: true, color: '#b7791f', origin: [0.5, 0.5] }));

        controls.add(new Button(this, rightX + rightW / 2, panelTop + 172, { w: rightW - 28, h: 38, label: 'Gửi xe hàng', color: C.green, size: 13, onTap: () => {
          const result = sendBranchShipment(s, toStoreId, selected, qty);
          if (!result.ok) { toast(this, result.reason === 'money' ? 'Không đủ tiền trả phí xe' : result.reason === 'stock' ? 'Kho không đủ hàng' : 'Chọn mặt hàng hợp lệ'); return; }
          persist(); rows.clear(); overlay.destroy(); toast(this, `Xe hàng khởi hành · ${formatMoney(result.fee)}`); this.render();
        } }).setEnabled(available > 0));

        controls.add(new Button(this, rightX + rightW / 2, panelTop + panelH - 34, { w: 90, h: 30, label: 'Đóng', size: 11, color: C.grey, onTap: () => { rows.clear(); overlay.destroy(); } }));
      } else {
        controls.add(txt(this, W / 2, H - 210, `Số lượng: ${qty} / ${available}   ·   Phí xe: ${formatMoney(500 + qty * 100)}`, { size: 11, bold: true, origin: [0.5, 0.5], align: 'center' }));
        controls.add(new Button(this, 72, H - 170, { w: 66, h: 38, label: '−', color: C.grey, onTap: () => { qty = Math.max(1, qty - 1); draw(); } }).setEnabled(qty > 1));
        controls.add(new Button(this, W - 72, H - 170, { w: 66, h: 38, label: '+', color: C.grey, onTap: () => { qty = Math.min(available, qty + 1); draw(); } }).setEnabled(qty < available));
        controls.add(new Button(this, W / 2, H - 118, { w: 180, h: 42, label: 'Gửi xe hàng', color: C.green, onTap: () => {
          const result = sendBranchShipment(s, toStoreId, selected, qty);
          if (!result.ok) { toast(this, result.reason === 'money' ? 'Không đủ tiền trả phí xe' : result.reason === 'stock' ? 'Kho không đủ hàng' : 'Chọn mặt hàng hợp lệ'); return; }
          persist(); rows.clear(); overlay.destroy(); toast(this, `Xe hàng khởi hành · ${formatMoney(result.fee)}`); this.render();
        } }).setEnabled(available > 0));
        controls.add(new Button(this, W / 2, H - 66, { w: 100, h: 34, label: 'Đóng', color: C.grey, onTap: () => { rows.clear(); overlay.destroy(); } }));
      }
    };
    draw();
  }
}
