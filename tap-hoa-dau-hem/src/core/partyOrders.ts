import { DATA, product } from './data';
import { Rng, daySeed } from './rng';
import { takeLots, takeOneFromSlot } from './stock';
import { weekIndex } from './weeklyQuests';
import { type GameState, type PartyOrder, type Slot } from './state';

export function refreshPartyOrder(state: GameState): void {
  if (state.level < 27) { state.partyOrder = null; return; }
  const week = weekIndex(state.day);
  const current = state.partyOrder;
  if (current?.status === 'accepted' && state.day > current.deadlineDay) current.status = 'expired';
  if (current && (current.status === 'offered' || current.status === 'accepted') && state.day <= current.deadlineDay) return;
  if (state.partyOrderWeek === week) return;
  state.partyOrderWeek = week;
  const rng = new Rng(daySeed(week + 1, 0xface));
  if (rng.next() >= 0.45 || !DATA.partyOrders.length) { state.partyOrder = null; return; }
  const template = rng.pick(DATA.partyOrders);
  const items = { ...template.items };
  const rewardMoney = Math.round(Object.entries(items).reduce((sum, [id, qty]) => sum + product(id).price * qty, 0) * 1.3);
  state.partyOrder = {
    id: `party:${template.id}:${week}`,
    week,
    customer: template.customer,
    items,
    offerDay: state.day,
    deadlineDay: state.day + template.deadlineDays - 1,
    rewardMoney,
    status: 'offered',
  };
}

export function respondToPartyOrder(state: GameState, accept: boolean): boolean {
  const order = state.partyOrder;
  if (!order || order.status !== 'offered' || state.day > order.deadlineDay) return false;
  order.status = accept ? 'accepted' : 'declined';
  return true;
}

function available(state: GameState, productId: string): number {
  const warehouse = state.warehouse.reduce((sum, lot) => sum + (lot.productId === productId ? lot.qty : 0), 0);
  const shelves = state.shelves.flat().reduce((sum, slot) => sum + (slot.productId === productId ? slot.qty : 0), 0);
  const counter = state.counter.reduce((sum, slot) => sum + (slot.productId === productId ? slot.qty : 0), 0);
  return warehouse + shelves + counter;
}

function removeFromSlots(slots: Slot[], productId: string, amount: number): number {
  let left = amount;
  for (const slot of slots) {
    if (left <= 0) break;
    if (slot.productId !== productId) continue;
    while (left > 0 && slot.qty > 0) { takeOneFromSlot(slot); left--; }
    if (slot.qty <= 0) { slot.qty = 0; slot.productId = null; slot.lots = []; }
  }
  return amount - left;
}

function removeStock(state: GameState, productId: string, amount: number): void {
  let left = amount;
  const warehouseCount = Math.min(left, state.warehouse.reduce((sum, lot) => sum + (lot.productId === productId ? lot.qty : 0), 0));
  if (warehouseCount) {
    takeLots(state, productId, warehouseCount);
    left -= warehouseCount;
  }
  if (left) left -= removeFromSlots(state.shelves.flat(), productId, left);
  if (left) removeFromSlots(state.counter, productId, left);
}

export function fulfillPartyOrder(state: GameState): { ok: true; reward: number } | { ok: false; reason: 'missing' | 'not-accepted' | 'expired' | 'short' } {
  const order = state.partyOrder;
  if (!order) return { ok: false, reason: 'missing' };
  if (order.status !== 'accepted') return { ok: false, reason: 'not-accepted' };
  if (state.day > order.deadlineDay) { order.status = 'expired'; return { ok: false, reason: 'expired' }; }
  if (Object.entries(order.items).some(([id, qty]) => available(state, id) < qty)) return { ok: false, reason: 'short' };
  for (const [id, qty] of Object.entries(order.items)) removeStock(state, id, qty);
  order.status = 'fulfilled';
  state.money += order.rewardMoney;
  state.regulars[order.customer] = (state.regulars[order.customer] ?? 0) + 1;
  state.today.journal.push({ m: state.clock, t: `Giao đơn tiệc cho ${order.customer}: +${order.rewardMoney.toLocaleString('vi-VN')}đ và tăng thân thiết.` });
  return { ok: true, reward: order.rewardMoney };
}

export function partyOrderProgress(state: GameState, order: PartyOrder): { productId: string; have: number; need: number }[] {
  return Object.entries(order.items).map(([productId, need]) => ({ productId, need, have: Math.min(need, available(state, productId)) }));
}
