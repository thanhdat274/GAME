import { DATA, hasFeature } from './data';
import type { GameState, Staff } from './state';

/** 2 ca mỗi ngày: 0 = sáng (08–14), 1 = chiều (14–20). */
export type Shift = 0 | 1;
export const SHIFTS: Shift[] = [0, 1];
export const WEEK_DAYS = 7;

/** Lịch ca mở từ level 13; trước đó mọi nhân viên làm cả ngày. */
export function scheduleEnabled(state: GameState): boolean {
  return hasFeature(state.level, 'schedule');
}

/** Thứ trong tuần của ngày game (0..6). */
export function weekday(day: number): number {
  return (((day - 1) % WEEK_DAYS) + WEEK_DAYS) % WEEK_DAYS;
}

export function shiftAt(minute: number): Shift {
  return minute < DATA.balance.staff.shifts[1].from ? 0 : 1;
}

function fullWeek(): boolean[] {
  return Array.from({ length: WEEK_DAYS * 2 }, () => true);
}

function scheduleOf(state: GameState, id: string): boolean[] {
  return (state.schedule[id] ??= fullWeek());
}

export function worksShift(state: GameState, staffId: string, day: number, shift: Shift): boolean {
  if (!scheduleEnabled(state)) return true;
  return scheduleOf(state, staffId)[weekday(day) * 2 + shift] ?? false;
}

/** Số ca nhân viên làm trong ngày (0, 1, 2). */
export function shiftsOn(state: GameState, staffId: string, day: number): number {
  return SHIFTS.filter((s) => worksShift(state, staffId, day, s)).length;
}

export function setShift(state: GameState, staffId: string, dow: number, shift: Shift, on: boolean): void {
  scheduleOf(state, staffId)[dow * 2 + shift] = on;
}

export function toggleShift(state: GameState, staffId: string, dow: number, shift: Shift): boolean {
  const sched = scheduleOf(state, staffId);
  sched[dow * 2 + shift] = !sched[dow * 2 + shift];
  return sched[dow * 2 + shift];
}

/**
 * Xếp tự động: mỗi ca có ít nhất 1 thu ngân; mỗi người nghỉ ít nhất 1 ngày/tuần nếu đủ người.
 * Chỉ có 1 thu ngân thì ưu tiên phủ kín mọi ca (không nghỉ). Vai trò khác làm 1 ca/ngày, luân phiên.
 */
export function autoSchedule(state: GameState): void {
  const cashiers = state.staff.filter((s) => s.role === 'cashier');
  const others = state.staff.filter((s) => s.role !== 'cashier');
  for (const s of state.staff) state.schedule[s.id] = Array.from({ length: WEEK_DAYS * 2 }, () => false);
  if (cashiers.length === 1) state.schedule[cashiers[0].id] = fullWeek();
  else if (cashiers.length > 1) {
    const rest = (i: number) => (i * Math.max(1, Math.floor(WEEK_DAYS / cashiers.length))) % WEEK_DAYS;
    for (let d = 0; d < WEEK_DAYS; d++) {
      const available = cashiers.filter((_, i) => rest(i) !== d || cashiers.every((__, j) => rest(j) === d));
      for (const shift of SHIFTS) {
        const pick = available[(d + shift) % available.length];
        state.schedule[pick.id][d * 2 + shift] = true;
      }
    }
  }
  const byRole = new Map<string, Staff[]>();
  for (const s of others) byRole.set(s.role, [...(byRole.get(s.role) ?? []), s]);
  for (const group of byRole.values()) {
    group.forEach((s, i) => {
      const restDay = (i * 3 + 6) % WEEK_DAYS;
      for (let d = 0; d < WEEK_DAYS; d++) {
        if (d === restDay) continue;
        const shift = group.length === 1 ? 0 : (i + d) % 2;
        state.schedule[s.id][d * 2 + shift] = true;
      }
    });
  }
  state.scheduleReady = true;
}

/** Khi xếp ca vừa mở khóa: xếp tự động một lần để lịch mặc định hợp lý. */
export function ensureScheduleReady(state: GameState): void {
  if (scheduleEnabled(state) && !state.scheduleReady) autoSchedule(state);
}

export interface ShiftCell {
  dow: number;
  shift: Shift;
  staff: string[];
  cashiers: number;
}

/** Tổng hợp lịch theo từng ca để vẽ màn Xếp ca và cảnh báo ca trống. */
export function scheduleGrid(state: GameState): ShiftCell[] {
  const out: ShiftCell[] = [];
  for (let dow = 0; dow < WEEK_DAYS; dow++) {
    for (const shift of SHIFTS) {
      const working = state.staff.filter((s) => (state.schedule[s.id] ?? fullWeek())[dow * 2 + shift]);
      out.push({ dow, shift, staff: working.map((s) => s.id), cashiers: working.filter((s) => s.role === 'cashier').length });
    }
  }
  return out;
}

/** Nhân viên làm ca đôi ở thứ `dow`. */
export function doubleShift(state: GameState, staffId: string, dow: number): boolean {
  const sched = state.schedule[staffId] ?? fullWeek();
  return !!sched[dow * 2] && !!sched[dow * 2 + 1];
}

/** Các ca trong ngày không có thu ngân (dùng cảnh báo chế độ quản lý buổi sáng). */
export function shiftsWithoutCashier(state: GameState, day: number): Shift[] {
  return SHIFTS.filter((shift) => !state.staff.some((s) => s.role === 'cashier' && worksShift(state, s.id, day, shift)));
}

export function removeFromSchedule(state: GameState, staffId: string): void {
  delete state.schedule[staffId];
}
