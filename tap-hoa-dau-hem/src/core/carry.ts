import { DATA } from './data';
import { warehouseQty, type GameState } from './state';

export interface CarryStack { productId: string; qty: number }

export function carryAvailable(state: GameState, carrying: CarryStack[], productId: string): number {
  return Math.max(0, warehouseQty(state, productId) - carrying.filter((stack) => stack.productId === productId).reduce((sum, stack) => sum + stack.qty, 0));
}

export function pickUp(state: GameState, carrying: CarryStack[], productId: string): number {
  const { carryStacks, carryUnitsPerStack } = DATA.balance.topDown.carry;
  let stack = carrying.find((entry) => entry.productId === productId);
  if (!stack) {
    if (carrying.length >= carryStacks) return 0;
    stack = { productId, qty: 0 };
    carrying.push(stack);
  }
  const qty = Math.min(carryUnitsPerStack - stack.qty, carryAvailable(state, carrying, productId));
  stack.qty += qty;
  if (stack.qty === 0) dropStack(carrying, productId);
  return qty;
}

export function dropStack(carrying: CarryStack[], productId: string): void {
  const index = carrying.findIndex((entry) => entry.productId === productId);
  if (index >= 0) carrying.splice(index, 1);
}
