/**
 * Màu môi trường theo giờ trong ngày cho bản đồ phố. Thuần logic (không Phaser) để test bằng Vitest;
 * `CityScene` chỉ áp dụng kết quả. Phút tính từ 0:00, vòng quanh 24 giờ.
 */

export const DAY_MINUTES = 24 * 60;

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface Ambient {
  /** Màu nhân (0xRRGGBB) phủ lên thế giới; 0xffffff là không đổi màu. */
  tint: number;
  /** 0 = ban ngày, 1 = đêm hẳn; điều khiển độ sáng của đèn. */
  darkness: number;
  phase: DayPhase;
}

interface Key { minute: number; tint: number; dark: number }

/** Khung khóa theo phút; nội suy tuyến tính từng kênh màu, khung cuối trùng khung đầu để vòng quanh liền mạch. */
const KEYS: readonly Key[] = [
  { minute: 0, tint: 0x4a5a90, dark: 1 },
  { minute: 300, tint: 0x4a5a90, dark: 1 },
  { minute: 360, tint: 0xe8a890, dark: 0.6 },
  { minute: 450, tint: 0xfff0dc, dark: 0.1 },
  { minute: 540, tint: 0xffffff, dark: 0 },
  { minute: 960, tint: 0xffffff, dark: 0 },
  { minute: 1050, tint: 0xffd9a0, dark: 0.1 },
  { minute: 1110, tint: 0xe89a80, dark: 0.4 },
  { minute: 1170, tint: 0x7a6a9a, dark: 0.8 },
  { minute: 1260, tint: 0x4a5a90, dark: 1 },
  { minute: DAY_MINUTES, tint: 0x4a5a90, dark: 1 },
];

/** Đưa phút về [0, 1440). */
export function normalizeMinute(minute: number): number {
  return ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (shift: number): number => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export function ambientAt(minute: number): Ambient {
  const m = normalizeMinute(minute);
  let i = 1;
  while (i < KEYS.length - 1 && KEYS[i].minute <= m) i++;
  const a = KEYS[i - 1];
  const b = KEYS[i];
  const t = b.minute === a.minute ? 0 : (m - a.minute) / (b.minute - a.minute);
  const dark = a.dark + (b.dark - a.dark) * t;
  return { tint: lerpColor(a.tint, b.tint, t), darkness: dark, phase: phaseAt(m) };
}

export function phaseAt(minute: number): DayPhase {
  const m = normalizeMinute(minute);
  if (m < 360 || m >= 1260) return 'night';
  if (m < 540) return 'dawn';
  if (m < 1050) return 'day';
  return 'dusk';
}

/** Tỉ lệ dân phố ra đường (0..1): đầy đủ ban ngày, thưa dần về đêm. */
export function presenceAt(minute: number): number {
  const m = normalizeMinute(minute);
  const points: [number, number][] = [[0, 0.15], [300, 0.15], [420, 0.6], [540, 1], [1020, 1], [1140, 0.6], [1320, 0.15], [DAY_MINUTES, 0.15]];
  for (let i = 1; i < points.length; i++) {
    if (m <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + (y1 - y0) * ((m - x0) / (x1 - x0));
    }
  }
  return 0.15;
}

/** "HH:MM" từ phút trong ngày. */
export function formatClock(minute: number): string {
  const m = Math.floor(normalizeMinute(minute));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Biểu tượng theo giai đoạn để hiện cạnh đồng hồ. */
export function phaseIcon(phase: DayPhase): string {
  return phase === 'night' ? '🌙' : phase === 'dawn' ? '🌅' : phase === 'dusk' ? '🌇' : '☀️';
}

/** Nhân hai màu 0xRRGGBB theo từng kênh (để nhuộm màu nền theo lớp phủ nhân màu). */
export function multiplyColor(a: number, b: number): number {
  const ch = (shift: number): number => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
