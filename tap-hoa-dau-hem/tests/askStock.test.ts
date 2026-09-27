import { describe, expect, it } from 'vitest';
import { createCustomer, type Customer } from '../src/core/customers';
import { DaySession, type DayEvents } from '../src/core/day';
import { DATA } from '../src/core/data';
import { Rng } from '../src/core/rng';
import { createNewGame, lotsFrom, shelfQty, warehouseQty } from '../src/core/state';
import { assignSlot } from '../src/core/stock';

const step = DATA.balance.tickMs / 1000;

/** Tiệm mở cửa, kệ 0 bày mì gói (ô 0) và gạo (ô 1) nhưng mì gói đã hết trên kệ. */
function shop(warehouse: Record<string, number>) {
  const s = createNewGame();
  s.warehouse = lotsFrom({ gao: 20, ...warehouse });
  assignSlot(s, 0, 0, 'mi_goi');
  assignSlot(s, 0, 1, 'gao');
  s.shelves[0][0].qty = 0;
  s.shelves[0][0].lots = [];
  s.phase = 'open';
  s.clock = DATA.balance.openMinute;
  return s;
}

/** Cho một khách mua đúng các món này vào tiệm (không sinh khách ngẫu nhiên). */
function shopper(session: DaySession, order: Record<string, number>): Customer {
  const c = createCustomer(1, session.state.level, new Rng(1), session.state);
  c.order = Object.entries(order).map(([productId, qty]) => ({ productId, qty, picked: 0, scanned: 0, missing: 0, pickedFrom: [] }));
  c.patience = c.patienceMax = 999;
  c.thief = false;
  c.cart = false;
  c.wantsCredit = false;
  c.bargainPct = 0;
  c.status = 'browsing';
  c.browseTimer = 0;
  c.browseIndex = 0;
  c.shopBudget = 999;
  session.shoppers.push(c);
  return c;
}

function run(session: DaySession, c: Customer, until: (c: Customer) => boolean, max = 4000): void {
  session.state.settings.autoScan = false;
  for (let i = 0; i < max && !until(c); i++) {
    (session as unknown as { nextSpawnIn: number }).nextSpawnIn = 999;
    session.tick(step);
  }
}

function listen(session: DaySession) {
  const log: string[] = [];
  const asked: DayEvents['stockAsked'][] = [];
  session.events.on('stockAsking', () => log.push('asking'));
  session.events.on('stockAsked', (e) => { log.push('asked'); asked.push(e); });
  session.events.on('customerLeft', ({ reason }) => log.push(`left:${reason}`));
  return { log, asked };
}

describe('khách hỏi món hết ở quầy', () => {
  it('kho còn: lấy cho khách, bày thêm lên kệ, rồi mới tính tiền', () => {
    const session = new DaySession(shop({ mi_goi: 30 }), 3);
    const { log, asked } = listen(session);
    const stock = shelfQty(session.state, 'mi_goi') + warehouseQty(session.state, 'mi_goi');
    const c = shopper(session, { mi_goi: 2, gao: 1 });
    run(session, c, (x) => x.status === 'scanning');
    expect(c.status).toBe('scanning');
    expect(log).toEqual(['asking', 'asked']);
    expect(asked[0]).toMatchObject({ productId: 'mi_goi', found: 2, missing: 0 });
    const line = c.order.find((l) => l.productId === 'mi_goi')!;
    expect(line).toMatchObject({ picked: 2, missing: 0, asked: true });
    expect(line.value).toBeGreaterThan(0);
    // Ô kệ được nạp lại (trừ 2 gói đưa khách), kho giảm tương ứng.
    expect(session.state.shelves[0][0].qty).toBeGreaterThan(0);
    expect(shelfQty(session.state, 'mi_goi') + warehouseQty(session.state, 'mi_goi') + 2).toBe(stock);
  });

  it('kho cũng hết: vẫn ra quầy hỏi, rồi chỉ tính tiền món còn lại', () => {
    const session = new DaySession(shop({}), 3);
    const { log, asked } = listen(session);
    const c = shopper(session, { mi_goi: 1, gao: 1 });
    run(session, c, (x) => x.status === 'scanning');
    expect(log).toEqual(['asking', 'asked']);
    expect(asked[0]).toMatchObject({ productId: 'mi_goi', found: 0, missing: 1 });
    expect(c.order.find((l) => l.productId === 'gao')!.picked).toBe(1);
  });

  it('không lấy được món nào: không về thẳng từ kệ mà ra quầy hỏi xong mới về', () => {
    const session = new DaySession(shop({}), 3);
    const { log } = listen(session);
    const c = shopper(session, { mi_goi: 1 });
    run(session, c, (x) => x.status === 'done');
    expect(log).toEqual(['asking', 'asked', 'left:nothing']);
  });

  it('kiểm kho mất vài giây, trong lúc đó khách đứng chờ ở quầy', () => {
    const session = new DaySession(shop({ mi_goi: 30 }), 3);
    const c = shopper(session, { mi_goi: 1 });
    run(session, c, (x) => x.askLeft !== undefined);
    expect(session.front).toBe(c);
    expect(c.status).toBe('waiting');
    run(session, c, (x) => x.status !== 'waiting', Math.ceil(DATA.balance.askStockSeconds / step) + 2);
    expect(c.status).toBe('scanning');
  });
});
