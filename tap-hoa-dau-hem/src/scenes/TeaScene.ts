import Phaser from 'phaser';
import { product, recipeById, type RecipeDef } from '../core/data';
import { missingIngredients, prepareRecipe, recipeRequirements } from '../core/recipes';
import { counterStockText } from '../core/customCups';
import { TEA_BAR_GROUPS, barGroupOf, teaOrder } from '../core/teaBar';
import { activeShopType } from '../core/shopTypes';
import { formatMoney, unlockedProducts, warehouseQty } from '../core/state';
import { G, persist } from '../game';
import { productTexture } from '../ui/art';
import { ScrollArea, pageFrame } from '../ui/page';
import { Button } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

interface TeaData { recipeId?: string; fromShop?: boolean; fromKitchen?: boolean; kitchenFromShop?: boolean }

/**
 * Mini-game pha ly trà sữa: các ô nguyên liệu xếp theo quầy (trà, siro, topping, sữa/đường, foam, đá) với số lượng tồn;
 * chạm đúng thứ tự công thức (kể cả nguyên liệu của tùy chọn đang chọn), chạm sai làm ly kém ngon hơn.
 */
export class TeaScene extends Phaser.Scene {
  private data0: TeaData = {};
  private recipe!: RecipeDef;
  private variantId: string | undefined;
  private order: string[] = [];
  private step = 0;
  private missed = 0;
  private done = false;
  private used = new Map<string, number>();
  private prompt!: Phaser.GameObjects.Text;
  private chips!: Phaser.GameObjects.Text;
  private list!: ScrollArea;
  private tiles = new Map<string, { button: Button; badge: Phaser.GameObjects.Text }>();
  private variantButtons: { id: string | undefined; button: Button }[] = [];
  private finishButton: Button | null = null;

  constructor() { super('Tea'); }

  create(data: TeaData): void {
    setupCamera(this);
    this.data0 = data;
    this.variantId = undefined;
    this.step = 0;
    this.missed = 0;
    this.done = false;
    this.used = new Map();
    this.tiles = new Map();
    this.variantButtons = [];
    this.finishButton = null;
    const recipe = recipeById(data.recipeId ?? '');
    if (!recipe) { this.leave(); return; }
    this.recipe = recipe;

    const landscape = W > H;
    pageFrame(this, `🧋 ${recipe.name}`, () => this.leave(), 'Chạm nguyên liệu đúng thứ tự để pha ly');
    const variantsY = landscape ? 66 : 76;
    this.renderVariantButtons(variantsY);
    this.chips = txt(this, W / 2, variantsY + 30, '', { size: 10, color: HEX.muted, origin: [0.5, 0], align: 'center', wrap: W - 24 });
    this.prompt = txt(this, W / 2, variantsY + (landscape ? 50 : 66), '', { size: 14, bold: true, origin: [0.5, 0.5], align: 'center', wrap: W - 24 });
    const listTop = variantsY + (landscape ? 68 : 88);
    this.list = new ScrollArea(this, listTop, H - 62);
    this.buildTiles();
    this.rebuildOrder();
  }

  // ---- Tùy chọn (biến thể) ------------------------------------------------------------------

  private renderVariantButtons(y: number): void {
    const options = [{ id: undefined as string | undefined, label: 'Mặc định' }, ...(this.recipe.variants ?? []).map((v) => ({ id: v.id as string | undefined, label: v.name }))];
    const width = Math.min(96, (W - 16) / options.length - 4);
    options.forEach((option, index) => {
      const button = new Button(this, W / 2 + (index - (options.length - 1) / 2) * (width + 4), y, {
        w: width, h: 28, label: option.label, size: 9, color: option.id === this.variantId ? C.green : C.wood,
        onTap: () => this.chooseVariant(option.id),
      });
      this.variantButtons.push({ id: option.id, button });
    });
  }

  private chooseVariant(id: string | undefined): void {
    if (this.step > 0 || this.done) return; // đã bắt đầu pha thì không đổi tùy chọn nữa
    this.variantId = id;
    this.variantButtons.forEach((v) => v.button.setStyle(v.id === id ? C.green : C.wood));
    this.rebuildOrder();
  }

  private variant() {
    return this.recipe.variants?.find((v) => v.id === this.variantId);
  }

  // ---- Thứ tự pha -----------------------------------------------------------------------------

  private rebuildOrder(): void {
    this.order = teaOrder(this.recipe, this.variant());
    this.step = 0;
    this.missed = 0;
    this.used = new Map();
    this.finishButton?.destroy();
    this.finishButton = null;
    this.refresh();
  }

  private missing(): string[] {
    return missingIngredients(G.state, this.recipe, this.variant());
  }

  /** Cập nhật lời nhắc, dải thứ tự, màu và số tồn của các ô. */
  private refresh(): void {
    const lack = this.done ? [] : this.missing();
    const next = this.order[this.step];
    if (this.done) {
      // Đã pha xong: giữ nguyên thông báo kết quả, chỉ cập nhật số tồn và dải thứ tự.
    } else if (lack.length) {
      this.prompt.setColor(HEX.red).setText(`Thiếu ${lack.map((id) => product(id).name).join(', ')}. Chọn tùy chọn khác hoặc nhập thêm hàng.`);
    } else if (this.step >= this.order.length) {
      this.prompt.setColor(HEX.green).setText('Đã đủ nguyên liệu · đậy nắp và lắc!');
    } else {
      this.prompt.setColor(HEX.ink).setText(`Bước ${this.step + 1}/${this.order.length}: thêm ${product(next).icon} ${product(next).name}`);
    }
    const onCounter = counterStockText(G.state.counter, this.recipe.output);
    this.chips.setText(`${this.order.map((id, i) => `${i < this.step ? '✓' : i === this.step ? '▶' : '·'}${product(id).icon}`).join(' ')}\nTrên quầy: ${onCounter || 'chưa có ly nào'}`);
    for (const [id, tile] of this.tiles) {
      const left = warehouseQty(G.state, id) - (this.done ? 0 : this.used.get(id) ?? 0);
      tile.badge.setText(String(Math.max(0, left)));
      tile.button.setStyle(left <= 0 ? C.grey : id === next && !lack.length && !this.done ? C.green : C.wood);
    }
    if (this.step >= this.order.length && !lack.length && !this.finishButton && !this.done) {
      this.finishButton = new Button(this, W / 2, H - 32, { w: 210, h: 44, label: '🧋 ĐẬY NẮP & LẮC', size: 14, color: C.green, onTap: () => this.complete() });
    }
  }

  // ---- Ô nguyên liệu ---------------------------------------------------------------------------

  private buildTiles(): void {
    const level = G.state.level;
    const shop = activeShopType(G.state);
    const ids = new Set<string>(unlockedProducts(level, G.state).filter((p) => shop.allowsProduct(p.id) && !p.recipeOnly).map((p) => p.id));
    // Món của công thức luôn hiện ô (kể cả nguyên liệu mượn từ nhóm khác).
    for (const id of Object.keys(recipeRequirements(this.recipe, undefined))) ids.add(id);
    for (const v of this.recipe.variants ?? []) for (const id of Object.keys(v.extraIngredients ?? {})) ids.add(id);
    const cols = Math.max(3, Math.floor((W - 16) / 68));
    const tileW = Math.min(64, (W - 16) / cols - 4);
    let y = 4;
    for (const group of TEA_BAR_GROUPS) {
      const members = [...ids].filter((id) => barGroupOf(id) === group.id).sort((a, b) => product(a).unlockLevel - product(b).unlockLevel || a.localeCompare(b));
      if (!members.length) continue;
      this.list.add(txt(this, 10, y, group.label, { size: 10, bold: true, color: HEX.muted }));
      y += 16;
      members.forEach((id, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = W / 2 + (col - (cols - 1) / 2) * (tileW + 4);
        const p = product(id);
        const cy = y + row * 50 + 23;
        const button = new Button(this, x, cy, {
          w: tileW, h: 46, label: p.name, size: 8, color: C.wood, sound: false,
          onTap: this.list.guard(() => this.tap(id)),
        });
        button.label.setY(15);
        const badge = txt(this, x + tileW / 2 - 3, cy - 21, '', { size: 9, bold: true, color: HEX.white, stroke: '#3b2618', origin: [1, 0] });
        // Hình pixel art của mặt hàng (16 texel × 1.5 = 24 px logic, tỉ lệ nguyên so với canvas).
        const key = productTexture(this, id);
        const icon = key ? this.add.image(x, cy - 7, key).setScale(1.5) : txt(this, x, cy - 7, p.icon, { size: 16, emoji: true, origin: [0.5, 0.5] });
        this.list.add([button, icon, badge]);
        this.tiles.set(id, { button, badge });
      });
      y += Math.ceil(members.length / cols) * 50 + 8;
    }
    this.list.setHeight(y + 6);
  }

  private tap(id: string): void {
    if (this.done || this.step >= this.order.length || this.missing().length) return;
    const left = warehouseQty(G.state, id) - (this.used.get(id) ?? 0);
    if (left <= 0) return;
    if (id === this.order[this.step]) {
      this.used.set(id, (this.used.get(id) ?? 0) + 1);
      this.step++;
    } else {
      this.missed++;
      this.prompt.setColor(HEX.red).setText(`Sai rồi! Cần ${product(this.order[this.step]).icon} ${product(this.order[this.step]).name}`);
      this.time.delayedCall(700, () => { if (!this.done) this.refresh(); });
      return;
    }
    this.refresh();
  }

  // ---- Hoàn tất -------------------------------------------------------------------------------

  private complete(): void {
    if (this.done) return;
    this.done = true;
    this.finishButton?.destroy();
    this.finishButton = null;
    const quality = Math.min(1.1, Math.max(0.75, 1.1 - this.missed * 0.07));
    const made = prepareRecipe(G.state, this.recipe.id, quality, this.variantId);
    const perfect = this.missed === 0;
    if (made.ok) {
      const priceDelta = this.variant()?.priceDelta ?? 0;
      this.prompt.setColor(HEX.green).setText(`${product(made.output).icon} ${perfect ? 'Pha chuẩn · Ngon' : 'Pha chưa chuẩn · Tạm được'}. Đã đưa vào quầy${priceDelta ? ` (giá +${formatMoney(priceDelta)})` : ''}.`);
      persist();
    } else {
      this.prompt.setColor(HEX.red).setText(made.reason === 'order' ? 'Món này pha theo đơn khi khách gọi, không pha sẵn.' : made.reason === 'space' ? 'Quầy đã đầy.' : made.reason === 'station' ? 'Cần có quầy pha trà / máy foam trong tiệm.' : 'Thiếu nguyên liệu hoặc thiết bị.');
    }
    this.refresh();
    new Button(this, W / 2 - 84, H - 32, { w: 150, h: 42, label: 'Pha tiếp', size: 13, color: C.green, onTap: () => this.scene.restart(this.data0) });
    new Button(this, W / 2 + 84, H - 32, { w: 150, h: 42, label: this.data0.fromShop ? 'Về tiệm' : 'Về bếp', size: 13, color: C.blue, onTap: () => this.leave() });
  }

  private leave(): void {
    if (this.data0.fromKitchen) { this.scene.start('Kitchen', { fromShop: this.data0.kitchenFromShop }); return; }
    if (!this.data0.fromShop) { this.scene.start('Kitchen'); return; }
    const shop = this.scene.get('Shop') as Phaser.Scene & { resumeFromRestock?: () => void };
    this.scene.stop('Tea');
    this.scene.resume('Shop');
    shop.resumeFromRestock?.();
  }
}
