import { describe, expect, it } from 'vitest';
import { KINETIC, KineticCore } from '../src/core/kinetic';

function setup(max = 2000) {
  let pos = 0;
  const core = new KineticCore({ get: () => pos, set: (v) => { pos = v; }, max: () => max });
  return { core, pos: () => pos };
}

/** Vuốt: từ y0 đi `dy` điểm trong `ms` mili-giây, `steps` lần di chuyển, nhấc tay sau `holdMs`. */
function swipe(core: KineticCore, y0: number, dy: number, ms: number, steps = 8, holdMs = 4, t0 = 1000): number {
  core.down(y0, t0, true);
  for (let i = 1; i <= steps; i++) core.move(y0 + (dy * i) / steps, t0 + (ms * i) / steps);
  const tUp = t0 + ms + holdMs;
  core.up(tUp);
  return tUp;
}

function runFrames(core: KineticCore, seconds: number): void {
  for (let i = 0; i < seconds * 60; i++) core.tick(1000 / 60);
}

describe('cuộn có quán tính', () => {
  it('kéo chậm: nội dung đi theo ngón tay, thả ra thì dừng ngay', () => {
    const { core, pos } = setup();
    // 20 bước 5 điểm: bắt đầu cuộn ở bước thứ 2 (vượt ngưỡng), từ đó nội dung đi đúng theo ngón tay.
    swipe(core, 500, -100, 2000, 20);
    expect(KINETIC.threshold).toBeLessThanOrEqual(10);
    expect(pos()).toBe(90);
    expect(core.velocity).toBe(0);
  });

  it('vuốt nhanh: thả ra vẫn trôi tiếp rồi chậm dần và dừng', () => {
    const { core, pos } = setup();
    swipe(core, 500, -160, 70);
    const atRelease = pos();
    expect(core.velocity).toBeGreaterThan(500);
    core.tick(16);
    const v1 = core.velocity;
    runFrames(core, 0.3);
    expect(pos()).toBeGreaterThan(atRelease + 100);
    expect(core.velocity).toBeLessThan(v1);
    runFrames(core, 5);
    expect(core.velocity).toBe(0);
  });

  it('dừng tay rồi mới nhấc: không trôi', () => {
    const { core } = setup();
    swipe(core, 500, -160, 70, 8, 200);
    expect(core.velocity).toBe(0);
  });

  it('chạm lúc đang trôi: dừng lại và chạm đó không tính là bấm', () => {
    const { core, pos } = setup();
    const t = swipe(core, 500, -160, 70);
    runFrames(core, 0.1);
    expect(core.moving).toBe(true);
    core.down(300, t + 150, true);
    expect(core.velocity).toBe(0);
    expect(core.tapBlocked).toBe(true);
    const stopped = pos();
    core.up(t + 200);
    runFrames(core, 0.5);
    expect(pos()).toBe(stopped);
    // Chạm tiếp theo lúc đứng yên thì là bấm bình thường.
    core.down(300, t + 1000, true);
    expect(core.tapBlocked).toBe(false);
  });

  it('không trôi quá đầu / cuối danh sách', () => {
    const { core, pos } = setup(300);
    swipe(core, 500, -200, 50);
    runFrames(core, 3);
    expect(pos()).toBe(300);
    swipe(core, 100, 400, 50, 8, 4, 9000);
    runFrames(core, 3);
    expect(pos()).toBe(0);
  });

  it('chạm ngoài vùng cuộn thì không cuộn', () => {
    const { core, pos } = setup();
    core.down(500, 0, false);
    core.move(300, 20);
    core.up(30);
    expect(pos()).toBe(0);
  });
});
