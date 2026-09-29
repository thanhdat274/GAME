import Phaser from 'phaser';
import { DATA, product, type RecipeDef } from '../core/data';
import { missingIngredients, prepareRecipe, recipeIngredients, setRecipeActive } from '../core/recipes';
import { assignCounterToOrders, orderRemaining, pendingOrdersFrom } from '../core/internalSupply';
import { activeShopType } from '../core/shopTypes';
import { formatMoney, warehouseQty } from '../core/state';
import {
  COOKED_RICE_ID, cookedPortions, isWarm, soakCapacity, soakLabel, soakStatus, soakingKg, startSoak, steamBatch, warmMinutesLeft,
} from '../core/stickyRice';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, dialog, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Tên ngắn của nguyên liệu trong thẻ công thức (nếp chín là phần đã hấp, không nằm trong kho). */
function ingredientLabel(id: string, qty: number): string {
  if (id === COOKED_RICE_ID) return `🍚${qty} phần nếp chín`;
  return `${product(id).icon}${qty} ${product(id).name}`;
}

/** Chuỗi có ít nhất một tiệm xôi (để gợi ý đặt xôi gói ở tạp hóa). */
function chainHasXoi(): boolean {
  return G.state.stores.some((store) => store.shopType === 'xoi');
}

export class KitchenScene extends Phaser.Scene {
  private list!: ScrollArea;
  /** Mở từ bảng tạm dừng lúc đang bán: đóng thì quay lại tiệm thay vì về buổi sáng. */
  private fromShop = false;
  constructor() { super('Kitchen'); }
  create(data: { fromShop?: boolean } = {}): void {
    setupCamera(this);
    this.fromShop = !!data.fromShop;
    const xoi = activeShopType(G.state).def.id === 'xoi';
    pageFrame(this, xoi ? '🍙 Bếp xôi' : '🍳 Bếp & quầy nước', () => this.close(), `Kho · ${formatMoney(G.state.money)}`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    this.render();
    if (xoi) this.maybeShowXoiTutorial();
  }

  private close(): void {
    persist();
    if (!this.fromShop) { this.scene.start('Morning'); return; }
    const shop = this.scene.get('Shop') as Phaser.Scene & { resumeFromRestock?: () => void };
    this.scene.stop('Kitchen');
    this.scene.resume('Shop');
    shop.resumeFromRestock?.();
  }

  private maybeShowXoiTutorial(): void {
    const s = G.state;
    if (s.tutorialsSeen.includes('xoi_prep')) return;
    s.tutorialsSeen.push('xoi_prep');
    persist();
    const c = DATA.balance.stickyRice;
    dialog(this, {
      icon: '🍙',
      title: 'Nấu xôi thế nào?',
      body: [
        `1. Ngâm nếp trong thùng ngâm ít nhất ${c.soakMinMinutes / 60} giờ (ngâm từ tối hôm trước là vừa). Quá ${c.soakMaxMinutes / 60} giờ nếp bị chua.`,
        `2. Hấp mẻ đã ngâm: mỗi kg ra ${c.portionsPerKg} phần nếp chín. Giữ lửa trong vùng xanh để xôi ngon.`,
        `3. Nếp chín nóng trong ${c.warmMinutes / 60} giờ; nguội thì món chỉ "Tạm được". Cuối ngày phần thừa phải bỏ.`,
        '4. Mở bán món rồi chế biến: múc nếp, rắc topping đúng thứ tự. Món ra quầy để khách gọi.',
      ].join('\n'),
      width: 330,
      buttons: [{ label: 'Hiểu rồi', color: C.green }],
    });
  }

  private render(): void {
    this.list.clear();
    const s = G.state;
    const shop = activeShopType(s);
    let y = 6;
    if (shop.def.id === 'xoi') y = this.renderXoiPrep(y);
    this.list.add(txt(this, 14, y, 'SỔ CÔNG THỨC', { size: 12, bold: true, color: HEX.muted })); y += 22;
    this.list.add(txt(this, 14, y, shop.def.id === 'xoi'
      ? 'Mỗi tiệm có quầy riêng. Món làm ra bày ở quầy xôi để khách gọi; xôi gói có thể chuyển sang đơn tạp hóa.'
      : 'Bật món trong menu để khách có thể gọi. Chế biến dùng nguyên liệu trong kho.', { size: 10, color: HEX.muted, wrap: W - 28 })); y += 40;
    // Món xôi chỉ nấu ở tiệm xôi; tạp hóa muốn bán xôi thì đặt xôi gói từ tiệm xôi.
    if (shop.def.id === 'grocery' && chainHasXoi()) {
      this.list.add(card(this, 8, y, W - 16, 44, 0xfff4d6));
      this.list.add(txt(this, 18, y + 8, '🍙 Muốn bán xôi? Đặt xôi gói từ Tiệm xôi nhà mình ở màn Nhập hàng.', { size: 10, wrap: W - 40 }));
      y += 52;
    }
    for (const recipe of DATA.recipes.filter((r) => shop.allowsRecipe(r.id))) y = this.renderRecipe(recipe, y);
    this.list.setHeight(y + 16);
  }

  private renderRecipe(recipe: RecipeDef, y: number): number {
    const s = G.state;
    const output = product(recipe.output);
    const locked = s.level < recipe.unlockLevel;
    const station = s.fixtures.some((f) => f.type === recipe.station);
    const reqs = recipeIngredients(recipe);
    const missing = missingIngredients(s, recipe);
    const enough = !missing.length;
    const active = s.activeRecipes.includes(recipe.id);
    const internalOrders = recipe.packaged && activeShopType(s).def.id === 'xoi'
      ? pendingOrdersFrom(s, s.activeStoreId).filter((order) => orderRemaining(order, output.id) > 0)
      : [];
    const ready = s.counter.filter((slot) => slot.productId === output.id).reduce((n, slot) => n + slot.qty, 0);
    const needed = internalOrders.reduce((n, order) => n + orderRemaining(order, output.id), 0);
    const h = internalOrders.length ? 120 : 92;
    this.list.add(card(this, 8, y, W - 16, h - 5, active ? 0xe8f5e9 : C.panel));
    this.list.add(txt(this, 18, y + 7, `${recipe.packaged ? '📦' : recipe.category === 'food' ? '🍽️' : '🥤'} ${recipe.name}`, { size: 13, bold: true }));
    this.list.add(txt(this, 18, y + 28, Object.entries(reqs).map(([id, qty]) => ingredientLabel(id, qty)).join(' · '), { size: 9, color: HEX.muted, wrap: W - 118 }));
    const missingText = missing.includes(COOKED_RICE_ID) ? 'Chưa có nếp chín · hấp một mẻ trước' : 'Thiếu nguyên liệu trong kho';
    const stockLabel = activeShopType(s).def.id === 'xoi' ? 'phần ở quầy xôi riêng' : 'phần sau quầy';
    const status = locked ? `Mở ở L${recipe.unlockLevel}` : !station ? `Cần ${DATA.furniture.find((f) => f.id === recipe.station)?.name ?? recipe.station}` : !enough ? missingText : active ? `${output.icon} Có ${ready} ${stockLabel}` : 'Sẵn sàng mở bán';
    this.list.add(txt(this, 18, y + 62, status, { size: 10, color: locked || !station || !enough ? HEX.red : HEX.green, wrap: W - 118 }));
    this.list.add(new Button(this, W - 57, y + 30, { w: 78, h: 31, label: active ? 'Tắt món' : 'Mở bán', size: 10, color: active ? C.wood : C.green, onTap: this.list.guard(() => {
      if (locked || !station) return;
      setRecipeActive(s, recipe.id, !active); persist(); this.render();
    }) }).setEnabled(!locked && station));
    this.list.add(new Button(this, W - 57, y + 65, { w: 78, h: 27, label: 'Chế biến', size: 10, color: C.blue, onTap: this.list.guard(() => {
      if (locked || !station || !enough || !active) { toast(this, 'Mở bán món và chuẩn bị đủ nguyên liệu trước'); return; }
      if (!s.counter.some((slot) => slot.productId === output.id || slot.productId === null || slot.qty <= 0)) { toast(this, 'Quầy đã đầy · bán bớt hoặc dọn một ô quầy trước'); return; }
      this.scene.start(recipe.minigame === 'tea' ? 'Tea' : 'Cook', { recipeId: recipe.id, fromKitchen: true, kitchenFromShop: this.fromShop });
    }) }).setEnabled(!locked && station && enough && active));
    if (internalOrders.length) {
      const transferable = Math.min(ready, needed);
      this.list.add(txt(this, 18, y + 91, `Đơn chờ ${needed} · quầy có ${ready}`, { size: 9, color: HEX.muted, wrap: W - 152 }));
      this.list.add(new Button(this, W - 58, y + 102, { w: 104, h: 26, label: `Giao ${transferable} cho đơn`, size: 9, color: C.wood, onTap: this.list.guard(() => {
        const moved = assignCounterToOrders(s, output.id);
        if (moved) { persist(); toast(this, `Đã chuyển ${moved} phần vào đơn nội bộ`); this.render(); }
      }) }).setEnabled(transferable > 0));
    }
    return y + h;
  }

  /** Bảng chuẩn bị của tiệm xôi: thùng ngâm, xửng hấp, nếp chín và đồng hồ giữ nóng. */
  private renderXoiPrep(y: number): number {
    const s = G.state;
    const cfg = DATA.balance.stickyRice;
    const capacity = soakCapacity(s);
    const soaking = soakingKg(s);
    const rawRice = warehouseQty(s, 'nep');
    this.list.add(txt(this, 14, y, 'CHUẨN BỊ NẾP', { size: 12, bold: true, color: HEX.muted })); y += 22;
    const soakH = 70 + s.soakBatches.length * 34;
    this.list.add(card(this, 8, y, W - 16, soakH, C.panel));
    this.list.add(txt(this, 18, y + 8, `🪣 Thùng ngâm · ${soaking}/${capacity} kg · kho còn ${rawRice} kg nếp`, { size: 12, bold: true, wrap: W - 40 }));
    const free = Math.max(0, capacity - soaking);
    const soakBtn = (x: number, kg: number) => new Button(this, x, y + 46, { w: 92, h: 30, label: `Ngâm ${kg} kg`, size: 11, color: C.green, onTap: this.list.guard(() => {
      const result = startSoak(s, s, kg);
      if (!result.ok) {
        toast(this, result.reason === 'tank' ? 'Cần đặt thùng ngâm trong mục Sắp xếp'
          : result.reason === 'capacity' ? 'Thùng ngâm đã đầy'
            : result.reason === 'rice' ? 'Kho không đủ nếp · nhập thêm ở màn Nhập hàng' : 'Số kg không hợp lệ');
        return;
      }
      persist(); this.render();
    }) }).setEnabled(free >= kg && rawRice >= kg);
    this.list.add(soakBtn(64, 1));
    this.list.add(soakBtn(164, 5));
    this.list.add(txt(this, 216, y + 40, `Ngâm ≥ ${cfg.soakMinMinutes / 60} giờ`, { size: 9, color: HEX.muted }));
    let by = y + 70;
    for (const batch of s.soakBatches) {
      const status = soakStatus(batch, s.day, s.clock);
      this.list.add(txt(this, 20, by + 8, soakLabel(batch, s.day, s.clock), { size: 10, color: status.kind === 'ready' ? HEX.green : status.kind === 'spoiled' ? HEX.red : HEX.ink, wrap: W - 130 }));
      if (status.kind === 'ready') {
        this.list.add(new Button(this, W - 60, by + 14, { w: 84, h: 28, label: '♨️ Hấp', size: 11, color: C.red, onTap: this.list.guard(() => {
          if (!s.fixtures.some((f) => f.type === 'xung_hap')) { toast(this, 'Cần đặt xửng hấp trong mục Sắp xếp'); return; }
          this.scene.start('Cook', { steamBatchId: batch.id, fromKitchen: true, kitchenFromShop: this.fromShop });
        }) }));
      }
      by += 34;
    }
    y += soakH + 8;
    const portions = cookedPortions(s);
    const riceH = 44 + s.cookedRice.length * 22;
    this.list.add(card(this, 8, y, W - 16, riceH, portions ? 0xfff8e1 : C.panel));
    this.list.add(txt(this, 18, y + 8, `🍚 Nếp chín: ${portions} phần`, { size: 12, bold: true }));
    this.list.add(txt(this, 18, y + 26, portions ? 'Mẻ cũ dùng trước · phần thừa bỏ cuối ngày' : 'Chưa hấp mẻ nào hôm nay', { size: 9, color: HEX.muted }));
    s.cookedRice.forEach((rice, i) => {
      const warm = isWarm(rice, s.day, s.clock);
      const left = warmMinutesLeft(rice, s.day, s.clock);
      const quality = rice.quality >= 1 ? 'Ngon' : 'Tạm được';
      const timer = warm ? `còn nóng ${Math.floor(left / 60)}g${String(left % 60).padStart(2, '0')}` : 'đã nguội';
      this.list.add(txt(this, 24, y + 44 + i * 22, `• ${rice.portions} phần · ${quality} · ${timer}`, { size: 10, color: warm ? HEX.green : HEX.red }));
    });
    return y + riceH + 14;
  }
}

/** Hấp một mẻ sau mini-game; trả câu báo kết quả. */
export function finishSteam(batchId: string, quality: number): string {
  const result = steamBatch(G.state, G.state, batchId, quality);
  persist();
  if (result.ok) return `Hấp xong ${result.rice.portions} phần nếp chín${result.rice.quality >= 1 ? ' · Ngon' : ' · Tạm được'}`;
  if (result.reason === 'soaking') return `Nếp chưa ngâm đủ · còn ${Math.ceil((result.minutesLeft ?? 0) / 60)} giờ`;
  return result.reason === 'spoiled' ? 'Mẻ nếp đã bị chua, phải bỏ' : 'Không hấp được mẻ này';
}

export class CookScene extends Phaser.Scene {
  private recipeId = '';
  private step = 0;
  private prompt!: Phaser.GameObjects.Text;
  private marker?: Phaser.GameObjects.Rectangle;
  private target?: Phaser.GameObjects.Rectangle;
  private meterFill?: Phaser.GameObjects.Rectangle;
  private meterX = 38;
  private meterW = W - 76;
  private goodSteps = 0;
  private missedSteps = 0;
  private mode: 'timing' | 'pour' | 'sequence' | 'boil' | 'mix' | 'wrap' | 'steam' = 'timing';
  private controls: Button[] = [];
  private progress = 0;
  private elapsed = 0;
  private waiting = false;
  private finished = false;
  private mixOrder: string[] = [];
  private variantId: string | undefined;
  private variantButtons: Button[] = [];
  /** Mở từ góc nhìn trên xuống lúc đang bán: xong thì quay lại tiệm thay vì về sổ món. */
  private fromShop = false;
  /** Mở từ màn Bếp (có thể đang phủ lên tiệm lúc bán): xong thì về lại màn Bếp. */
  private fromKitchen = false;
  private kitchenFromShop = false;
  /** Mini-game hấp: id mẻ ngâm, mức lửa, thời gian lửa nằm trong vùng xanh, đang giữ nút lửa. */
  private steamBatchId = '';
  private flame = 0.3;
  private inZone = 0;
  private holding = false;
  private flameMarker?: Phaser.GameObjects.Rectangle;
  /** Nút GIỮ LỬA và nhãn của nó, ẩn khi hấp xong để không bị nút quay về đè lên. */
  private fireControls: Phaser.GameObjects.GameObject[] = [];
  /** Bước gói: các hướng cần vuốt. */
  private folds: ('←' | '→' | '↑')[] = [];
  constructor() { super('Cook'); }
  create(data: { recipeId?: string; fromShop?: boolean; steamBatchId?: string; fromKitchen?: boolean; kitchenFromShop?: boolean }): void {
    setupCamera(this);
    this.recipeId = data.recipeId ?? '';
    this.fromShop = !!data.fromShop;
    this.fromKitchen = !!data.fromKitchen;
    this.kitchenFromShop = !!data.kitchenFromShop;
    this.steamBatchId = data.steamBatchId ?? '';
    this.flame = 0.3;
    this.inZone = 0;
    this.holding = false;
    this.flameMarker = undefined;
    this.folds = [];
    // Phaser tái dùng instance scene: reset trạng thái của lượt chế biến trước.
    this.step = 0;
    this.goodSteps = 0;
    this.missedSteps = 0;
    this.progress = 0;
    this.elapsed = 0;
    this.waiting = false;
    this.finished = false;
    this.controls = [];
    this.marker = undefined;
    this.target = undefined;
    this.meterFill = undefined;
    this.variantId = undefined;
    this.variantButtons = [];
    if (this.steamBatchId) { this.createSteam(); return; }
    const recipe = DATA.recipes.find((r) => r.id === this.recipeId);
    if (!recipe) { this.leave(); return; }
    this.mode = recipe.id === 'xuc_xich_nuong' ? 'timing'
      : recipe.id === 'mi_ly' ? 'pour'
        : recipe.id === 'banh_mi_trung' ? 'sequence'
          : recipe.id === 'trung_luoc' ? 'boil'
            : recipe.packaged ? 'wrap'
              : 'mix';
    this.mixOrder = Object.keys(recipe.ingredients);
    pageFrame(this, `👩‍🍳 ${recipe.name}`, () => this.leave(), this.mode === 'mix' || this.mode === 'wrap' ? 'Chạm nguyên liệu đúng thứ tự rồi hoàn tất' : 'Thao tác chế biến');
    this.prompt = txt(this, W / 2, H * 0.36, this.instruction(recipe), { size: 19, bold: true, origin: [0.5, 0.5], wrap: W - 40, align: 'center' });
    if (recipe.variants?.length) this.renderVariantControls(recipe.variants);
    if (this.mode === 'timing') {
      this.drawMeter();
      this.target = this.add.rectangle(W / 2, H * 0.58, 48, 30, 0x74be70, 0.85);
      this.marker = this.add.rectangle(this.meterX, H * 0.58, 10, 34, 0xffd54f).setDepth(2);
      this.moveTarget(recipe.steps.length);
      txt(this, W / 2, H * 0.63, 'Chạm khi kim ở vùng xanh', { size: 11, color: HEX.muted, origin: [0.5, 0.5] });
      this.addControl(W / 2, H * 0.75, 190, 64, 'NƯỚNG · CHẶN KIM', () => this.nextTimingStep(recipe.steps), C.green);
    } else if (this.mode === 'pour') {
      this.drawMeter();
      this.add.rectangle(this.meterX + this.meterW * 0.78, H * 0.58, 3, 30, 0x75d47e).setDepth(1);
      this.meterFill = this.add.rectangle(this.meterX, H * 0.58, 1, 20, 0x53a8ed).setOrigin(0, 0.5).setDepth(1);
      this.addControl(W / 2, H * 0.75, 190, 58, 'RÓT NƯỚC', () => this.pourWater(), C.blue);
    } else if (this.mode === 'boil') {
      this.drawMeter();
      this.add.rectangle(this.meterX + this.meterW * 0.55, H * 0.58, this.meterW * 0.22, 30, 0x74be70, 0.55).setDepth(1);
      this.meterFill = this.add.rectangle(this.meterX, H * 0.58, 1, 18, 0xffa726).setOrigin(0, 0.5).setDepth(2);
      this.addControl(W / 2, H * 0.75, 190, 58, 'VỚT TRỨNG', () => this.finishBoil(), C.green);
    } else if (this.mode === 'sequence') {
      this.renderAssemblyControls();
    } else {
      this.renderMixControls(recipe.steps.at(-1) ?? 'Hoàn tất');
    }
  }
  update(_time: number, delta: number): void {
    if (this.finished) return;
    if (this.mode === 'steam') { this.tickSteam(delta / 1000); return; }
    if (this.mode === 'timing' && this.marker) {
      const x = this.marker.x + delta * 0.18;
      this.marker.x = x > this.meterX + this.meterW ? this.meterX : x;
    } else if (this.mode === 'boil') {
      this.elapsed += delta / 1000;
      this.progress = Math.min(1, this.elapsed / 12);
      if (this.meterFill) this.meterFill.displayWidth = this.meterW * this.progress;
      if (this.elapsed >= 12) this.complete(0.75, 'Trứng bị quá lửa · Tạm được');
    } else if (this.mode === 'pour' && this.waiting) {
      this.elapsed += delta / 1000;
      if (this.elapsed >= 2) this.complete(this.progress >= 0.70 && this.progress <= 0.90 ? 1.1 : 0.78, this.progress <= 1 ? 'Mì đã ngấm nước' : 'Mì bị nhão');
    }
  }
  private moveTarget(total: number): void {
    if (this.target) this.target.x = this.meterX + this.meterW * (((this.step * 2 + 1) % (total * 2)) / (total * 2));
  }
  private instruction(recipe: (typeof DATA.recipes)[number]): string {
    if (this.mode === 'pour') return 'Rót từng nhịp, dừng gần vạch xanh rồi chờ mì chín.';
    if (this.mode === 'boil') return 'Canh thời gian; vớt trong vùng xanh để trứng chín vừa.';
    if (this.mode === 'sequence') return recipe.steps[this.step] ?? 'Hoàn tất món';
    if (this.mode === 'mix' || this.mode === 'wrap') return `Thêm ${product(this.mixOrder[this.step] ?? recipe.output).name} · bước ${this.step + 1}/${this.mixOrder.length}`;
    return recipe.steps[this.step] ?? 'Canh kim nướng';
  }
  private drawMeter(): void {
    this.add.rectangle(this.meterX + this.meterW / 2, H * 0.58, this.meterW, 24, 0x543c2e).setStrokeStyle(2, 0x2b1d14);
  }
  private renderVariantControls(variants: NonNullable<(typeof DATA.recipes)[number]['variants']>): void {
    txt(this, W / 2, 91, 'TÙY CHỌN MÓN', { size: 10, bold: true, color: HEX.muted, origin: [0.5, 0.5] });
    const options = [{ id: undefined, label: 'Mặc định' }, ...variants.map((variant) => ({ id: variant.id, label: variant.name }))];
    const width = Math.min(104, (W - 28) / options.length - 6);
    options.forEach((option, index) => {
      const selected = option.id === this.variantId;
      const button = new Button(this, W / 2 + (index - (options.length - 1) / 2) * (width + 6), 116, {
        w: width, h: 30, label: option.label, size: 10, color: selected ? C.green : C.wood,
        onTap: () => {
          this.variantId = option.id;
          this.variantButtons.forEach((item, i) => item.setStyle(i === index ? C.green : C.wood));
        },
      });
      this.variantButtons.push(button);
    });
  }
  private addControl(x: number, y: number, w: number, h: number, label: string, onTap: () => void, color: number): Button {
    const button = new Button(this, x, y, { w, h, label, size: 14, color, onTap });
    this.controls.push(button);
    return button;
  }
  private clearControls(): void { this.controls.forEach((button) => button.destroy()); this.controls = []; }
  private pourWater(): void {
    if (this.waiting) return;
    this.progress = Math.min(1.1, this.progress + 0.22);
    if (this.meterFill) this.meterFill.displayWidth = this.meterW * Math.min(1, this.progress);
    if (this.progress >= 0.70) {
      this.waiting = true;
      this.elapsed = 0;
      this.prompt.setText('Đã rót nước · chờ mì chín trong 2 giây…');
      this.clearControls();
      this.addControl(W / 2, H * 0.75, 190, 58, 'ĐANG Ủ…', () => undefined, C.grey).setEnabled(false);
    } else {
      this.prompt.setText(`Mực nước ${Math.round(this.progress * 100)}% · tiếp tục tới vạch xanh.`);
    }
  }
  private renderAssemblyControls(): void {
    const recipe = DATA.recipes.find((item) => item.id === this.recipeId)!;
    const names = ['banh_mi', 'trung_ga', 'seal'];
    const labels = ['🥖 Bánh mì', '🥚 Trứng', '🥪 Kẹp lại'];
    const expected = names[this.step];
    this.prompt.setText(`${recipe.steps[this.step] ?? 'Hoàn tất'} · ${this.step + 1}/3`);
    this.clearControls();
    labels.forEach((label, index) => this.addControl(W * (index + 0.5) / 3, H * 0.72, W / 3 - 8, 52, label, () => {
      if (this.finished) return;
      if (names[index] === expected) this.goodSteps++; else this.missedSteps++;
      this.step++;
      if (this.step >= names.length) this.complete(Math.max(0.75, 0.85 + this.goodSteps * 0.1 - this.missedSteps * 0.08), this.missedSteps ? 'Thứ tự chưa chuẩn · Tạm được' : 'Đúng thứ tự · Ngon');
      else this.renderAssemblyControls();
    }, index === this.step ? C.green : C.wood));
  }
  private renderMixControls(finalAction: string): void {
    if (this.step >= this.mixOrder.length && this.mode === 'wrap') { this.startFolding(); return; }
    if (this.step >= this.mixOrder.length) {
      this.prompt.setText(`Đã thêm đủ nguyên liệu · thao tác cuối: ${finalAction}`);
      this.clearControls();
      this.addControl(W / 2, H * 0.72, 210, 58, finalAction.toUpperCase(), () => this.complete(Math.max(0.75, 0.85 + this.goodSteps * 0.1 - this.missedSteps * 0.12), this.missedSteps ? 'Pha chưa đúng thứ tự · Tạm được' : 'Pha đúng công thức · Ngon'), C.green);
      return;
    }
    const expected = this.mixOrder[this.step];
    const ingredient = product(expected);
    this.prompt.setText(`Thêm ${ingredient.icon} ${ingredient.name} · bước ${this.step + 1}/${this.mixOrder.length}`);
    this.clearControls();
    this.mixOrder.forEach((id, index) => {
      const p = product(id);
      this.addControl(W * (index + 0.5) / this.mixOrder.length, H * 0.72, W / this.mixOrder.length - 8, 54, `${p.icon} ${p.name}`, () => {
        if (this.finished) return;
        if (id === expected) { this.goodSteps++; this.step++; }
        else this.missedSteps++;
        this.renderMixControls(finalAction);
      }, id === expected ? C.green : C.wood);
    });
  }
  private nextTimingStep(steps: string[]): void {
    if (this.marker && this.target && Math.abs(this.marker.x - this.target.x) <= 24) this.goodSteps++;
    else this.missedSteps++;
    this.step++;
    if (this.step >= steps.length) {
      const quality = Math.max(0.75, 0.8 + this.goodSteps / Math.max(1, this.step) * 0.4 - this.missedSteps * 0.02);
      this.complete(quality, this.missedSteps ? 'Có bước chưa đều · Tạm được' : 'Nướng đều · Ngon');
      return;
    }
    this.prompt.setText(`${steps[this.step]} · Bước ${this.step + 1}/${steps.length}`);
    if (this.marker) this.marker.x = this.meterX;
    this.moveTarget(steps.length);
  }
  private finishBoil(): void {
    const good = this.progress >= 0.55 && this.progress <= 0.80;
    this.complete(good ? 1.1 : 0.76, good ? 'Trứng chín tới · Ngon' : this.progress < 0.55 ? 'Trứng còn sống · Tạm được' : 'Trứng bị quá lửa · Tạm được');
  }
  private complete(quality: number, result: string): void {
    if (this.finished) return;
    this.finished = true;
    this.clearControls();
    if (this.mode === 'steam') {
      this.holding = false;
      this.fireControls.forEach((item) => item.destroy());
      this.fireControls = [];
      this.prompt.setText(`♨️ ${finishSteam(this.steamBatchId, quality)}`);
    } else {
      // Mẻ nếp chín cũ nhất được dùng trước: xem nó còn nóng không trước khi lấy.
      const oldest = [...G.state.cookedRice].sort((a, b) => a.cookedDay - b.cookedDay || a.cookedMinute - b.cookedMinute)[0];
      const coldRice = !!oldest && !isWarm(oldest, G.state.day, G.state.clock);
      const made = prepareRecipe(G.state, this.recipeId, quality, this.variantId);
      const riceNote = !made.ok || made.quality >= quality - 0.05 ? '' : coldRice ? ' (nếp đã nguội · Tạm được)' : ' (mẻ nếp hấp chưa đều · kém ngon hơn)';
      this.prompt.setText(made.ok ? `${product(made.output).icon} ${result}${riceNote}. Đã đưa vào quầy.` : made.reason === 'space' ? 'Quầy đã đầy.' : 'Thiếu nguyên liệu hoặc thiết bị.');
      persist();
    }
    new Button(this, W / 2, H * 0.83, { w: 150, h: 42, label: this.fromShop ? 'Về tiệm' : 'Về bếp', size: 13, color: C.blue, onTap: () => this.leave() });
  }

  // ---------- Tiệm xôi: hấp nếp (giữ lửa trong vùng xanh) ----------
  private static readonly STEAM_ZONE = [0.45, 0.75] as const;

  private createSteam(): void {
    this.mode = 'steam';
    const batch = G.state.soakBatches.find((item) => item.id === this.steamBatchId);
    pageFrame(this, '♨️ Hấp nếp', () => this.leave(), batch ? `Mẻ ${batch.kg} kg` : 'Mẻ nếp');
    this.prompt = txt(this, W / 2, H * 0.3, 'Giữ nút LỬA để giữ ngọn lửa trong vùng xanh tới khi xôi chín.', { size: 17, bold: true, origin: [0.5, 0.5], wrap: W - 40, align: 'center' });
    // Thanh lửa dọc: vùng xanh ở giữa.
    const barX = W / 2;
    const top = H * 0.4;
    const barH = H * 0.26;
    this.add.rectangle(barX, top + barH / 2, 44, barH, 0x543c2e).setStrokeStyle(2, 0x2b1d14);
    const [lo, hi] = CookScene.STEAM_ZONE;
    this.add.rectangle(barX, top + barH * (1 - (lo + hi) / 2), 44, barH * (hi - lo), 0x74be70, 0.6);
    this.flameMarker = this.add.rectangle(barX, top + barH * (1 - this.flame), 56, 8, 0xff7043).setDepth(2);
    // Thanh độ chín.
    this.add.rectangle(this.meterX + this.meterW / 2, H * 0.72, this.meterW, 24, 0x543c2e).setStrokeStyle(2, 0x2b1d14);
    this.meterFill = this.add.rectangle(this.meterX, H * 0.72, 1, 18, 0xffe082).setOrigin(0, 0.5).setDepth(2);
    txt(this, W / 2, H * 0.72 + 22, 'Độ chín', { size: 10, color: HEX.muted, origin: [0.5, 0.5] });
    const fire = this.add.rectangle(W / 2, H * 0.86, 200, 60, C.red).setStrokeStyle(3, 0x24160d).setInteractive({ useHandCursor: true });
    const fireLabel = txt(this, W / 2, H * 0.86, '🔥 GIỮ LỬA', { size: 16, bold: true, color: HEX.white, origin: [0.5, 0.5] }).setDepth(1);
    this.fireControls = [fire, fireLabel];
    fire.on('pointerdown', () => { this.holding = true; });
    fire.on('pointerup', () => { this.holding = false; });
    fire.on('pointerout', () => { this.holding = false; });
  }

  private tickSteam(dt: number): void {
    const seconds = DATA.balance.stickyRice.steamSeconds;
    this.flame = Math.max(0, Math.min(1, this.flame + (this.holding ? 0.9 : -0.55) * dt));
    const [lo, hi] = CookScene.STEAM_ZONE;
    const inside = this.flame >= lo && this.flame <= hi;
    if (inside) this.inZone += dt;
    this.progress = Math.min(1, this.progress + dt / seconds);
    const top = H * 0.4;
    const barH = H * 0.26;
    if (this.flameMarker) {
      this.flameMarker.y = top + barH * (1 - this.flame);
      this.flameMarker.fillColor = inside ? 0x66bb6a : 0xff7043;
    }
    if (this.meterFill) this.meterFill.displayWidth = this.meterW * this.progress;
    if (this.progress >= 1) {
      const ratio = this.inZone / seconds;
      const quality = Math.max(0.75, Math.min(1.2, 0.7 + ratio * 0.5));
      this.complete(quality, ratio >= 0.6 ? 'Lửa đều · Ngon' : 'Lửa chưa đều · Tạm được');
    }
  }

  // ---------- Tiệm xôi: gói lá / gấp hộp (vuốt theo hướng) ----------
  private startFolding(): void {
    this.clearControls();
    const dirs: ('←' | '→' | '↑')[] = ['←', '→', '↑'];
    this.folds = [0, 1, 2].map((i) => dirs[(this.goodSteps + this.missedSteps + i * 2) % 3]);
    this.step = 0;
    this.renderFold();
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.mode !== 'wrap' || this.finished || this.step >= this.folds.length) return;
      const dx = p.upX - p.downX;
      const dy = p.upY - p.downY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
      this.fold(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? '←' : '→') : dy < 0 ? '↑' : '→');
    });
  }

  private renderFold(): void {
    if (this.step >= this.folds.length) {
      this.complete(Math.max(0.75, 0.85 + this.goodSteps * 0.06 - this.missedSteps * 0.1), this.missedSteps ? 'Gói chưa khéo · Tạm được' : 'Gói gọn gàng · Ngon');
      return;
    }
    const want = this.folds[this.step];
    this.prompt.setText(`Vuốt ${want} để gấp lá · ${this.step + 1}/${this.folds.length}`);
    this.clearControls();
    (['←', '↑', '→'] as const).forEach((dir, i) => this.addControl(W * (i + 0.5) / 3, H * 0.72, W / 3 - 10, 54, dir, () => this.fold(dir), dir === want ? C.green : C.wood));
  }

  private fold(dir: '←' | '→' | '↑'): void {
    if (this.finished) return;
    if (dir === this.folds[this.step]) this.goodSteps++; else this.missedSteps++;
    this.step++;
    this.renderFold();
  }

  private leave(): void {
    if (this.fromKitchen) { this.scene.start('Kitchen', { fromShop: this.kitchenFromShop }); return; }
    if (!this.fromShop) { this.scene.start('Kitchen'); return; }
    const shop = this.scene.get('Shop') as Phaser.Scene & { resumeFromRestock?: () => void };
    this.scene.stop('Cook');
    this.scene.resume('Shop');
    shop.resumeFromRestock?.();
  }
}
