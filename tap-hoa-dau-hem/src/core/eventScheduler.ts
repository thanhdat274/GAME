import eventsJson from '../data/events.json';
import { calendarDate } from './calendar';
import { Rng, daySeed } from './rng';
import { unlockedProducts, type ActiveEvent, type GameState } from './state';

interface EventDefinition {
  id: string;
  name: string;
  duration: number;
  dialog: string;
  items?: string[];
  decor?: string[];
  start?: { month: number; day: number };
  end?: { month: number; day: number };
  chance?: number;
  minLevel?: number;
  unexpected?: boolean;
  oncePerYear?: boolean;
  rewardAt?: number;
  rewardDecor?: string;
  quests?: { id: string; text: string; metric: string; arg?: string; target: number; rewardMoney: number; rewardExp: number }[];
}
interface EventFile { seasonal: EventDefinition[]; random: EventDefinition[] }
const EVENT_TABLE = eventsJson as EventFile;

function monthDayRank(month: number, day: number): number { return (month - 1) * 10 + day; }

/** Decide the calendar and one optional random event at the start of each game day. */
export function scheduleEvents(state: GameState): ActiveEvent[] {
  state.activeEvents = state.activeEvents.filter((event) => event.endsDay >= state.day);
  const date = calendarDate(state.day, { month: state.calendarStartMonth, year: state.calendarStartYear });
  const dateRank = monthDayRank(date.month, date.day);
  const added: ActiveEvent[] = [];

  for (const def of state.level >= 22 ? EVENT_TABLE.seasonal : []) {
    if (!def.start || !def.end) continue;
    const inRange = dateRank >= monthDayRank(def.start.month, def.start.day) && dateRank <= monthDayRank(def.end.month, def.end.day);
    if (!inRange || state.activeEvents.some((event) => event.id === def.id)) continue;
    const remaining = monthDayRank(def.end.month, def.end.day) - dateRank;
    added.push({ id: def.id, day: state.day, endsDay: state.day + remaining });
  }

  if (state.eventRollDay !== state.day) {
    state.eventRollDay = state.day;
    if (state.level >= 21) {
      const rng = new Rng(daySeed(state.day, 0x45564e54));
      const candidates = EVENT_TABLE.random.filter((def) => state.level >= (def.minLevel ?? 1) &&
        (!def.oncePerYear || !state.eventHistory.includes(`${def.id}:${date.year}`)));
      let roll = rng.next();
      let selected: EventDefinition | undefined;
      for (const def of candidates) {
        roll -= def.chance ?? 0;
        if (roll < 0) { selected = def; break; }
      }
      if (selected) {
        const params: ActiveEvent['params'] = {};
        if (selected.id === 'social_trend') {
          const pool = unlockedProducts(state.level, state);
          if (pool.length) params.productId = rng.pick(pool).id;
        }
        if (selected.id === 'power_outage') params.outageHours = rng.int(2, 4);
        const active: ActiveEvent = {
          id: selected.id,
          day: state.day,
          endsDay: state.day + selected.duration - 1,
          ...(selected.unexpected ? { unexpected: true } : {}),
          ...(Object.keys(params).length ? { params } : {}),
        };
        added.push(active);
        if (selected.oncePerYear) state.eventHistory.push(`${selected.id}:${date.year}`);
      }
    }
  }

  if (added.length) {
    state.activeEvents.push(...added);
    for (const active of added) {
      const def = [...EVENT_TABLE.seasonal, ...EVENT_TABLE.random].find((item) => item.id === active.id)!;
      state.morningNotes.push(`${def.unexpected ? 'Sự cố' : 'Sự kiện'}: ${def.name}. ${def.dialog}`);
    }
  }
  return added;
}

export function eventDefinition(id: string): EventDefinition | undefined {
  return [...EVENT_TABLE.seasonal, ...EVENT_TABLE.random].find((item) => item.id === id);
}
