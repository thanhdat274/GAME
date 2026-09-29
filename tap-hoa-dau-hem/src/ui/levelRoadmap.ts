import Phaser from 'phaser';
import { DATA } from '../core/data';
import { levelStatus } from '../core/progression';
import { formatNumber, type GameState } from '../core/state';
import { KineticScroll, snap } from './scroll';
import { Bar, Button, panel } from './widgets';
import { C, H, HEX, W, txt } from './theme';

/** Dòng EXP ngắn gọn cho level hiện tại: phần đã đi / độ dài level (khớp thanh), còn thiếu bao nhiêu. */
export function levelProgressText(s: GameState): string {
  const st = levelStatus(s.exp, s.level);
  if (st.next === null) return `Lv ${s.level} (tối đa) · Tổng ${formatNumber(s.exp)} EXP`;
  return `Lv ${s.level} → ${st.next}: ${formatNumber(st.into)} / ${formatNumber(st.span)} EXP (${Math.floor(st.pct * 100)}%)\n`
    + `Còn ${formatNumber(st.remaining)} EXP · Tổng ${formatNumber(s.exp)} / ${formatNumber(st.nextExp ?? 0)}`;
}

/**
 * Bảng lộ trình level: tiến độ hiện tại (số khớp với thanh EXP) và từng mốc level mở khóa gì.
 * `onClose` gọi khi đóng (vd. để tiệm chạy tiếp).
 */
export function openLevelRoadmap(scene: Phaser.Scene, s: GameState, onClose?: () => void): Phaser.GameObjects.Container {
  const L = scene.add.container(0, 0).setDepth(3500);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    L.destroy();
    onClose?.();
  };

  const landscape = W > H;
  const PX = landscape ? 16 : 12;
  const PW = W - PX * 2;
  const TOP = landscape ? 20 : 36;
  const BOTTOM = H - (landscape ? 16 : 30);

  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive();
  shade.on('pointerup', (p: Phaser.Input.Pointer) => {
    if (p.getDistance() < 10 && (p.worldY < TOP || p.worldY > BOTTOM || p.worldX < PX || p.worldX > PX + PW)) close();
  });
  L.add(shade);
  L.add(panel(scene, PX, TOP, PW, BOTTOM - TOP));

  const st = levelStatus(s.exp, s.level);
  const levels = DATA.levels.levels;

  if (landscape) {
    const leftW = Math.min(230, Math.floor(PW * 0.38));
    L.add(txt(scene, PX + 14, TOP + 18, '🏆 Lộ trình level', { size: 16, bold: true, origin: [0, 0.5] }));
    L.add(new Button(scene, PX + PW - 22, TOP + 18, { w: 32, h: 28, label: '✕', size: 14, color: C.grey, onTap: close }));

    L.add(txt(scene, PX + 14, TOP + 46, st.next === null ? `Level ${s.level} (tối đa)` : `Level ${s.level} → ${st.next}`, { size: 13, bold: true, color: HEX.ink }));
    if (st.next !== null) {
      L.add(txt(scene, PX + leftW - 8, TOP + 46, `${Math.floor(st.pct * 100)}%`, { size: 13, bold: true, color: '#b7791f', origin: [1, 0] }));
    }
    const bar = new Bar(scene, PX + 14, TOP + 68, leftW - 22, 10, C.yellow, 0x000000);
    bar.set(st.pct);
    L.add(bar);

    L.add(txt(scene, PX + 14, TOP + 88, st.next === null
      ? `Tổng ${formatNumber(s.exp)} EXP\n${DATA.levels.nextTeaser}`
      : `${formatNumber(st.into)} / ${formatNumber(st.span)} EXP của level này\n`
        + `Còn thiếu: ${formatNumber(st.remaining)} EXP\n`
        + `Tổng EXP: ${formatNumber(s.exp)} / ${formatNumber(st.nextExp ?? 0)}`,
    { size: 10.5, color: HEX.muted, wrap: leftW - 22 }));

    const divX = PX + leftW + 8;
    const divider = scene.add.graphics();
    divider.fillStyle(C.panelEdge, 1).fillRect(divX, TOP + 38, 2, BOTTOM - TOP - 48);
    L.add(divider);

    const rightX = divX + 10;
    const rightW = PX + PW - rightX - 6;
    const listTop = TOP + 36;
    const listBottom = BOTTOM - 8;

    const list = scene.add.container(0, 0);
    const maskG = scene.make.graphics({}, false).fillRect(rightX, listTop, rightW, listBottom - listTop);
    list.setMask(maskG.createGeometryMask());
    L.add(list);
    L.once(Phaser.GameObjects.Events.DESTROY, () => maskG.destroy());

    let y = listTop + 4;
    let currentY = y;
    levels.forEach((lv, i) => {
      const done = lv.level <= s.level;
      const current = lv.level === s.level;
      const isNext = lv.level === s.level + 1;
      if (current) currentY = y;
      const prev = levels[i - 1];
      const extras: string[] = [];
      if (prev && (lv.staffSlots ?? 0) > (prev.staffSlots ?? 0)) extras.push(`🧑‍💼 ${lv.staffSlots} chỗ nhân viên`);
      if (prev && lv.traffic !== undefined && lv.traffic !== prev.traffic) extras.push(`👥 lượng khách ×${lv.traffic}`);
      const label = txt(scene, rightX + 44, y + 24, lv.label + (extras.length ? `\n${extras.join(' · ')}` : ''), {
        size: 10, color: done ? HEX.ink : '#7a6a5a', wrap: rightW - 54,
      });
      const rowH = Math.max(42, 28 + label.height + 6);
      const bg = scene.add.graphics();
      if (current) bg.fillStyle(0xfff1c1, 1).fillRoundedRect(rightX, y, rightW, rowH - 4, 6).lineStyle(2, C.yellow, 1).strokeRoundedRect(rightX, y, rightW, rowH - 4, 6);
      else if (isNext) bg.fillStyle(0xeaf3ff, 1).fillRoundedRect(rightX, y, rightW, rowH - 4, 6);

      bg.fillStyle(done ? (current ? C.yellow : C.green) : 0xb8a898, 1).fillCircle(rightX + 22, y + 18, 13);
      const badge = txt(scene, rightX + 22, y + 18, String(lv.level), { size: 11, bold: true, color: HEX.white, origin: [0.5, 0.5] });
      const title = txt(scene, rightX + 44, y + 6, `Lv ${lv.level} · ${formatNumber(lv.exp)} EXP`, { size: 11, bold: true, color: done ? HEX.ink : '#7a6a5a' });
      const statusText = current ? '📍 Đang ở đây' : done ? '✓ Đã mở' : isNext ? `còn ${formatNumber(Math.max(0, lv.exp - s.exp))} EXP` : '🔒';
      const status = txt(scene, rightX + rightW - 10, y + 7, statusText, {
        size: 9, bold: true, color: current ? '#b7791f' : done ? HEX.green : isNext ? '#1f5fa0' : HEX.muted, origin: [1, 0],
      });
      list.add([bg, badge, title, status, label]);
      y += rowH;
    });

    const contentH = y - listTop + 8;
    const max = Math.max(0, contentH - (listBottom - listTop));
    let offset = Math.min(max, Math.max(0, currentY - listTop - 8));
    const setOffset = (v: number) => {
      offset = Phaser.Math.Clamp(v, 0, max);
      if (list.active) list.y = snap(-offset);
    };
    setOffset(offset);
    new KineticScroll(scene, {
      inView: (py, px) => py >= listTop && py <= listBottom && (px === undefined || (px >= rightX && px <= rightX + rightW)),
      enabled: () => !closed && L.active,
      get: () => offset,
      set: setOffset,
      max: () => max,
    });
  } else {
    const HEAD_H = 118;
    L.add(txt(scene, W / 2, TOP + 20, '🏆 Lộ trình level', { size: 17, bold: true, origin: [0.5, 0.5] }));
    L.add(new Button(scene, PX + PW - 22, TOP + 20, { w: 32, h: 28, label: '✕', size: 14, color: C.grey, onTap: close }));
    L.add(txt(scene, PX + 14, TOP + 40, st.next === null ? `Level ${s.level} · tối đa` : `Level ${s.level} → ${st.next}`, { size: 13, bold: true, color: HEX.ink }));
    L.add(txt(scene, PX + PW - 14, TOP + 40, st.next === null ? '' : `${Math.floor(st.pct * 100)}%`, { size: 13, bold: true, color: '#b7791f', origin: [1, 0] }));
    const bar = new Bar(scene, PX + 14, TOP + 60, PW - 28, 12, C.yellow, 0x000000);
    bar.set(st.pct);
    L.add(bar);
    L.add(txt(scene, PX + 14, TOP + 78, st.next === null
      ? `Tổng ${formatNumber(s.exp)} EXP · ${DATA.levels.nextTeaser}`
      : `${formatNumber(st.into)} / ${formatNumber(st.span)} EXP của level này · còn ${formatNumber(st.remaining)} EXP\n`
        + `Tổng EXP: ${formatNumber(s.exp)} / ${formatNumber(st.nextExp ?? 0)}`,
    { size: 11, color: HEX.muted, wrap: PW - 28 }));
    const divider = scene.add.graphics();
    divider.fillStyle(C.panelEdge, 1).fillRect(PX + 10, TOP + HEAD_H - 4, PW - 20, 2);
    L.add(divider);

    const listTop = TOP + HEAD_H;
    const listBottom = BOTTOM - 8;
    const list = scene.add.container(0, 0);
    const maskG = scene.make.graphics({}, false).fillRect(PX, listTop, PW, listBottom - listTop);
    list.setMask(maskG.createGeometryMask());
    L.add(list);
    L.once(Phaser.GameObjects.Events.DESTROY, () => maskG.destroy());

    let y = listTop + 4;
    let currentY = y;
    levels.forEach((lv, i) => {
      const done = lv.level <= s.level;
      const current = lv.level === s.level;
      const isNext = lv.level === s.level + 1;
      if (current) currentY = y;
      const prev = levels[i - 1];
      const extras: string[] = [];
      if (prev && (lv.staffSlots ?? 0) > (prev.staffSlots ?? 0)) extras.push(`🧑‍💼 ${lv.staffSlots} chỗ nhân viên`);
      if (prev && lv.traffic !== undefined && lv.traffic !== prev.traffic) extras.push(`👥 lượng khách ×${lv.traffic}`);
      const label = txt(scene, PX + 52, y + 26, lv.label + (extras.length ? `\n${extras.join(' · ')}` : ''), {
        size: 11, color: done ? HEX.ink : '#7a6a5a', wrap: PW - 66,
      });
      const rowH = Math.max(46, 30 + label.height + 8);
      const bg = scene.add.graphics();
      if (current) bg.fillStyle(0xfff1c1, 1).fillRoundedRect(PX + 6, y, PW - 12, rowH - 4, 8).lineStyle(2, C.yellow, 1).strokeRoundedRect(PX + 6, y, PW - 12, rowH - 4, 8);
      else if (isNext) bg.fillStyle(0xeaf3ff, 1).fillRoundedRect(PX + 6, y, PW - 12, rowH - 4, 8);
      bg.fillStyle(done ? (current ? C.yellow : C.green) : 0xb8a898, 1).fillCircle(PX + 28, y + 20, 15);
      const badge = txt(scene, PX + 28, y + 20, String(lv.level), { size: 12, bold: true, color: HEX.white, origin: [0.5, 0.5] });
      const title = txt(scene, PX + 52, y + 8, `Lv ${lv.level} · ${formatNumber(lv.exp)} EXP`, { size: 12, bold: true, color: done ? HEX.ink : '#7a6a5a' });
      const statusText = current ? '📍 Bạn đang ở đây' : done ? '✓ Đã mở' : isNext ? `còn ${formatNumber(Math.max(0, lv.exp - s.exp))} EXP` : '🔒';
      const status = txt(scene, PX + PW - 14, y + 9, statusText, {
        size: 10, bold: true, color: current ? '#b7791f' : done ? HEX.green : isNext ? '#1f5fa0' : HEX.muted, origin: [1, 0],
      });
      list.add([bg, badge, title, status, label]);
      y += rowH;
    });
    const contentH = y - listTop + 8;
    const max = Math.max(0, contentH - (listBottom - listTop));
    let offset = Math.min(max, Math.max(0, currentY - listTop - 8));
    const setOffset = (v: number) => {
      offset = Phaser.Math.Clamp(v, 0, max);
      if (list.active) list.y = snap(-offset);
    };
    setOffset(offset);
    new KineticScroll(scene, {
      inView: (py) => py >= listTop && py <= listBottom,
      enabled: () => !closed && L.active,
      get: () => offset,
      set: setOffset,
      max: () => max,
    });
  }
  return L;
}
