import { describe, expect, it } from 'vitest';
import { DAY_MINUTES, ambientAt, formatClock, multiplyColor, normalizeMinute, phaseAt, phaseIcon, presenceAt } from '../src/core/timeOfDay';

const channels = (c: number): number[] => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

describe('timeOfDay', () => {
  it('vòng quanh 24 giờ: phút 0, 1440 và 2880 cho cùng màu', () => {
    expect(ambientAt(0)).toEqual(ambientAt(DAY_MINUTES));
    expect(ambientAt(0)).toEqual(ambientAt(2 * DAY_MINUTES));
    expect(normalizeMinute(-60)).toBe(1380);
  });

  it('màu liên tục: hai phút liền kề không nhảy quá 12/255 mỗi kênh', () => {
    let prev = channels(ambientAt(0).tint);
    for (let m = 1; m <= DAY_MINUTES; m++) {
      const cur = channels(ambientAt(m).tint);
      for (let i = 0; i < 3; i++) expect(Math.abs(cur[i] - prev[i])).toBeLessThanOrEqual(12);
      prev = cur;
    }
  });

  it('ban ngày không đổi màu và không tối; ban đêm tối hẳn', () => {
    for (const m of [540, 720, 900, 960]) {
      const a = ambientAt(m);
      expect(a.tint).toBe(0xffffff);
      expect(a.darkness).toBe(0);
    }
    for (const m of [0, 120, 300, 1300, 1439]) expect(ambientAt(m).darkness).toBe(1);
  });

  it('độ tối luôn trong 0..1, giảm dần lúc rạng sáng và tăng dần lúc chiều', () => {
    let last = 1;
    for (let m = 300; m <= 540; m += 10) {
      const d = ambientAt(m).darkness;
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      last = d;
    }
    last = 0;
    for (let m = 960; m <= 1260; m += 10) {
      const d = ambientAt(m).darkness;
      expect(d).toBeGreaterThanOrEqual(last - 1e-9);
      last = d;
    }
  });

  it('các giai đoạn theo giờ', () => {
    expect(phaseAt(120)).toBe('night');
    expect(phaseAt(400)).toBe('dawn');
    expect(phaseAt(720)).toBe('day');
    expect(phaseAt(1100)).toBe('dusk');
    expect(phaseAt(1300)).toBe('night');
    expect(ambientAt(1100).phase).toBe('dusk');
    expect(new Set(['night', 'dawn', 'day', 'dusk'].map((p) => phaseIcon(p as never))).size).toBe(4);
  });

  it('mật độ người đi đường: đêm vắng, ngày đầy đủ, luôn trong (0, 1]', () => {
    expect(presenceAt(120)).toBeLessThan(0.25);
    expect(presenceAt(720)).toBe(1);
    for (let m = 0; m < DAY_MINUTES; m += 15) {
      const p = presenceAt(m);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(presenceAt(0)).toBeCloseTo(presenceAt(DAY_MINUTES - 0.001), 2);
  });

  it('định dạng giờ', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(480)).toBe('08:00');
    expect(formatClock(1230.7)).toBe('20:30');
    expect(formatClock(1500)).toBe('01:00');
  });

  it('multiplyColor nhân theo kênh', () => {
    expect(multiplyColor(0xffffff, 0x4a5a90)).toBe(0x4a5a90);
    expect(multiplyColor(0x000000, 0xffffff)).toBe(0);
    expect(multiplyColor(0x808080, 0x808080)).toBe(0x404040);
  });
});
