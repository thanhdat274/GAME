import Phaser from 'phaser';
import { DATA, product } from '../core/data';
import { prepareRecipe, recipeIngredients, setRecipeActive } from '../core/recipes';
import { formatMoney, warehouseTotals } from '../core/state';
import { G, persist } from '../game';
import { PAGE_TOP, ScrollArea, card, pageFrame } from '../ui/page';
import { Button, toast } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

export class KitchenScene extends Phaser.Scene {
  private list!: ScrollArea;
  constructor() { super('Kitchen'); }
  create(): void {
    setupCamera(this);
    pageFrame(this, '🍳 Bếp & quầy nước', () => { persist(); this.scene.start('Morning'); }, `Kho · ${formatMoney(G.state.money)}`);
    this.list = new ScrollArea(this, PAGE_TOP + 4, H - 8);
    this.render();
  }
  private render(): void {
    this.list.clear();
    const s = G.state;
    let y = 6;
    this.list.add(txt(this, 14, y, 'SỔ CÔNG THỨC', { size: 12, bold: true, color: HEX.muted })); y += 22;
    this.list.add(txt(this, 14, y, 'Bật món trong menu để khách có thể gọi. Chế biến dùng nguyên liệu trong kho.', { size: 10, color: HEX.muted, wrap: W - 28 })); y += 40;
    for (const recipe of DATA.recipes) {
      const output = product(recipe.output);
      const locked = s.level < recipe.unlockLevel;
      const station = s.fixtures.some((f) => f.type === recipe.station);
      const reqs = recipeIngredients(recipe);
      const totals = warehouseTotals(s);
      const enough = Object.entries(reqs).every(([id, qty]) => (totals[id] ?? 0) >= qty);
      const active = s.activeRecipes.includes(recipe.id);
      const h = 92;
      this.list.add(card(this, 8, y, W - 16, h - 5, active ? 0xe8f5e9 : C.panel));
      this.list.add(txt(this, 18, y + 7, `${recipe.category === 'food' ? '🍽️' : '🥤'} ${recipe.name}`, { size: 13, bold: true }));
      this.list.add(txt(this, 18, y + 28, Object.entries(reqs).map(([id, qty]) => `${product(id).icon}${qty} ${product(id).name}`).join(' · '), { size: 9, color: HEX.muted, wrap: W - 38 }));
      const status = locked ? `Mở ở L${recipe.unlockLevel}` : !station ? `Cần ${DATA.furniture.find((f) => f.id === recipe.station)?.name ?? recipe.station}` : !enough ? 'Thiếu nguyên liệu trong kho' : active ? `${output.icon} Có ${s.counter.filter((x) => x.productId === output.id).reduce((n, x) => n + x.qty, 0)} phần ở quầy` : 'Sẵn sàng mở bán';
      this.list.add(txt(this, 18, y + 50, status, { size: 10, color: locked || !station || !enough ? HEX.red : HEX.green }));
      this.list.add(new Button(this, W - 57, y + 30, { w: 78, h: 31, label: active ? 'Tắt món' : 'Mở bán', size: 10, color: active ? C.wood : C.green, onTap: this.list.guard(() => {
        if (locked || !station) return;
        setRecipeActive(s, recipe.id, !active); persist(); this.render();
      }) }).setEnabled(!locked && station));
      this.list.add(new Button(this, W - 57, y + 65, { w: 78, h: 27, label: 'Chế biến', size: 10, color: C.blue, onTap: this.list.guard(() => {
        if (locked || !station || !enough || !active) { toast(this, 'Mở bán món và chuẩn bị đủ nguyên liệu trước'); return; }
        if (!s.counter.some((slot) => slot.productId === output.id || slot.productId === null || slot.qty <= 0)) { toast(this, 'Quầy đã đầy · bán bớt hoặc dọn một ô quầy trước'); return; }
        this.scene.start('Cook', { recipeId: recipe.id });
      }) }).setEnabled(!locked && station && enough && active));
      y += h;
    }
    this.list.setHeight(y + 16);
  }
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
  private mode: 'timing' | 'pour' | 'sequence' | 'boil' | 'mix' = 'timing';
  private controls: Button[] = [];
  private progress = 0;
  private elapsed = 0;
  private waiting = false;
  private finished = false;
  private mixOrder: string[] = [];
  private variantId: string | undefined;
  private variantButtons: Button[] = [];
  constructor() { super('Cook'); }
  create(data: { recipeId: string }): void {
    setupCamera(this);
    this.recipeId = data.recipeId;
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
    const recipe = DATA.recipes.find((r) => r.id === this.recipeId);
    if (!recipe) { this.scene.start('Kitchen'); return; }
    this.mode = recipe.id === 'xuc_xich_nuong' ? 'timing'
      : recipe.id === 'mi_ly' ? 'pour'
        : recipe.id === 'banh_mi_trung' ? 'sequence'
          : recipe.id === 'trung_luoc' ? 'boil'
            : 'mix';
    this.mixOrder = Object.keys(recipe.ingredients);
    pageFrame(this, `👩‍🍳 ${recipe.name}`, () => this.scene.start('Kitchen'), this.mode === 'mix' ? 'Chạm nguyên liệu đúng thứ tự rồi hoàn tất' : 'Thao tác chế biến');
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
    if (this.mode === 'mix') return `Thêm ${product(this.mixOrder[this.step] ?? recipe.output).name} · bước ${this.step + 1}/${this.mixOrder.length}`;
    return recipe.steps[this.step] ?? 'Canh kim nướng';
  }
  private drawMeter(): void {
    this.add.rectangle(this.meterX + this.meterW / 2, H * 0.58, this.meterW, 24, 0x543c2e).setStrokeStyle(2, 0x2b1d14);
  }
  private renderVariantControls(variants: NonNullable<(typeof DATA.recipes)[number]['variants']>): void {
    txt(this, W / 2, 91, 'TÙY CHỈNH LY', { size: 10, bold: true, color: HEX.muted, origin: [0.5, 0.5] });
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
    const made = prepareRecipe(G.state, this.recipeId, quality, this.variantId);
    this.prompt.setText(made.ok ? `${product(made.output).icon} ${result}. Đã đưa vào quầy.` : made.reason === 'space' ? 'Quầy đã đầy.' : 'Thiếu nguyên liệu hoặc thiết bị.');
    persist();
    new Button(this, W / 2, H * 0.83, { w: 150, h: 42, label: 'Về sổ món', size: 13, color: C.blue, onTap: () => this.scene.start('Kitchen') });
  }
}
