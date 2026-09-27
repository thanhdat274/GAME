import Phaser from 'phaser';
import { product } from '../core/data';
import {
  cancelInternalOrder, internalFee, internalSuppliers, orderStatusLabel, placeInternalOrder, setRecurringOrder, type InternalSupplier,
} from '../core/internalSupply';
import { activeShopType } from '../core/shopTypes';
import { formatMoney } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn "Hàng nhà mình": đặt hàng từ các tiệm khác trong chuỗi (một lần hoặc mỗi ngày) và theo dõi đơn nội bộ. */
export class InternalScene extends Phaser.Scene {
  private list!: ScrollArea;
  private back = 'Morning';
  /** Số lượng đang chọn theo mối → mặt hàng. */
  private qty: Record<string, Record<string, number>> = {};
  constructor() { super('Internal'); }

  create(data: { back?: string } = {}): void {
    setupCamera(this);
    this.back = data.back ?? 'Morning';
    this.qty = {};
    pageFrame(this, '🏪 Hàng nhà mình', () => { persist(); this.scene.start(this.back); }, `Tiền chung · ${formatMoney(G.state.money)}`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    this.render();
  }

  private render(): void {
    this.list.clear();
    const s = G.state;
    let y = 6;
    const flowNote = activeShopType(s).def.sim === 'production'
      ? 'Nguyên liệu giao từ kho tạp hóa tới kho tiệm xôi sáng hôm sau, giữ hạn dùng.'
      : 'Xôi gói giao từ tiệm xôi vào ô sau quầy tạp hóa, bán gọi món trong ngày.';
    this.list.add(txt(this, 14, y, `Mỗi tiệm có kho và quầy riêng. ${flowNote} Hàng nội bộ tính theo giá vốn, chỉ trả phí xe.`, { size: 10, color: HEX.muted, wrap: W - 28 }));
    y += 36;
    const suppliers = internalSuppliers(s);
    if (!suppliers.length) {
      this.list.add(txt(this, W / 2, y + 30, 'Chuỗi chưa có tiệm nào cung cấp hàng cho tiệm này.', { size: 12, color: HEX.muted, origin: [0.5, 0.5], wrap: W - 40, align: 'center' }));
      y += 70;
    }
    for (const sp of suppliers) y = this.renderSupplier(sp, y);
    if (activeShopType(s).def.sim === 'production') y = this.renderPriorityToggle(y);
    y = this.renderOrders(y);
    this.list.setHeight(y + 16);
  }

  private renderSupplier(sp: InternalSupplier, y: number): number {
    const s = G.state;
    const picks = (this.qty[sp.id] ??= {});
    const step = 1;
    const rec = s.recurringOrders.find((r) => r.fromStoreId === sp.storeId && r.toStoreId === s.activeStoreId);
    const recurringSummary = rec?.active
      ? `Mỗi ngày: ${Object.entries(rec.items).map(([id, n]) => `${n} ${product(id).name.toLowerCase()}`).join(', ')}`
      : '';
    const recurringLines = recurringSummary ? Math.max(1, Math.ceil(recurringSummary.length / 68)) : 0;
    const footerHeight = recurringSummary ? 62 + recurringLines * 14 : 58;
    const h = 56 + sp.items.length * 40 + footerHeight;
    this.list.add(card(this, 8, y, W - 16, h, 0xfff8e1));
    this.list.add(txt(this, 18, y + 8, `🏪 ${sp.name}`, { size: 14, bold: true }));
    const note = sp.kind === 'made'
      ? `Làm theo đơn · giao 7h sáng mai · thợ làm ~${sp.capacityPerDay ?? 0} phần/ngày${sp.capacityPerDay ? '' : ' (chưa có thợ)'}`
      : 'Lấy từ kho · xe tới sáng mai · giữ hạn dùng';
    this.list.add(txt(this, 18, y + 30, note, { size: 10, color: sp.kind === 'made' && !sp.capacityPerDay ? HEX.red : HEX.muted, wrap: W - 40 }));
    let ry = y + 56;
    for (const item of sp.items) {
      const p = product(item.productId);
      const q = picks[item.productId] ?? 0;
      this.list.add(txt(this, 18, ry + 4, `${p.icon} ${p.name}`, { size: 12, bold: true }));
      this.list.add(txt(this, 18, ry + 21, `${sp.kind === 'made' ? 'Làm được' : 'Kho còn'} ${item.available} · vốn ${formatMoney(p.cost)}`, { size: 9, color: HEX.muted }));
      this.list.add(new Button(this, W - 132, ry + 16, { w: 30, h: 28, label: '−', size: 15, color: C.red, onTap: this.list.guard(() => { picks[item.productId] = Math.max(0, q - step); this.render(); }) }).setEnabled(q > 0));
      this.list.add(txt(this, W - 94, ry + 16, String(q), { size: 14, bold: true, origin: [0.5, 0.5] }));
      this.list.add(new Button(this, W - 56, ry + 16, { w: 30, h: 28, label: '+', size: 15, color: C.green, onTap: this.list.guard(() => {
        const cap = sp.kind === 'stock' ? item.available : Infinity;
        picks[item.productId] = Math.min(cap, q + step);
        this.render();
      }) }));
      ry += 40;
    }
    const total = Object.values(picks).reduce((n, v) => n + v, 0);
    this.list.add(txt(this, 18, ry - 2, total ? `Phí xe ${formatMoney(internalFee(total))}` : 'Chọn số lượng rồi đặt', { size: 10, color: HEX.muted }));
    this.list.add(new Button(this, 76, ry + 34, { w: 120, h: 32, label: 'Đặt một lần', size: 11, color: C.blue, onTap: this.list.guard(() => {
      const result = placeInternalOrder(s, sp.storeId, s.activeStoreId, picks);
      if (!result.ok) {
        toast(this, result.reason === 'money' ? 'Không đủ tiền trả phí xe' : result.reason === 'stock' ? 'Kho tiệm kia hết hàng' : 'Chọn số lượng trước');
        return;
      }
      this.qty[sp.id] = {};
      persist();
      toast(this, sp.kind === 'made' ? 'Đã đặt · giao 7h sáng mai' : 'Xe hàng khởi hành · tới sáng mai');
      this.render();
    }) }).setEnabled(total > 0));
    const recLabel = rec?.active ? '⏹ Tắt đặt mỗi ngày' : '🔁 Đặt mỗi ngày';
    this.list.add(new Button(this, W - 90, ry + 34, { w: 140, h: 32, label: recLabel, size: 11, color: rec?.active ? C.red : C.green, onTap: this.list.guard(() => {
      if (rec?.active) setRecurringOrder(s, sp.storeId, s.activeStoreId, {}, false);
      else if (!total && !rec) { toast(this, 'Chọn số lượng cho mỗi ngày trước'); return; }
      else setRecurringOrder(s, sp.storeId, s.activeStoreId, total ? picks : rec!.items, true);
      persist();
      this.render();
    }) }));
    if (rec?.active) this.list.add(txt(this, 18, ry + 54, recurringSummary, { size: 9, color: HEX.green, wrap: W - 40 }));
    return y + h + 8;
  }

  private renderPriorityToggle(y: number): number {
    const s = G.state;
    const on = s.settings.xoiOrderPriority !== false;
    this.list.add(card(this, 8, y, W - 16, 48, C.panel));
    this.list.add(txt(this, 18, y + 8, 'Thợ nấu xôi làm đơn nội bộ trước hàng bán lẻ', { size: 11, wrap: W - 130 }));
    this.list.add(new Button(this, W - 56, y + 24, { w: 78, h: 30, label: on ? 'Bật' : 'Tắt', size: 11, color: on ? C.green : C.grey, onTap: this.list.guard(() => {
      s.settings.xoiOrderPriority = !on;
      persist();
      this.render();
    }) }));
    return y + 56;
  }

  private renderOrders(y: number): number {
    const s = G.state;
    const orders = s.internalOrders.filter((o) => o.toStoreId === s.activeStoreId || o.fromStoreId === s.activeStoreId).slice(-12).reverse();
    this.list.add(txt(this, 14, y + 4, 'ĐƠN NỘI BỘ GẦN ĐÂY', { size: 12, bold: true, color: HEX.muted }));
    y += 26;
    if (!orders.length) {
      this.list.add(txt(this, 18, y, 'Chưa có đơn nào.', { size: 11, color: HEX.muted }));
      return y + 24;
    }
    for (const o of orders) {
      const incoming = o.toStoreId === s.activeStoreId;
      const other = s.stores.find((st) => st.id === (incoming ? o.fromStoreId : o.toStoreId))?.name ?? '?';
      const lines = Object.entries(o.items).map(([id, n]) => `${product(id).name} ${o.filled[id] ?? 0}/${n}`).join(' · ');
      this.list.add(card(this, 8, y, W - 16, 56, o.status === 'short' ? 0xf9e3dd : C.panel));
      this.list.add(txt(this, 18, y + 6, `${incoming ? '⬅️ Từ' : '➡️ Cho'} ${other} · ngày ${o.dueDay} · ${orderStatusLabel(o)}`, { size: 11, bold: true, wrap: W - 110 }));
      this.list.add(txt(this, 18, y + 26, lines + (o.shortReason && o.status === 'short' ? ` · ${o.shortReason}` : ''), { size: 9, color: HEX.muted, wrap: W - 110 }));
      if (incoming && o.status === 'pending' && !Object.values(o.filled).some((n) => n > 0)) {
        this.list.add(new Button(this, W - 50, y + 28, { w: 66, h: 28, label: 'Hủy', size: 10, color: C.grey, onTap: this.list.guard(() => {
          if (cancelInternalOrder(s, o.id)) { persist(); this.render(); }
        }) }));
      }
      y += 62;
    }
    return y;
  }
}
