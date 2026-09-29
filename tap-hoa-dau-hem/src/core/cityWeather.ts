/**
 * Thời tiết mưa trên bản đồ phố. Thuần logic (không Phaser) để test bằng Vitest.
 * Tất định theo ngày game (không dùng ngẫu nhiên thật) và khớp sự kiện `heavy_rain` cùng mùa trong lịch.
 * Chỉ là lớp hiển thị: không đổi doanh thu, khách thật hay save.
 */
import { normalizeMinute } from './timeOfDay';

export type WeatherKind = 'clear' | 'drizzle' | 'rain' | 'storm';

export interface Weather {
  /** Cường độ mưa 0..1. */
  rain: number;
  kind: WeatherKind;
}

export interface WeatherContext {
  /** Id mùa trong lịch (`spring`, `summer`, `autumn`, `winter`). */
  season: string;
  /** Sự kiện `heavy_rain` đang diễn ra. */
  heavyRain: boolean;
}

/** Xác suất một ngày có mưa rào, theo mùa; mùa lạ dùng mức trung bình. */
export const SHOWER_CHANCE: Record<string, number> = { spring: 0.25, summer: 0.35, autumn: 0.2, winter: 0.1 };
const DEFAULT_SHOWER_CHANCE = 0.2;

/** Cửa sổ mưa lớn của sự kiện `heavy_rain` ("chiều nay mưa to"), phút trong ngày. */
const EVENT_WINDOW = { from: 12 * 60, to: 20 * 60, ramp: 60 };
const SHOWER_RAMP = 30;

/** Băm số nguyên thành số trong [0, 1); cùng đầu vào luôn cùng kết quả. */
export function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 2 ** 32;
}

/** Cường độ của một cửa sổ mưa [from, to) có chân dốc `ramp` phút hai đầu, đỉnh `peak`. */
function windowIntensity(minute: number, from: number, to: number, ramp: number, peak: number): number {
  if (minute < from || minute >= to) return 0;
  const edge = Math.min(minute - from, to - minute) / ramp;
  return peak * Math.min(1, edge);
}

/** Mưa rào của ngày: có hay không, giờ bắt đầu, độ dài và cường độ (tất định theo `day`). */
export function showerOf(day: number, season: string): { from: number; to: number; peak: number } | null {
  const chance = SHOWER_CHANCE[season] ?? DEFAULT_SHOWER_CHANCE;
  if (hash01(day, 1) >= chance) return null;
  const from = 6 * 60 + Math.floor(hash01(day, 2) * 12 * 60);
  const length = 120 + Math.floor(hash01(day, 3) * 120);
  return { from, to: from + length, peak: 0.25 + hash01(day, 4) * 0.35 };
}

export function weatherKindOf(rain: number): WeatherKind {
  return rain < 0.05 ? 'clear' : rain < 0.4 ? 'drizzle' : rain < 0.75 ? 'rain' : 'storm';
}

export function weatherAt(day: number, minute: number, ctx: WeatherContext): Weather {
  const m = normalizeMinute(minute);
  let rain = 0;
  if (ctx.heavyRain) rain = windowIntensity(m, EVENT_WINDOW.from, EVENT_WINDOW.to, EVENT_WINDOW.ramp, 1);
  const shower = showerOf(day, ctx.season);
  if (shower) rain = Math.max(rain, windowIntensity(m, shower.from, shower.to, SHOWER_RAMP, shower.peak));
  return { rain, kind: weatherKindOf(rain) };
}

/** Màu nhân xám xanh thêm vào màu môi trường khi mưa (0xffffff khi quang). */
export function rainTint(rain: number): number {
  const k = Math.min(1, Math.max(0, rain)) * 0.6;
  const ch = (to: number): number => Math.round(255 + (to - 255) * k);
  return (ch(0xb4) << 16) | (ch(0xc0) << 8) | ch(0xd2);
}

export function weatherIcon(kind: WeatherKind): string {
  return kind === 'clear' ? '' : kind === 'drizzle' ? '🌦️' : kind === 'rain' ? '🌧️' : '⛈️';
}
