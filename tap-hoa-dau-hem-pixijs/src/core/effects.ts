import eventsData from '../data/events.json';
import type { ActiveEvent } from './state';
import { DATA } from './data';
import { calendarDate, seasonDemandMultiplier } from './calendar';

export interface EffectContribution {
  trafficMul?: number;
  wholesaleMul?: number;
  electricityMul?: number;
  demandCategory?: Record<string, number>;
  demandProduct?: Record<string, number>;
  powerOut?: boolean;
}

export class EffectStack {
  private effects: EffectContribution[];
  private eventIds: Set<string>;

  constructor(effects: EffectContribution[] = [], eventIds: string[] = []) { this.effects = effects; this.eventIds = new Set(eventIds); }

  static forDay(day: number, startMonth: number, startYear: number, active: ActiveEvent[]): EffectStack {
    const date = calendarDate(day, { month: startMonth, year: startYear });
    const effects: EffectContribution[] = [];
    for (const category of ['drink', 'frozen', 'dry']) {
      const mul = seasonDemandMultiplier(date.season, category);
      if (mul !== 1) effects.push({ demandCategory: { [category]: mul } });
    }
    for (const activeEvent of active) {
      const def = [...(eventsData as EventTable).seasonal, ...(eventsData as EventTable).random].find((item) => item.id === activeEvent.id);
      for (const effect of def?.effects ?? []) effects.push(activeEvent.params ? replaceParams(effect, activeEvent.params) : effect);
    }
    return new EffectStack(effects, active.map((event) => event.id));
  }

  multiply(key: 'trafficMul' | 'wholesaleMul' | 'electricityMul'): number {
    return this.effects.reduce((value, effect) => value * (effect[key] ?? 1), 1);
  }
  demand(category: string, productId?: string): number {
    const productEvent = productId ? DATA.products.find((item) => item.id === productId)?.eventOnly : undefined;
    const postEventDemand = productEvent && !this.eventIds.has(productEvent) ? 0.3 : 1;
    return this.effects.reduce((value, effect) => value * (effect.demandCategory?.[category] ?? 1) * (effect.demandProduct?.[productId ?? ''] ?? 1), postEventDemand);
  }
  powerIsOut(): boolean { return this.effects.some((effect) => effect.powerOut); }
}

type EventDef = {
  id: string; name?: string; duration?: number; chance?: number; minLevel?: number; effects?: EffectContribution[];
  start?: { month: number; day: number }; end?: { month: number; day: number };
  items?: string[]; decor?: string[]; quests?: { id: string; text: string; metric: string; arg?: string; target: number; rewardMoney: number; rewardExp: number }[];
  rewardAt?: number; rewardDecor?: string; dialog?: string; oncePerYear?: boolean; unexpected?: boolean;
};
type EventTable = { seasonal: EventDef[]; random: EventDef[] };
function replaceParams(effect: EffectContribution, params: Record<string, string | number>): EffectContribution {
  const demandProduct = effect.demandProduct ? { ...effect.demandProduct } : undefined;
  if (demandProduct && typeof params.productId === 'string' && demandProduct['*selected*'] !== undefined) {
    demandProduct[params.productId] = demandProduct['*selected*'];
    delete demandProduct['*selected*'];
  }
  return { ...effect, ...(demandProduct ? { demandProduct } : {}) };
}

export function validateEventsData(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return ['events.json: gốc phải là object'];
  const table = input as Partial<EventTable>;
  const allIds = new Set<string>();
  for (const group of ['seasonal', 'random'] as const) {
    if (!Array.isArray(table[group])) { errors.push(`${group}: phải là mảng`); continue; }
    for (const item of table[group]!) {
      if (!item || typeof item.id !== 'string' || !item.id) errors.push(`${group}: thiếu id`);
      else if (allIds.has(item.id)) errors.push(`${group}: id trùng ${item.id}`);
      else allIds.add(item.id);
      if (typeof item.duration !== 'number' || item.duration < 1) errors.push(`${item.id}: duration phải >= 1`);
      if (typeof item.dialog !== 'string' || !item.dialog.trim()) errors.push(String(item.id) + ': thiếu dialog');
      if (group === 'random' && (typeof item.chance !== 'number' || item.chance < 0 || item.chance > 1)) errors.push(`${item.id}: chance phải trong [0, 1]`);
      if (!Array.isArray(item.effects)) errors.push(`${item.id}: effects phải là mảng`);
      if (group === 'seasonal') for (const endpoint of [item.start, item.end]) {
        if (!endpoint || !Number.isInteger(endpoint.month) || endpoint.month < 1 || endpoint.month > 12 || !Number.isInteger(endpoint.day) || endpoint.day < 1 || endpoint.day > 10) {
          errors.push(`${item.id}: ngày mùa phải nằm trong lịch 12×10`);
          break;
        }
      }
      for (const key of ['items', 'decor'] as const) if (item[key] !== undefined) {
        if (!Array.isArray(item[key]) || item[key]!.some((id) => typeof id !== 'string')) errors.push(String(item.id) + ': ' + key + ' phải là mảng id');
        else for (const id of item[key]!) {
          const exists = key === 'items' ? DATA.products.some((p) => p.id === id) : DATA.decor.some((d) => d.id === id);
          if (!exists) errors.push(String(item.id) + ': ' + key + ' tham chiếu id không tồn tại "' + id + '"');
        }
      }
      if (item.rewardDecor && !DATA.decor.some((d) => d.id === item.rewardDecor)) errors.push(String(item.id) + ': rewardDecor không tồn tại (' + item.rewardDecor + ')');
      if (item.quests !== undefined && !Array.isArray(item.quests)) errors.push(String(item.id) + ': quests phải là mảng');
      const questIds = new Set<string>();
      for (const quest of Array.isArray(item.quests) ? item.quests : []) {
        if (!quest || typeof quest.id !== 'string' || !quest.id || typeof quest.text !== 'string' || !quest.text.trim() || !Number.isInteger(quest.target) || quest.target <= 0 || !Number.isFinite(quest.rewardMoney) || quest.rewardMoney < 0 || !Number.isFinite(quest.rewardExp) || quest.rewardExp < 0) errors.push(String(item.id) + ': nhiệm vụ có trường không hợp lệ');
        if (questIds.has(quest.id)) errors.push(String(item.id) + ': id nhiệm vụ trùng ' + quest.id);
        questIds.add(quest.id);
        if (!['soldEventItems', 'soldProduct', 'soldProductList', 'soldCategory', 'served', 'revenue'].includes(quest.metric)) errors.push(String(item.id) + ': metric nhiệm vụ không hợp lệ (' + quest.metric + ')');
        if (quest.metric === 'soldProduct' && !DATA.products.some((p) => p.id === quest.arg)) errors.push(String(item.id) + ': nhiệm vụ tham chiếu mặt hàng không tồn tại (' + quest.arg + ')');
        if (quest.metric === 'soldProductList' && (!quest.arg || quest.arg.split(',').some((id) => !DATA.products.some((p) => p.id === id.trim())))) errors.push(String(item.id) + ': danh sách món nhiệm vụ không hợp lệ');
        if (quest.metric === 'soldCategory' && !['dry', 'snack', 'household', 'drink', 'fresh', 'frozen', 'counter'].includes(quest.arg ?? '')) errors.push(String(item.id) + ': nhóm nhiệm vụ không tồn tại (' + quest.arg + ')');
      }
      for (const effect of item.effects ?? []) {
        if (!effect || typeof effect !== 'object') { errors.push(`${item.id}: effect phải là object`); continue; }
        for (const key of ['trafficMul', 'wholesaleMul', 'electricityMul'] as const) if (effect[key] !== undefined && (!Number.isFinite(effect[key]) || effect[key]! <= 0)) errors.push(`${item.id}: ${key} phải là số > 0`);
        for (const key of ['demandCategory', 'demandProduct'] as const) if (effect[key] !== undefined && (!effect[key] || typeof effect[key] !== 'object' || Object.values(effect[key]!).some((value) => !Number.isFinite(value) || value <= 0))) errors.push(`${item.id}: ${key} phải là các hệ số > 0`);
        if (effect.powerOut !== undefined && typeof effect.powerOut !== 'boolean') errors.push(`${item.id}: powerOut phải là boolean`);
      }
    }
  }
  return errors;
}
