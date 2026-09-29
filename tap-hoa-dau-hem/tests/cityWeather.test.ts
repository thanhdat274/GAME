import { describe, expect, it } from 'vitest';
import { SHOWER_CHANCE, hash01, rainTint, showerOf, weatherAt, weatherIcon, weatherKindOf } from '../src/core/cityWeather';

const clear = { season: 'summer', heavyRain: false };

describe('cityWeather', () => {
  it('tất định: cùng ngày, giờ, ngữ cảnh luôn cùng kết quả', () => {
    for (const day of [1, 17, 300]) for (const minute of [0, 480, 900, 1300]) {
      expect(weatherAt(day, minute, clear)).toEqual(weatherAt(day, minute, clear));
    }
    expect(hash01(5, 1)).toBe(hash01(5, 1));
    expect(hash01(5, 1)).not.toBe(hash01(6, 1));
  });

  it('cường độ trong [0, 1] và kind khớp cường độ', () => {
    for (let day = 1; day <= 60; day++) for (let m = 0; m < 1440; m += 30) {
      const w = weatherAt(day, m, { season: 'spring', heavyRain: day % 3 === 0 });
      expect(w.rain).toBeGreaterThanOrEqual(0);
      expect(w.rain).toBeLessThanOrEqual(1);
      expect(w.kind).toBe(weatherKindOf(w.rain));
    }
  });

  it('sự kiện mưa lớn: đỉnh 1 buổi chiều, không mưa sáng sớm nếu không có mưa rào', () => {
    // Tìm ngày mùa đông không có mưa rào để tách riêng sự kiện.
    let day = 1;
    while (showerOf(day, 'winter')) day++;
    const ctx = { season: 'winter', heavyRain: true };
    expect(weatherAt(day, 16 * 60, ctx).rain).toBe(1);
    expect(weatherAt(day, 16 * 60, ctx).kind).toBe('storm');
    expect(weatherAt(day, 6 * 60, ctx).rain).toBe(0);
    expect(weatherAt(day, 22 * 60, ctx).rain).toBe(0);
    expect(weatherAt(day, 16 * 60, { season: 'winter', heavyRain: false }).rain).toBe(0);
  });

  it('liên tục: hai phút liền kề không nhảy quá 0.03', () => {
    for (const heavyRain of [true, false]) for (let day = 1; day <= 40; day++) {
      let prev = weatherAt(day, 0, { season: 'summer', heavyRain }).rain;
      for (let m = 1; m <= 1440; m++) {
        const cur = weatherAt(day, m, { season: 'summer', heavyRain }).rain;
        expect(Math.abs(cur - prev)).toBeLessThanOrEqual(0.03);
        prev = cur;
      }
    }
  });

  it('xác suất mưa rào theo mùa: tỉ lệ ngày mưa gần xác suất, hè nhiều hơn đông', () => {
    const rate = (season: string): number => {
      let n = 0;
      for (let day = 1; day <= 4000; day++) if (showerOf(day, season)) n++;
      return n / 4000;
    };
    for (const season of Object.keys(SHOWER_CHANCE)) expect(Math.abs(rate(season) - SHOWER_CHANCE[season])).toBeLessThan(0.03);
    expect(rate('summer')).toBeGreaterThan(rate('winter'));
  });

  it('mưa rào có giờ, độ dài và cường độ hợp lý', () => {
    let seen = 0;
    for (let day = 1; day <= 400; day++) {
      const s = showerOf(day, 'summer');
      if (!s) continue;
      seen++;
      expect(s.from).toBeGreaterThanOrEqual(360);
      expect(s.to - s.from).toBeGreaterThanOrEqual(120);
      expect(s.to - s.from).toBeLessThanOrEqual(240);
      expect(s.peak).toBeGreaterThanOrEqual(0.25);
      expect(s.peak).toBeLessThanOrEqual(0.6);
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('rainTint: 0xffffff khi quang, xám xanh hơn khi mưa, đơn điệu theo cường độ', () => {
    expect(rainTint(0)).toBe(0xffffff);
    const red = (c: number) => (c >> 16) & 0xff;
    expect(red(rainTint(1))).toBeLessThan(red(rainTint(0.5)));
    expect(red(rainTint(0.5))).toBeLessThan(255);
    expect(rainTint(5)).toBe(rainTint(1));
  });

  it('biểu tượng: trống khi quang, khác nhau theo mức mưa', () => {
    expect(weatherIcon('clear')).toBe('');
    expect(new Set(['drizzle', 'rain', 'storm'].map((k) => weatherIcon(k as never))).size).toBe(3);
  });
});
