import Phaser from 'phaser';
import {
  addRule, autoRestockUnlocked, lockPlanogram, moveRule, removeRule, stockLevel, suggestRule,
} from '../core/autorestock';
import { DATA, hasFeature, product, supplier } from '../core/data';
import { formatMoney, unlockedProducts, type RestockRule } from '../core/state';
import { supplierUnlocked } from '../core/stock';
import { G, persist } from '../game';
import { productIcon } from '../ui/art';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { play } from '../ui/sound';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn Quy tắc: "Khi tồn [món] dưới X thì nhập Y từ [mối]" và chốt sơ đồ kệ cho nhân viên kho. */
export class RulesScene extends Phaser.Scene {
  private list!: ScrollArea;

  constructor() {
    super('Rules');
  }

  create(): void {
    setupCamera(this);
    pageFrame(this, '⚙️ Quy tắc tự động', () => { persist(); this.scene.start('Morning'); }, 'Chạy mỗi buổi sáng theo thứ tự ưu tiên');
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    this.render();
  }

  private render(): void {
    const s = G.state;
    this.list.clear();
    let y = 4;
    if (hasFeature(s.level, 'stocker')) y = this.planogramCard(y);
    if (!autoRestockUnlocked(s)) {
      this.list.add(txt(this, W / 2, y + 30, `Đặt hàng tự động mở ở level ${DATA.levels.levels.find((l) => l.features?.includes('autorestock'))?.level}.`, { size: 13, color: HEX.muted, origin: [0.5, 0.5] }));
      this.list.setHeight(y + 80);
      return;
    }
    this.list.add(txt(this, 14, y, `Quy tắc (${s.rules.length}) — trên cùng ưu tiên nhất khi thiếu tiền`, { size: 12, bold: true }));
    y += 22;
    s.rules.forEach((rule, i) => { y = this.ruleCard(rule, i, y); });
    y += 8;
    this.list.add(txt(this, 14, y, 'Thêm quy tắc (gợi ý theo bán trung bình 7 ngày)', { size: 12, bold: true }));
    y += 22;
    const has = new Set(s.rules.map((r) => r.productId));
    for (const p of unlockedProducts(s.level, s)) {
      if (p.behindCounter || has.has(p.id)) continue;
      const sug = suggestRule(s, p.id);
      this.list.add(card(this, 8, y, W - 16, 44));
      this.list.add(productIcon(this, 30, y + 22, p, 28));
      this.list.add(txt(this, 52, y + 6, p.name, { size: 12, bold: true }));
      this.list.add(txt(this, 52, y + 24, `Còn ${stockLevel(s, p.id)} · gợi ý dưới ${sug.threshold} thì nhập ${sug.qty}`, { size: 10, color: HEX.muted }));
      this.list.add(new Button(this, W - 50, y + 22, {
        w: 70, h: 30, label: '+ Thêm', size: 11, color: C.green,
        onTap: this.list.guard(() => {
          addRule(s, { productId: p.id, threshold: sug.threshold, qty: sug.qty, supplierId: 'co_tu' });
          play('pick');
          persist();
          this.render();
        }),
      }));
      y += 48;
    }
    this.list.setHeight(y + 20);
  }

  private planogramCard(y: number): number {
    const s = G.state;
    this.list.add(card(this, 8, y, W - 16, 74, 0xe8f1fb));
    this.list.add(txt(this, 18, y + 8, '📐 Sơ đồ kệ', { size: 14, bold: true }));
    const status = s.planogram ? 'Đã chốt. Nhân viên kho/bổ sung kệ bày theo sơ đồ này.' : 'Chưa chốt. Bày kệ như ý rồi bấm "Chốt" để nhân viên làm theo.';
    this.list.add(txt(this, 18, y + 28, status, { size: 10, color: HEX.muted, wrap: W - 150 }));
    this.list.add(new Button(this, W - 66, y + 36, {
      w: 104, h: 34, label: s.planogram ? '📐 Chốt lại' : '📐 Chốt', size: 12, color: C.blue,
      onTap: this.list.guard(() => {
        lockPlanogram(s);
        play('pick');
        persist();
        toast(this, 'Đã chốt sơ đồ kệ theo cách bày hiện tại');
        this.render();
      }),
    }));
    return y + 82;
  }

  private ruleCard(rule: RestockRule, index: number, y: number): number {
    const s = G.state;
    const p = product(rule.productId);
    const h = 104;
    const sp = supplier(rule.supplierId);
    this.list.add(card(this, 8, y, W - 16, h - 6));
    this.list.add(productIcon(this, 30, y + 22, p, 28));
    this.list.add(txt(this, 52, y + 8, `${index + 1}. ${p.name}`, { size: 13, bold: true }));
    this.list.add(txt(this, 52, y + 26, `Đang có ${stockLevel(s, p.id)} (kho + kệ + chờ giao)`, { size: 10, color: HEX.muted }));
    const step = (field: 'threshold' | 'qty', delta: number) => this.list.guard(() => {
      rule[field] = Math.max(field === 'qty' ? 1 : 0, rule[field] + delta);
      persist();
      this.render();
    });
    const row = y + 56;
    this.list.add(txt(this, 18, row, 'Dưới', { size: 11, origin: [0, 0.5] }));
    this.list.add(new Button(this, 64, row, { w: 26, h: 26, label: '−', size: 14, color: C.woodLight, onTap: step('threshold', -1) }));
    this.list.add(txt(this, 92, row, String(rule.threshold), { size: 13, bold: true, origin: [0.5, 0.5] }));
    this.list.add(new Button(this, 120, row, { w: 26, h: 26, label: '+', size: 14, color: C.green, onTap: step('threshold', 1) }));
    this.list.add(txt(this, 140, row, 'nhập', { size: 11, origin: [0, 0.5] }));
    this.list.add(new Button(this, 186, row, { w: 26, h: 26, label: '−', size: 14, color: C.woodLight, onTap: step('qty', -5) }));
    this.list.add(txt(this, 216, row, String(rule.qty), { size: 13, bold: true, origin: [0.5, 0.5] }));
    this.list.add(new Button(this, 246, row, { w: 26, h: 26, label: '+', size: 14, color: C.green, onTap: step('qty', 5) }));
    const other = DATA.suppliers.find((x) => x.id !== rule.supplierId && supplierUnlocked(s, x.id));
    this.list.add(new Button(this, W - 50, row, {
      w: 76, h: 26, label: `${sp.icon} ${sp.name.replace('Đại lý ', '')}`, size: 10, color: C.wood,
      onTap: this.list.guard(() => {
        if (!other) { toast(this, 'Chưa mở mối sỉ khác'); return; }
        rule.supplierId = other.id;
        persist();
        this.render();
      }),
    }));
    const by = y + 84;
    this.list.add(txt(this, 18, by, `≈ ${formatMoney(p.cost * rule.qty)}/lần`, { size: 10, color: HEX.muted, origin: [0, 0.5] }));
    this.list.add(new Button(this, W - 150, by, { w: 44, h: 22, label: '▲', size: 11, color: C.blue, onTap: this.list.guard(() => { moveRule(s, rule.productId, -1); persist(); this.render(); }) }).setEnabled(index > 0));
    this.list.add(new Button(this, W - 100, by, { w: 44, h: 22, label: '▼', size: 11, color: C.blue, onTap: this.list.guard(() => { moveRule(s, rule.productId, 1); persist(); this.render(); }) }).setEnabled(index < s.rules.length - 1));
    this.list.add(new Button(this, W - 44, by, { w: 56, h: 22, label: 'Xóa', size: 11, color: C.red, onTap: this.list.guard(() => { removeRule(s, rule.productId); persist(); this.render(); }) }));
    return y + h;
  }
}
