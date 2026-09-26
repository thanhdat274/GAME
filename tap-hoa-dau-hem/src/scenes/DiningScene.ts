import Phaser from 'phaser';
import { DATA } from '../core/data';
import { cleanDiningTable, diningTableName, diningTableStatus, ensureDiningTables, serveExtraDiningOrder, tickDining } from '../core/dining';
import { G, persist } from '../game';
import { pageFrame, card } from '../ui/page';
import { Button, dialog, toast } from '../ui/widgets';
import { C, HEX, W, setupCamera, txt } from '../ui/theme';

export class DiningScene extends Phaser.Scene {
  constructor() { super('Dining'); }

  create(): void {
    setupCamera(this);
    pageFrame(this, '🪑 Khu ăn tại chỗ', () => this.close(), 'Khách ăn xong sẽ để lại bàn cần dọn.');
    this.render();
  }

  update(_time: number, delta: number): void {
    if (tickDining(G.state, delta / 1000).length) {
      persist();
      this.scene.restart();
    }
  }

  private render(): void {
    ensureDiningTables(G.state);
    const tables = G.state.diningTables;
    if (!tables.length) {
      txt(this, W / 2, 180, 'Chưa có bàn ăn. Mở Đất E hoặc F rồi đặt bàn trong mục Sắp xếp.', { size: 13, color: HEX.muted, origin: [0.5, 0.5], align: 'center', wrap: W - 44 });
      return;
    }
    tables.slice(0, 5).forEach((table, index) => {
      const y = 96 + index * 104;
      card(this, 10, y, W - 20, 92, table.status === 'dirty' ? 0xf9e3dd : table.status === 'occupied' ? 0xe5f0f3 : C.panel);
      txt(this, 22, y + 15, diningTableName(G.state, table.fixtureUid), { size: 13, bold: true });
      txt(this, 22, y + 39, diningTableStatus(table), { size: 10, color: table.status === 'dirty' ? HEX.red : HEX.muted, wrap: W - 44 });
      if (table.status === 'dirty') {
        new Button(this, W - 66, y + 72, { w: 110, h: 30, label: '🧹 Dọn bàn', size: 11, color: C.green, onTap: () => {
          if (cleanDiningTable(G.state, table.fixtureUid)) { persist(); this.scene.restart(); }
        } });
      } else if (table.status === 'occupied') {
        new Button(this, W - 66, y + 72, { w: 110, h: 30, label: '🍽 Gọi thêm', size: 11, color: C.blue, onTap: () => this.offerExtras(table.fixtureUid) })
          .setEnabled(table.extraOrders < DATA.balance.dining.maxExtraOrders && G.state.counter.some((slot) => slot.productId && slot.qty > 0 && DATA.recipes.some((recipe) => recipe.output === slot.productId)));
      }
    });
  }

  private offerExtras(fixtureUid: number): void {
    const options = G.state.counter.flatMap((slot, index) => slot.productId && slot.qty > 0 && DATA.recipes.some((recipe) => recipe.output === slot.productId)
      ? [{ index, productId: slot.productId }] : []);
    if (!options.length) { toast(this, 'Quầy chưa có món ăn hoặc nước pha sẵn.'); return; }
    dialog(this, {
      icon: '🍽️', title: 'Khách muốn gọi thêm', body: 'Chọn món đang có ở quầy để phục vụ.',
      buttons: [
        ...options.slice(0, 3).map(({ index, productId }) => ({
          label: `${DATA.products.find((item) => item.id === productId)?.name ?? productId} ×${G.state.counter[index].qty}`,
          color: C.green,
          onTap: () => {
            if (serveExtraDiningOrder(G.state, fixtureUid, index)) { persist(); this.scene.restart(); }
            else toast(this, 'Bàn không còn nhận gọi thêm hoặc món đã hết.');
          },
        })),
        { label: 'Để sau', color: C.grey },
      ],
    });
  }

  private close(): void {
    const shop = this.scene.get('Shop') as Phaser.Scene & { resumeFromDining?: () => void };
    shop.resumeFromDining?.();
    this.scene.stop('Dining');
    this.scene.resume('Shop');
  }
}
