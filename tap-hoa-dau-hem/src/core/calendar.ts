import calendarData from '../data/calendar.json';

export interface CalendarDate { day: number; month: number; year: number; season: string; seasonName: string }
export interface CalendarStart { month: number; year: number }

export function calendarDate(gameDay: number, start: CalendarStart = { month: 1, year: 1 }): CalendarDate {
  const offset = Math.max(0, Math.floor(gameDay) - 1) + (Math.max(1, start.month) - 1) * calendarData.daysPerMonth;
  const monthIndex = Math.floor(offset / calendarData.daysPerMonth);
  const month = monthIndex % calendarData.monthsPerYear + 1;
  const year = Math.max(1, start.year) + Math.floor(monthIndex / calendarData.monthsPerYear);
  const day = offset % calendarData.daysPerMonth + 1;
  const season = calendarData.seasons.find((item) => item.months.includes(month)) ?? calendarData.seasons[0];
  return { day, month, year, season: season.id, seasonName: season.name };
}

export function calendarLabel(date: CalendarDate): string {
  return `Ngày ${date.day} · Tháng ${date.month} · Năm ${date.year} · Mùa ${date.seasonName}`;
}

export function seasonDemandMultiplier(season: string, category: string): number {
  return (calendarData.seasonDemand as Record<string, Record<string, number>>)[season]?.[category] ?? 1;
}
