import Phaser from 'phaser';
import { DATA, product } from '../core/data';
import { questDef, questDone } from '../core/quests';
import { startNextDay } from '../core/day';
import { activeShopType } from '../core/shopTypes';
import { startSoak, suggestSoakKg } from '../core/stickyRice';
import { formatClock, formatMoney, formatNumber, type JournalEntry } from '../core/state';
import { G, persist } from '../game';
import { ScrollArea, card } from '../ui/page';
import { dispatchLiveCommand } from '../services/liveShop';
import { play } from '../ui/sound';
import { Button, panel } from '../ui/widgets';
import { C, H, HEX, W, setupCamera, txt } from '../ui/theme';

/** Màn tổng kết cuối ngày: doanh thu, lãi, khách, sao, EXP, lên level. */
export class SummaryScene extends Phaser.Scene {
  constructor() {
    super('Summary');
  }

  create(): void {
    setupCamera(this);
    const s = G.state;
    const sum = s.lastSummary;
    if (!sum) {
      this.scene.start('Morning');
      return;
    }
    const hasJournal = (sum.journal?.length ?? 0) > 0;
    const hasChain = s.stores.length > 1;
    // Nút hai bên cố định bề rộng; tiêu đề căn giữa và thu nhỏ cho vừa khoảng trống còn lại.
    const btnW = 76;
    const side = hasJournal || hasChain ? 10 + btnW + 6 : 16;
    const title = txt(this, W / 2, 30, `${hasJournal || hasChain ? '' : '🌙 '}Tổng kết ngày ${sum.day}`, { size: 20, bold: true, color: HEX.cream, origin: [0.5, 0.5] });
    const room = W - side * 2;
    if (title.width > room) title.setScale(room / title.width);
    if (hasJournal) new Button(this, W - 10 - btnW / 2, 30, { w: btnW, h: 32, label: '📖 Nhật ký', size: 11, color: C.blue, onTap: () => this.showJournal(sum.journal ?? [], 0) }).setDepth(50);
    if (hasChain) new Button(this, 10 + btnW / 2, 30, { w: btnW, h: 32, label: '🏪 Chuỗi', size: 11, color: C.blue, onTap: () => this.showChainSummary(sum.day) }).setDepth(50);

    const hasLevelUp = sum.levelUps.length > 0;
    const top = 58;
    // Mọi thứ tạo từ đây tới hết khung lên cấp được gom vào vùng cuộn phía trên cụm nút (xem cuối hàm).
    const before = new Set(this.children.list);
    const rows: [string, string, string?][] = [
      ['Doanh thu', formatMoney(sum.revenue)],
      ['Tiền vốn hàng đã bán', `-${formatMoney(sum.cogs)}`, HEX.muted],
      ['Lãi gộp', formatMoney(sum.grossProfit), sum.grossProfit >= 0 ? HEX.green : HEX.red],
      ['Tiền tip', `+${formatMoney(sum.tips)}`, '#b7791f'],
    ];
    if (sum.overpaid > 0) rows.push(['Thối dư', `-${formatMoney(sum.overpaid)}`, HEX.red]);
    if (sum.spoiledCost) {
      const items = (sum.spoiled ?? []).slice(0, 2).map((x) => `${x.qty} ${product(x.productId).name.toLowerCase()}`).join(', ');
      rows.push([`Hàng hỏng${items ? `: ${items}` : ''}`, `-${formatMoney(sum.spoiledCost)}`, HEX.red]);
    }
    if (sum.electricity) rows.push(['Tiền điện', `-${formatMoney(sum.electricity)}`, HEX.red]);
    if (sum.wages) rows.push([`Lương nhân viên${sum.wageDebt ? ` (nợ ${formatMoney(sum.wageDebt)})` : ''}`, `-${formatMoney(sum.wages)}`, HEX.red]);
    if (sum.bonuses) rows.push(['Thưởng nhân viên', `-${formatMoney(sum.bonuses)}`, HEX.red]);
    if (sum.theftCost) rows.push(['Mất trộm', `-${formatMoney(sum.theftCost)}`, HEX.red]);
    if (sum.fines) rows.push(['Kẻ trộm bồi thường', `+${formatMoney(sum.fines)}`, HEX.green]);
    if (sum.counterfeitLoss) rows.push(['Nhận phải tiền giả', `-${formatMoney(sum.counterfeitLoss)}`, HEX.red]);
    if (sum.policeRecovered) rows.push(['🚓 Công an trả lại', `+${formatMoney(sum.policeRecovered)}`, HEX.green]);
    if (sum.deliveryFees) rows.push(['Phí giao hàng', `+${formatMoney(sum.deliveryFees)}`, HEX.green]);
    if (sum.debtGiven) rows.push(['Cho ghi sổ', formatMoney(sum.debtGiven), '#1f5fa0']);
    if (sum.debtCollectedAmount) rows.push(['Thu nợ', `+${formatMoney(sum.debtCollectedAmount)}`, HEX.green]);
    if (sum.badDebt) rows.push(['Nợ khó đòi', `-${formatMoney(sum.badDebt)}`, HEX.red]);
    if (sum.tax) rows.push(['Thuế tạm tính (nộp cuối tháng)', sum.tax > 0 ? `-${formatMoney(sum.tax)}` : `+${formatMoney(-sum.tax)}`, sum.tax > 0 ? HEX.red : HEX.green]);
    if (sum.staffPit) rows.push(['TNCN giữ lại từ lương (nộp thay)', formatMoney(sum.staffPit), '#1f5fa0']);
    if (sum.taxReserved) rows.push(['Để vào quỹ thuế', formatMoney(sum.taxReserved), '#1f5fa0']);
    if (sum.netProfit !== undefined && (sum.spoiledCost || sum.electricity || sum.debtCollectedAmount || sum.wages || sum.theftCost || sum.counterfeitLoss || sum.tax)) {
      rows.push(['Lãi ròng', formatMoney(sum.netProfit), sum.netProfit >= 0 ? HEX.green : HEX.red]);
    }
    if (sum.closedEarlyAt !== undefined) {
      rows.push([`🚪 Đóng cửa sớm${sum.sentHome ? ` · mời về ${sum.sentHome} khách` : ''}`, formatClock(sum.closedEarlyAt), '#b7791f']);
    }
    rows.push(
      ['Khách hài lòng', `${sum.happy} / ${sum.served + sum.left}`],
      ['Khách bỏ về', String(sum.left), sum.left > 0 ? HEX.red : HEX.ink],
      ['Sao trung bình', sum.avgRating ? `⭐ ${sum.avgRating.toFixed(1)}` : '–'],
      ['EXP nhận được', `+${formatNumber(sum.expGained)}`, HEX.green],
    );
    let y = top + 18;
    const pitch = rows.length > 15 ? 18 : rows.length > 10 ? 22 : 28;
    const size = rows.length > 15 ? 12 : rows.length > 10 ? 13 : 15;
    for (const [label, value, color] of rows) {
      txt(this, 34, y, label, { size, color: HEX.ink });
      txt(this, W - 34, y, value, { size, bold: true, color: color ?? HEX.ink, origin: [1, 0] });
      y += pitch;
    }
    const complaints = sum.priceComplaints ?? [];
    if (complaints.length) {
      const t = txt(this, W / 2, y + 4, `💸 ${complaints.slice(0, 2).map((c) => `${product(c.productId).name}: ${c.qty} khách chê đắt`).join(' · ')}`, { size: 12, bold: true, color: HEX.red, origin: [0.5, 0], align: 'center', wrap: 290 });
      y += t.height + 8;
    }
    if (sum.spoiledCost) {
      const tip = activeShopType(G.state).def.service === 'counter'
        ? 'Mẹo: nếp chín thừa bỏ cuối ngày · hấp từng mẻ vừa đủ bán.'
        : 'Mẹo: nhập ít hàng tươi hơn, hoặc bán xả hàng hết hạn trong ngày.';
      const t = txt(this, W / 2, y + 2, tip, { size: 11, color: HEX.muted, origin: [0.5, 0], align: 'center', wrap: 290 });
      y += t.height + 6;
    }
    if (sum.staffLevelUps?.length) {
      const t = txt(this, W / 2, y + 2, `⭐ ${sum.staffLevelUps.join(' · ')}`, { size: 12, bold: true, color: '#b7411f', origin: [0.5, 0], align: 'center', wrap: 290 });
      y += t.height + 6;
    }
    for (const id of sum.achievements ?? []) {
      const a = DATA.achievements.find((item) => item.id === id);
      if (!a) continue;
      const t = txt(this, W / 2, y + 2, `🏆 Thành tựu: ${a.name}!`, { size: 13, bold: true, color: '#b7411f', origin: [0.5, 0] });
      y += t.height + 6;
    }
    if (sum.bestSeller) {
      const p = product(sum.bestSeller.productId);
      txt(this, W / 2, y + 8, `🏆 Bán chạy nhất: ${p.icon} ${p.name} (${sum.bestSeller.qty})`, { size: 14, bold: true, origin: [0.5, 0], color: HEX.ink });
      y += 34;
    }
    const missed = sum.missed ?? [];
    if (missed.length > 0) {
      const list = missed
        .slice(0, 3)
        .map((m) => `${product(m.productId).name} (${m.qty})`)
        .join(', ');
      const byZone = new Map<string, number>();
      for (const m of missed) {
        const category = product(m.productId).category;
        const zone = ({ dry: 'Đồ khô', snack: 'Ăn vặt', household: 'Đồ dùng', drink: 'Đồ uống', fresh: 'Đồ tươi', frozen: 'Đông lạnh', counter: 'Sau quầy', food: 'Đồ ăn', beverage: 'Đồ pha chế' } as const)[category];
        byZone.set(zone, (byZone.get(zone) ?? 0) + m.qty);
      }
      const busiestZone = [...byZone.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      // Tiệm chỉ bán ở quầy (tiệm xôi) làm món chứ không nhập, và không có khu kệ.
      const counterShop = activeShopType(G.state).def.service === 'counter';
      const t = txt(this, W / 2, y + 6, counterShop
        ? (activeShopType(G.state).def.id === 'xoi'
          ? `🍙 Khách gọi mà quầy hết món: ${list}\nNgâm thêm nếp và làm sẵn trước giờ cao điểm nhé!`
          : `🧋 Khách gọi mà quầy hết món: ${list}\nPha sẵn thêm các ly này (kể cả Size L, topping) trước giờ cao điểm nhé!`)
        : `📦 Khách hỏi mà hết hàng: ${list}\nNhập thêm những món này nhé!`, {
        size: 13,
        bold: true,
        color: HEX.red,
        origin: [0.5, 0],
        align: 'center',
        wrap: 290,
      });
      y += t.height + 10;
      if (busiestZone && !counterShop) {
        const zoneTip = txt(this, W / 2, y, `Khu hay hết nhất: ${busiestZone}`, { size: 12, bold: true, color: HEX.red, origin: [0.5, 0] });
        y += zoneTip.height + 8;
      }
    } else if (sum.left > sum.served && sum.served + sum.left > 0) {
      const tip = txt(this, W / 2, y + 6, activeShopType(G.state).def.service === 'counter'
        ? 'Mẹo: khách bỏ về nhiều? Làm sẵn món trước giờ cao điểm và thuê thêm thợ nấu.'
        : 'Mẹo: khách bỏ về nhiều? Nhập đủ các món và nạp kệ thường xuyên.', { size: 12, color: HEX.muted, origin: [0.5, 0], align: 'center', wrap: 280 });
      y += tip.height + 10;
    }
    const h = y - top + 12;
    // panel() usually returns a NineSlice, not Graphics; give the background an explicit lower depth.
    panel(this, 16, top, W - 32, h).setDepth(-1);
    let end = top + h;

    if (hasLevelUp) {
      const lv = sum.levelUps[sum.levelUps.length - 1];
      const labels = sum.levelUps.map((l) => `• ${DATA.levels.levels[l - 1].label}`).join('\n');
      const t = txt(this, W / 2, top + h + 36, `🎉 Lên cấp! Level ${lv}`, { size: 22, bold: true, color: '#b7411f', origin: [0.5, 0.5] });
      const list = txt(this, W / 2, top + h + 60, labels, { size: 14, origin: [0.5, 0], align: 'center', wrap: 280 });
      panel(this, 16, top + h + 12, W - 32, 62 + list.height, 0xfff1c1).setDepth(-1);
      end += 12 + 62 + list.height;
      this.tweens.add({ targets: t, scale: 1.12, yoyo: true, repeat: 3, duration: 260 });
      play('levelup');
    } else if (sum.capReached) {
      panel(this, 16, top + h + 12, W - 32, 90, 0xe6f0ff).setDepth(-1);
      end += 12 + 90;
      txt(this, W / 2, top + h + 56, `🚧 ${DATA.levels.nextTeaser}\nEXP vẫn được cộng dồn cho bản cập nhật sau!`, {
        size: 14,
        origin: [0.5, 0.5],
        align: 'center',
        wrap: 290,
      });
    }

    const unclaimed = (s.quests?.list ?? []).filter((q) => !q.claimed && questDone(s, questDef(q.id))).length;
    const fresh = s.reviews.filter((r) => r.day === sum.day);

    const landscape = W > H;
    // Mép trên của cụm nút dưới đáy (Ngày mới, nhiệm vụ, đánh giá); nội dung dài hơn thì cuộn thay vì đè lên nút.
    const buttonsTop = landscape ? H - 54 : fresh.length ? H - (unclaimed ? 146 : 100) - 19 : unclaimed ? H - 120 : H - 70;
    const made = this.children.list.filter((o) => !before.has(o));
    const area = new ScrollArea(this, top - 4, buttonsTop - 8);
    // panel() usually returns NineSlice, so move both panel types before text before parenting into the scroll container.
    const isBackground = (o: Phaser.GameObjects.GameObject) => o instanceof Phaser.GameObjects.Graphics || o instanceof Phaser.GameObjects.NineSlice;
    const ordered = [...made.filter(isBackground), ...made.filter((o) => !isBackground(o))];
    for (const o of ordered) (o as unknown as Phaser.GameObjects.Components.Transform).y -= area.top;
    area.add(ordered);
    area.setHeight(end - area.top + 8);
    const overflow = end + 8 - area.bottom;
    if (overflow > 0) {
      // Còn nội dung bên dưới: mũi tên gợi ý kéo, và tự cuộn xuống để thấy khung lên cấp.
      const hint = txt(this, W / 2, area.bottom - 4, '▼', { size: 12, bold: true, color: HEX.muted, origin: [0.5, 1] });
      this.tweens.add({ targets: hint, y: hint.y + 3, yoyo: true, repeat: -1, duration: 500 });
      this.events.on('update', () => hint.setVisible(area.content.y > area.top - overflow + 4));
      if (hasLevelUp || sum.capReached) {
        const pos = { v: 0 };
        const auto = this.tweens.add({ targets: pos, v: overflow, delay: 700, duration: 600, ease: 'Sine.easeInOut', onUpdate: () => area.setScroll(pos.v) });
        this.input.once('pointerdown', () => auto.stop());
      }
    }
    // Tiệm xôi: ngâm nếp cho sáng mai ngay ở màn tổng kết.
    const soakKg = !G.liveSnapshot && activeShopType(G.state).def.id === 'xoi' ? suggestSoakKg(G.state) : 0;

    if (landscape) {
      const bottomBtns: { btn: Button; w: number }[] = [];
      if (fresh.length) {
        const bad = fresh.filter((r) => r.stars <= 2).length;
        const b = new Button(this, 0, H - 26, {
          w: 130, h: 36, size: 11.5, color: bad ? C.redDark : C.blue,
          label: `✍️ ${fresh.length} đánh giá${bad ? ` (${bad} chê)` : ''}`,
          onTap: () => this.scene.start('Reviews', { back: 'Summary' }),
        });
        bottomBtns.push({ btn: b, w: 130 });
      }
      if (unclaimed) {
        const b = new Button(this, 0, H - 26, {
          w: 126, h: 36, label: `🎯 ${unclaimed} thưởng`, color: C.green, size: 11.5,
          onTap: () => this.scene.start('Quests', { back: 'Summary' }),
        });
        bottomBtns.push({ btn: b, w: 126 });
      }
      if (soakKg > 0) {
        const soakBtn: Button = new Button(this, 0, H - 26, {
          w: 130, h: 36, size: 11.5, color: C.green, label: `🪣 Ngâm ${soakKg}kg`,
          onTap: () => {
            if (!startSoak(G.state, G.state, soakKg).ok) return;
            persist();
            soakBtn.label.setText(`✓ Đã ngâm ${soakKg}kg`);
            soakBtn.setEnabled(false);
          },
        });
        bottomBtns.push({ btn: soakBtn, w: 130 });
      }
      const nextBtn = new Button(this, 0, H - 26, {
        w: 140,
        h: 38,
        label: 'Ngày mới ☀️',
        color: C.red,
        size: 15,
        onTap: () => {
          if (G.liveSnapshot) {
            void dispatchLiveCommand({ type: 'nextDay' }).then(() => this.scene.start('Morning')).catch((error) => {
              this.add.text(W / 2, H - 92, error instanceof Error ? error.message : 'Không mở được ngày mới.', { color: '#b42318', fontSize: '12px', wordWrap: { width: W - 40 } }).setOrigin(0.5);
            });
            return;
          }
          const gift = startNextDay(G.state);
          persist();
          this.scene.start('Morning', { gift });
        },
      });
      bottomBtns.push({ btn: nextBtn, w: 140 });

      const gap = 10;
      const totalW = bottomBtns.reduce((sum, item) => sum + item.w, 0) + (bottomBtns.length - 1) * gap;
      let currX = (W - totalW) / 2;
      for (const item of bottomBtns) {
        item.btn.setX(currX + item.w / 2);
        currX += item.w + gap;
      }
    } else {
      const lift = soakKg > 0 ? 46 : 0;
      if (soakKg > 0) {
        const soakBtn: Button = new Button(this, W / 2, H - 100, {
          w: 220, h: 38, size: 13, color: C.green, label: `🪣 Ngâm ${soakKg} kg nếp cho mai`,
          onTap: () => {
            if (!startSoak(G.state, G.state, soakKg).ok) return;
            persist();
            soakBtn.label.setText(`✓ Đã ngâm ${soakKg} kg`);
            soakBtn.setEnabled(false);
          },
        });
      }
      if (fresh.length) {
        const bad = fresh.filter((r) => r.stars <= 2).length;
        new Button(this, W / 2, H - (unclaimed ? 146 : 100) - lift, {
          w: 220, h: 38, size: 13, color: bad ? C.redDark : C.blue,
          label: `✍️ ${fresh.length} đánh giá mới${bad ? ` · ${bad} chê` : ''}`,
          onTap: () => this.scene.start('Reviews', { back: 'Summary' }),
        });
      }
      if (unclaimed) {
        new Button(this, W / 2, H - 100 - lift, { w: 220, h: 40, label: `🎯 Nhận ${unclaimed} thưởng nhiệm vụ`, color: C.green, size: 13, onTap: () => this.scene.start('Quests', { back: 'Summary' }) });
      }

      new Button(this, W / 2, H - 44, {
        w: 220,
        h: 52,
        label: 'Ngày mới ☀️',
        color: C.red,
        size: 18,
        onTap: () => {
          if (G.liveSnapshot) {
            void dispatchLiveCommand({ type: 'nextDay' }).then(() => this.scene.start('Morning')).catch((error) => {
              this.add.text(W / 2, H - 92, error instanceof Error ? error.message : 'Không mở được ngày mới.', { color: '#b42318', fontSize: '12px', wordWrap: { width: W - 40 } }).setOrigin(0.5);
            });
            return;
          }
          const gift = startNextDay(G.state);
          persist();
          this.scene.start('Morning', { gift });
        },
      });
    }
  }

  /** Tab Nhật ký: các sự việc trong ngày theo giờ game. */
  private showJournal(entries: JournalEntry[], page: number): void {
    const landscape = W > H;
    const per = landscape ? 12 : 14;
    const pages = Math.max(1, Math.ceil(entries.length / per));
    const L = this.add.container(0, 0).setDepth(2000);
    L.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive());
    const panelTop = landscape ? 14 : 40;
    const panelH = landscape ? H - 28 : H - 80;
    L.add(panel(this, 14, panelTop, W - 28, panelH));
    L.add(txt(this, W / 2, panelTop + 20, `📖 Nhật ký ngày ${G.state.lastSummary?.day ?? ''}`, { size: landscape ? 15 : 18, bold: true, origin: [0.5, 0.5] }));
    const pageEntries = entries.slice(page * per, page * per + per);
    if (landscape) {
      const half = Math.ceil(per / 2);
      const colW = (W - 56) / 2;
      pageEntries.forEach((e, i) => {
        const col = i < half ? 0 : 1;
        const row = i % half;
        const x = 24 + col * (colW + 12);
        const y = panelTop + 42 + row * 28;
        L.add(txt(this, x, y, formatClock(e.m), { size: 11, bold: true, color: '#1f5fa0' }));
        L.add(txt(this, x + 44, y, e.t, { size: 11, wrap: colW - 48 }));
      });
    } else {
      pageEntries.forEach((e, i) => {
        L.add(txt(this, 26, 92 + i * 30, formatClock(e.m), { size: 12, bold: true, color: '#1f5fa0' }));
        L.add(txt(this, 70, 92 + i * 30, e.t, { size: 12, wrap: W - 100 }));
      });
    }
    const go = (p: number) => () => { L.destroy(); this.showJournal(entries, p); };
    const navY = panelTop + panelH - (landscape ? 24 : 32);
    L.add(new Button(this, landscape ? 70 : 60, navY, { w: landscape ? 60 : 70, h: landscape ? 30 : 36, label: '◀', color: C.wood, onTap: go(page - 1) }).setEnabled(page > 0));
    L.add(txt(this, landscape ? W / 2 - 40 : W / 2 - 50, navY, `${page + 1}/${pages}`, { size: 13, origin: [0.5, 0.5] }));
    L.add(new Button(this, landscape ? W / 2 + 10 : 140, navY, { w: landscape ? 60 : 70, h: landscape ? 30 : 36, label: '▶', color: C.wood, onTap: go(page + 1) }).setEnabled(page < pages - 1));
    L.add(new Button(this, W - 66, navY, { w: landscape ? 84 : 110, h: landscape ? 32 : 40, label: 'Đóng', color: C.grey, onTap: () => L.destroy() }));
  }

  /** Latest per-store ledger plus an at-a-glance chain total. */
  private showChainSummary(day: number): void {
    persist();
    const landscape = W > H;
    const rows = G.state.stores.map((store) => {
      const records = Array.isArray(store.data.analytics) ? store.data.analytics as { day: number; revenue: number; profit: number; customers: number; internalCost?: number; production?: { made: number; sold: number; delivered: number; spoiled: number; noCook: boolean } }[] : [];
      const record = [...records].reverse().find((item) => item.day <= day);
      const orderCost = G.state.internalOrders.filter((order) => order.toStoreId === store.id && order.dueDay === day)
        .reduce((sum, order) => sum + (order.internalCost ?? 0), 0);
      return {
        name: store.name,
        revenue: record?.revenue ?? 0,
        profit: record?.profit ?? 0,
        customers: record?.customers ?? 0,
        recordDay: record?.day ?? null,
        internalCost: Math.max(record?.day === day ? record.internalCost ?? 0 : 0, orderCost),
        production: record?.day === day ? record.production : undefined,
      };
    });
    const layer = this.add.container(0, 0).setDepth(2000);
    layer.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.66).setInteractive());
    const panelTop = landscape ? 10 : 70;
    const panelH = landscape ? H - 20 : H - 140;
    const panelW = W - 28;
    layer.add(panel(this, 14, panelTop, panelW, panelH));
    layer.add(txt(this, 30, panelTop + 20, `🏪 Báo cáo chuỗi · ngày ${day}`, { size: landscape ? 15 : 17, bold: true }));
    layer.add(new Button(this, 14 + panelW - 36, panelTop + 20, { w: 54, h: 28, label: 'Đóng', size: 11, color: C.grey, onTap: () => layer.destroy() }));

    const listTop = panelTop + 38;
    const totalH = 50;
    const listBottom = panelTop + panelH - totalH - 6;
    const scroll = new ScrollArea(this, listTop, listBottom, undefined, { x: 18, width: panelW - 8 });
    layer.add(scroll.content);

    let y = 4;
    for (const row of rows) {
      const hasDetails = !!row.internalCost || !!row.production;
      const height = row.production && row.internalCost ? 84 : hasDetails ? 70 : 54;
      scroll.add(card(this, 4, y, panelW - 16, height, C.panel));
      scroll.add(txt(this, 14, y + 6, row.name, { size: 12, bold: true }));
      scroll.add(txt(this, 14, y + 26, row.recordDay === null ? 'Chưa có ngày bán được ghi nhận' : `Số liệu ngày ${row.recordDay}`, { size: 9, color: HEX.muted }));
      scroll.add(txt(this, panelW - 24, y + 14, `${formatMoney(row.revenue)}  ·  ${formatMoney(row.profit)}  ·  ${row.customers}`, { size: 10, bold: true, origin: [1, 0] }));
      if (row.production) {
        const p = row.production;
        scroll.add(txt(this, 14, y + 46, p.noCook ? '⚠ Không có thợ · không sản xuất' : `Xôi: làm ${p.made} · bán ${p.sold} · giao ${p.delivered} · hỏng ${p.spoiled}`, { size: 9, color: p.noCook ? HEX.red : HEX.ink, wrap: panelW - 40 }));
      }
      if (row.internalCost) scroll.add(txt(this, panelW - 24, y + (row.production ? 62 : 46), `Nhận hàng nội bộ: ${formatMoney(row.internalCost)}`, { size: 9, color: HEX.muted, origin: [1, 0] }));
      y += height + 6;
    }
    scroll.setHeight(y + 6);

    const totals = rows.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, profit: sum.profit + row.profit, customers: sum.customers + row.customers }), { revenue: 0, profit: 0, customers: 0 });
    const totalY = panelTop + panelH - totalH - 4;
    layer.add(panel(this, 20, totalY, panelW - 12, totalH, 0xe8f5e9));
    layer.add(txt(this, 30, totalY + 8, 'TỔNG CHUỖI', { size: 11, bold: true, color: HEX.green }));
    layer.add(txt(this, 30, totalY + 26, `${formatMoney(totals.revenue)} doanh thu  ·  ${formatMoney(totals.profit)} lãi  ·  ${totals.customers} khách`, { size: 10, bold: true, wrap: panelW - 30 }));
  }
}
